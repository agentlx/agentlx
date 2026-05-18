import type {
  AuditLogView,
  ActionTemplateView,
  CreateMachineGroupInput,
  CreateMachineEnrollmentInput,
  CreateActionTemplateInput,
  DashboardView,
  ExecutionFeedView,
  ExecutionDetailView,
  ExecutionLogView,
  ExecuteActionInput,
  FinalizeMachineEnrollmentInput,
  GroupSelectableUserView,
  MachineGroupAccessView,
  MachineGroupAssignmentInput,
  MachineGroupOptionView,
  MachineGroupsPageView,
  MachineGroupView,
  MachinesPageView,
  MachineEnrollmentCommandView,
  MachineControlAction,
  MachineControlActionInput,
  MachineDetailView,
  MachineView,
  PendingMachineEnrollmentCreateView,
  PendingMachineEnrollmentView,
  RealtimeTemplateExecutionView,
  RecurringScheduleLookupInput,
  RecurringScheduleView,
  RecurringTemplateScheduleInput,
  RemoteTerminalInput,
  StartRealtimeTemplateExecutionInput,
  TemplateLookupInput,
  TemplateCatalogView,
  UpdateMachineGroupInput,
  UpdateMachineAgentNameInput,
  UpdateMachineScheduledTaskLimitInput,
  UpdateActionTemplateInput,
} from "@/lib/agentlx";
import { formatTemplateSystemScope } from "@/lib/agentlx";
import {
  deriveMachineStatus,
  formatEstimatedTime,
  formatExecutionDate,
  formatRelativeTime,
  formatUptime,
} from "@/lib/formatting";
import { appendAuditLog } from "./audit.server";
import { dbQuery, withTransaction } from "./db.server";
import { getEnv } from "./env.server";
import {
  decryptPendingToken,
  encryptPendingToken,
  generateToken,
  sha256Hex,
} from "./security.server";
import { protectExecutionCommand, redactSensitiveText } from "./redaction.server";

const AGENT_SELF_UNINSTALL_MARKER = "__AGENTLX_SELF_UNINSTALL__";
const AGENT_SYNC_MARKER = "__AGENTLX_SYNC_NOW__";
const AGENT_SYNC_COMMAND = `: "${AGENT_SYNC_MARKER}"`;
const MACHINE_SYNC_COOLDOWN_MS = 15_000;
const DEFAULT_LIST_LIMIT = 200;
const MACHINE_LIST_LIMIT = 500;
const TEMPLATE_LIST_LIMIT = 300;
const MACHINE_DETAIL_EXECUTION_LIMIT = 80;
const DASHBOARD_EXECUTION_LIMIT = 6;
const PENDING_ENROLLMENT_LIMIT = 100;

function buildAgentSelfUninstallCommand() {
  return `
# ${AGENT_SELF_UNINSTALL_MARKER}
set -eu

SERVICE_NAME="agentlx"
REMOVE_DELAY_SEC="3"
AGENT_ROOT=""

if command -v systemctl >/dev/null 2>&1; then
  AGENT_ROOT="$(systemctl cat "$SERVICE_NAME" 2>/dev/null | sed -n 's/^WorkingDirectory=//p' | head -n 1)"
  if [ -z "$AGENT_ROOT" ]; then
    EXEC_START_LINE="$(systemctl cat "$SERVICE_NAME" 2>/dev/null | sed -n 's/^ExecStart=//p' | head -n 1)"
    if [ -n "$EXEC_START_LINE" ]; then
      AGENT_ROOT="$(printf '%s' "$EXEC_START_LINE" | sed -n 's/.* \\([^ ]*\\/agent\\.py\\).*/\\1/p' | head -n 1)"
      AGENT_ROOT="$(dirname "$AGENT_ROOT")"
    fi
  fi
fi

if [ -z "$AGENT_ROOT" ] && [ -d /opt/agentlx ]; then
  AGENT_ROOT="/opt/agentlx"
fi

if [ -z "$AGENT_ROOT" ] || [ ! -d "$AGENT_ROOT" ]; then
  echo "Nao foi possivel localizar o diretorio do agent." >&2
  exit 1
fi

case "$AGENT_ROOT" in
  ""|"/"|"/bin"|"/boot"|"/dev"|"/etc"|"/home"|"/lib"|"/lib64"|"/opt"|"/proc"|"/root"|"/run"|"/sbin"|"/sys"|"/tmp"|"/usr"|"/var")
    echo "Diretorio do agent inseguro para remocao: $AGENT_ROOT" >&2
    exit 1
    ;;
esac

if [ ! -f "$AGENT_ROOT/agent.py" ] && [ ! -d "$AGENT_ROOT/agentlx" ]; then
  echo "Diretorio localizado nao parece conter o agent: $AGENT_ROOT" >&2
  exit 1
fi

TMP_SCRIPT="/tmp/lxagent-remove-$$.sh"
cat > "$TMP_SCRIPT" <<'EOF'
#!/bin/sh
set -eu
SERVICE_NAME="\${SERVICE_NAME:-agentlx}"
AGENT_ROOT="\${AGENT_ROOT:-}"
REMOVE_DELAY_SEC="\${REMOVE_DELAY_SEC:-3}"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME.service"

case "$AGENT_ROOT" in
  ""|"/"|"/bin"|"/boot"|"/dev"|"/etc"|"/home"|"/lib"|"/lib64"|"/opt"|"/proc"|"/root"|"/run"|"/sbin"|"/sys"|"/tmp"|"/usr"|"/var")
    exit 1
    ;;
esac

if [ ! -f "$AGENT_ROOT/agent.py" ] && [ ! -d "$AGENT_ROOT/agentlx" ]; then
  exit 1
fi

sleep "$REMOVE_DELAY_SEC"
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
fi
rm -f "$SERVICE_PATH" >/dev/null 2>&1 || true
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true
fi
if command -v pkill >/dev/null 2>&1; then
  pkill -TERM -f "$AGENT_ROOT/agent.py" >/dev/null 2>&1 || true
  sleep 1
  pkill -KILL -f "$AGENT_ROOT/agent.py" >/dev/null 2>&1 || true
fi
rm -rf -- "$AGENT_ROOT" >/dev/null 2>&1 || true
rm -f -- "$0" >/dev/null 2>&1 || true
EOF

chmod 700 "$TMP_SCRIPT"

if command -v systemd-run >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
  UNIT_NAME="lxagent-remove-$(date +%s)-$$"
  systemd-run --unit="$UNIT_NAME" --collect \\
    --setenv="SERVICE_NAME=$SERVICE_NAME" \\
    --setenv="AGENT_ROOT=$AGENT_ROOT" \\
    --setenv="REMOVE_DELAY_SEC=$REMOVE_DELAY_SEC" \\
    /bin/sh "$TMP_SCRIPT" >/dev/null
else
  nohup env SERVICE_NAME="$SERVICE_NAME" AGENT_ROOT="$AGENT_ROOT" REMOVE_DELAY_SEC="$REMOVE_DELAY_SEC" /bin/sh "$TMP_SCRIPT" >/dev/null 2>&1 &
fi

echo "Desinstalacao do agent agendada para $AGENT_ROOT."
`.trim();
}

type MachineRow = {
  id: string;
  agent_id: string;
  agent_label: string;
  hostname: string;
  ip: string;
  os: string;
  distro_id: string;
  distro_family: string;
  distro_version: string;
  kernel: string;
  arch: string;
  location: string;
  uptime_sec: number;
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_percent: number;
  scheduled_task_limit: number;
  last_seen_at: string;
  services: string[];
};

type DashboardMachineStatsRow = {
  total: string | number;
  online: string | number;
  offline: string | number;
  warning: string | number;
  avg_cpu: string | number | null;
  ram_used_total: string | number | null;
  ram_total: string | number | null;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  service: string;
  target_distro_ids: unknown;
  target_distro_families: unknown;
  command: string;
  estimated_seconds: number;
  risk: "low" | "medium" | "high";
  enabled: number;
};

type ExecutionRow = {
  id: string;
  execution_kind: "template" | "terminal";
  machine_id: string;
  machine_hostname: string;
  machine_exists: boolean;
  template_id: string;
  template_name: string;
  command: string;
  schedule_id: string | null;
  schedule_run_at: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  status: "queued" | "dispatched" | "running" | "success" | "failed" | "cancelled";
  output: string;
  error_output: string;
  requested_by: string;
  available_at: string;
};

type ScheduleRow = {
  id: string;
  machine_id: string;
  machine_hostname: string;
  machine_exists: boolean;
  template_id: string | null;
  template_name: string;
  service: string;
  command: string;
  interval_hours: number;
  status: "active" | "paused" | "cancelled";
  requested_by: string;
  created_at: string;
  starts_at: string;
  next_run_at: string;
  last_run_at: string | null;
  last_execution_id: string | null;
  failure_count: number;
};

type AuditRow = {
  id: string;
  action: string;
  actor_type: "panel" | "agent" | "system";
  actor_id: string;
  message: string;
  created_at: string;
  execution_id: string | null;
  machine_id: string | null;
  machine_hostname: string | null;
};

type PendingEnrollmentRow = {
  id: string;
  token_encrypted: string;
  created_at: string;
  expires_at: string;
  install_dir: string;
  location: string;
  agent_name: string;
};

type GroupRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  owner_count: number;
  member_count: number;
  machine_count: number;
};

type GroupUserAssignmentRow = {
  group_id: string;
  group_role: "member" | "owner";
  user_id: string;
  full_name: string;
  email: string;
  user_role: "admin" | "member";
  disabled: boolean;
};

type SelectableUserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "member";
  disabled: boolean;
};

