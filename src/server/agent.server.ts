import type {
  AgentDecommissionInput,
  AgentHeartbeatInput,
  AgentHeartbeatResponse,
  AgentPollInput,
  AgentRegistrationInput,
  AgentRegistrationResponse,
  ExecutionResultInput,
  QueuedExecutionPayload,
  ServiceDetection,
} from "@/lib/agentlx";
import { resolveLinuxDistribution } from "@/lib/agentlx";
import { deriveMachineStatus } from "@/lib/formatting";
import { appendAuditLog } from "./audit.server";
import { dbQuery, withTransaction } from "./db.server";
import {
  decryptAgentToken,
  generateToken,
  sha256Hex,
  encryptAgentToken,
  readAgentAuthorizationId,
  verifyAgentRequestSignature,
} from "./security.server";
import { redactSensitiveText, resolveExecutionCommand } from "./redaction.server";

const AGENT_SELF_UNINSTALL_MARKER = "__AGENTLX_SELF_UNINSTALL__";
const AGENT_SYNC_MARKER = "__AGENTLX_SYNC_NOW__";
const AGENT_REQUEST_SIGNATURE_VERSION = "v2";
const AGENT_REQUEST_SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
const SCHEDULE_MATERIALIZATION_LIMIT = 50;

type AgentRow = {
  id: string;
  machine_id: string;
  state: "active" | "disabled";
  poll_interval_sec: number;
  auth_token_encrypted: string;
  auth_token_issued_at: string;
  auth_token_last_rotated_at: string | null;
  auth_token_last_used_at: string | null;
  auth_token_last_acknowledged_at: string | null;
  auth_token_last_persist_error: string | null;
  auth_token_last_persist_error_at: string | null;
  auth_token_prev_hash: string | null;
  auth_token_prev_expires_at: string | null;
  using_previous_token: boolean;
};

type AuthenticatedAgent = {
  agent: AgentRow;
  signedAt: string;
  nonce: string;
};

type MachineRow = {
  id: string;
  agent_id: string;
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
  status: "online" | "offline" | "warning";
  services: string[];
};

type ExistingMachineRegistrationRow = {
  id: string;
  agent_id: string;
  status: "online" | "offline" | "warning";
};

type EnrollmentTokenRow = {
  id: string;
  token_hash: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_machine_id: string | null;
  consumed_agent_id: string | null;
  location: string;
  agent_name: string;
};

type ExecutionRow = {
  id: string;
  machine_id: string;
  template_id: string | null;
  template_name: string;
  command: string;
  command_encrypted: string;
  schedule_id: string | null;
  schedule_run_at: string | null;
  execution_kind: "template" | "terminal";
  status: string;
  started_at: string | null;
  finished_at: string | null;
  requested_at: string;
  timeout_sec: number;
  duration_ms: number;
  exit_code: number | null;
  output: string;
  error_output: string;
  available_at: string;
};

type ScheduleRow = {
  id: string;
  machine_id: string;
  machine_hostname: string;
  agent_id: string;
  template_id: string | null;
  template_name: string;
  service: string;
  command: string;
  command_encrypted: string;
  interval_hours: number;
  next_run_at: string;
  requested_by: string;
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

function normalizeServiceSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\.service$/i, "")
    .replace(/[^a-z0-9._@-]+/g, "-")
    .replace(/^[._@-]+|[._@-]+$/g, "");

  return normalized.slice(0, 64);
}

function normalizeServiceDisplayName(value: string | undefined, fallback: string) {
  const normalized = (value || fallback)
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || fallback).slice(0, 120);
}

function normalizeServices(services: ServiceDetection[]) {
  const unique = new Map<string, ServiceDetection>();

  for (const service of services.slice(0, 128)) {
    const slug = normalizeServiceSlug(service.slug);
    if (!slug) {
      continue;
    }

    unique.set(slug, {
      slug,
      displayName: normalizeServiceDisplayName(service.displayName, slug),
      version: service.version?.trim().slice(0, 64) || undefined,
      detectedBy: service.detectedBy,
    });
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftName = left.displayName ?? left.slug;
    const rightName = right.displayName ?? right.slug;
    return leftName.localeCompare(rightName);
  });
}

function deriveStatus(snapshot: AgentRegistrationInput["snapshot"]) {
  const lastSeenAt = snapshot.collectedAt ?? new Date().toISOString();
  return deriveMachineStatus({
    lastSeenAt,
    cpuPercent: snapshot.cpuPercent,
    diskPercent: snapshot.diskPercent,
    ramUsedGb: snapshot.ramUsedGb,
    ramTotalGb: snapshot.ramTotalGb,
  });
}

function snapshotDistribution(snapshot: AgentRegistrationInput["snapshot"]) {
  return resolveLinuxDistribution(snapshot);
}

