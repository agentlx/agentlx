ALTER TABLE action_executions
  ADD COLUMN IF NOT EXISTS requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE action_schedules
  ADD COLUMN IF NOT EXISTS requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

UPDATE action_executions execution
SET requested_by_user_id = users.id
FROM users
WHERE execution.requested_by_user_id IS NULL
  AND LOWER(users.email) = LOWER(execution.requested_by);

UPDATE action_schedules schedule
SET requested_by_user_id = users.id
FROM users
WHERE schedule.requested_by_user_id IS NULL
  AND LOWER(users.email) = LOWER(schedule.requested_by);

CREATE INDEX IF NOT EXISTS idx_action_executions_requested_by_user
  ON action_executions(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_action_schedules_requested_by_user
  ON action_schedules(requested_by_user_id);
