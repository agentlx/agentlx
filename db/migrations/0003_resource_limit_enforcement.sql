CREATE TABLE IF NOT EXISTS resource_limit_enforcement (
  resource TEXT PRIMARY KEY CHECK (resource IN ('machines', 'templates', 'groups')),
  limit_value INTEGER CHECK (limit_value IS NULL OR limit_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO resource_limit_enforcement (resource, limit_value, updated_at)
VALUES
  ('machines', 10, now()),
  ('templates', 10, now()),
  ('groups', 10, now())
ON CONFLICT (resource) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_agentlx_resource_limit(
  target_resource TEXT,
  current_count INTEGER
)
RETURNS VOID AS $$
DECLARE
  configured_limit INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('agentlx-resource-limit:' || target_resource));

  SELECT limit_value
    INTO configured_limit
    FROM resource_limit_enforcement
   WHERE resource = target_resource;

  IF NOT FOUND THEN
    configured_limit := 10;
  END IF;

  IF configured_limit IS NULL THEN
    RETURN;
  END IF;

  IF current_count >= configured_limit THEN
    RAISE EXCEPTION 'AgentLX resource limit reached for %: %', target_resource, configured_limit
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_machine_insert_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT COUNT(*)::integer INTO current_count FROM machines;
  PERFORM enforce_agentlx_resource_limit('machines', current_count);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_pending_machine_enrollment_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF NEW.consumed_at IS NOT NULL OR NEW.expires_at <= now() THEN
    RETURN NEW;
  END IF;

  SELECT (
    (SELECT COUNT(*) FROM machines)
    +
    (SELECT COUNT(*)
       FROM agent_enrollment_tokens
      WHERE consumed_at IS NULL
        AND expires_at > now())
  )::integer
    INTO current_count;

  PERFORM enforce_agentlx_resource_limit('machines', current_count);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_template_insert_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT COUNT(*)::integer INTO current_count FROM action_templates;
  PERFORM enforce_agentlx_resource_limit('templates', current_count);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_group_insert_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT COUNT(*)::integer INTO current_count FROM machine_groups;
  PERFORM enforce_agentlx_resource_limit('groups', current_count);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_machine_insert_limit ON machines;
CREATE TRIGGER trg_enforce_machine_insert_limit
BEFORE INSERT ON machines
FOR EACH ROW
EXECUTE FUNCTION enforce_machine_insert_limit();

DROP TRIGGER IF EXISTS trg_enforce_pending_machine_enrollment_limit ON agent_enrollment_tokens;
CREATE TRIGGER trg_enforce_pending_machine_enrollment_limit
BEFORE INSERT ON agent_enrollment_tokens
FOR EACH ROW
EXECUTE FUNCTION enforce_pending_machine_enrollment_limit();

DROP TRIGGER IF EXISTS trg_enforce_template_insert_limit ON action_templates;
CREATE TRIGGER trg_enforce_template_insert_limit
BEFORE INSERT ON action_templates
FOR EACH ROW
EXECUTE FUNCTION enforce_template_insert_limit();

DROP TRIGGER IF EXISTS trg_enforce_group_insert_limit ON machine_groups;
CREATE TRIGGER trg_enforce_group_insert_limit
BEFORE INSERT ON machine_groups
FOR EACH ROW
EXECUTE FUNCTION enforce_group_insert_limit();