async function loadEnrollmentToken(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: EnrollmentTokenRow[] }> },
  tokenHash: string,
) {
  const result = await client.query(
    `
      SELECT
        id,
        token_hash,
        created_by,
        created_at,
        expires_at,
        consumed_at,
        consumed_machine_id,
        consumed_agent_id,
        location,
        agent_name
      FROM agent_enrollment_tokens
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

async function loadAgentById(agentId: string) {
  const result = await dbQuery<AgentRow>(
    `
      SELECT
        id,
        machine_id,
        state,
        poll_interval_sec,
        auth_token_encrypted,
        auth_token_issued_at,
        auth_token_last_rotated_at,
        auth_token_last_used_at,
        auth_token_last_acknowledged_at,
        auth_token_last_persist_error,
        auth_token_last_persist_error_at,
        auth_token_prev_hash,
        auth_token_prev_expires_at,
        FALSE AS using_previous_token
      FROM agents
      WHERE id = $1
      LIMIT 1
    `,
    [agentId],
  );
  return result.rows[0] ?? null;
}

function toUnauthorized(message: string) {
  return Object.assign(new Error(message), { statusCode: 401 });
}

export async function authenticateAgentMessage(input: {
  authorizationHeader: string | null | undefined;
  method: string;
  requestPath: string;
  rawBody: string;
  getHeader: (name: string) => string | null | undefined;
}): Promise<AuthenticatedAgent> {
  const agentId = readAgentAuthorizationId(input.authorizationHeader);
  if (!agentId) {
    throw toUnauthorized("Authorization Agent ausente.");
  }

  const agent = await loadAgentById(agentId);
  if (!agent || agent.state !== "active") {
    throw toUnauthorized("Agent nao autorizado.");
  }

  const signatureHeaders = {
    version: input.getHeader("x-agent-auth-version")?.trim() ?? "",
    timestamp: input.getHeader("x-agent-auth-timestamp")?.trim() ?? "",
    nonce: input.getHeader("x-agent-auth-nonce")?.trim() ?? "",
    signature: input.getHeader("x-agent-auth-signature")?.trim() ?? "",
  };

  if (
    !signatureHeaders.version ||
    !signatureHeaders.timestamp ||
    !signatureHeaders.nonce ||
    !signatureHeaders.signature
  ) {
    throw toUnauthorized("Cabecalhos de assinatura do agent estao incompletos.");
  }

  if (signatureHeaders.version !== AGENT_REQUEST_SIGNATURE_VERSION) {
    throw toUnauthorized("Versao de assinatura do agent nao suportada.");
  }

  if (!/^[A-Za-z0-9_-]{16,128}$/.test(signatureHeaders.nonce)) {
    throw toUnauthorized("Nonce de assinatura do agent invalido.");
  }

  const requestTimestamp = new Date(signatureHeaders.timestamp).getTime();
  const now = Date.now();
  if (
    Number.isNaN(requestTimestamp) ||
    Math.abs(now - requestTimestamp) > AGENT_REQUEST_SIGNATURE_WINDOW_MS
  ) {
    throw toUnauthorized("Assinatura do agent expirada ou fora da janela permitida.");
  }

  let agentSecret: string;
  try {
    agentSecret = decryptAgentToken(agent.auth_token_encrypted);
  } catch {
    throw toUnauthorized("Credencial local do agent nao esta disponivel no servidor.");
  }
  const valid = await verifyAgentRequestSignature({
    agentSecret,
    method: input.method,
    requestPath: input.requestPath,
    timestamp: signatureHeaders.timestamp,
    nonce: signatureHeaders.nonce,
    rawBody: input.rawBody,
    signature: signatureHeaders.signature,
  });

  if (!valid) {
    throw toUnauthorized("Assinatura do agent invalida.");
  }

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(now + AGENT_REQUEST_SIGNATURE_WINDOW_MS).toISOString();

  await dbQuery("DELETE FROM agent_request_nonces WHERE expires_at <= $1", [createdAt]);
  const nonceInsert = await dbQuery<{ nonce: string }>(
    `
      INSERT INTO agent_request_nonces (token_hash, nonce, request_path, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING nonce
    `,
    [agent.id, signatureHeaders.nonce, input.requestPath, createdAt, expiresAt],
  );

  if (!nonceInsert.rows[0]) {
    throw toUnauthorized("Nonce de assinatura do agent ja foi utilizado.");
  }

  return {
    agent,
    signedAt: signatureHeaders.timestamp,
    nonce: signatureHeaders.nonce,
  };
}

export async function authenticateAgentRequest(
  request: Request,
  requestPath: string,
  rawBody: string,
) {
  return authenticateAgentMessage({
    authorizationHeader: request.headers.get("authorization"),
    method: request.method,
    requestPath,
    rawBody,
    getHeader: (name) => request.headers.get(name),
  });
}

async function markAgentTokenUsage(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  agent: AgentRow,
  usedAt: string,
) {
  await client.query(
    `
      UPDATE agents
      SET last_seen_at = GREATEST(last_seen_at, $2), auth_token_last_used_at = $2
      WHERE id = $1
    `,
    [agent.id, usedAt],
  );
  agent.auth_token_last_used_at = usedAt;
}

async function appendAgentAuditLog(
  client: {
    query: <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: T[] }>;
  },
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

async function loadMachine(machineId: string) {
  const result = await dbQuery<MachineRow>(
    `
      SELECT
        m.id,
        m.agent_id,
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
        m.status,
        COALESCE(array_remove(array_agg(ms.slug ORDER BY ms.slug), NULL), '{}') AS services
      FROM machines m
      LEFT JOIN machine_services ms ON ms.machine_id = m.id
      WHERE m.id = $1
      GROUP BY m.id
    `,
    [machineId],
  );

  return result.rows[0] ?? null;
}

async function replaceMachineServices(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  machineId: string,
  services: ServiceDetection[],
  collectedAt: string,
) {
  await client.query("DELETE FROM machine_services WHERE machine_id = $1", [machineId]);
  for (const service of services) {
    await client.query(
      `
        INSERT INTO machine_services (
          id, machine_id, slug, display_name, version, detected_by, collected_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        crypto.randomUUID(),
        machineId,
        service.slug,
        service.displayName ?? null,
        service.version ?? null,
        service.detectedBy,
        collectedAt,
      ],
    );
  }
}

