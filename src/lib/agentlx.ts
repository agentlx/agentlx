import { z } from "zod";
import type { UserRole } from "@/lib/auth";

function optionalNonEmptyString(maxLength: number) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }
    return value;
  }, z.string().min(1).max(maxLength).optional());
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function requiredTrimmedString(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, "Campo obrigatorio.")
    .max(maxLength)
    .refine((value) => !hasControlCharacters(value), {
      message: "Caracteres de controle nao sao permitidos.",
    });
}

export const machineStatusValues = ["online", "offline", "warning"] as const;
export type MachineStatus = (typeof machineStatusValues)[number];

export const executionStatusValues = [
  "queued",
  "dispatched",
  "running",
  "success",
  "failed",
  "cancelled",
] as const;
export type ExecutionStatus = (typeof executionStatusValues)[number];

export const actionRiskValues = ["low", "medium", "high"] as const;
export type ActionRisk = (typeof actionRiskValues)[number];

export const recurringScheduleStatusValues = ["active", "paused", "cancelled"] as const;
export type RecurringScheduleStatus = (typeof recurringScheduleStatusValues)[number];

export const MAX_RECURRING_INTERVAL_DAYS = 100_000;
export const MAX_MACHINE_SCHEDULED_TASK_LIMIT = 50;
export const LIST_PAGE_LIMIT = 50;
export const MAX_LIST_PAGE_LIMIT = 100;

export const machineControlActionValues = ["restart", "poweroff"] as const;
export type MachineControlAction = (typeof machineControlActionValues)[number];

export const machineGroupRoleValues = ["member", "owner"] as const;
export type MachineGroupRole = (typeof machineGroupRoleValues)[number];

const nullableCursorSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .optional()
  .nullable()
  .transform((value) => value ?? null);

const pageLimitSchema = z.number().int().min(1).max(MAX_LIST_PAGE_LIMIT).default(LIST_PAGE_LIMIT);

export const machinePageInputSchema = z.object({
  cursor: nullableCursorSchema,
  limit: pageLimitSchema,
  search: z.string().trim().max(120).default(""),
  status: z.enum(["all", ...machineStatusValues]).default("all"),
});

export const executionLogPageInputSchema = z.object({
  executionsCursor: nullableCursorSchema,
  auditsCursor: nullableCursorSchema,
  limit: pageLimitSchema,
  auditsLimit: pageLimitSchema,
});

export type CursorPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export const serviceDetectionSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9._@-]{0,63}$/),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !hasControlCharacters(value), {
      message: "Caracteres de controle nao sao permitidos.",
    })
    .optional(),
  version: z.string().min(1).max(64).optional(),
  detectedBy: z.enum(["agent", "seed", "manual"]).default("agent"),
});

export const linuxDistributionSchema = z.object({
  id: z.string().min(1).max(64),
  family: z.string().min(1).max(64),
  version: z.string().max(64).default(""),
  name: z.string().min(1).max(120),
  prettyName: z.string().min(1).max(120),
  like: z.array(z.string().min(1).max(64)).default([]),
});

export const machineSnapshotSchema = z.object({
  hostname: z.string().min(1).max(120),
  ip: z.string().min(1).max(120),
  os: z.string().min(1).max(120),
  kernel: z.string().min(1).max(120),
  arch: z.string().min(1).max(64),
  distribution: linuxDistributionSchema.optional(),
  location: z.string().max(120).optional().default(""),
  uptimeSec: z.number().int().nonnegative(),
  cpuPercent: z.number().min(0).max(100),
  ramUsedGb: z.number().min(0),
  ramTotalGb: z.number().positive(),
  diskPercent: z.number().min(0).max(100),
  services: z.array(serviceDetectionSchema).max(128).default([]),
  collectedAt: z.string().datetime().optional(),
});