type DbClient = {
  query: <T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

function normalizeDisplayText(value: string) {
  if (!value || !/[ÃÂ�]/.test(value)) {
    return value;
  }

  try {
    const repaired = Buffer.from(value, "latin1").toString("utf8");
    const suspiciousScore = (text: string) => (text.match(/[ÃÂ�]/g) ?? []).length;
    return suspiciousScore(repaired) < suspiciousScore(value) ? repaired : value;
  } catch {
    return value;
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toMachineView(
  machine: MachineRow,
  options: { canEditScheduledTaskLimit?: boolean } = {},
): MachineView {
  const status = deriveMachineStatus({
    lastSeenAt: machine.last_seen_at,
    cpuPercent: machine.cpu_percent,
    diskPercent: machine.disk_percent,
    ramUsedGb: machine.ram_used_gb,
    ramTotalGb: machine.ram_total_gb,
  });

  return {
    id: machine.id,
    hostname: machine.hostname,
    agentName: machine.agent_label,
    ip: machine.ip,
    os: machine.os,
    distroId: machine.distro_id,
    distroFamily: machine.distro_family,
    distroVersion: machine.distro_version,
    status,
    uptime: formatUptime(machine.uptime_sec),
    lastSeen: formatRelativeTime(machine.last_seen_at),
    services: machine.services,
    cpu: machine.cpu_percent,
    ramUsed: machine.ram_used_gb,
    ramTotal: machine.ram_total_gb,
    disk: machine.disk_percent,
    kernel: machine.kernel,
    arch: machine.arch,
    location: machine.location,
    lastSeenAt: machine.last_seen_at,
    canDelete: false,
    scheduledTaskLimit: machine.scheduled_task_limit,
    canEditScheduledTaskLimit: options.canEditScheduledTaskLimit ?? false,
  };
}

function toTemplateView(template: TemplateRow): ActionTemplateView {
  return {
    id: template.id,
    name: normalizeDisplayText(template.name),
    description: normalizeDisplayText(template.description ?? ""),
    service: template.service,
    targetDistroIds: [],
    targetDistroFamilies: [],
    systemScope: formatTemplateSystemScope({ targetDistroIds: [], targetDistroFamilies: [] }),
    command: normalizeDisplayText(template.command),
    estimatedTime: formatEstimatedTime(template.estimated_seconds),
    risk: template.risk,
  };
}

function toExecutionLogView(execution: ExecutionRow): ExecutionLogView {
  const isScheduled = execution.available_at > execution.requested_at;
  const description = isScheduled
    ? `Agendado por ${execution.requested_by} para ${execution.machine_hostname} em ${formatExecutionDate(
        execution.available_at,
      )}.`
    : `Executado por ${execution.requested_by} em ${execution.machine_hostname} em ${formatExecutionDate(
        execution.requested_at,
      )}.`;

  return {
    id: execution.id,
    executionKind: execution.execution_kind,
    templateId: execution.template_id,
    templateName: execution.template_name,
    machineId: execution.machine_id,
    machineHostname: execution.machine_hostname,
    machineAvailable: execution.machine_exists,
    executedAt: formatExecutionDate(
      execution.finished_at ?? execution.started_at ?? execution.requested_at,
    ),
    durationMs: execution.duration_ms,
    status: execution.status,
    output: normalizeDisplayText(execution.output),
    errorOutput: normalizeDisplayText(execution.error_output),
    command: normalizeDisplayText(execution.command),
    requestedBy: execution.requested_by,
    requestedAt: execution.requested_at,
    availableAt: execution.available_at,
    isScheduled,
    description: normalizeDisplayText(description),
  };
}

function formatIntervalHours(intervalHours: number) {
  if (intervalHours % 24 === 0) {
    const days = intervalHours / 24;
    return days === 1 ? "1 dia" : `${days} dias`;
  }

  return intervalHours === 1 ? "1 hora" : `${intervalHours} horas`;
}

function intervalDaysToHours(intervalDays: number) {
  return intervalDays * 24;
}

function toRecurringScheduleView(schedule: ScheduleRow): RecurringScheduleView {
  return {
    id: schedule.id,
    templateId: schedule.template_id ?? "template-removed",
    templateName: normalizeDisplayText(schedule.template_name),
    machineId: schedule.machine_id,
    machineHostname: schedule.machine_hostname,
    machineAvailable: schedule.machine_exists,
    requestedBy: schedule.requested_by,
    createdAt: formatExecutionDate(schedule.created_at),
    startsAt: formatExecutionDate(schedule.starts_at),
    nextRunAt: formatExecutionDate(schedule.next_run_at),
    lastRunAt: schedule.last_run_at ? formatExecutionDate(schedule.last_run_at) : null,
    lastExecutionId: schedule.last_execution_id,
    intervalHours: schedule.interval_hours,
    status: schedule.status,
    failureCount: schedule.failure_count,
    command: normalizeDisplayText(schedule.command),
    description: `Recorrencia a cada ${formatIntervalHours(schedule.interval_hours)} para ${schedule.machine_hostname}.`,
  };
}

function toAuditLogView(audit: AuditRow): AuditLogView {
  return {
    id: audit.id,
    action: audit.action,
    actorType: audit.actor_type,
    actorId: audit.actor_id,
    machineId: audit.machine_id,
    machineHostname: audit.machine_hostname,
    executionId: audit.execution_id,
    createdAt: formatExecutionDate(audit.created_at),
    message: normalizeDisplayText(audit.message),
  };
}

function slugifyKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 48);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function trimOptionalValue(value: string) {
  return value.trim();
}

function machineAccessCondition(machineIdExpression: string, userParamRef: string) {
  return `(
    NOT EXISTS (
      SELECT 1
      FROM machine_group_links access_link
      WHERE access_link.machine_id = ${machineIdExpression}
    )
    OR EXISTS (
      SELECT 1
      FROM machine_group_links access_link
      INNER JOIN machine_group_users access_user ON access_user.group_id = access_link.group_id
      WHERE access_link.machine_id = ${machineIdExpression}
        AND access_user.user_id = ${userParamRef}
    )
  )`;
}

function toSelectableUserView(user: SelectableUserRow): GroupSelectableUserView {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    disabled: user.disabled,
  };
}

function toMachineGroupOptionView(group: GroupRow): MachineGroupOptionView {
  return {
    id: group.id,
    name: normalizeDisplayText(group.name),
    description: normalizeDisplayText(group.description),
    ownerCount: Number(group.owner_count ?? 0),
    memberCount: Number(group.member_count ?? 0),
    machineCount: Number(group.machine_count ?? 0),
  };
}

function buildMachineInstallCommand(input: {
  appOrigin: string;
  enrollmentToken: string;
  installDir: string;
  location: string;
  agentName: string;
}) {
  const parts = [
    "curl -fsSL",
    shellQuote(`${input.appOrigin}/api/agent/install.sh`),
    "| sudo bash -s --",
    "--api-base-url",
    shellQuote(input.appOrigin),
    "--enrollment-token",
    shellQuote(input.enrollmentToken),
    "--install-dir",
    shellQuote(input.installDir),
  ];

  if (input.location) {
    parts.push("--location", shellQuote(input.location));
  }

  parts.push("--agent-name", shellQuote(input.agentName));

  return parts.join(" ");
}

function toPendingMachineEnrollmentView(row: PendingEnrollmentRow): PendingMachineEnrollmentView {
  const appOrigin = getEnv().APP_ORIGIN.replace(/\/+$/, "");
  const token = decryptPendingToken(row.token_encrypted);

  return {
    id: row.id,
    token,
    location: row.location,
    agentName: row.agent_name,
    installDir: row.install_dir,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    command: buildMachineInstallCommand({
      appOrigin,
      enrollmentToken: token,
      installDir: row.install_dir,
      location: row.location,
      agentName: row.agent_name,
    }),
  };
}

function safeToPendingMachineEnrollmentView(row: PendingEnrollmentRow) {
  try {
    return toPendingMachineEnrollmentView(row);
  } catch {
    return null;
  }
}

function getQueryExecutor(client?: DbClient): DbClient {
  if (client) {
    return client;
  }

  return {
    query: (text, params) => dbQuery(text, params),
  };
}

async function appendPanelAuditLog(
  client: DbClient,
  input: {
    executionId?: string | null;
    machineId?: string | null;
    machineHostname?: string | null;
    actorType: "panel" | "agent" | "system";
    actorId: string;
    action: string;
    message: string;
    createdAt?: string;
    severity?: "info" | "notice" | "warn" | "critical";
    metadata?: Record<string, unknown>;
  },
) {
  return appendAuditLog(client, input);
}

function normalizeIdList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function loadSelectableUsers(client?: DbClient) {
  const db = getQueryExecutor(client);
  const result = await db.query<SelectableUserRow>(
    `
      SELECT
        id,
        full_name,
        email,
        role,
        disabled
      FROM users
      ORDER BY disabled ASC, role ASC, full_name ASC, email ASC
    `,
  );

  return result.rows;
}

async function loadMachineGroupRows(client?: DbClient) {
  const db = getQueryExecutor(client);
  const result = await db.query<GroupRow>(
    `
      SELECT
        grp.id,
        grp.name,
        grp.description,
        grp.created_at,
        grp.updated_at,
        COUNT(DISTINCT CASE WHEN grp_user.role = 'owner' THEN grp_user.user_id END)::int AS owner_count,
        COUNT(DISTINCT CASE WHEN grp_user.role = 'member' THEN grp_user.user_id END)::int AS member_count,
        COUNT(DISTINCT machine_link.machine_id)::int AS machine_count
      FROM machine_groups grp
      LEFT JOIN machine_group_users grp_user ON grp_user.group_id = grp.id
      LEFT JOIN machine_group_links machine_link ON machine_link.group_id = grp.id
      GROUP BY grp.id
      ORDER BY grp.name ASC
    `,
  );

  return result.rows;
}

async function loadMachineGroupUserAssignments(client?: DbClient) {
  const db = getQueryExecutor(client);
  const result = await db.query<GroupUserAssignmentRow>(
    `
      SELECT
        grp_user.group_id,
        grp_user.role AS group_role,
        usr.id AS user_id,
        usr.full_name,
        usr.email,
        usr.role AS user_role,
        usr.disabled
      FROM machine_group_users grp_user
      INNER JOIN users usr ON usr.id = grp_user.user_id
      ORDER BY usr.full_name ASC, usr.email ASC
    `,
  );

  return result.rows;
}

async function loadGroupByName(name: string, client?: DbClient) {
  const db = getQueryExecutor(client);
  const result = await db.query<{ id: string }>(
    `
      SELECT id
      FROM machine_groups
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `,
    [name.trim()],
  );

  return result.rows[0] ?? null;
}

async function assertUsersExist(userIds: string[], client?: DbClient) {
  if (userIds.length === 0) {
    return;
  }

  const db = getQueryExecutor(client);
  const result = await db.query<{ id: string }>(
    `
      SELECT id
      FROM users
      WHERE id = ANY($1::text[])
    `,
    [userIds],
  );

  if (result.rows.length !== userIds.length) {
    throw new Error("Um ou mais usuarios selecionados nao existem mais.");
  }
}

async function loadMachineGroupOptions(client?: DbClient) {
  const groups = await loadMachineGroupRows(client);
  return groups.map(toMachineGroupOptionView);
}

async function loadAssignedMachineGroupOptions(machineId: string, client?: DbClient) {
  const db = getQueryExecutor(client);
  const result = await db.query<GroupRow>(
    `
      SELECT
        grp.id,
        grp.name,
        grp.description,
        grp.created_at,
        grp.updated_at,
        COUNT(DISTINCT CASE WHEN grp_user.role = 'owner' THEN grp_user.user_id END)::int AS owner_count,
        COUNT(DISTINCT CASE WHEN grp_user.role = 'member' THEN grp_user.user_id END)::int AS member_count,
        COUNT(DISTINCT machine_link.machine_id)::int AS machine_count
      FROM machine_groups grp
      INNER JOIN machine_group_links assigned_link
        ON assigned_link.group_id = grp.id
       AND assigned_link.machine_id = $1
      LEFT JOIN machine_group_users grp_user ON grp_user.group_id = grp.id
      LEFT JOIN machine_group_links machine_link ON machine_link.group_id = grp.id
      GROUP BY grp.id
      ORDER BY grp.name ASC
    `,
    [machineId],
  );

  return result.rows.map(toMachineGroupOptionView);
}

async function canManageMachineGroups(
  machineId: string,
  viewer: {
    userId: string;
    role: "admin" | "member";
    canAccessGroupsScreen: boolean;
  },
  client?: DbClient,
) {
  const db = getQueryExecutor(client);
  const result = await db.query<{
    machine_exists: boolean;
    has_groups: boolean;
    is_owner: boolean;
  }>(
    `
      SELECT
        EXISTS (SELECT 1 FROM machines WHERE id = $1) AS machine_exists,
        EXISTS (SELECT 1 FROM machine_group_links WHERE machine_id = $1) AS has_groups,
        EXISTS (
          SELECT 1
          FROM machine_group_links access_link
          INNER JOIN machine_group_users access_user ON access_user.group_id = access_link.group_id
          WHERE access_link.machine_id = $1
            AND access_user.user_id = $2
            AND access_user.role = 'owner'
        ) AS is_owner
    `,
    [machineId, viewer.userId],
  );

  const row = result.rows[0];
  if (!row?.machine_exists) {
    return false;
  }

  if (viewer.role === "admin") {
    return true;
  }

  if (!row.has_groups) {
    return viewer.canAccessGroupsScreen;
  }

  return row.is_owner;
}

async function canEditMachineScheduledTaskLimit(
  machineId: string,
  viewerUserId: string,
  client?: DbClient,
) {
  const db = getQueryExecutor(client);
  const result = await db.query<{
    machine_exists: boolean;
    has_groups: boolean;
    is_owner: boolean;
  }>(
    `
      SELECT
        EXISTS (SELECT 1 FROM machines WHERE id = $1) AS machine_exists,
        EXISTS (SELECT 1 FROM machine_group_links WHERE machine_id = $1) AS has_groups,
        EXISTS (
          SELECT 1
          FROM machine_group_links grp_link
          INNER JOIN machine_group_users grp_user ON grp_user.group_id = grp_link.group_id
          WHERE grp_link.machine_id = $1
            AND grp_user.user_id = $2
            AND grp_user.role = 'owner'
        ) AS is_owner
    `,
    [machineId, viewerUserId],
  );

  const row = result.rows[0];
  if (!row?.machine_exists) {
    return false;
  }

  return row.has_groups && row.is_owner;
}

async function assertViewerCanEditMachineScheduledTaskLimit(
  client: DbClient,
  machineId: string,
  viewerUserId: string,
) {
  const result = await client.query<{
    machine_exists: boolean;
    has_groups: boolean;
    is_owner: boolean;
  }>(
    `
      SELECT
        EXISTS (SELECT 1 FROM machines WHERE id = $1) AS machine_exists,
        EXISTS (SELECT 1 FROM machine_group_links WHERE machine_id = $1) AS has_groups,
        EXISTS (
          SELECT 1
          FROM machine_group_links grp_link
          INNER JOIN machine_group_users grp_user ON grp_user.group_id = grp_link.group_id
          WHERE grp_link.machine_id = $1
            AND grp_user.user_id = $2
            AND grp_user.role = 'owner'
        ) AS is_owner
    `,
    [machineId, viewerUserId],
  );

  const row = result.rows[0];
  if (!row?.machine_exists) {
    throw new Error("Maquina nao encontrada.");
  }
  if (!row.has_groups) {
    throw new Error("A maquina precisa pertencer a um grupo antes desta configuracao ser editada.");
  }
  if (!row.is_owner) {
    throw new Error(
      "Apenas o proprietario de um grupo desta maquina pode alterar esta configuracao.",
    );
  }
}

async function loadMachineDeletePermissions(machineIds: string[], viewerUserId: string) {
  if (machineIds.length === 0) {
    return new Map<string, boolean>();
  }

  const result = await dbQuery<{ machine_id: string; can_delete: boolean }>(
    `
      SELECT
        machine.id AS machine_id,
        (
          NOT EXISTS (
            SELECT 1
            FROM machine_group_links grp_link
            WHERE grp_link.machine_id = machine.id
          )
          OR EXISTS (
            SELECT 1
            FROM machine_group_links grp_link
            INNER JOIN machine_group_users grp_user ON grp_user.group_id = grp_link.group_id
            WHERE grp_link.machine_id = machine.id
              AND grp_user.user_id = $2
              AND grp_user.role = 'owner'
          )
        ) AS can_delete
      FROM machines machine
      WHERE machine.id = ANY($1::text[])
    `,
    [machineIds, viewerUserId],
  );

  return new Map(result.rows.map((row) => [row.machine_id, row.can_delete]));
}

async function assertViewerCanDeleteMachine(
  client: DbClient,
  machineId: string,
  viewerUserId: string,
) {
  const result = await client.query<{ can_delete: boolean }>(
    `
      SELECT
        (
          NOT EXISTS (
            SELECT 1
            FROM machine_group_links grp_link
            WHERE grp_link.machine_id = $1
          )
          OR EXISTS (
            SELECT 1
            FROM machine_group_links grp_link
            INNER JOIN machine_group_users grp_user ON grp_user.group_id = grp_link.group_id
            WHERE grp_link.machine_id = $1
              AND grp_user.user_id = $2
              AND grp_user.role = 'owner'
          )
        ) AS can_delete
    `,
    [machineId, viewerUserId],
  );

  if (!result.rows[0]?.can_delete) {
    throw new Error(
      "Voce precisa ser proprietario de um grupo desta maquina para excluir. Maquinas sem grupo podem ser excluidas por usuarios com acesso a Maquinas.",
    );
  }
}

export async function assertViewerCanAccessMachine(
  machineId: string,
  viewerUserId: string,
  client?: DbClient,
) {
  const db = getQueryExecutor(client);
  const result = await db.query<{ id: string }>(
    `
      SELECT id
      FROM machines machine
      WHERE machine.id = $1
        AND ${machineAccessCondition("machine.id", "$2")}
      LIMIT 1
    `,
    [machineId, viewerUserId],
  );

  if (!result.rows[0]) {
    throw new Error("Voce nao possui permissao para acessar esta maquina.");
  }
}

async function loadMachineForQueue(client: DbClient, machineId: string, viewerUserId?: string) {
  const params: unknown[] = [machineId];
  const conditions = ["m.id = $1"];

  if (viewerUserId) {
    params.push(viewerUserId);
    conditions.push(machineAccessCondition("m.id", `$${params.length}`));
  }

  const machines = await client.query<MachineRow>(
    `
      SELECT
        m.id,
        m.agent_id,
        a.label AS agent_label,
        m.hostname,
        m.ip,
        m.os,
        m.distro_id,
        m.distro_family,
        m.distro_version,
        m.kernel,
        m.arch,
        m.location,
        m.uptime_sec,
        m.cpu_percent,
        m.ram_used_gb,
        m.ram_total_gb,
        m.disk_percent,
        m.scheduled_task_limit,
        m.last_seen_at,
        COALESCE(
          array_remove(
            array_agg(COALESCE(ms.display_name, ms.slug) ORDER BY LOWER(COALESCE(ms.display_name, ms.slug))),
            NULL
          ),
          '{}'
        ) AS services
      FROM machines m
      INNER JOIN agents a ON a.id = m.agent_id
      LEFT JOIN machine_services ms ON ms.machine_id = m.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY m.id, a.label
    `,
    params,
  );

  return machines.rows[0] ?? null;
}

async function loadMachines(machineId?: string, viewerUserId?: string, limit?: number) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (machineId) {
    params.push(machineId);
    conditions.push(`m.id = $${params.length}`);
  }

  if (viewerUserId) {
    params.push(viewerUserId);
    conditions.push(machineAccessCondition("m.id", `$${params.length}`));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = limit
    ? (() => {
        params.push(limit);
        return `LIMIT $${params.length}`;
      })()
    : "";

  const result = await dbQuery<MachineRow>(
    `
      SELECT
        m.id,
        m.agent_id,
        a.label AS agent_label,
        m.hostname,
        m.ip,
        m.os,
        m.distro_id,
        m.distro_family,
        m.distro_version,
        m.kernel,
        m.arch,
        m.location,
        m.uptime_sec,
        m.cpu_percent,
        m.ram_used_gb,
        m.ram_total_gb,
        m.disk_percent,
        m.scheduled_task_limit,
        m.last_seen_at,
        COALESCE(
          array_remove(
            array_agg(COALESCE(ms.display_name, ms.slug) ORDER BY LOWER(COALESCE(ms.display_name, ms.slug))),
            NULL
          ),
          '{}'
        ) AS services
      FROM machines m
      INNER JOIN agents a ON a.id = m.agent_id
      LEFT JOIN machine_services ms ON ms.machine_id = m.id
      ${where}
      GROUP BY m.id, a.label
      ORDER BY m.hostname ASC
      ${limitClause}
    `,
    params,
  );

  return result.rows;
}

async function loadDashboardMachineStats(viewerUserId: string) {
  const result = await dbQuery<DashboardMachineStatsRow>(
    `
      WITH visible_machines AS (
        SELECT
          m.cpu_percent,
          m.ram_used_gb,
          m.ram_total_gb,
          CASE
            WHEN m.last_seen_at::timestamptz <= NOW() - INTERVAL '180 seconds' THEN 'offline'
            WHEN m.last_seen_at::timestamptz <= NOW() - INTERVAL '90 seconds'
              OR m.cpu_percent >= 85
              OR m.disk_percent >= 90
              OR (CASE WHEN m.ram_total_gb > 0 THEN (m.ram_used_gb / m.ram_total_gb) * 100 ELSE 0 END) >= 90
              THEN 'warning'
            ELSE 'online'
          END AS derived_status
        FROM machines m
        WHERE ${machineAccessCondition("m.id", "$1")}
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE derived_status = 'online') AS online,
        COUNT(*) FILTER (WHERE derived_status = 'offline') AS offline,
        COUNT(*) FILTER (WHERE derived_status = 'warning') AS warning,
        COALESCE(ROUND(AVG(cpu_percent)), 0) AS avg_cpu,
        COALESCE(ROUND(SUM(ram_used_gb)::numeric, 1), 0) AS ram_used_total,
        COALESCE(SUM(ram_total_gb), 0) AS ram_total
      FROM visible_machines
    `,
    [viewerUserId],
  );

  const row = result.rows[0];
  return {
    total: Number(row?.total ?? 0),
    online: Number(row?.online ?? 0),
    offline: Number(row?.offline ?? 0),
    warning: Number(row?.warning ?? 0),
    avgCpu: Number(row?.avg_cpu ?? 0),
    ramUsedTotal: Number(row?.ram_used_total ?? 0),
    ramTotal: Number(row?.ram_total ?? 0),
  };
}

async function loadTemplates(limit = TEMPLATE_LIST_LIMIT) {
  const result = await dbQuery<TemplateRow>(
    `
      SELECT
        id,
        name,
        description,
        service,
        target_distro_ids,
        target_distro_families,
        command,
        estimated_seconds,
        risk,
        enabled
      FROM action_templates
      WHERE enabled = 1
      ORDER BY service ASC, name ASC
      LIMIT $1
    `,
    [limit],
  );
  return result.rows;
}

async function loadTemplateById(client: DbClient, templateId: string) {
  const result = await client.query<TemplateRow>(
    `
      SELECT
        id,
        name,
        description,
        service,
        target_distro_ids,
        target_distro_families,
        command,
        estimated_seconds,
        risk,
        enabled
      FROM action_templates
      WHERE id = $1 AND enabled = 1
      LIMIT 1
    `,
    [templateId],
  );

  return result.rows[0] ?? null;
}

async function loadExecutions(
  machineId?: string,
  executionId?: string,
  viewerUserId?: string,
  limit = DEFAULT_LIST_LIMIT,
) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (machineId) {
    params.push(machineId);
    conditions.push(`execution.machine_id = $${params.length}`);
  }

  if (executionId) {
    params.push(executionId);
    conditions.push(`execution.id = $${params.length}`);
  }

  if (viewerUserId) {
    params.push(viewerUserId);
    conditions.push(machineAccessCondition("execution.machine_id", `$${params.length}`));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);
  const limitClause = `LIMIT $${params.length}`;

  const result = await dbQuery<ExecutionRow>(
    `
      SELECT
        execution.id,
        execution.execution_kind,
        execution.machine_id,
        COALESCE(NULLIF(execution.machine_hostname, ''), machine.hostname, execution.machine_id) AS machine_hostname,
        (machine.id IS NOT NULL) AS machine_exists,
        COALESCE(
          execution.template_id,
          CASE
            WHEN execution.execution_kind = 'terminal' THEN 'terminal-remote-shell'
            ELSE 'template-removed'
          END
        ) AS template_id,
        execution.template_name,
        execution.command,
        execution.schedule_id,
        execution.schedule_run_at,
        execution.requested_at,
        execution.started_at,
        execution.finished_at,
        execution.duration_ms,
        execution.status,
        execution.output,
        execution.error_output,
        execution.requested_by,
        execution.available_at
      FROM action_executions execution
      LEFT JOIN machines machine ON machine.id = execution.machine_id
      ${where}
      ORDER BY execution.requested_at DESC
      ${limitClause}
    `,
    params,
  );

  return result.rows;
}