async function insertInventory(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  machineId: string,
  snapshot: AgentRegistrationInput["snapshot"],
  services: ServiceDetection[],
) {
  const distribution = snapshotDistribution(snapshot);

  await client.query(
    `
      INSERT INTO machine_inventories (
        id, machine_id, collected_at, hostname, ip, os, distro_id, distro_family,
        distro_version, kernel, arch, location, uptime_sec, cpu_percent, ram_used_gb,
        ram_total_gb, disk_percent, services_json
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb
      )
    `,
    [
      crypto.randomUUID(),
      machineId,
      snapshot.collectedAt ?? new Date().toISOString(),
      snapshot.hostname,
      snapshot.ip,
      snapshot.os,
      distribution.id,
      distribution.family,
      distribution.version,
      snapshot.kernel,
      snapshot.arch,
      snapshot.location ?? "",
      snapshot.uptimeSec,
      snapshot.cpuPercent,
      snapshot.ramUsedGb,
      snapshot.ramTotalGb,
      snapshot.diskPercent,
      JSON.stringify(services),
    ],
  );
}

async function insertStatusHistory(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  machineId: string,
  status: "online" | "offline" | "warning",
  recordedAt: string,
  note: string,
) {
  await client.query(
    `
      INSERT INTO machine_status_history (id, machine_id, status, recorded_at, note)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [crypto.randomUUID(), machineId, status, recordedAt, note],
  );
}

function nextScheduleRunAfter(runAt: string, intervalHours: number, now: string) {
  const runAtMs = new Date(runAt).getTime();
  const nowMs = new Date(now).getTime();
  const intervalMs = intervalHours * 60 * 60 * 1000;

  if (
    Number.isNaN(runAtMs) ||
    Number.isNaN(nowMs) ||
    !Number.isFinite(intervalMs) ||
    intervalMs < 60 * 60 * 1000
  ) {
    throw new Error("Recorrencia invalida para materializacao.");
  }

  let nextMs = runAtMs + intervalMs;
  if (nextMs <= nowMs) {
    const missedIntervals = Math.floor((nowMs - nextMs) / intervalMs) + 1;
    nextMs += missedIntervals * intervalMs;
  }

  return new Date(nextMs).toISOString();
}

async function materializeDueRecurringExecutions(
  client: {
    query: <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: T[] }>;
  },
  input: {
    machineId: string;
    agentId: string;
    now: string;
    limit: number;
  },
) {
  const due = await client.query<ScheduleRow>(
    `
      SELECT
        id,
        machine_id,
        machine_hostname,
        agent_id,
        template_id,
        template_name,
        service,
        command,
        command_encrypted,
        interval_hours,
        next_run_at,
        requested_by
      FROM action_schedules
      WHERE machine_id = $1
        AND agent_id = $2
        AND status = 'active'
        AND next_run_at <= $3
      ORDER BY next_run_at ASC
      LIMIT $4
      FOR UPDATE SKIP LOCKED
    `,
    [input.machineId, input.agentId, input.now, input.limit],
  );

  for (const schedule of due.rows) {
    const executionId = crypto.randomUUID();
    const nextRunAt = nextScheduleRunAfter(
      schedule.next_run_at,
      schedule.interval_hours,
      input.now,
    );

    await client.query(
      `
        INSERT INTO action_executions (
          id, machine_id, machine_hostname, agent_id, template_id, template_name, service,
          command, command_encrypted, schedule_id, schedule_run_at, execution_kind, status,
          requested_by, requested_at, available_at, dispatched_at, started_at, finished_at,
          timeout_sec, duration_ms, exit_code, output, error_output
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'template', 'queued',
          $12, $13, $13, NULL, NULL, NULL, 120, 0, NULL, '', ''
        )
      `,
      [
        executionId,
        schedule.machine_id,
        schedule.machine_hostname,
        schedule.agent_id,
        schedule.template_id,
        schedule.template_name,
        schedule.service,
        schedule.command,
        schedule.command_encrypted,
        schedule.id,
        schedule.next_run_at,
        schedule.requested_by,
        input.now,
      ],
    );

    await client.query(
      `
        UPDATE action_schedules
        SET
          next_run_at = $2,
          last_run_at = $3,
          last_execution_id = $4,
          updated_at = $5
        WHERE id = $1
      `,
      [schedule.id, nextRunAt, schedule.next_run_at, executionId, input.now],
    );

    await appendAgentAuditLog(client, {
      actorType: "system",
      actorId: "scheduler",
      action: "schedule.materialized",
      machineId: schedule.machine_id,
      machineHostname: schedule.machine_hostname,
      executionId,
      message: `Recorrencia ${schedule.id} materializada como execucao ${executionId}.`,
      createdAt: input.now,
      severity: "notice",
      metadata: {
        scheduleId: schedule.id,
        scheduledRunAt: schedule.next_run_at,
        nextRunAt,
      },
    });
  }
}

async function decommissionAgentRecords(
  client: {
    query: <T extends Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: T[] }>;
  },
  input: {
    agentId: string;
    machineId: string;
    hostname: string;
    mode: "panel" | "manual";
    executionId?: string | null;
  },
) {
  const now = new Date().toISOString();

  if (input.executionId) {
    const execution = await client.query<{ id: string }>(
      `
        SELECT id
        FROM action_executions
        WHERE id = $1 AND machine_id = $2
        LIMIT 1
      `,
      [input.executionId, input.machineId],
    );

    if (!execution.rows[0]) {
      throw new Error("Execução de desinstalação não encontrada para este agent.");
    }
  }

  await client.query("DELETE FROM machine_inventories WHERE machine_id = $1", [input.machineId]);
  await client.query("DELETE FROM machine_status_history WHERE machine_id = $1", [input.machineId]);
  await client.query("DELETE FROM machine_services WHERE machine_id = $1", [input.machineId]);
  await client.query(
    `
      UPDATE action_schedules
      SET status = 'cancelled', updated_at = $2
      WHERE machine_id = $1 AND status = 'active'
    `,
    [input.machineId, now],
  );
  await client.query("DELETE FROM machines WHERE id = $1", [input.machineId]);
  await client.query("DELETE FROM agents WHERE id = $1", [input.agentId]);

  await appendAgentAuditLog(client, {
    actorType: "agent",
    actorId: input.agentId,
    action: "agent.decommissioned",
    machineId: input.machineId,
    machineHostname: input.hostname,
    executionId: null,
    message:
      input.mode === "manual"
        ? `Agent ${input.agentId} da máquina ${input.hostname} foi desinstalado manualmente e removido do painel.`
        : `Agent ${input.agentId} da máquina ${input.hostname} foi desinstalado remotamente e removido do painel.`,
    createdAt: now,
    severity: "critical",
    metadata: {
      alert: true,
      mode: input.mode,
      removedMachineId: input.machineId,
    },
  });
}

export async function registerAgent(
  input: AgentRegistrationInput,
  enrollmentToken: string,
): Promise<AgentRegistrationResponse> {
  const requestedMachineId = input.machineId?.trim() || null;
  const requestedAgentId = input.agentId?.trim() || null;
  const agentSecret = generateToken("ags");
  const tokenHash = await sha256Hex(agentSecret);
  const tokenEncrypted = encryptAgentToken(agentSecret);
  const enrollmentTokenHash = await sha256Hex(enrollmentToken);
  const now = new Date().toISOString();

  return withTransaction(async (client) => {
    const enrollment = await loadEnrollmentToken(client, enrollmentTokenHash);
    if (!enrollment) {
      throw new Error("Token de enrollment invalido.");
    }

    const expiresAt = new Date(enrollment.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("Token de enrollment expirado.");
    }

    if (
      enrollment.consumed_at &&
      (requestedMachineId !== enrollment.consumed_machine_id ||
        requestedAgentId !== enrollment.consumed_agent_id)
    ) {
      throw new Error("Este token ja foi utilizado por outra maquina.");
    }

    const snapshot = {
      ...input.snapshot,
      location: input.snapshot.location?.trim() || enrollment.location || "",
    };
    const agentName = input.agentName?.trim() || enrollment.agent_name || snapshot.hostname;
    const services = normalizeServices(snapshot.services);
    const distribution = snapshotDistribution(snapshot);
    const collectedAt = snapshot.collectedAt ?? now;
    const status = deriveStatus(snapshot);

    let existing: ExistingMachineRegistrationRow | null = null;

    if (requestedMachineId) {
      const existingByMachineId = await client.query<ExistingMachineRegistrationRow>(
        "SELECT id, agent_id, status FROM machines WHERE id = $1 LIMIT 1",
        [requestedMachineId],
      );
      existing = existingByMachineId.rows[0] ?? null;
    }

    if (!existing && requestedAgentId) {
      const existingByAgentId = await client.query<ExistingMachineRegistrationRow>(
        "SELECT id, agent_id, status FROM machines WHERE agent_id = $1 LIMIT 1",
        [requestedAgentId],
      );
      existing = existingByAgentId.rows[0] ?? null;
    }

    const machineId =
      existing?.id ??
      enrollment.consumed_machine_id ??
      requestedMachineId ??
      `machine-${crypto.randomUUID()}`;
    const agentId =
      existing?.agent_id ??
      enrollment.consumed_agent_id ??
      requestedAgentId ??
      `agent-${crypto.randomUUID()}`;

    if (existing) {
      await client.query(
        `
          UPDATE agents
          SET
            label = $2,
            auth_token_hash = $3,
            auth_token_encrypted = $4,
            auth_token_issued_at = $5,
            auth_token_last_rotated_at = $5,
            auth_token_last_used_at = $5,
            auth_token_last_acknowledged_at = $5,
            auth_token_last_persist_error = NULL,
            auth_token_last_persist_error_at = NULL,
            auth_token_prev_hash = NULL,
            auth_token_prev_expires_at = NULL,
            last_seen_at = $6,
            version = $7,
            poll_interval_sec = $8,
            state = 'active'
          WHERE id = $1
        `,
        [
          agentId,
          agentName,
          tokenHash,
          tokenEncrypted,
          now,
          collectedAt,
          input.agentVersion,
          input.pollIntervalSec,
        ],
      );

      await client.query(
        `
          UPDATE machines
          SET
            hostname = $2,
            ip = $3,
            os = $4,
            distro_id = $5,
            distro_family = $6,
            distro_version = $7,
            kernel = $8,
            arch = $9,
            location = $10,
            uptime_sec = $11,
            cpu_percent = $12,
            ram_used_gb = $13,
            ram_total_gb = $14,
            disk_percent = $15,
            status = $16,
            last_seen_at = $17,
            updated_at = $18
          WHERE id = $1
        `,
        [
          machineId,
          snapshot.hostname,
          snapshot.ip,
          snapshot.os,
          distribution.id,
          distribution.family,
          distribution.version,
          snapshot.kernel,
          snapshot.arch,
          snapshot.location ?? "",
          snapshot.uptimeSec,
          snapshot.cpuPercent,
          snapshot.ramUsedGb,
          snapshot.ramTotalGb,
          snapshot.diskPercent,
          status,
          collectedAt,
          now,
        ],
      );

      await replaceMachineServices(client, machineId, services, collectedAt);
      await insertInventory(client, machineId, snapshot, services);
      await insertStatusHistory(
        client,
        machineId,
        status,
        collectedAt,
        existing.status === status
          ? "Agent re-registrado e token rotacionado."
          : `Agent re-registrado e status alterado de ${existing.status} para ${status}.`,
      );
      await appendAgentAuditLog(client, {
        actorType: "agent",
        actorId: agentId,
        action: "agent.reregistered",
        machineId,
        executionId: null,
        message: `Agent ${agentId} re-registrado para a máquina ${snapshot.hostname} com novo token.`,
        createdAt: now,
        severity: "warn",
        metadata: {
          alert: true,
          machineId,
          hostname: snapshot.hostname,
          status,
        },
      });

      if (!enrollment.consumed_at) {
        await client.query(
          `
            UPDATE agent_enrollment_tokens
            SET consumed_at = $2, consumed_machine_id = $3, consumed_agent_id = $4
            WHERE id = $1
          `,
          [enrollment.id, now, machineId, agentId],
        );
      }

      return {
        agentId,
        machineId,
        agentSecret,
        pollIntervalSec: input.pollIntervalSec,
      };
    }

    await client.query(
      `
        INSERT INTO agents (
          id, machine_id, label, auth_token_hash, auth_token_encrypted, auth_token_issued_at,
          auth_token_last_rotated_at, auth_token_last_used_at, auth_token_last_acknowledged_at,
          registered_at, last_seen_at, version, poll_interval_sec, state
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, $6, $6, $7, $8, $9, $10, 'active')
      `,
      [
        agentId,
        machineId,
        agentName,
        tokenHash,
        tokenEncrypted,
        now,
        now,
        collectedAt,
        input.agentVersion,
        input.pollIntervalSec,
      ],
    );

    await client.query(
      `
        INSERT INTO machines (
          id, agent_id, hostname, ip, os, distro_id, distro_family, distro_version, kernel,
          arch, location, uptime_sec, cpu_percent, ram_used_gb, ram_total_gb, disk_percent,
          status, last_seen_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20
        )
      `,
      [
        machineId,
        agentId,
        snapshot.hostname,
        snapshot.ip,
        snapshot.os,
        distribution.id,
        distribution.family,
        distribution.version,
        snapshot.kernel,
        snapshot.arch,
        snapshot.location ?? "",
        snapshot.uptimeSec,
        snapshot.cpuPercent,
        snapshot.ramUsedGb,
        snapshot.ramTotalGb,
        snapshot.diskPercent,
        status,
        collectedAt,
        now,
        now,
      ],
    );

    await replaceMachineServices(client, machineId, services, collectedAt);
    await insertInventory(client, machineId, snapshot, services);
    await insertStatusHistory(
      client,
      machineId,
      status,
      collectedAt,
      "Agent registrado pela primeira vez.",
    );
    await appendAgentAuditLog(client, {
      actorType: "agent",
      actorId: agentId,
      action: "agent.registered",
      machineId,
      executionId: null,
      message: `Agent ${agentId} registrado para a máquina ${snapshot.hostname}.`,
      createdAt: now,
      severity: "notice",
      metadata: {
        alert: true,
        machineId,
        hostname: snapshot.hostname,
        location: snapshot.location ?? "",
      },
    });

    await client.query(
      `
        UPDATE agent_enrollment_tokens
        SET consumed_at = $2, consumed_machine_id = $3, consumed_agent_id = $4
        WHERE id = $1
      `,
      [enrollment.id, now, machineId, agentId],
    );

    return {
      agentId,
      machineId,
      agentSecret,
      pollIntervalSec: input.pollIntervalSec,
    };
  });
}

export async function submitHeartbeat(
  authenticated: AuthenticatedAgent,
  input: AgentHeartbeatInput,
): Promise<AgentHeartbeatResponse> {
  const agent = authenticated.agent;

  const machine = await loadMachine(agent.machine_id);
  if (!machine) {
    throw new Error("Máquina vinculada ao agent não foi encontrada.");
  }

  const services = normalizeServices(input.snapshot.services);
  const distribution = snapshotDistribution(input.snapshot);
  const collectedAt =
    input.snapshot.collectedAt ?? input.lastHeartbeatAt ?? new Date().toISOString();
  const status = deriveStatus({
    ...input.snapshot,
    collectedAt,
  });
  const shouldRefreshInventory = input.includeInventory;
  const statusChanged = machine.status !== status;
  const auditEntries: Array<{ action: string; message: string }> = [];

  await withTransaction(async (client) => {
    await markAgentTokenUsage(client, agent, collectedAt);

    await client.query(
      `
        UPDATE agents
        SET last_seen_at = $2, version = $3
        WHERE id = $1
      `,
      [agent.id, collectedAt, input.agentVersion],
    );

    await client.query(
      `
        UPDATE machines
        SET
          hostname = $2,
          ip = $3,
          os = $4,
          distro_id = $5,
          distro_family = $6,
          distro_version = $7,
          kernel = $8,
          arch = $9,
          location = $10,
          uptime_sec = $11,
          cpu_percent = $12,
          ram_used_gb = $13,
          ram_total_gb = $14,
          disk_percent = $15,
          status = $16,
          last_seen_at = $17,
          updated_at = $18
        WHERE id = $1
      `,
      [
        machine.id,
        input.snapshot.hostname,
        input.snapshot.ip,
        input.snapshot.os,
        distribution.id,
        distribution.family,
        distribution.version,
        input.snapshot.kernel,
        input.snapshot.arch,
        input.snapshot.location ?? "",
        input.snapshot.uptimeSec,
        input.snapshot.cpuPercent,
        input.snapshot.ramUsedGb,
        input.snapshot.ramTotalGb,
        input.snapshot.diskPercent,
        status,
        collectedAt,
        new Date().toISOString(),
      ],
    );

    if (shouldRefreshInventory) {
      await replaceMachineServices(client, machine.id, services, collectedAt);
      await insertInventory(client, machine.id, { ...input.snapshot, collectedAt }, services);
      auditEntries.push({
        action: "agent.heartbeat.inventory",
        message: `Inventário atualizado por ${input.snapshot.hostname}.`,
      });
    }

    if (statusChanged) {
      await insertStatusHistory(
        client,
        machine.id,
        status,
        collectedAt,
        `Status alterado de ${machine.status} para ${status}.`,
      );
      auditEntries.push({
        action: "agent.heartbeat.status",
        message: `Status da máquina alterado para ${status}.`,
      });
    }

    for (const entry of auditEntries) {
      await appendAgentAuditLog(client, {
        actorType: "agent",
        actorId: agent.id,
        action: entry.action,
        machineId: machine.id,
        executionId: null,
        message: entry.message,
        createdAt: collectedAt,
        severity: entry.action === "agent.heartbeat.status" ? "warn" : "info",
      });
    }
  });

  const pending = await dbQuery<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM action_executions
      WHERE machine_id = $1 AND status = 'queued'
      `,
    [machine.id],
  );

  return {
    ok: true,
    machineId: machine.id,
    status,
    pendingExecutions: Number(pending.rows[0]?.count ?? 0),
  };
}