export const agentRegistrationSchema = z.object({
  agentId: optionalNonEmptyString(120),
  agentName: z.string().min(1).max(12).optional(),
  machineId: optionalNonEmptyString(120),
  agentVersion: z.string().min(1).max(80).default("agentlx-linux-0.1.0"),
  pollIntervalSec: z.number().int().min(10).max(300).default(30),
  snapshot: machineSnapshotSchema,
});

export const agentHeartbeatSchema = z.object({
  agentVersion: z.string().min(1).max(80).default("agentlx-linux-0.1.0"),
  snapshot: machineSnapshotSchema,
  lastHeartbeatAt: z.string().datetime().optional(),
  includeInventory: z.boolean().default(true),
});

export const agentPollSchema = z.object({
  limit: z.number().int().min(1).max(10).default(3),
});

export const executionResultSchema = z.object({
  executionId: z.string().min(1).max(80),
  status: z.enum(["success", "failed"]),
  output: z.string().max(50_000).default(""),
  errorOutput: z.string().max(20_000).default(""),
  exitCode: z.number().int().default(0),
  durationMs: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
});

export const executeActionInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  templateId: z.string().min(1).max(120),
  scheduledFor: z.string().datetime().optional(),
  requestedBy: z.string().min(1).max(120).default("admin_devops_01"),
});

export const recurringTemplateScheduleInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  templateId: z.string().min(1).max(120),
  startsAt: z.string().datetime(),
  intervalDays: z.number().int().min(1).max(MAX_RECURRING_INTERVAL_DAYS),
  requestedBy: z.string().min(1).max(120).default("admin_devops_01"),
});

export const recurringScheduleLookupSchema = z.object({
  scheduleId: z.string().min(1).max(80),
});

export const linuxDistributionTemplateValues = [
  "all-linux",
  "ubuntu",
  "debian",
  "rhel",
  "redhat",
  "centos",
  "centos-stream",
  "fedora",
  "rocky",
  "almalinux",
  "cloudlinux",
  "gentoo",
  "arch",
  "manjaro",
  "alpine",
  "opensuse",
  "opensuse-leap",
  "sles",
  "ol",
  "amazon",
  "amzn",
  "linuxmint",
  "pop",
  "raspbian",
  "devuan",
  "elementary",
  "neon",
  "linux",
] as const;

export const createActionTemplateInputSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(240).default(""),
  command: z.string().min(1).max(4_000),
  risk: z.enum(actionRiskValues).default("low"),
  requestedBy: z.string().min(1).max(120).default("admin_devops_01"),
});

export const updateActionTemplateInputSchema = createActionTemplateInputSchema.extend({
  templateId: z.string().min(1).max(120),
});

export const templateLookupSchema = z.object({
  templateId: z.string().min(1).max(120),
});

export const remoteTerminalInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  command: z.string().min(1).max(8_000),
  timeoutSec: z.number().int().min(5).max(900).default(120),
  requestedBy: z.string().min(1).max(120).default("terminal_console"),
});

export const machineControlActionInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  action: z.enum(machineControlActionValues),
  requestedBy: z.string().min(1).max(120).default("admin_devops_01"),
});

export const openRealtimeTerminalSessionInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  cols: z.number().int().min(40).max(300).default(120),
  rows: z.number().int().min(10).max(120).default(30),
});

export const startRealtimeTemplateExecutionInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  templateId: z.string().min(1).max(120),
  cols: z.number().int().min(40).max(300).default(120),
  rows: z.number().int().min(10).max(120).default(30),
  requestedBy: z.string().min(1).max(120).default("admin_devops_01"),
});

export const executionLookupSchema = z.object({
  executionId: z.string().min(1).max(80),
});

export const machineLookupSchema = z.object({
  machineId: z.string().min(1).max(120),
});

export const machineGroupLookupSchema = z.object({
  groupId: z.string().min(1).max(120),
});

export const createMachineGroupInputSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(240).default(""),
  memberUserIds: z.array(z.string().min(1).max(120)).default([]),
  ownerUserIds: z.array(z.string().min(1).max(120)).default([]),
});