async function loadRecurringSchedules(
  viewerUserId?: string,
  scheduleId?: string,
  limit = DEFAULT_LIST_LIMIT,
) {
  const params: unknown[] = [];
  const conditions = ["schedule.status = 'active'"];

  if (scheduleId) {
    params.push(scheduleId);
    conditions.push(`schedule.id = $${params.length}`);
  }

  if (viewerUserId) {
    params.push(viewerUserId);
    conditions.push(machineAccessCondition("schedule.machine_id", `$${params.length}`));
  }

  params.push(limit);
  const limitClause = `LIMIT $${params.length}`;

  const result = await dbQuery<ScheduleRow>(
    `
      SELECT
        schedule.id,
        schedule.machine_id,
        COALESCE(NULLIF(schedule.machine_hostname, ''), machine.hostname, schedule.machine_id) AS machine_hostname,
        (machine.id IS NOT NULL) AS machine_exists,
        schedule.template_id,
        schedule.template_name,
        schedule.service,
        schedule.command,
        schedule.interval_hours,
        schedule.status,
        schedule.requested_by,
        schedule.created_at,
        schedule.starts_at,
        schedule.next_run_at,
        schedule.last_run_at,
        schedule.last_execution_id,
        schedule.failure_count
      FROM action_schedules schedule
      LEFT JOIN machines machine ON machine.id = schedule.machine_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY schedule.next_run_at ASC
      ${limitClause}
    `,
    params,
  );

  return result.rows;
}

