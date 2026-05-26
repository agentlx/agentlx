CREATE TABLE IF NOT EXISTS terminal_session_limit_enforcement (
  scope TEXT PRIMARY KEY CHECK (scope IN ('per_user')),
  limit_value INTEGER CHECK (limit_value IS NULL OR limit_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO terminal_session_limit_enforcement (scope, limit_value, updated_at)
VALUES ('per_user', 1, now())
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE IF NOT EXISTS realtime_terminal_session_leases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_terminal_session_leases_user_active
  ON realtime_terminal_session_leases (user_id, expires_at)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_realtime_terminal_session_leases_machine_active
  ON realtime_terminal_session_leases (machine_id, expires_at)
  WHERE closed_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_agentlx_terminal_session_limit(
  target_user_id TEXT
)
RETURNS VOID AS $$
DECLARE
  configured_limit INTEGER;
  current_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agentlx-terminal-session-limit:' || target_user_id));

  SELECT limit_value
    INTO configured_limit
    FROM terminal_session_limit_enforcement
   WHERE scope = 'per_user';

  IF NOT FOUND THEN
    configured_limit := 1;
  END IF;

  IF configured_limit IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
    INTO current_count
    FROM realtime_terminal_session_leases
   WHERE user_id = target_user_id
     AND closed_at IS NULL
     AND expires_at > now();

  IF current_count >= configured_limit THEN
    RAISE EXCEPTION 'AgentLX terminal session limit reached for user: %', configured_limit
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_realtime_terminal_session_insert_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;

  PERFORM enforce_agentlx_terminal_session_limit(NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_realtime_terminal_session_insert_limit ON realtime_terminal_session_leases;
CREATE TRIGGER trg_enforce_realtime_terminal_session_insert_limit
BEFORE INSERT ON realtime_terminal_session_leases
FOR EACH ROW
EXECUTE FUNCTION enforce_realtime_terminal_session_insert_limit();