export const updateMachineGroupInputSchema = createMachineGroupInputSchema.extend({
  groupId: z.string().min(1).max(120),
});

export const machineGroupAssignmentInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  groupIds: z.array(z.string().min(1).max(120)).max(200).default([]),
});

export const createMachineEnrollmentInputSchema = z.object({
  location: z.string().max(120).default(""),
  agentName: requiredTrimmedString(12),
  installDir: z.string().min(1).max(240).default("/opt/agentlx"),
});

export const finalizeMachineEnrollmentInputSchema = createMachineEnrollmentInputSchema.extend({
  enrollmentToken: z.string().min(1).max(240),
});

export const updateMachineAgentNameInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  agentName: requiredTrimmedString(12),
});

export const updateMachineScheduledTaskLimitInputSchema = z.object({
  machineId: z.string().min(1).max(120),
  scheduledTaskLimit: z.number().int().min(1).max(MAX_MACHINE_SCHEDULED_TASK_LIMIT),
});

export const agentDecommissionSchema = z.object({
  executionId: z.string().min(1).max(80).optional(),
  mode: z.enum(["panel", "manual"]).default("panel"),
});

export type ServiceDetection = z.infer<typeof serviceDetectionSchema>;
export type LinuxDistribution = z.infer<typeof linuxDistributionSchema>;
export type MachineSnapshotInput = z.infer<typeof machineSnapshotSchema>;
export type AgentRegistrationInput = z.infer<typeof agentRegistrationSchema>;
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;
export type AgentPollInput = z.infer<typeof agentPollSchema>;
export type ExecutionResultInput = z.infer<typeof executionResultSchema>;
export type ExecuteActionInput = z.infer<typeof executeActionInputSchema>;
export type RecurringTemplateScheduleInput = z.infer<typeof recurringTemplateScheduleInputSchema>;
export type RecurringScheduleLookupInput = z.infer<typeof recurringScheduleLookupSchema>;
export type CreateActionTemplateInput = z.infer<typeof createActionTemplateInputSchema>;
export type UpdateActionTemplateInput = z.infer<typeof updateActionTemplateInputSchema>;
export type TemplateLookupInput = z.infer<typeof templateLookupSchema>;
export type RemoteTerminalInput = z.infer<typeof remoteTerminalInputSchema>;
export type MachineControlActionInput = z.infer<typeof machineControlActionInputSchema>;
export type OpenRealtimeTerminalSessionInput = z.infer<
  typeof openRealtimeTerminalSessionInputSchema
>;
export type StartRealtimeTemplateExecutionInput = z.infer<
  typeof startRealtimeTemplateExecutionInputSchema
>;
export type ExecutionLookupInput = z.infer<typeof executionLookupSchema>;
export type MachineLookupInput = z.infer<typeof machineLookupSchema>;
export type MachineGroupLookupInput = z.infer<typeof machineGroupLookupSchema>;
export type CreateMachineGroupInput = z.infer<typeof createMachineGroupInputSchema>;
export type UpdateMachineGroupInput = z.infer<typeof updateMachineGroupInputSchema>;
export type MachineGroupAssignmentInput = z.infer<typeof machineGroupAssignmentInputSchema>;
export type CreateMachineEnrollmentInput = z.infer<typeof createMachineEnrollmentInputSchema>;
export type FinalizeMachineEnrollmentInput = z.infer<typeof finalizeMachineEnrollmentInputSchema>;
export type UpdateMachineAgentNameInput = z.infer<typeof updateMachineAgentNameInputSchema>;
export type UpdateMachineScheduledTaskLimitInput = z.infer<
  typeof updateMachineScheduledTaskLimitInputSchema
>;
export type AgentDecommissionInput = z.infer<typeof agentDecommissionSchema>;