async function loadAuditLogs(limit = 80, viewerUserId?: string) {
  const params: unknown[] = [limit];
  const visibilityWhere = viewerUserId
    ? `WHERE audit.machine_id IS NULL OR ${machineAccessCondition("audit.machine_id", "$2")}`
    : "";
  const result = await dbQuery<AuditRow>(
    `
      SELECT
        audit.id,
        audit.action,
        audit.actor_type,
        audit.actor_id,
        audit.message,
        audit.created_at,
        audit.execution_id,
        audit.machine_id,
        COALESCE(NULLIF(audit.machine_hostname, ''), machine.hostname) AS machine_hostname
      FROM audit_logs audit
      LEFT JOIN machines machine ON machine.id = audit.machine_id
      ${visibilityWhere}
      ORDER BY audit.created_at DESC
      LIMIT $1
    `,
    viewerUserId ? [...params, viewerUserId] : params,
  );

  return result.rows;
}

async function loadPendingEnrollments() {
  const now = new Date().toISOString();

  await dbQuery(
    `
      DELETE FROM agent_enrollment_tokens
      WHERE consumed_at IS NULL
        AND (
          expires_at <= $1
          OR COALESCE(token_encrypted, '') = ''
        )
    `,
    [now],
  );

  const result = await dbQuery<PendingEnrollmentRow>(
    `
      SELECT
        id,
        token_encrypted,
        created_at,
        expires_at,
        install_dir,
        location,
        agent_name
      FROM agent_enrollment_tokens
      WHERE consumed_at IS NULL
        AND expires_at > $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [now, PENDING_ENROLLMENT_LIMIT],
  );

  return result.rows;
}

function buildMachineControlCommand(action: MachineControlAction) {
  const successMessage =
    action === "restart"
      ? "Reinicio agendado com fallback multi-init."
      : "Desligamento agendado com fallback multi-init.";
  const fallbackScript =
    action === "restart"
      ? `
sleep 2
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl reboot && exit 0
fi
if command -v loginctl >/dev/null 2>&1; then
  loginctl reboot && exit 0
fi
if command -v openrc-shutdown >/dev/null 2>&1; then
  openrc-shutdown -r now && exit 0
fi
if command -v shutdown >/dev/null 2>&1; then
  shutdown -r now && exit 0
  shutdown -r +0 && exit 0
fi
if command -v reboot >/dev/null 2>&1; then
  reboot && exit 0
  reboot -f && exit 0
fi
if command -v busybox >/dev/null 2>&1; then
  busybox reboot && exit 0
fi
if command -v telinit >/dev/null 2>&1; then
  telinit 6 && exit 0
fi
if command -v init >/dev/null 2>&1; then
  init 6 && exit 0
fi
exit 1
`.trim()
      : `
sleep 2
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl poweroff && exit 0
fi
if command -v loginctl >/dev/null 2>&1; then
  loginctl poweroff && exit 0
fi
if command -v openrc-shutdown >/dev/null 2>&1; then
  openrc-shutdown -p now && exit 0
fi
if command -v shutdown >/dev/null 2>&1; then
  shutdown -P now && exit 0
  shutdown -h now && exit 0
  shutdown -h +0 && exit 0
fi
if command -v poweroff >/dev/null 2>&1; then
  poweroff && exit 0
fi
if command -v halt >/dev/null 2>&1; then
  halt -p && exit 0
  halt && exit 0
fi
if command -v busybox >/dev/null 2>&1; then
  busybox poweroff && exit 0
  busybox halt && exit 0
fi
if command -v telinit >/dev/null 2>&1; then
  telinit 0 && exit 0
fi
if command -v init >/dev/null 2>&1; then
  init 0 && exit 0
fi
exit 1
`.trim();

  switch (action) {
    case "restart":
    case "poweroff":
      return `
set -eu
nohup sh -c '
${fallbackScript}
' >/dev/null 2>&1 < /dev/null &
echo "${successMessage}"
`.trim();
    default:
      return action satisfies never;
  }
}

function machineControlTemplateName(action: MachineControlAction) {
  switch (action) {
    case "restart":
      return "Reiniciar maquina";
    case "poweroff":
      return "Desligar maquina";
    default:
      return action satisfies never;
  }
}

async function buildMachineGroupAccess(
  machineId: string,
  viewer: {
    userId: string;
    role: "admin" | "member";
    canAccessGroupsScreen: boolean;
  },
): Promise<MachineGroupAccessView> {
  const [assignedGroups, availableGroups, canManage] = await Promise.all([
    loadAssignedMachineGroupOptions(machineId),
    loadMachineGroupOptions(),
    canManageMachineGroups(machineId, viewer),
  ]);

  return {
    assignedGroups,
    availableGroups,
    canManage,
  };
}

export async function getDashboardView(viewerUserId: string): Promise<DashboardView> {
  const [machines, executions, stats] = await Promise.all([
    loadMachines(undefined, viewerUserId, 10),
    loadExecutions(undefined, undefined, viewerUserId, DASHBOARD_EXECUTION_LIMIT),
    loadDashboardMachineStats(viewerUserId),
  ]);
  const machineViews = machines.map((machine) => toMachineView(machine));
  const dashboardMachines = [...machineViews]
    .sort((left, right) =>
      left.hostname.localeCompare(right.hostname, "pt-BR", { sensitivity: "base" }),
    )
    .slice(0, 10);
  const recentExecutions = executions.slice(0, 6).map(toExecutionLogView);

  return {
    total: stats.total,
    online: stats.online,
    offline: stats.offline,
    warning: stats.warning,
    recentExecutions,
    machines: dashboardMachines,
    avgCpu: stats.avgCpu,
    ramUsedTotal: stats.ramUsedTotal,
    ramTotal: stats.ramTotal,
  };
}

export async function getMachinesView(viewerUserId: string): Promise<MachinesPageView> {
  const [machines, pendingEnrollments] = await Promise.all([
    loadMachines(undefined, viewerUserId, MACHINE_LIST_LIMIT),
    loadPendingEnrollments(),
  ]);
  const deletePermissions = await loadMachineDeletePermissions(
    machines.map((machine) => machine.id),
    viewerUserId,
  );

  return {
    machines: machines.map((machine) => ({
      ...toMachineView(machine),
      canDelete: deletePermissions.get(machine.id) ?? false,
    })),
    pendingEnrollments: pendingEnrollments
      .map(safeToPendingMachineEnrollmentView)
      .filter((entry): entry is PendingMachineEnrollmentView => entry != null),
  };
}

export async function getMachineGroupsPageView(): Promise<MachineGroupsPageView> {
  const [groups, assignments, users] = await Promise.all([
    loadMachineGroupRows(),
    loadMachineGroupUserAssignments(),
    loadSelectableUsers(),
  ]);

  const ownersByGroupId = new Map<string, GroupSelectableUserView[]>();
  const membersByGroupId = new Map<string, GroupSelectableUserView[]>();

  for (const assignment of assignments) {
    const targetMap = assignment.group_role === "owner" ? ownersByGroupId : membersByGroupId;
    const current = targetMap.get(assignment.group_id) ?? [];
    current.push(
      toSelectableUserView({
        id: assignment.user_id,
        full_name: assignment.full_name,
        email: assignment.email,
        role: assignment.user_role,
        disabled: assignment.disabled,
      }),
    );
    targetMap.set(assignment.group_id, current);
  }

  return {
    groups: groups.map((group) => ({
      ...toMachineGroupOptionView(group),
      owners: ownersByGroupId.get(group.id) ?? [],
      members: membersByGroupId.get(group.id) ?? [],
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    })),
    users: users.map(toSelectableUserView),
  };
}

export async function previewMachineEnrollmentCommand(
  input: CreateMachineEnrollmentInput & { requestedBy: string },
): Promise<MachineEnrollmentCommandView> {
  const appOrigin = getEnv().APP_ORIGIN.replace(/\/+$/, "");
  const enrollmentToken = generateToken("enr");
  const location = trimOptionalValue(input.location);
  const agentName = input.agentName.trim();
  const installDir = input.installDir.trim();

  if (!installDir) {
    throw new Error("Informe um caminho valido para instalacao do agent.");
  }
  if (!agentName) {
    throw new Error("Informe o nome do agent.");
  }

  return {
    command: buildMachineInstallCommand({
      appOrigin,
      enrollmentToken,
      installDir,
      location,
      agentName,
    }),
    enrollmentToken,
    installScriptUrl: `${appOrigin}/api/agent/install.sh`,
    sourceBaseUrl: `${appOrigin}/api/agent/files`,
    installDir,
    location,
    agentName,
  };
}

export async function createMachineEnrollmentPending(
  input: FinalizeMachineEnrollmentInput & { requestedBy: string },
): Promise<PendingMachineEnrollmentCreateView> {
  const appOrigin = getEnv().APP_ORIGIN.replace(/\/+$/, "");
  const enrollmentToken = input.enrollmentToken.trim();
  const tokenHash = await sha256Hex(enrollmentToken);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const location = trimOptionalValue(input.location);
  const agentName = input.agentName.trim();
  const installDir = input.installDir.trim();
  const enrollmentId = crypto.randomUUID();

  if (!installDir) {
    throw new Error("Informe um caminho valido para instalacao do agent.");
  }
  if (!agentName) {
    throw new Error("Informe o nome do agent.");
  }

  await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM agent_enrollment_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    if (existing.rows[0]) {
      throw new Error("Este codigo ja foi utilizado. Gere um novo antes de criar.");
    }

    await client.query(
      `
        INSERT INTO agent_enrollment_tokens (
          id,
          token_hash,
          token_encrypted,
          created_by,
          created_at,
          expires_at,
          consumed_at,
          consumed_machine_id,
          consumed_agent_id,
          install_dir,
          location,
          agent_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, $8, $9)
      `,
      [
        enrollmentId,
        tokenHash,
        encryptPendingToken(enrollmentToken),
        input.requestedBy,
        createdAt,
        expiresAt,
        installDir,
        location,
        agentName,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "machine.enrollment.created",
      message: `Conta ${input.requestedBy} criou uma instalacao pendente do agent com validade ate ${formatExecutionDate(expiresAt)} para o caminho ${installDir}${location ? ` em ${location}` : ""}.`,
      createdAt,
      severity: "notice",
      metadata: {
        alert: false,
        enrollmentId,
        installDir,
        location,
      },
    });
  });

  return {
    enrollmentId,
    command: buildMachineInstallCommand({
      appOrigin,
      enrollmentToken,
      installDir,
      location,
      agentName,
    }),
    enrollmentToken,
    expiresAt,
    createdAt,
    installScriptUrl: `${appOrigin}/api/agent/install.sh`,
    sourceBaseUrl: `${appOrigin}/api/agent/files`,
    installDir,
    location,
    agentName,
  };
}

export async function updateMachineAgentName(
  input: UpdateMachineAgentNameInput & { requestedBy: string; requestedByUserId: string },
): Promise<{ agentName: string }> {
  const agentName = input.agentName.trim();

  if (!agentName) {
    throw new Error("Informe o nome do agent.");
  }

  await withTransaction(async (client) => {
    await assertViewerCanAccessMachine(input.machineId, input.requestedByUserId, client);

    const machineResult = await client.query<{
      id: string;
      hostname: string;
      agent_id: string;
      agent_label: string;
    }>(
      `
        SELECT
          m.id,
          m.hostname,
          m.agent_id,
          a.label AS agent_label
        FROM machines m
        INNER JOIN agents a ON a.id = m.agent_id
        WHERE m.id = $1
        FOR UPDATE OF a
      `,
      [input.machineId],
    );

    const machine = machineResult.rows[0];
    if (!machine) {
      throw new Error("Maquina nao encontrada.");
    }

    if (machine.agent_label === agentName) {
      return;
    }

    await client.query(
      `
        UPDATE agents
        SET label = $2
        WHERE id = $1
      `,
      [machine.agent_id, agentName],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "machine.agent_name.updated",
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Conta ${input.requestedBy} alterou o nome do agent de ${machine.agent_label} para ${agentName} em ${machine.hostname}.`,
      createdAt: new Date().toISOString(),
      severity: "notice",
      metadata: {
        alert: false,
        oldAgentName: machine.agent_label,
        newAgentName: agentName,
      },
    });
  });

  return { agentName };
}

