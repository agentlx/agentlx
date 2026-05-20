CREATE TABLE IF NOT EXISTS auth_login_rate_limits (
  subject_key TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('ip', 'email')),
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limits_locked_until
  ON auth_login_rate_limits(locked_until)
  WHERE locked_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_integrity_anchors (
  id TEXT PRIMARY KEY,
  audit_log_id TEXT NOT NULL,
  integrity_hash TEXT NOT NULL,
  anchor_hash TEXT NOT NULL,
  anchor_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_integrity_anchors_created_at
  ON audit_integrity_anchors(created_at DESC);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_bytes BYTEA;

UPDATE users
SET profile_photo_bytes = decode(profile_photo_data, 'base64')
WHERE profile_photo_bytes IS NULL
  AND profile_photo_data IS NOT NULL
  AND profile_photo_data <> '';

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
  ON audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_email
  ON audit_logs ((metadata_json->>'email'), created_at DESC)
  WHERE metadata_json ? 'email';

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_ip
  ON audit_logs ((metadata_json->>'ipAddress'), created_at DESC)
  WHERE metadata_json ? 'ipAddress';

CREATE INDEX IF NOT EXISTS idx_audit_logs_severity_created_at
  ON audit_logs(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_id
  ON audit_logs(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_action_executions_requested_id
  ON action_executions(requested_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_machines_hostname_agent_id
  ON machines ((LOWER(hostname)), agent_id, id);

CREATE INDEX IF NOT EXISTS idx_agents_label_id
  ON agents ((LOWER(label)), id);

UPDATE agents
SET auth_token_issued_at = registered_at
WHERE auth_token_issued_at = '';

ALTER TABLE agents
  ALTER COLUMN auth_token_issued_at DROP DEFAULT;

ALTER TABLE agents
  ALTER COLUMN auth_token_issued_at TYPE TIMESTAMPTZ USING auth_token_issued_at::timestamptz,
  ALTER COLUMN auth_token_last_rotated_at TYPE TIMESTAMPTZ USING NULLIF(auth_token_last_rotated_at, '')::timestamptz,
  ALTER COLUMN auth_token_last_used_at TYPE TIMESTAMPTZ USING NULLIF(auth_token_last_used_at, '')::timestamptz,
  ALTER COLUMN auth_token_last_acknowledged_at TYPE TIMESTAMPTZ USING NULLIF(auth_token_last_acknowledged_at, '')::timestamptz,
  ALTER COLUMN auth_token_last_persist_error_at TYPE TIMESTAMPTZ USING NULLIF(auth_token_last_persist_error_at, '')::timestamptz,
  ALTER COLUMN auth_token_prev_expires_at TYPE TIMESTAMPTZ USING NULLIF(auth_token_prev_expires_at, '')::timestamptz,
  ALTER COLUMN registered_at TYPE TIMESTAMPTZ USING registered_at::timestamptz,
  ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz;

ALTER TABLE agents
  ALTER COLUMN auth_token_issued_at SET DEFAULT now();

ALTER TABLE machines
  ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz,
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;

ALTER TABLE machine_services
  ALTER COLUMN collected_at TYPE TIMESTAMPTZ USING collected_at::timestamptz;

ALTER TABLE machine_status_history
  ALTER COLUMN recorded_at TYPE TIMESTAMPTZ USING recorded_at::timestamptz;

ALTER TABLE machine_inventories
  ALTER COLUMN collected_at TYPE TIMESTAMPTZ USING collected_at::timestamptz;

ALTER TABLE action_executions
  ALTER COLUMN requested_at TYPE TIMESTAMPTZ USING requested_at::timestamptz,
  ALTER COLUMN available_at TYPE TIMESTAMPTZ USING available_at::timestamptz,
  ALTER COLUMN dispatched_at TYPE TIMESTAMPTZ USING NULLIF(dispatched_at, '')::timestamptz,
  ALTER COLUMN started_at TYPE TIMESTAMPTZ USING NULLIF(started_at, '')::timestamptz,
  ALTER COLUMN finished_at TYPE TIMESTAMPTZ USING NULLIF(finished_at, '')::timestamptz,
  ALTER COLUMN schedule_run_at TYPE TIMESTAMPTZ USING NULLIF(schedule_run_at, '')::timestamptz;

ALTER TABLE audit_logs
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;

ALTER TABLE action_schedules
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz,
  ALTER COLUMN starts_at TYPE TIMESTAMPTZ USING starts_at::timestamptz,
  ALTER COLUMN next_run_at TYPE TIMESTAMPTZ USING next_run_at::timestamptz,
  ALTER COLUMN last_run_at TYPE TIMESTAMPTZ USING NULLIF(last_run_at, '')::timestamptz;

ALTER TABLE agent_enrollment_tokens
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz,
  ALTER COLUMN consumed_at TYPE TIMESTAMPTZ USING NULLIF(consumed_at, '')::timestamptz;

ALTER TABLE agent_request_nonces
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz;

ALTER TABLE users
  ALTER COLUMN profile_photo_updated_at TYPE TIMESTAMPTZ USING NULLIF(profile_photo_updated_at, '')::timestamptz,
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;

ALTER TABLE machine_groups
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz,
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at::timestamptz;

ALTER TABLE machine_group_users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;

ALTER TABLE machine_group_links
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;

ALTER TABLE user_sessions
  ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz,
  ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz,
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;