export type MachineView = {
  id: string;
  hostname: string;
  agentName: string;
  ip: string;
  os: string;
  distroId: string;
  distroFamily: string;
  distroVersion: string;
  status: MachineStatus;
  uptime: string;
  lastSeen: string;
  services: string[];
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  disk: number;
  kernel: string;
  arch: string;
  location: string;
  lastSeenAt: string;
  canDelete: boolean;
  scheduledTaskLimit: number;
  canEditScheduledTaskLimit: boolean;
};

export type PendingMachineEnrollmentView = {
  id: string;
  token: string;
  location: string;
  agentName: string;
  installDir: string;
  createdAt: string;
  expiresAt: string;
  command: string;
};

export type GroupSelectableUserView = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  disabled: boolean;
};

export type MachineGroupOptionView = {
  id: string;
  name: string;
  description: string;
  ownerCount: number;
  memberCount: number;
  machineCount: number;
};

export type MachineGroupView = MachineGroupOptionView & {
  owners: GroupSelectableUserView[];
  members: GroupSelectableUserView[];
  createdAt: string;
  updatedAt: string;
};

export type MachineGroupsPageView = {
  groups: MachineGroupView[];
  users: GroupSelectableUserView[];
};

export type MachineGroupAccessView = {
  assignedGroups: MachineGroupOptionView[];
  availableGroups: MachineGroupOptionView[];
  canManage: boolean;
};

export type MachinesPageView = {
  machines: MachineView[];
  pendingEnrollments: PendingMachineEnrollmentView[];
  machinesPageInfo: CursorPageInfo;
};

export type ActionTemplateView = {
  id: string;
  name: string;
  description: string;
  service: string;
  targetDistroIds: string[];
  targetDistroFamilies: string[];
  systemScope: string;
  command: string;
  estimatedTime: string;
  risk: ActionRisk;
};

export type ExecutionLogView = {
  id: string;
  executionKind: "template" | "terminal";
  templateId: string;
  templateName: string;
  machineId: string;
  machineHostname: string;
  machineAvailable: boolean;
  executedAt: string;
  durationMs: number;
  status: ExecutionStatus;
  output: string;
  errorOutput: string;
  command: string;
  requestedBy: string;
  requestedAt: string;
  availableAt: string;
  isScheduled: boolean;
  description: string;
};

export type RecurringScheduleView = {
  id: string;
  templateId: string;
  templateName: string;
  machineId: string;
  machineHostname: string;
  machineAvailable: boolean;
  requestedBy: string;
  createdAt: string;
  startsAt: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastExecutionId: string | null;
  intervalHours: number;
  status: RecurringScheduleStatus;
  failureCount: number;
  command: string;
  description: string;
};

export type AuditLogView = {
  id: string;
  action: string;
  actorType: "panel" | "agent" | "system";
  actorId: string;
  machineId: string | null;
  machineHostname: string | null;
  executionId: string | null;
  createdAt: string;
  message: string;
};

export type TemplateCatalogView = {
  templates: ActionTemplateView[];
  machines: MachineView[];
  enterpriseFeatures: {
    recurringJobs: boolean;
  };
};

export type ExecutionFeedView = {
  executions: ExecutionLogView[];
  scheduled: ExecutionLogView[];
  recurringSchedules: RecurringScheduleView[];
  audits: AuditLogView[];
  executionsPageInfo: CursorPageInfo;
  auditsPageInfo: CursorPageInfo;
};

export type MachineDetailView = {
  machine: MachineView;
  logs: ExecutionLogView[];
  templates: ActionTemplateView[];
  groupAccess: MachineGroupAccessView;
};

export type ExecutionDetailView = ExecutionLogView;

export type DashboardView = {
  total: number;
  online: number;
  offline: number;
  warning: number;
  recentExecutions: ExecutionLogView[];
  machines: MachineView[];
  avgCpu: number;
  ramUsedTotal: number;
  ramTotal: number;
};

export type QueuedExecutionPayload = {
  executionId: string;
  templateId: string;
  templateName: string;
  command: string;
  timeoutSec: number;
  machineId: string;
  actionType?: "run_shell" | "agent_self_uninstall" | "agent_sync";
  payload?: {
    command?: string;
  };
};