export async function updateMachineScheduledTaskLimit(
  input: UpdateMachineScheduledTaskLimitInput & { requestedBy: string; requestedByUserId: string },
): Promise<{ scheduledTaskLimit: number }> {
  await withTransaction(async (client) => {
    await assertViewerCanAccessMachine(input.machineId, input.requestedByUserId, client);
    await assertViewerCanEditMachineScheduledTaskLimit(
      client,
      input.machineId,
      input.requestedByUserId,
    );

    const machineResult = await client.query<{
      id: string;
      hostname: string;
      scheduled_task_limit: number;
    }>(
      `
        SELECT id, hostname, scheduled_task_limit
        FROM machines
        WHERE id = $1
        FOR UPDATE
      `,
      [input.machineId],
    );

    const machine = machineResult.rows[0];
    if (!machine) {
      throw new Error("Maquina nao encontrada.");
    }

    if (machine.scheduled_task_limit === input.scheduledTaskLimit) {
      return;
    }

    const now = new Date().toISOString();
    await client.query(
      `
        UPDATE machines
        SET scheduled_task_limit = $2, updated_at = $3
        WHERE id = $1
      `,
      [input.machineId, input.scheduledTaskLimit, now],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "machine.scheduled_task_limit.updated",
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Conta ${input.requestedBy} alterou o limite de tarefas agendadas de ${machine.scheduled_task_limit} para ${input.scheduledTaskLimit} em ${machine.hostname}.`,
      createdAt: now,
      severity: "warn",
      metadata: {
        alert: true,
        oldScheduledTaskLimit: machine.scheduled_task_limit,
        newScheduledTaskLimit: input.scheduledTaskLimit,
      },
    });
  });

  return { scheduledTaskLimit: input.scheduledTaskLimit };
}

export async function getMachineDetailView(
  machineId: string,
  viewer: {
    userId: string;
    role: "admin" | "member";
    canAccessGroupsScreen: boolean;
  },
): Promise<MachineDetailView | null> {
  const [machines, logs, templates, canEditScheduledTaskLimit] = await Promise.all([
    loadMachines(machineId, viewer.userId),
    loadExecutions(machineId, undefined, viewer.userId, MACHINE_DETAIL_EXECUTION_LIMIT),
    loadTemplates(),
    canEditMachineScheduledTaskLimit(machineId, viewer.userId),
  ]);

  const machine = machines[0];
  if (!machine) {
    return null;
  }

  return {
    machine: toMachineView(machine, { canEditScheduledTaskLimit }),
    logs: logs.map(toExecutionLogView),
    templates: templates.map(toTemplateView),
    groupAccess: await buildMachineGroupAccess(machineId, viewer),
  };
}

export async function getTemplateCatalogView(viewerUserId: string): Promise<TemplateCatalogView> {
  const [templates, machines] = await Promise.all([
    loadTemplates(),
    loadMachines(undefined, viewerUserId, MACHINE_LIST_LIMIT),
  ]);
  return {
    templates: templates.map(toTemplateView),
    machines: machines.map((machine) => toMachineView(machine)),
  };
}

export async function getExecutionLogFeed(viewerUserId: string): Promise<ExecutionFeedView> {
  const [executions, recurringSchedules, audits] = await Promise.all([
    loadExecutions(undefined, undefined, viewerUserId, DEFAULT_LIST_LIMIT),
    loadRecurringSchedules(viewerUserId, undefined, DEFAULT_LIST_LIMIT),
    loadAuditLogs(80, viewerUserId),
  ]);
  const executionViews = executions.map(toExecutionLogView);

  return {
    executions: executionViews,
    scheduled: executionViews
      .filter((execution) => execution.status === "queued" && execution.isScheduled)
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt)),
    recurringSchedules: recurringSchedules.map(toRecurringScheduleView),
    audits: audits.map(toAuditLogView),
  };
}

export async function getExecutionDetailView(
  viewerUserId: string,
  executionId: string,
): Promise<ExecutionDetailView | null> {
  const executions = await loadExecutions(undefined, executionId, viewerUserId, 1);
  return executions[0] ? toExecutionLogView(executions[0]) : null;
}

export async function createMachineGroup(
  input: CreateMachineGroupInput & { requestedBy: string; requestedByUserId: string },
) {
  const ownerUserIds = normalizeIdList(input.ownerUserIds);
  const memberUserIds = normalizeIdList(input.memberUserIds).filter(
    (userId) => !ownerUserIds.includes(userId),
  );
  const name = input.name.trim();
  const description = input.description.trim();

  if (!name) {
    throw new Error("Informe um nome para o grupo.");
  }

  if (ownerUserIds.length === 0) {
    throw new Error("Selecione pelo menos um proprietario para o grupo.");
  }

  return withTransaction(async (client) => {
    const duplicate = await loadGroupByName(name, client);
    if (duplicate) {
      throw new Error("Ja existe um grupo com este nome.");
    }

    await assertUsersExist([...ownerUserIds, ...memberUserIds], client);

    const now = new Date().toISOString();
    const groupId = `grp-${crypto.randomUUID()}`;

    await client.query(
      `
        INSERT INTO machine_groups (
          id, name, description, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [groupId, name, description, input.requestedByUserId, now, now],
    );

    for (const userId of ownerUserIds) {
      await client.query(
        `
          INSERT INTO machine_group_users (group_id, user_id, role, created_at)
          VALUES ($1, $2, 'owner', $3)
        `,
        [groupId, userId, now],
      );
    }

    for (const userId of memberUserIds) {
      await client.query(
        `
          INSERT INTO machine_group_users (group_id, user_id, role, created_at)
          VALUES ($1, $2, 'member', $3)
        `,
        [groupId, userId, now],
      );
    }

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "group.created",
      message: `Conta ${input.requestedBy} criou o grupo ${name} com ${ownerUserIds.length} proprietario(s) e ${memberUserIds.length} membro(s).`,
      createdAt: now,
      severity: "notice",
      metadata: {
        alert: false,
        groupId,
        ownerCount: ownerUserIds.length,
        memberCount: memberUserIds.length,
      },
    });

    return { groupId };
  });
}

