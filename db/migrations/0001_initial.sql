CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,
  auth_token_encrypted TEXT NOT NULL DEFAULT '',
  auth_token_issued_at TEXT NOT NULL DEFAULT '',
  auth_token_last_rotated_at TEXT,
  auth_token_last_used_at TEXT,
  auth_token_last_acknowledged_at TEXT,
  auth_token_last_persist_error TEXT,
  auth_token_last_persist_error_at TEXT,
  auth_token_prev_hash TEXT,
  auth_token_prev_expires_at TEXT,
  registered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  version TEXT NOT NULL,
  poll_interval_sec INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  hostname TEXT NOT NULL,
  ip TEXT NOT NULL,
  os TEXT NOT NULL,
  distro_id TEXT NOT NULL DEFAULT 'linux',
  distro_family TEXT NOT NULL DEFAULT 'linux',
  distro_version TEXT NOT NULL DEFAULT '',
  kernel TEXT NOT NULL,
  arch TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  uptime_sec INTEGER NOT NULL,
  cpu_percent REAL NOT NULL,
  ram_used_gb REAL NOT NULL,
  ram_total_gb REAL NOT NULL,
  disk_percent REAL NOT NULL,
  scheduled_task_limit INTEGER NOT NULL DEFAULT 1 CHECK (scheduled_task_limit >= 1 AND scheduled_task_limit <= 50),
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'warning')),
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_services (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  slug TEXT NOT NULL,
  display_name TEXT,
  version TEXT,
  detected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_status_history (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'warning')),
  recorded_at TEXT NOT NULL,
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_inventories (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  collected_at TEXT NOT NULL,
  hostname TEXT NOT NULL,
  ip TEXT NOT NULL,
  os TEXT NOT NULL,
  distro_id TEXT NOT NULL DEFAULT 'linux',
  distro_family TEXT NOT NULL DEFAULT 'linux',
  distro_version TEXT NOT NULL DEFAULT '',
  kernel TEXT NOT NULL,
  arch TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  uptime_sec INTEGER NOT NULL,
  cpu_percent REAL NOT NULL,
  ram_used_gb REAL NOT NULL,
  ram_total_gb REAL NOT NULL,
  disk_percent REAL NOT NULL,
  services_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS action_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  service TEXT NOT NULL,
  target_distro_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_distro_families JSONB NOT NULL DEFAULT '[]'::jsonb,
  command TEXT NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  enabled INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS distro_id TEXT NOT NULL DEFAULT 'linux';

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS distro_family TEXT NOT NULL DEFAULT 'linux';

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS distro_version TEXT NOT NULL DEFAULT '';

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS scheduled_task_limit INTEGER NOT NULL DEFAULT 1 CHECK (scheduled_task_limit >= 1 AND scheduled_task_limit <= 50);

ALTER TABLE machine_inventories
  ADD COLUMN IF NOT EXISTS distro_id TEXT NOT NULL DEFAULT 'linux';

ALTER TABLE machine_inventories
  ADD COLUMN IF NOT EXISTS distro_family TEXT NOT NULL DEFAULT 'linux';

ALTER TABLE machine_inventories
  ADD COLUMN IF NOT EXISTS distro_version TEXT NOT NULL DEFAULT '';

ALTER TABLE action_templates
  ADD COLUMN IF NOT EXISTS target_distro_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE action_templates
  ADD COLUMN IF NOT EXISTS target_distro_families JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE action_templates
  ALTER COLUMN description DROP NOT NULL;

CREATE TABLE IF NOT EXISTS action_executions (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  template_id TEXT REFERENCES action_templates(id),
  template_name TEXT NOT NULL,
  service TEXT NOT NULL,
  command TEXT NOT NULL,
  command_encrypted TEXT NOT NULL DEFAULT '',
  execution_kind TEXT NOT NULL DEFAULT 'template' CHECK (execution_kind IN ('template', 'terminal')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'dispatched', 'running', 'success', 'failed', 'cancelled')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  dispatched_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  timeout_sec INTEGER NOT NULL DEFAULT 120,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  exit_code INTEGER,
  output TEXT NOT NULL DEFAULT '',
  error_output TEXT NOT NULL DEFAULT ''
);

ALTER TABLE action_executions
  ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS execution_kind TEXT NOT NULL DEFAULT 'template'
  CHECK (execution_kind IN ('template', 'terminal'));

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS command_encrypted TEXT NOT NULL DEFAULT '';

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS timeout_sec INTEGER NOT NULL DEFAULT 120;

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS available_at TEXT;

UPDATE action_executions
SET available_at = requested_at
WHERE available_at IS NULL OR available_at = '';

ALTER TABLE action_executions
  ALTER COLUMN available_at SET NOT NULL;

ALTER TABLE action_executions
  DROP CONSTRAINT IF EXISTS action_executions_machine_id_fkey;

ALTER TABLE action_executions
  DROP CONSTRAINT IF EXISTS action_executions_agent_id_fkey;

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS machine_hostname TEXT NOT NULL DEFAULT '';

UPDATE action_executions execution
SET machine_hostname = machine.hostname
FROM machines machine
WHERE machine.id = execution.machine_id
  AND execution.machine_hostname = '';

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  execution_id TEXT REFERENCES action_executions(id),
  machine_id TEXT REFERENCES machines(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('panel', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'notice', 'warn', 'critical')),
  message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  integrity_prev_hash TEXT,
  integrity_hash TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_machine_id_fkey;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS machine_hostname TEXT;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS integrity_prev_hash TEXT;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS integrity_hash TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_encrypted TEXT NOT NULL DEFAULT '';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_issued_at TEXT NOT NULL DEFAULT '';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_last_rotated_at TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_last_used_at TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_last_acknowledged_at TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_last_persist_error TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_last_persist_error_at TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_prev_hash TEXT;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS auth_token_prev_expires_at TEXT;

UPDATE audit_logs audit
SET machine_hostname = machine.hostname
FROM machines machine
WHERE machine.id = audit.machine_id
  AND COALESCE(audit.machine_hostname, '') = '';

CREATE INDEX IF NOT EXISTS idx_machine_services_machine_id
  ON machine_services(machine_id);

CREATE INDEX IF NOT EXISTS idx_machine_status_history_machine_id
  ON machine_status_history(machine_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_machine_inventories_machine_id
  ON machine_inventories(machine_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_executions_machine_id
  ON action_executions(machine_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_executions_status
  ON action_executions(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_executions_available_at
  ON action_executions(status, available_at ASC);

CREATE INDEX IF NOT EXISTS idx_action_executions_machine_due
  ON action_executions(machine_id, status, available_at ASC, requested_at ASC);

CREATE TABLE IF NOT EXISTS action_schedules (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  machine_hostname TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL,
  template_id TEXT REFERENCES action_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  service TEXT NOT NULL,
  command TEXT NOT NULL,
  command_encrypted TEXT NOT NULL DEFAULT '',
  interval_hours INTEGER NOT NULL CHECK (interval_hours >= 1 AND interval_hours <= 2400000),
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_execution_id TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS schedule_id TEXT;

ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS schedule_run_at TEXT;

CREATE INDEX IF NOT EXISTS idx_action_schedules_machine_due
  ON action_schedules(machine_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_action_executions_schedule_id
  ON action_executions(schedule_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_machine_id
  ON audit_logs(machine_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_enrollment_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_encrypted TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_machine_id TEXT,
  consumed_agent_id TEXT,
  install_dir TEXT NOT NULL DEFAULT '/opt/agentlx',
  location TEXT NOT NULL DEFAULT '',
  agent_name TEXT NOT NULL DEFAULT ''
);

ALTER TABLE agent_enrollment_tokens
  ADD COLUMN IF NOT EXISTS token_encrypted TEXT NOT NULL DEFAULT '';

ALTER TABLE agent_enrollment_tokens
  ADD COLUMN IF NOT EXISTS install_dir TEXT NOT NULL DEFAULT '/opt/agentlx';

CREATE INDEX IF NOT EXISTS idx_agent_enrollment_tokens_expires_at
  ON agent_enrollment_tokens(expires_at);

CREATE TABLE IF NOT EXISTS agent_request_nonces (
  token_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  request_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (token_hash, nonce)
);

CREATE INDEX IF NOT EXISTS idx_agent_request_nonces_expires_at
  ON agent_request_nonces(expires_at);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  allowed_screens JSONB NOT NULL DEFAULT '[]'::jsonb,
  mfa_secret TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  profile_photo_mime TEXT,
  profile_photo_data TEXT,
  profile_photo_width INTEGER,
  profile_photo_height INTEGER,
  profile_photo_updated_at TEXT,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_data TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_width INTEGER;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_height INTEGER;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_updated_at TEXT;

UPDATE users
SET profile_photo_updated_at = updated_at
WHERE profile_photo_data IS NOT NULL
  AND profile_photo_mime IS NOT NULL
  AND profile_photo_updated_at IS NULL;

UPDATE users
SET mfa_enabled = TRUE
WHERE mfa_secret IS NOT NULL
  AND mfa_enabled = FALSE;

CREATE TABLE IF NOT EXISTS machine_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_group_users (
  group_id TEXT NOT NULL REFERENCES machine_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('member', 'owner')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS machine_group_links (
  machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES machine_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (machine_id, group_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  session_version INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users ((LOWER(email)));

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
  ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_machine_group_users_user_id
  ON machine_group_users(user_id, role);

CREATE INDEX IF NOT EXISTS idx_machine_group_links_machine_id
  ON machine_group_links(machine_id);

CREATE INDEX IF NOT EXISTS idx_machine_group_links_group_id
  ON machine_group_links(group_id);