export async function pollPendingExecutions(
  authenticated: AuthenticatedAgent,
  input: AgentPollInput,
): Promise<{ executions: QueuedExecutionPayload[] }> {
  const agent = authenticated.agent;

  return withTransaction(async (client) => {
    const now = new Date().toISOString();
    const machine = await loadMachine(agent.machine_id);
    if (!machine) {
      throw new Error("MÃ¡quina vinculada ao agent nÃ£o foi encontrada.");
    }

    await markAgentTokenUsage(client, agent, now);

    await materializeDueRecurringExecutions(client, {
      machineId: agent.machine_id,
      agentId: agent.id,
      now,
      limit: SCHEDULE_MATERIALIZATION_LIMIT,
    });

    const scheduledTaskLimit = Math.max(1, Number(machine.scheduled_task_limit || 1));
    const inFlightScheduled = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM action_executions
        WHERE machine_id = $1
          AND status IN ('dispatched', 'running')
          AND execution_kind = 'template'
          AND (schedule_id IS NOT NULL OR available_at > requested_at)
      `,
      [agent.machine_id],
    );
    const scheduledDispatchLimit = Math.max(
      0,
      scheduledTaskLimit - Number(inFlightScheduled.rows[0]?.count ?? 0),
    );
    const result = await client.query<ExecutionRow>(
      `
        WITH immediate_picked AS (
          SELECT id
          FROM action_executions
          WHERE machine_id = $1 AND status = 'queued'
            AND available_at <= $4
            AND NOT (
              execution_kind = 'template'
              AND (schedule_id IS NOT NULL OR available_at > requested_at)
            )
          ORDER BY requested_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        ),
        scheduled_picked AS (
          SELECT id
          FROM action_executions
          WHERE machine_id = $1 AND status = 'queued'
            AND available_at <= $4
            AND execution_kind = 'template'
            AND (schedule_id IS NOT NULL OR available_at > requested_at)
          ORDER BY available_at ASC, requested_at ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        ),
        picked AS (
          SELECT id FROM immediate_picked
          UNION ALL
          SELECT id FROM scheduled_picked
        )
        UPDATE action_executions execution
        SET status = 'dispatched', dispatched_at = $4
        FROM picked
        WHERE execution.id = picked.id
        RETURNING
          execution.id,
          execution.machine_id,
          execution.template_id,
          execution.template_name,
          execution.command,
          execution.command_encrypted,
          execution.schedule_id,
          execution.schedule_run_at,
          execution.execution_kind,
          execution.status,
          execution.started_at,
          execution.finished_at,
          execution.requested_at,
          execution.available_at,
          execution.timeout_sec,
          execution.duration_ms,
          execution.exit_code,
          execution.output,
          execution.error_output
      `,
      [agent.machine_id, input.limit, scheduledDispatchLimit, now],
    );

    for (const execution of result.rows) {
      await appendAgentAuditLog(client, {
        actorType: "system",
        actorId: "api",
        action: "execution.dispatched",
        machineId: execution.machine_id,
        executionId: execution.id,
        message: `Execução ${execution.id} despachada para o agent ${agent.id}.`,
        createdAt: now,
        severity: "notice",
      });
    }

    return {
      executions: result.rows.map((execution: ExecutionRow) => {
        const resolvedCommand = resolveExecutionCommand(
          execution.command,
          execution.command_encrypted || null,
        );

        return {
          executionId: execution.id,
          templateId: execution.template_id ?? "terminal-remote-shell",
          templateName: execution.template_name,
          command: resolvedCommand,
          timeoutSec: execution.timeout_sec,
          machineId: execution.machine_id,
          actionType:
            resolvedCommand === AGENT_SELF_UNINSTALL_MARKER
              ? "agent_self_uninstall"
              : resolvedCommand.includes(AGENT_SYNC_MARKER)
                ? "agent_sync"
                : "run_shell",
          payload:
            resolvedCommand === AGENT_SELF_UNINSTALL_MARKER
              ? {}
              : resolvedCommand.includes(AGENT_SYNC_MARKER)
                ? {}
                : {
                    command: resolvedCommand,
                  },
        };
      }),
    };
  });
}

export async function submitExecutionResult(
  authenticated: AuthenticatedAgent,
  input: ExecutionResultInput,
): Promise<{ execution: ExecutionRow }> {
  const agent = authenticated.agent;

  return withTransaction(async (client) => {
    const requestCompletedAt = new Date().toISOString();
    const machine = await loadMachine(agent.machine_id);
    if (!machine) {
      throw new Error("MÃ¡quina vinculada ao agent nÃ£o foi encontrada.");
    }

    await markAgentTokenUsage(client, agent, requestCompletedAt);

    const existing = await client.query<ExecutionRow>(
      `
        SELECT
          id,
          machine_id,
          template_id,
          template_name,
          command,
          command_encrypted,
          schedule_id,
          schedule_run_at,
          execution_kind,
          status,
          started_at,
          finished_at,
          requested_at,
          available_at,
          timeout_sec,
          duration_ms,
          exit_code,
          output,
          error_output
        FROM action_executions
        WHERE id = $1 AND machine_id = $2
        LIMIT 1
      `,
      [input.executionId, agent.machine_id],
    );

    const execution = existing.rows[0];
    if (!execution) {
      throw new Error("Execução não encontrada para este agent.");
    }

    const resolvedExecutionCommand = resolveExecutionCommand(
      execution.command,
      execution.command_encrypted || null,
    );
    const startedAt = input.startedAt ?? execution.started_at ?? new Date().toISOString();
    const finishedAt = input.finishedAt ?? new Date().toISOString();

    const updated = await client.query<ExecutionRow>(
      `
        UPDATE action_executions
        SET
          status = $2,
          started_at = $3,
          finished_at = $4,
          duration_ms = $5,
          exit_code = $6,
          output = $7,
          error_output = $8
        WHERE id = $1
        RETURNING
          id,
          machine_id,
          template_id,
          template_name,
          command,
          command_encrypted,
          schedule_id,
          schedule_run_at,
          execution_kind,
          status,
          started_at,
          finished_at,
          requested_at,
          available_at,
          timeout_sec,
          duration_ms,
          exit_code,
          output,
          error_output
      `,
      [
        input.executionId,
        input.status,
        startedAt,
        finishedAt,
        input.durationMs,
        input.exitCode,
        redactSensitiveText(input.output),
        redactSensitiveText(input.errorOutput),
      ],
    );

    await appendAgentAuditLog(client, {
      actorType: "agent",
      actorId: agent.id,
      action: `execution.${input.status}`,
      machineId: agent.machine_id,
      executionId: input.executionId,
      message: `Execução ${input.executionId} concluída com status ${input.status}.`,
      createdAt: finishedAt,
      severity: input.status === "failed" ? "warn" : "notice",
    });

    if (execution.schedule_id) {
      await client.query(
        `
          UPDATE action_schedules
          SET
            failure_count = CASE
              WHEN $2 = 'failed' THEN failure_count + 1
              ELSE 0
            END,
            updated_at = $3
          WHERE id = $1
        `,
        [execution.schedule_id, input.status, finishedAt],
      );
    }

    if (updated.rows[0]) {
      updated.rows[0].output = normalizeDisplayText(updated.rows[0].output);
      updated.rows[0].error_output = normalizeDisplayText(updated.rows[0].error_output);
      updated.rows[0].command = normalizeDisplayText(updated.rows[0].command);
    }

    if (
      resolvedExecutionCommand.includes(AGENT_SELF_UNINSTALL_MARKER) &&
      input.status === "success"
    ) {
      const machine = await loadMachine(agent.machine_id);
      if (machine) {
        await decommissionAgentRecords(client, {
          agentId: agent.id,
          machineId: machine.id,
          hostname: machine.hostname,
          mode: "panel",
          executionId: input.executionId,
        });
      }
    }

    return {
      execution: updated.rows[0],
    };
  });
}

export async function decommissionCurrentAgent(
  authenticated: AuthenticatedAgent,
  input: AgentDecommissionInput,
): Promise<{ ok: true; removedMachineId: string }> {
  const agent = authenticated.agent;

  const machine = await loadMachine(agent.machine_id);
  if (!machine) {
    throw new Error("Máquina não encontrada para este agent.");
  }

  return withTransaction(async (client) => {
    await decommissionAgentRecords(client, {
      agentId: agent.id,
      machineId: machine.id,
      hostname: machine.hostname,
      mode: input.mode,
      executionId: input.executionId ?? null,
    });

    return {
      ok: true,
      removedMachineId: machine.id,
    };
  });
}