export async function updateMachineGroup(
  input: UpdateMachineGroupInput & { requestedBy: string; requestedByUserId: string },
) {
  const ownerUserIds = normalizeIdList(input.ownerUserIds);
  const memberUserIds = normalizeIdList(input.memberUserIds).filter(
    (userId) => !ownerUserIds.includes(userId),
  );
  const name = input.name.trim();
  const description = input.description.trim();

  if (!name) {
    throw new Error("Informe um nome para o grupo.");
  }

  if (ownerUserIds.length === 0) {
    throw new Error("Selecione pelo menos um proprietario para o grupo.");
  }

  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM machine_groups
        WHERE id = $1
        LIMIT 1
      `,
      [input.groupId],
    );

    const group = existing.rows[0];
    if (!group) {
      throw new Error("Grupo nao encontrado.");
    }

    const duplicate = await loadGroupByName(name, client);
    if (duplicate && duplicate.id !== input.groupId) {
      throw new Error("Ja existe um grupo com este nome.");
    }

    await assertUsersExist([...ownerUserIds, ...memberUserIds], client);

    const now = new Date().toISOString();

    await client.query(
      `
        UPDATE machine_groups
        SET
          name = $2,
          description = $3,
          updated_at = $4
        WHERE id = $1
      `,
      [input.groupId, name, description, now],
    );

    await client.query("DELETE FROM machine_group_users WHERE group_id = $1", [input.groupId]);

    for (const userId of ownerUserIds) {
      await client.query(
        `
          INSERT INTO machine_group_users (group_id, user_id, role, created_at)
          VALUES ($1, $2, 'owner', $3)
        `,
        [input.groupId, userId, now],
      );
    }

    for (const userId of memberUserIds) {
      await client.query(
        `
          INSERT INTO machine_group_users (group_id, user_id, role, created_at)
          VALUES ($1, $2, 'member', $3)
        `,
        [input.groupId, userId, now],
      );
    }

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "group.updated",
      message: `Conta ${input.requestedBy} atualizou o grupo ${name} com ${ownerUserIds.length} proprietario(s) e ${memberUserIds.length} membro(s).`,
      createdAt: now,
      severity: "notice",
      metadata: {
        alert: false,
        groupId: input.groupId,
        ownerCount: ownerUserIds.length,
        memberCount: memberUserIds.length,
      },
    });

    return { groupId: input.groupId };
  });
}

export async function assignMachineGroups(
  input: MachineGroupAssignmentInput & {
    requestedBy: string;
    requestedByUserId: string;
    requestedByRole: "admin" | "member";
    canAccessGroupsScreen: boolean;
  },
): Promise<MachineGroupAccessView> {
  const normalizedGroupIds = normalizeIdList(input.groupIds);

  await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Maquina nao encontrada.");
    }

    const canManage = await canManageMachineGroups(
      input.machineId,
      {
        userId: input.requestedByUserId,
        role: input.requestedByRole,
        canAccessGroupsScreen: input.canAccessGroupsScreen,
      },
      client,
    );
    if (!canManage) {
      throw new Error("Voce nao possui permissao para alterar os grupos desta maquina.");
    }

    if (normalizedGroupIds.length > 0) {
      const groups = await client.query<{ id: string; name: string }>(
        `
          SELECT id, name
          FROM machine_groups
          WHERE id = ANY($1::text[])
        `,
        [normalizedGroupIds],
      );

      if (groups.rows.length !== normalizedGroupIds.length) {
        throw new Error("Um ou mais grupos selecionados nao existem mais.");
      }
    }

    const currentGroupNames = await client.query<{ name: string }>(
      `
        SELECT grp.name
        FROM machine_group_links grp_link
        INNER JOIN machine_groups grp ON grp.id = grp_link.group_id
        WHERE grp_link.machine_id = $1
        ORDER BY grp.name ASC
      `,
      [input.machineId],
    );

    await client.query("DELETE FROM machine_group_links WHERE machine_id = $1", [input.machineId]);

    const now = new Date().toISOString();
    for (const groupId of normalizedGroupIds) {
      await client.query(
        `
          INSERT INTO machine_group_links (machine_id, group_id, created_at)
          VALUES ($1, $2, $3)
        `,
        [input.machineId, groupId, now],
      );
    }

    const nextGroupNames = await client.query<{ name: string }>(
      `
        SELECT name
        FROM machine_groups
        WHERE id = ANY($1::text[])
        ORDER BY name ASC
      `,
      [normalizedGroupIds],
    );

    const before = currentGroupNames.rows.map((row) => row.name).join(", ") || "Sem grupo";
    const after = nextGroupNames.rows.map((row) => row.name).join(", ") || "Sem grupo";

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "machine.groups.updated",
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Conta ${input.requestedBy} atualizou os grupos da maquina ${machine.hostname}: ${before} -> ${after}.`,
      createdAt: now,
      severity: "warn",
      metadata: {
        alert: true,
        before,
        after,
      },
    });
  });

  return buildMachineGroupAccess(input.machineId, {
    userId: input.requestedByUserId,
    role: input.requestedByRole,
    canAccessGroupsScreen: input.canAccessGroupsScreen,
  });
}

export async function createActionTemplate(
  input: CreateActionTemplateInput,
): Promise<ActionTemplateView> {
  return withTransaction(async (client) => {
    const baseId = slugifyKey(input.name) || "custom-template";
    const templateId = `custom-${baseId}-${crypto.randomUUID().slice(0, 8)}`;
    const templateDescription = input.description.trim() || null;

    await client.query(
      `
        INSERT INTO action_templates (
          id, name, description, service, target_distro_ids, target_distro_families,
          command, estimated_seconds, risk, enabled
        )
        VALUES ($1, $2, $3, 'system', $4::jsonb, '[]'::jsonb, $5, $6, $7, 1)
      `,
      [
        templateId,
        input.name.trim(),
        templateDescription,
        "[]",
        input.command.trim(),
        15,
        input.risk,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "template.created",
      message: `Conta ${input.requestedBy} criou o template ${input.name.trim()} (${templateId}).`,
      createdAt: new Date().toISOString(),
      severity: "notice",
      metadata: {
        alert: false,
        templateId,
        risk: input.risk,
      },
    });

    return {
      id: templateId,
      name: input.name.trim(),
      description: templateDescription ?? "",
      service: "system",
      targetDistroIds: [],
      targetDistroFamilies: [],
      systemScope: formatTemplateSystemScope({
        targetDistroIds: [],
        targetDistroFamilies: [],
      }),
      command: input.command.trim(),
      estimatedTime: formatEstimatedTime(15),
      risk: input.risk,
    };
  });
}

export async function updateActionTemplate(
  input: UpdateActionTemplateInput,
): Promise<ActionTemplateView> {
  return withTransaction(async (client) => {
    const template = await loadTemplateById(client, input.templateId);
    if (!template) {
      throw new Error("Template não encontrado.");
    }

    const updatedAt = new Date().toISOString();
    const templateDescription = input.description.trim() || null;

    await client.query(
      `
        UPDATE action_templates
        SET
          name = $2,
          description = $3,
          target_distro_ids = $4::jsonb,
          target_distro_families = '[]'::jsonb,
          command = $5,
          risk = $6
        WHERE id = $1
      `,
      [
        input.templateId,
        input.name.trim(),
        templateDescription,
        "[]",
        input.command.trim(),
        input.risk,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "template.updated",
      message: `Conta ${input.requestedBy} atualizou o template ${input.name.trim()} (${input.templateId}).`,
      createdAt: updatedAt,
      severity: "notice",
      metadata: {
        alert: false,
        templateId: input.templateId,
        risk: input.risk,
      },
    });

    return {
      id: input.templateId,
      name: input.name.trim(),
      description: templateDescription ?? "",
      service: template.service,
      targetDistroIds: [],
      targetDistroFamilies: [],
      systemScope: formatTemplateSystemScope({
        targetDistroIds: [],
        targetDistroFamilies: [],
      }),
      command: input.command.trim(),
      estimatedTime: formatEstimatedTime(template.estimated_seconds),
      risk: input.risk,
    };
  });
}

export async function deleteActionTemplate(
  input: TemplateLookupInput & { requestedBy: string },
): Promise<{ templateId: string; cancelledExecutions: number }> {
  return withTransaction(async (client) => {
    const template = await loadTemplateById(client, input.templateId);
    if (!template) {
      throw new Error("Template não encontrado.");
    }

    const now = new Date().toISOString();
    const cancellationMessage = "Execução cancelada porque o template foi excluído.";

    const cancelled = await client.query<{
      id: string;
      machine_id: string;
      machine_hostname: string;
    }>(
      `
        UPDATE action_executions
        SET
          status = 'cancelled',
          finished_at = COALESCE(finished_at, $2),
          error_output = CASE
            WHEN COALESCE(error_output, '') = '' THEN $3
            ELSE error_output || CHR(10) || $3
          END
        WHERE template_id = $1 AND status IN ('queued', 'dispatched')
        RETURNING id, machine_id, machine_hostname
      `,
      [input.templateId, now, cancellationMessage],
    );

    const cancelledSchedules = await client.query<{
      id: string;
      machine_id: string;
      machine_hostname: string;
    }>(
      `
        UPDATE action_schedules
        SET status = 'cancelled', updated_at = $2
        WHERE template_id = $1 AND status = 'active'
        RETURNING id, machine_id, machine_hostname
      `,
      [input.templateId, now],
    );

    for (const execution of cancelled.rows) {
      await client.query(
        `
          INSERT INTO audit_logs (
            id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
            created_at
          )
          VALUES ($1, $2, $3, $4, 'panel', $5, 'execution.cancelled', $6, $7)
        `,
        [
          crypto.randomUUID(),
          execution.id,
          execution.machine_id,
          execution.machine_hostname,
          input.requestedBy,
          `Conta ${input.requestedBy} cancelou a execução ${execution.id} porque o template ${template.name} foi excluído.`,
          now,
        ],
      );
    }

    for (const schedule of cancelledSchedules.rows) {
      await client.query(
        `
          INSERT INTO audit_logs (
            id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
            created_at
          )
          VALUES ($1, NULL, $2, $3, 'panel', $4, 'schedule.cancelled', $5, $6)
        `,
        [
          crypto.randomUUID(),
          schedule.machine_id,
          schedule.machine_hostname,
          input.requestedBy,
          `Conta ${input.requestedBy} cancelou a recorrencia ${schedule.id} porque o template ${template.name} foi excluido.`,
          now,
        ],
      );
    }

    await client.query(
      `
        UPDATE action_executions
        SET template_id = NULL
        WHERE template_id = $1
      `,
      [input.templateId],
    );

    await client.query(
      `
        UPDATE action_schedules
        SET template_id = NULL
        WHERE template_id = $1
      `,
      [input.templateId],
    );

    await client.query(
      `
        DELETE FROM action_templates
        WHERE id = $1
      `,
      [input.templateId],
    );

    await client.query(
      `
        INSERT INTO audit_logs (
          id, execution_id, machine_id, actor_type, actor_id, action, message, created_at
        )
        VALUES ($1, NULL, NULL, 'panel', $2, 'template.deleted', $3, $4)
      `,
      [
        crypto.randomUUID(),
        input.requestedBy,
        `Conta ${input.requestedBy} excluiu o template ${template.name} (${input.templateId}) e cancelou ${cancelled.rows.length} execuções pendentes.`,
        now,
      ],
    );

    return {
      templateId: input.templateId,
      cancelledExecutions: cancelled.rows.length,
    };
  });
}

