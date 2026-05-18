import type { ActionRisk, ExecutionStatus } from "@/lib/agentlx";
import { defaultActionTemplates } from "@/lib/agentlx";

export type AgentRecord = {
  id: string;
  machineId: string;
  label: string;
  authTokenHash: string;
  registeredAt: string;
  lastSeenAt: string;
  version: string;
  pollIntervalSec: number;
  state: "active" | "disabled";
};

export type MachineRecord = {
  id: string;
  agentId: string;
  hostname: string;
  ip: string;
  os: string;
  distroId: string;
  distroFamily: string;
  distroVersion: string;
  kernel: string;
  arch: string;
  location: string;
  uptimeSec: number;
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number;
  services: string[];
  lastSeenAt: string;
  status: "online" | "offline" | "warning";
  createdAt: string;
  updatedAt: string;
};

export type InventoryRecord = {
  id: string;
  machineId: string;
  collectedAt: string;
  hostname: string;
  ip: string;
  os: string;
  distroId: string;
  distroFamily: string;
  distroVersion: string;
  kernel: string;
  arch: string;
  location: string;
  uptimeSec: number;
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number;
  services: {
    slug: string;
    displayName?: string;
    version?: string;
    detectedBy: "agent" | "seed" | "manual";
  }[];
};

export type MachineStatusRecord = {
  id: string;
  machineId: string;
  status: "online" | "offline" | "warning";
  recordedAt: string;
  note: string;
};

export type TemplateRecord = {
  id: string;
  name: string;
  description: string;
  service: string;
  targetDistroIds: string[];
  targetDistroFamilies: string[];
  command: string;
  estimatedSeconds: number;
  risk: ActionRisk;
  enabled: boolean;
};

export type ExecutionRecord = {
  id: string;
  machineId: string;
  agentId: string;
  templateId: string;
  templateName: string;
  service: string;
  command: string;
  status: ExecutionStatus;
  requestedBy: string;
  requestedAt: string;
  dispatchedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  exitCode: number | null;
  output: string;
  errorOutput: string;
};

export type AuditLogRecord = {
  id: string;
  executionId: string | null;
  machineId: string | null;
  actorType: "panel" | "agent" | "system";
  actorId: string;
  action: string;
  message: string;
  createdAt: string;
};

export type DatabaseState = {
  version: 1;
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
  agents: AgentRecord[];
  machines: MachineRecord[];
  inventories: InventoryRecord[];
  statusHistory: MachineStatusRecord[];
  templates: TemplateRecord[];
  executions: ExecutionRecord[];
  auditLogs: AuditLogRecord[];
};

function seconds(days: number, hours = 0, minutes = 0): number {
  return days * 86_400 + hours * 3_600 + minutes * 60;
}

function beforeNow(secondsAgo: number) {
  return new Date(Date.now() - secondsAgo * 1_000).toISOString();
}

function templateSeed(): TemplateRecord[] {
  return defaultActionTemplates.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    service: item.service,
    targetDistroIds: [...item.targetDistroIds],
    targetDistroFamilies: [...item.targetDistroFamilies],
    command: item.command,
    estimatedSeconds: item.estimatedSeconds,
    risk: item.risk,
    enabled: true,
  }));
}

function executionSeed(
  machineId: string,
  agentId: string,
  overrides: Partial<ExecutionRecord>,
): ExecutionRecord {
  const requestedAt = overrides.requestedAt ?? beforeNow(900);
  return {
    id: overrides.id ?? crypto.randomUUID(),
    machineId,
    agentId,
    templateId: overrides.templateId ?? "system-disk-usage",
    templateName: overrides.templateName ?? "Uso de disco",
    service: overrides.service ?? "system",
    command: overrides.command ?? "df -h",
    status: overrides.status ?? "success",
    requestedBy: overrides.requestedBy ?? "admin_devops_01",
    requestedAt,
    dispatchedAt: overrides.dispatchedAt ?? requestedAt,
    startedAt: overrides.startedAt ?? requestedAt,
    finishedAt: overrides.finishedAt ?? requestedAt,
    durationMs: overrides.durationMs ?? 0,
    exitCode: overrides.exitCode ?? 0,
    output: overrides.output ?? "",
    errorOutput: overrides.errorOutput ?? "",
  };
}