export type AgentRegistrationResponse = {
  agentId: string;
  machineId: string;
  agentSecret: string;
  pollIntervalSec: number;
};

export type AgentHeartbeatResponse = {
  ok: true;
  machineId: string;
  status: MachineStatus;
  pendingExecutions: number;
};

export type LinuxDistributionTemplateOption = {
  value: (typeof linuxDistributionTemplateValues)[number];
  label: string;
};

export type RealtimeTerminalSessionView = {
  sessionId: string;
  machineId: string;
  wsPath: string;
};

export type RealtimeTerminalPresenceParticipantView = {
  userId: string;
  fullName: string;
  email: string;
  connectedAt: string;
  tunnelCount: number;
};

export type RealtimeTerminalPresenceView = {
  machineId: string;
  onlineCount: number;
  participants: RealtimeTerminalPresenceParticipantView[];
};

export type RealtimeTemplateExecutionView = {
  execution: ExecutionDetailView;
  session: RealtimeTerminalSessionView;
};

export type MachineEnrollmentCommandView = {
  command: string;
  enrollmentToken: string;
  installScriptUrl: string;
  sourceBaseUrl: string;
  installDir: string;
  location: string;
  agentName: string;
};

export type PendingMachineEnrollmentCreateView = MachineEnrollmentCommandView & {
  enrollmentId: string;
  expiresAt: string;
  createdAt: string;
};

const distroFamilyById: Record<string, string> = {
  almalinux: "redhat",
  alpine: "alpine",
  amazon: "redhat",
  amzn: "redhat",
  arch: "arch",
  centos: "redhat",
  "centos-stream": "redhat",
  cloudlinux: "redhat",
  debian: "debian",
  devuan: "debian",
  elementary: "debian",
  fedora: "redhat",
  gentoo: "gentoo",
  linuxmint: "debian",
  manjaro: "arch",
  neon: "debian",
  ol: "redhat",
  opensuse: "suse",
  "opensuse-leap": "suse",
  pop: "debian",
  raspbian: "debian",
  redhat: "redhat",
  rhel: "redhat",
  rocky: "redhat",
  sles: "suse",
  ubuntu: "debian",
};

const distroMatchHints = [
  "centos stream",
  "cloudlinux",
  "rocky linux",
  "alma linux",
  "almalinux",
  "red hat",
  "ubuntu",
  "debian",
  "fedora",
  "gentoo",
  "arch",
  "manjaro",
  "opensuse",
  "sles",
  "alpine",
] as const;

function normalizeDistroToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/g, "-");
}

function toTitleCase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function distroLabel(value: string) {
  if (value === "all-linux") {
    return "Todas as distros Linux";
  }
  if (value === "rhel") {
    return "RHEL";
  }
  if (value === "amzn") {
    return "Amazon Linux (amzn)";
  }
  if (value === "ol") {
    return "Oracle Linux";
  }
  if (value === "sles") {
    return "SLES";
  }
  return toTitleCase(value.replaceAll("-", " "));
}

export const linuxDistributionTemplateOptions: LinuxDistributionTemplateOption[] =
  linuxDistributionTemplateValues.map((value) => ({
    value,
    label: distroLabel(value),
  }));

export function inferLinuxDistribution(osLabel: string): LinuxDistribution {
  const normalized = osLabel.trim().toLowerCase();
  let distroId = "linux";

  for (const hint of distroMatchHints) {
    if (!normalized.includes(hint)) {
      continue;
    }

    distroId =
      hint === "centos stream"
        ? "centos-stream"
        : hint === "rocky linux"
          ? "rocky"
          : hint === "alma linux"
            ? "almalinux"
            : hint === "red hat"
              ? "rhel"
              : normalizeDistroToken(hint);
    break;
  }

  const versionMatch = osLabel.match(/\d+(?:\.\d+)+|\d+/);
  const family = distroFamilyById[distroId] ?? "linux";
  const prettyName = osLabel.trim() || "Linux";

  return {
    id: distroId,
    family,
    version: versionMatch?.[0] ?? "",
    name: toTitleCase(distroId.replaceAll("-", " ")) || "Linux",
    prettyName,
    like: family !== "linux" ? [family] : [],
  };
}