function resolveAvailableAt(scheduledFor?: string) {
  if (!scheduledFor) {
    return null;
  }

  const scheduledDate = new Date(scheduledFor);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error("Data de agendamento invalida.");
  }
  if (scheduledDate.getTime() < Date.now()) {
    throw new Error("O agendamento so pode ser criado para uma data e horario futuros.");
  }

  return scheduledDate.toISOString();
}

function resolveScheduleStartsAt(startsAt: string) {
  const startDate = new Date(startsAt);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Data inicial da recorrencia invalida.");
  }
  if (startDate.getTime() < Date.now()) {
    throw new Error("A recorrencia so pode comecar a partir da data e horario atuais.");
  }

  return startDate.toISOString();
}

export async function createRecurringTemplateSchedule(
  input: RecurringTemplateScheduleInput & { requestedByUserId: string },
): Promise<RecurringScheduleView> {
  const schedule = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Maquina nao encontrada.");
    }

    const template = await loadTemplateById(client, input.templateId);
    if (!template) {
      throw new Error("Template nao encontrado.");
    }

    const scheduleId = crypto.randomUUID();
    const now = new Date().toISOString();
    const startsAt = resolveScheduleStartsAt(input.startsAt);
    const intervalHours = intervalDaysToHours(input.intervalDays);
    const protectedCommand = protectExecutionCommand(template.command);

    await client.query(
      `
        INSERT INTO action_schedules (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service,
          command, command_encrypted, interval_hours, status, requested_by, created_at,
          updated_at, starts_at, next_run_at, last_run_at, last_execution_id, failure_count
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $12, $12, $13, $13,
          NULL, NULL, 0
        )
      `,
      [
        scheduleId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        template.id,
        template.name,
        template.service,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        intervalHours,
        input.requestedBy,
        now,
        startsAt,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "schedule.created",
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Conta ${input.requestedBy} criou recorrencia do template ${template.name} para ${machine.hostname} a cada ${formatIntervalHours(intervalHours)}.`,
      createdAt: now,
      severity: template.risk === "high" ? "warn" : "notice",
      metadata: {
        alert: template.risk === "high",
        scheduleId,
        templateId: template.id,
        intervalDays: input.intervalDays,
        intervalHours,
        startsAt,
      },
    });

    return toRecurringScheduleView({
      id: scheduleId,
      machine_id: machine.id,
      machine_hostname: machine.hostname,
      machine_exists: true,
      template_id: template.id,
      template_name: template.name,
      service: template.service,
      command: protectedCommand.redactedCommand,
      interval_hours: intervalHours,
      status: "active",
      requested_by: input.requestedBy,
      created_at: now,
      starts_at: startsAt,
      next_run_at: startsAt,
      last_run_at: null,
      last_execution_id: null,
      failure_count: 0,
    });
  });

  if (new Date(schedule.startsAt).getTime() <= Date.now()) {
    const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
    notifyAgentQueueAvailable(schedule.machineId);
  }

  return schedule;
}

export async function cancelRecurringTemplateSchedule(
  input: RecurringScheduleLookupInput & { requestedBy: string; requestedByUserId: string },
): Promise<{ scheduleId: string; cancelledExecutions: number }> {
  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const schedules = await client.query<ScheduleRow>(
      `
        SELECT
          schedule.id,
          schedule.machine_id,
          COALESCE(NULLIF(schedule.machine_hostname, ''), machine.hostname, schedule.machine_id) AS machine_hostname,
          (machine.id IS NOT NULL) AS machine_exists,
          schedule.template_id,
          schedule.template_name,
          schedule.service,
          schedule.command,
          schedule.interval_hours,
          schedule.status,
          schedule.requested_by,
          schedule.created_at,
          schedule.starts_at,
          schedule.next_run_at,
          schedule.last_run_at,
          schedule.last_execution_id,
          schedule.failure_count
        FROM action_schedules schedule
        LEFT JOIN machines machine ON machine.id = schedule.machine_id
        WHERE schedule.id = $1
          AND schedule.status = 'active'
          AND ${machineAccessCondition("schedule.machine_id", "$2")}
        LIMIT 1
        FOR UPDATE OF schedule
      `,
      [input.scheduleId, input.requestedByUserId],
    );

    const schedule = schedules.rows[0];
    if (!schedule) {
      throw new Error("Recorrencia nao encontrada ou sem permissao.");
    }

    await client.query(
      `
        UPDATE action_schedules
        SET status = 'cancelled', updated_at = $2
        WHERE id = $1
      `,
      [input.scheduleId, now],
    );

    const cancelled = await client.query<{ id: string }>(
      `
        UPDATE action_executions
        SET
          status = 'cancelled',
          finished_at = COALESCE(finished_at, $2),
          error_output = CASE
            WHEN COALESCE(error_output, '') = '' THEN 'Execucao cancelada porque a recorrencia foi cancelada.'
            ELSE error_output || CHR(10) || 'Execucao cancelada porque a recorrencia foi cancelada.'
          END
        WHERE schedule_id = $1 AND status = 'queued'
        RETURNING id
      `,
      [input.scheduleId, now],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "schedule.cancelled",
      machineId: schedule.machine_id,
      machineHostname: schedule.machine_hostname,
      message: `Conta ${input.requestedBy} cancelou a recorrencia ${input.scheduleId} do template ${schedule.template_name}.`,
      createdAt: now,
      severity: "warn",
      metadata: {
        alert: true,
        scheduleId: input.scheduleId,
        cancelledExecutions: cancelled.rows.length,
      },
    });

    return {
      scheduleId: input.scheduleId,
      cancelledExecutions: cancelled.rows.length,
    };
  });
}

export async function queueTemplateExecution(
  input: ExecuteActionInput & { requestedByUserId: string },
): Promise<ExecutionDetailView> {
  const result = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Máquina não encontrada.");
    }

    const templates = await client.query<TemplateRow>(
      `
        SELECT
          id,
          name,
          description,
          service,
          target_distro_ids,
          target_distro_families,
          command,
          estimated_seconds,
          risk,
          enabled
        FROM action_templates
        WHERE id = $1 AND enabled = 1
        LIMIT 1
      `,
      [input.templateId],
    );

    const template = templates.rows[0];
    if (!template) {
      throw new Error("Template não encontrado.");
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const scheduledFor = resolveAvailableAt(input.scheduledFor);
    const availableAt =
      scheduledFor && new Date(scheduledFor).getTime() > new Date(requestedAt).getTime()
        ? scheduledFor
        : requestedAt;
    const isScheduled = availableAt !== requestedAt;
    const protectedCommand = protectExecutionCommand(template.command);

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'template', 'queued',
          $10, $11, $12, NULL, NULL, NULL, 120, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        template.id,
        template.name,
        template.service,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        input.requestedBy,
        requestedAt,
        availableAt,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "execution.requested",
      executionId,
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: isScheduled
        ? `Conta ${input.requestedBy} criou um agendamento do template ${template.name} para a maquina ${machine.hostname} em ${formatExecutionDate(availableAt)}.`
        : `Conta ${input.requestedBy} executou o template ${template.name} para a maquina ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
      createdAt: requestedAt,
      severity: template.risk === "high" ? "warn" : "notice",
      metadata: {
        alert: template.risk === "high",
        executionKind: "template",
        templateId: template.id,
        risk: template.risk,
        scheduled: isScheduled,
      },
    });

    return {
      id: executionId,
      executionKind: "template" as const,
      templateId: template.id,
      templateName: template.name,
      machineId: machine.id,
      machineHostname: machine.hostname,
      machineAvailable: true,
      executedAt: formatExecutionDate(availableAt),
      durationMs: 0,
      status: "queued" as const,
      output: "",
      errorOutput: "",
      command: protectedCommand.redactedCommand,
      requestedBy: input.requestedBy,
      requestedAt,
      availableAt,
      isScheduled,
      description: isScheduled
        ? `Agendado por ${input.requestedBy} para ${machine.hostname} em ${formatExecutionDate(availableAt)}.`
        : `Executado por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
    };
  });

  if (!result.isScheduled) {
    const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
    notifyAgentQueueAvailable(result.machineId);
  }

  return result;
}

export async function startRealtimeTemplateExecution(
  input: StartRealtimeTemplateExecutionInput & {
    openedByUserId: string;
    requestedByUserId: string;
  },
): Promise<RealtimeTemplateExecutionView> {
  const created = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Máquina não encontrada.");
    }

    const machineView = toMachineView(machine);
    if (machineView.status === "offline") {
      throw new Error("A máquina está offline. Aguarde um heartbeat antes de executar o template.");
    }

    const template = await loadTemplateById(client, input.templateId);
    if (!template) {
      throw new Error("Template não encontrado.");
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const protectedCommand = protectExecutionCommand(template.command);

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'template', 'running',
          $10, $11, $11, $11, $11, NULL, 120, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        template.id,
        template.name,
        template.service,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        input.requestedBy,
        requestedAt,
      ],
    );

    await client.query(
      `
        INSERT INTO audit_logs (
          id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'panel', $5, 'execution.realtime.started', $6, $7)
      `,
      [
        crypto.randomUUID(),
        executionId,
        machine.id,
        machine.hostname,
        input.requestedBy,
        `Conta ${input.requestedBy} iniciou o template ${template.name} em shell ao vivo na máquina ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
        requestedAt,
      ],
    );

    return {
      execution: {
        id: executionId,
        executionKind: "template" as const,
        templateId: template.id,
        templateName: template.name,
        machineId: machine.id,
        machineHostname: machine.hostname,
        machineAvailable: true,
        executedAt: formatExecutionDate(requestedAt),
        durationMs: 0,
        status: "running" as const,
        output: "",
        errorOutput: "",
        command: protectedCommand.redactedCommand,
        requestedBy: input.requestedBy,
        requestedAt,
        availableAt: requestedAt,
        isScheduled: false,
        description: `Executado por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
      },
      command: protectedCommand.rawCommand,
    };
  });

  try {
    const { openRealtimeTerminalSession } = await import("./terminal-realtime.server");
    const session = await openRealtimeTerminalSession(
      {
        machineId: input.machineId,
        cols: input.cols,
        rows: input.rows,
      },
      {
        userId: input.openedByUserId,
        actorId: input.requestedBy,
      },
      {
        executionId: created.execution.id,
        command: created.command,
        timeoutSec: 120,
      },
    );

    return {
      execution: created.execution,
      session,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error ? error.message : "Não foi possível abrir o shell da execução.";

    await withTransaction(async (client) => {
      await client.query(
        `
          UPDATE action_executions
          SET
            status = 'failed',
            finished_at = $2,
            duration_ms = 0,
            exit_code = 1,
            error_output = $3
          WHERE id = $1
        `,
        [created.execution.id, finishedAt, redactSensitiveText(message)],
      );

      await client.query(
        `
          INSERT INTO audit_logs (
            id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
            created_at
          )
          VALUES ($1, $2, $3, $4, 'system', 'api', 'execution.realtime.failed', $5, $6)
        `,
        [
          crypto.randomUUID(),
          created.execution.id,
          created.execution.machineId,
          created.execution.machineHostname,
          `Falha ao abrir o shell ao vivo para a execução ${created.execution.id}: ${message}`,
          finishedAt,
        ],
      );
    });

    throw error;
  }
}

export async function queueRemoteTerminalCommand(
  input: RemoteTerminalInput & { requestedByUserId: string },
): Promise<ExecutionDetailView> {
  const result = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Máquina não encontrada.");
    }

    const machineView = toMachineView(machine);
    if (machineView.status === "offline") {
      throw new Error("A máquina está offline. Aguarde um heartbeat antes de abrir o terminal.");
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const command = input.command.trim();
    const protectedCommand = protectExecutionCommand(command);

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, NULL, 'Terminal remoto', 'system', $5, $6, 'terminal', 'queued',
          $7, $8, $8, NULL, NULL, NULL, $9, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        input.requestedBy,
        requestedAt,
        input.timeoutSec,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "terminal.requested",
      executionId,
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Comando enviado ao terminal remoto de ${machine.hostname}: ${protectedCommand.redactedCommand.slice(0, 140)}`,
      createdAt: requestedAt,
      severity: "warn",
      metadata: {
        alert: true,
        executionKind: "terminal",
      },
    });

    return {
      id: executionId,
      executionKind: "terminal" as const,
      templateId: "terminal-remote-shell",
      templateName: "Terminal remoto",
      machineId: machine.id,
      machineHostname: machine.hostname,
      machineAvailable: true,
      executedAt: formatExecutionDate(requestedAt),
      durationMs: 0,
      status: "queued" as const,
      output: "",
      errorOutput: "",
      command: protectedCommand.redactedCommand,
      requestedBy: input.requestedBy,
      requestedAt,
      availableAt: requestedAt,
      isScheduled: false,
      description: `Executado por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
    };
  });

  const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
  notifyAgentQueueAvailable(result.machineId);

  return result;
}

export async function queueMachineControlAction(
  input: MachineControlActionInput & { requestedByUserId: string },
): Promise<ExecutionDetailView> {
  const result = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Máquina não encontrada.");
    }

    const machineView = toMachineView(machine);
    if (machineView.status === "offline") {
      throw new Error(
        `A máquina está offline. Aguarde um heartbeat antes de solicitar ${
          input.action === "restart" ? "o reinício" : "o desligamento"
        }.`,
      );
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const command = buildMachineControlCommand(input.action);
    const templateName = machineControlTemplateName(input.action);
    const protectedCommand = protectExecutionCommand(command);

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, NULL, $5, 'system', $6, $7, 'terminal', 'queued',
          $8, $9, $9, NULL, NULL, NULL, 120, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        templateName,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        input.requestedBy,
        requestedAt,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: `machine.${input.action}.requested`,
      executionId,
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `${templateName} solicitado para ${machine.hostname}.`,
      createdAt: requestedAt,
      severity: "warn",
      metadata: {
        alert: true,
        action: input.action,
        executionKind: "terminal",
      },
    });

    return {
      id: executionId,
      executionKind: "terminal" as const,
      templateId: `machine-control-${input.action}`,
      templateName,
      machineId: machine.id,
      machineHostname: machine.hostname,
      machineAvailable: true,
      executedAt: formatExecutionDate(requestedAt),
      durationMs: 0,
      status: "queued" as const,
      output: "",
      errorOutput: "",
      command: protectedCommand.redactedCommand,
      requestedBy: input.requestedBy,
      requestedAt,
      availableAt: requestedAt,
      isScheduled: false,
      description: `Executado por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
    };
  });

  const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
  notifyAgentQueueAvailable(result.machineId);

  return result;
}