export function createSeedState(): DatabaseState {
  const now = new Date().toISOString();

  const agents: AgentRecord[] = [
    {
      id: "agent-srv-br-carbonio-01",
      machineId: "srv-br-carbonio-01",
      label: "seed-agent-srv-br-carbonio-01",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(42, 12)),
      lastSeenAt: beforeNow(2),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
    {
      id: "agent-db-prod-main",
      machineId: "db-prod-main",
      label: "seed-agent-db-prod-main",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(128, 4)),
      lastSeenAt: beforeNow(12),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
    {
      id: "agent-srv-br-carbonio-02",
      machineId: "srv-br-carbonio-02",
      label: "seed-agent-srv-br-carbonio-02",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(12, 2)),
      lastSeenAt: beforeNow(4),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
    {
      id: "agent-proxy-edge-lon-03",
      machineId: "proxy-edge-lon-03",
      label: "seed-agent-proxy-edge-lon-03",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(25, 0)),
      lastSeenAt: beforeNow(seconds(0, 4, 12)),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
    {
      id: "agent-web-edge-node-9",
      machineId: "web-edge-node-9",
      label: "seed-agent-web-edge-node-9",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(5, 21)),
      lastSeenAt: beforeNow(60),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
    {
      id: "agent-backup-vault-01",
      machineId: "backup-vault-01",
      label: "seed-agent-backup-vault-01",
      authTokenHash: "seed-disabled",
      registeredAt: beforeNow(seconds(201, 8)),
      lastSeenAt: beforeNow(8),
      version: "agentlx-linux-seed",
      pollIntervalSec: 30,
      state: "active",
    },
  ];

  const machines: MachineRecord[] = [
    {
      id: "srv-br-carbonio-01",
      agentId: "agent-srv-br-carbonio-01",
      hostname: "srv-br-carbonio-01",
      ip: "172.16.0.45",
      os: "Ubuntu 22.04 LTS",
      distroId: "ubuntu",
      distroFamily: "debian",
      distroVersion: "22.04",
      kernel: "5.15.0-86-generic",
      arch: "x86_64",
      location: "DC-SP-01",
      uptimeSec: seconds(42, 11),
      cpuPercent: 24,
      ramUsedGb: 12.4,
      ramTotalGb: 32,
      diskPercent: 47,
      services: ["carbonio", "postfix", "nginx"],
      lastSeenAt: beforeNow(2),
      status: "online",
      createdAt: beforeNow(seconds(42, 12)),
      updatedAt: now,
    },
    {
      id: "db-prod-main",
      agentId: "agent-db-prod-main",
      hostname: "db-prod-main",
      ip: "172.16.0.48",
      os: "Debian 12",
      distroId: "debian",
      distroFamily: "debian",
      distroVersion: "12",
      kernel: "6.1.0-13-amd64",
      arch: "x86_64",
      location: "DC-SP-01",
      uptimeSec: seconds(128, 4),
      cpuPercent: 41,
      ramUsedGb: 18.2,
      ramTotalGb: 64,
      diskPercent: 62,
      services: ["mariadb"],
      lastSeenAt: beforeNow(12),
      status: "online",
      createdAt: beforeNow(seconds(128, 4)),
      updatedAt: now,
    },
    {
      id: "srv-br-carbonio-02",
      agentId: "agent-srv-br-carbonio-02",
      hostname: "srv-br-carbonio-02",
      ip: "172.16.0.46",
      os: "Ubuntu 22.04 LTS",
      distroId: "ubuntu",
      distroFamily: "debian",
      distroVersion: "22.04",
      kernel: "5.15.0-86-generic",
      arch: "x86_64",
      location: "DC-RJ-02",
      uptimeSec: seconds(12, 2),
      cpuPercent: 18,
      ramUsedGb: 9.1,
      ramTotalGb: 16,
      diskPercent: 33,
      services: ["carbonio"],
      lastSeenAt: beforeNow(4),
      status: "online",
      createdAt: beforeNow(seconds(12, 2)),
      updatedAt: now,
    },
    {
      id: "proxy-edge-lon-03",
      agentId: "agent-proxy-edge-lon-03",
      hostname: "proxy-edge-lon-03",
      ip: "10.45.1.12",
      os: "CentOS Stream 9",
      distroId: "centos-stream",
      distroFamily: "redhat",
      distroVersion: "9",
      kernel: "5.14.0-362.el9",
      arch: "x86_64",
      location: "DC-LON-03",
      uptimeSec: seconds(25, 1),
      cpuPercent: 0,
      ramUsedGb: 0,
      ramTotalGb: 8,
      diskPercent: 21,
      services: ["nginx"],
      lastSeenAt: beforeNow(seconds(0, 4, 12)),
      status: "offline",
      createdAt: beforeNow(seconds(25, 1)),
      updatedAt: now,
    },
    {
      id: "web-edge-node-9",
      agentId: "agent-web-edge-node-9",
      hostname: "web-edge-node-9",
      ip: "10.45.1.18",
      os: "Rocky Linux 9",
      distroId: "rocky",
      distroFamily: "redhat",
      distroVersion: "9",
      kernel: "5.14.0-362.el9",
      arch: "x86_64",
      location: "DC-LON-03",
      uptimeSec: seconds(5, 21),
      cpuPercent: 78,
      ramUsedGb: 6.8,
      ramTotalGb: 8,
      diskPercent: 89,
      services: ["nginx", "redis"],
      lastSeenAt: beforeNow(60),
      status: "warning",
      createdAt: beforeNow(seconds(5, 21)),
      updatedAt: now,
    },
    {
      id: "backup-vault-01",
      agentId: "agent-backup-vault-01",
      hostname: "backup-vault-01",
      ip: "172.16.0.90",
      os: "Debian 12",
      distroId: "debian",
      distroFamily: "debian",
      distroVersion: "12",
      kernel: "6.1.0-13-amd64",
      arch: "x86_64",
      location: "DC-SP-01",
      uptimeSec: seconds(201, 8),
      cpuPercent: 6,
      ramUsedGb: 1.2,
      ramTotalGb: 8,
      diskPercent: 71,
      services: ["restic"],
      lastSeenAt: beforeNow(8),
      status: "online",
      createdAt: beforeNow(seconds(201, 8)),
      updatedAt: now,
    },
  ];

  const inventories: InventoryRecord[] = machines.map((machine) => ({
    id: `inv-${machine.id}`,
    machineId: machine.id,
    collectedAt: machine.lastSeenAt,
    hostname: machine.hostname,
    ip: machine.ip,
    os: machine.os,
    distroId: machine.distroId,
    distroFamily: machine.distroFamily,
    distroVersion: machine.distroVersion,
    kernel: machine.kernel,
    arch: machine.arch,
    location: machine.location,
    uptimeSec: machine.uptimeSec,
    cpuPercent: machine.cpuPercent,
    ramUsedGb: machine.ramUsedGb,
    ramTotalGb: machine.ramTotalGb,
    diskPercent: machine.diskPercent,
    services: machine.services.map((slug) => ({
      slug,
      displayName: slug.toUpperCase(),
      detectedBy: "seed",
    })),
  }));

  const statusHistory: MachineStatusRecord[] = machines.map((machine) => ({
    id: `status-${machine.id}`,
    machineId: machine.id,
    status: machine.status,
    recordedAt: machine.lastSeenAt,
    note: "Estado inicial carregado a partir do seed do MVP.",
  }));

  const executions: ExecutionRecord[] = [
    executionSeed("srv-br-carbonio-01", "agent-srv-br-carbonio-01", {
      id: "exec-001",
      templateId: "carbonio-ssl-check",
      templateName: "Verificar certificados SSL",
      service: "carbonio",
      command: "/opt/carbonio/scripts/cert-check.sh --verbose",
      requestedAt: beforeNow(60 * 5),
      durationMs: 4_312,
      output:
        "[INFO] Starting certificate validation for domain: zimbra.corp.local\n[INFO] Checking trust chain... OK\n[INFO] Private key match: OK\n[SUCCESS] SSL expires in 341 days (2027-04-19)",
    }),
    executionSeed("db-prod-main", "agent-db-prod-main", {
      id: "exec-002",
      templateId: "system-disk-usage",
      templateName: "Uso de disco",
      command: "df -h",
      requestedAt: beforeNow(60 * 9),
      durationMs: 812,
      output:
        "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       100G   62G   38G  62% /\n/dev/sdb1       500G  301G  199G  61% /var/lib/mysql",
    }),
    executionSeed("proxy-edge-lon-03", "agent-proxy-edge-lon-03", {
      id: "exec-003",
      templateId: "system-top-processes",
      templateName: "Top processos",
      command: "ps aux --sort=-%cpu | head -11",
      requestedAt: beforeNow(60 * 32),
      status: "failed",
      durationMs: 0,
      exitCode: 255,
      output: "ssh: connect to host 10.45.1.12 port 22: Connection timed out",
      errorOutput: "[FAIL] Agent unreachable",
    }),
    executionSeed("srv-br-carbonio-02", "agent-srv-br-carbonio-02", {
      id: "exec-004",
      templateId: "carbonio-mailq-status",
      templateName: "Status da fila de e-mails",
      service: "carbonio",
      command: "postqueue -p | tail -50",
      requestedAt: beforeNow(60 * 47),
      durationMs: 1_620,
      output: "Mail queue is empty.",
    }),
    executionSeed("web-edge-node-9", "agent-web-edge-node-9", {
      id: "exec-005",
      templateId: "system-top-processes",
      templateName: "Top processos",
      command: "ps aux --sort=-%cpu | head -11",
      requestedAt: beforeNow(60 * 66),
      durationMs: 990,
      output:
        "USER       PID %CPU %MEM    VSZ   RSS COMMAND\nnginx    12834 24.1  2.1 412980 17120 nginx: worker\nredis    12901 18.3  4.5 213044 36440 redis-server",
    }),
  ];

  const auditLogs: AuditLogRecord[] = executions.flatMap((execution) => [
    {
      id: `audit-${execution.id}-request`,
      executionId: execution.id,
      machineId: execution.machineId,
      actorType: "panel",
      actorId: execution.requestedBy,
      action: "execution.requested",
      message: `Template ${execution.templateId} solicitado para ${execution.machineId}.`,
      createdAt: execution.requestedAt,
    },
    {
      id: `audit-${execution.id}-final`,
      executionId: execution.id,
      machineId: execution.machineId,
      actorType: execution.status === "failed" ? "system" : "agent",
      actorId: execution.agentId,
      action: `execution.${execution.status}`,
      message: `Execução ${execution.status} para ${execution.machineId}.`,
      createdAt: execution.finishedAt ?? execution.requestedAt,
    },
  ]);

  return {
    version: 1,
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
    agents,
    machines,
    inventories,
    statusHistory,
    templates: templateSeed(),
    executions,
    auditLogs,
  };
}