export function resolveLinuxDistribution(snapshot: {
  os: string;
  distribution?: LinuxDistribution;
}): LinuxDistribution {
  if (!snapshot.distribution) {
    return inferLinuxDistribution(snapshot.os);
  }

  const id = normalizeDistroToken(snapshot.distribution.id);
  const family = normalizeDistroToken(
    snapshot.distribution.family || distroFamilyById[id] || "linux",
  );

  return {
    ...snapshot.distribution,
    id,
    family,
    version: snapshot.distribution.version ?? "",
    like: (snapshot.distribution.like ?? []).map(normalizeDistroToken),
  };
}

export function formatTemplateSystemScope(input: {
  targetDistroIds: string[];
  targetDistroFamilies: string[];
}) {
  void input;
  return "Todas as maquinas registradas";
}

export const defaultActionTemplates = [
  {
    id: "carbonio-ssl-check",
    name: "Verificar certificados SSL",
    description: "Valida cadeia, chave privada e expiração dos certificados do Carbonio.",
    service: "carbonio",
    targetDistroIds: [],
    targetDistroFamilies: [],
    command: "/opt/carbonio/scripts/cert-check.sh --verbose",
    estimatedSeconds: 5,
    risk: "low",
  },
  {
    id: "carbonio-mailq-status",
    name: "Status da fila de e-mails",
    description: "Lista mensagens pendentes na fila do Postfix integrado ao Carbonio.",
    service: "carbonio",
    targetDistroIds: [],
    targetDistroFamilies: [],
    command: "postqueue -p | tail -50",
    estimatedSeconds: 2,
    risk: "low",
  },
  {
    id: "system-disk-usage",
    name: "Uso de disco",
    description: "Relatório de utilização de disco por mountpoint.",
    service: "system",
    targetDistroIds: [],
    targetDistroFamilies: [],
    command: "df -h",
    estimatedSeconds: 1,
    risk: "low",
  },
  {
    id: "system-top-processes",
    name: "Top processos",
    description: "Lista os 10 processos com maior uso de CPU.",
    service: "system",
    targetDistroIds: [],
    targetDistroFamilies: [],
    command: "ps aux --sort=-%cpu | head -11",
    estimatedSeconds: 1,
    risk: "low",
  },
  {
    id: "system-package-updates-debian",
    name: "Atualizações disponíveis (APT)",
    description: "Lista os pacotes com upgrade pendente em Ubuntu, Debian e derivados.",
    service: "system",
    targetDistroIds: [],
    targetDistroFamilies: ["debian"],
    command: "sh -c \"apt list --upgradable 2>/dev/null | sed -n '1,25p'\"",
    estimatedSeconds: 4,
    risk: "low",
  },
  {
    id: "system-package-updates-redhat",
    name: "Atualizações disponíveis (DNF/YUM)",
    description:
      "Lista updates pendentes em Red Hat, CentOS, Fedora, Rocky, AlmaLinux e derivados.",
    service: "system",
    targetDistroIds: [],
    targetDistroFamilies: ["redhat"],
    command:
      "sh -c \"if command -v dnf >/dev/null 2>&1; then dnf -q check-update; code=$?; [ $code -eq 0 ] || [ $code -eq 100 ]; elif command -v yum >/dev/null 2>&1; then yum -q check-update; code=$?; [ $code -eq 0 ] || [ $code -eq 100 ]; else echo 'Nenhum gerenciador DNF/YUM encontrado'; exit 1; fi\"",
    estimatedSeconds: 4,
    risk: "low",
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  service: string;
  targetDistroIds: readonly string[];
  targetDistroFamilies: readonly string[];
  command: string;
  estimatedSeconds: number;
  risk: ActionRisk;
}[];