export async function queueMachineSync(input: {
  machineId: string;
  requestedBy: string;
  requestedByUserId: string;
}): Promise<ExecutionDetailView> {
  const result = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("MÃ¡quina nÃ£o encontrada.");
    }

    const machineView = toMachineView(machine);
    if (machineView.status === "offline") {
      throw new Error("A mÃ¡quina estÃ¡ offline. Aguarde um heartbeat antes de sincronizar.");
    }

    await client.query("SELECT id FROM machines WHERE id = $1 FOR UPDATE", [machine.id]);

    const cooldownStartedAt = new Date(Date.now() - MACHINE_SYNC_COOLDOWN_MS).toISOString();
    const recent = await client.query<{ requested_at: string }>(
      `
        SELECT requested_at
        FROM action_executions
        WHERE machine_id = $1
          AND template_name = 'Sincronizar agent'
          AND requested_at > $2
        ORDER BY requested_at DESC
        LIMIT 1
      `,
      [machine.id, cooldownStartedAt],
    );

    const recentRequestedAt = recent.rows[0]?.requested_at;
    if (recentRequestedAt) {
      const remainingMs =
        MACHINE_SYNC_COOLDOWN_MS - (Date.now() - new Date(recentRequestedAt).getTime());
      const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      throw new Error(`Aguarde ${remainingSeconds}s antes de atualizar esta mÃ¡quina novamente.`);
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const templateName = "Sincronizar agent";

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, NULL, $5, 'system', $6, '', 'terminal', 'queued',
          $7, $8, $8, NULL, NULL, NULL, 60, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        templateName,
        AGENT_SYNC_COMMAND,
        input.requestedBy,
        requestedAt,
      ],
    );

    await appendPanelAuditLog(client, {
      actorType: "panel",
      actorId: input.requestedBy,
      action: "machine.sync.requested",
      executionId,
      machineId: machine.id,
      machineHostname: machine.hostname,
      message: `Conta ${input.requestedBy} solicitou sincronizaÃ§Ã£o imediata do agent na mÃ¡quina ${machine.hostname}.`,
      createdAt: requestedAt,
      severity: "notice",
      metadata: {
        executionKind: "terminal",
        action: "agent_sync",
      },
    });

    return {
      id: executionId,
      executionKind: "terminal" as const,
      templateId: "agent-sync",
      templateName,
      machineId: machine.id,
      machineHostname: machine.hostname,
      machineAvailable: true,
      executedAt: formatExecutionDate(requestedAt),
      durationMs: 0,
      status: "queued" as const,
      output: "",
      errorOutput: "",
      command: AGENT_SYNC_COMMAND,
      requestedBy: input.requestedBy,
      requestedAt,
      availableAt: requestedAt,
      isScheduled: false,
      description: `SincronizaÃ§Ã£o solicitada por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
    };
  });

  const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
  notifyAgentQueueAvailable(result.machineId);

  return result;
}

export async function queueMachineAgentUninstall(input: {
  machineId: string;
  requestedBy: string;
  requestedByUserId: string;
}): Promise<ExecutionDetailView> {
  const result = await withTransaction(async (client) => {
    const machine = await loadMachineForQueue(client, input.machineId, input.requestedByUserId);
    if (!machine) {
      throw new Error("Máquina não encontrada.");
    }

    const machineView = toMachineView(machine);
    if (machineView.status === "offline") {
      throw new Error(
        "A máquina está offline. Aguarde um heartbeat antes de solicitar a desinstalação.",
      );
    }

    await assertViewerCanDeleteMachine(client, machine.id, input.requestedByUserId);

    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM action_executions
        WHERE machine_id = $1
          AND status IN ('queued', 'dispatched', 'running')
          AND template_name = 'Desinstalar agent'
        LIMIT 1
      `,
      [machine.id],
    );

    if (existing.rows[0]) {
      throw new Error("Já existe uma desinstalação do agent em andamento para esta máquina.");
    }

    const executionId = crypto.randomUUID();
    const requestedAt = new Date().toISOString();
    const templateName = "Desinstalar agent";
    const uninstallCommand = buildAgentSelfUninstallCommand();
    const protectedCommand = protectExecutionCommand(uninstallCommand);

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service, command,
          command_encrypted, execution_kind, status, requested_by, requested_at, available_at,
          dispatched_at, started_at, finished_at, timeout_sec, duration_ms, exit_code, output,
          error_output
        )
        VALUES (
          $1, $2, $3, $4, NULL, $5, 'system', $6, $7, 'terminal', 'queued',
          $8, $9, $9, NULL, NULL, NULL, 180, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        machine.id,
        machine.hostname,
        machine.agent_id,
        templateName,
        protectedCommand.redactedCommand,
        protectedCommand.encryptedCommand,
        input.requestedBy,
        requestedAt,
      ],
    );

    await client.query(
      `
        INSERT INTO audit_logs (
          id, execution_id, machine_id, machine_hostname, actor_type, actor_id, action, message,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'panel', $5, 'machine.agent.uninstall.requested', $6, $7)
      `,
      [
        crypto.randomUUID(),
        executionId,
        machine.id,
        machine.hostname,
        input.requestedBy,
        `Conta ${input.requestedBy} solicitou a desinstalação completa do agent na máquina ${machine.hostname}.`,
        requestedAt,
      ],
    );

    return {
      id: executionId,
      executionKind: "terminal" as const,
      templateId: "agent-self-uninstall",
      templateName,
      machineId: machine.id,
      machineHostname: machine.hostname,
      machineAvailable: true,
      executedAt: formatExecutionDate(requestedAt),
      durationMs: 0,
      status: "queued" as const,
      output: "",
      errorOutput: "",
      command: protectedCommand.redactedCommand,
      requestedBy: input.requestedBy,
      requestedAt,
      availableAt: requestedAt,
      isScheduled: false,
      description: `Executado por ${input.requestedBy} em ${machine.hostname} em ${formatExecutionDate(requestedAt)}.`,
    };
  });

  const { notifyAgentQueueAvailable } = await import("./terminal-realtime.server");
  notifyAgentQueueAvailable(result.machineId);

  return result;
}
