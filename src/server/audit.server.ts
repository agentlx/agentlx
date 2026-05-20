import { appendFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { getEnv } from "./env.server";
import { redactAuditMessage } from "./redaction.server";

export type AuditSeverity = "info" | "notice" | "warn" | "critical";

type Queryable = {
  query: <T extends Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

type AppendAuditLogInput = {
  executionId?: string | null;
  machineId?: string | null;
  machineHostname?: string | null;
  actorType: "panel" | "agent" | "system";
  actorId: string;
  action: string;
  message: string;
  createdAt?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
};

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    );
  }

  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(sortJson(value));
}

function computeIntegrityHash(input: {
  id: string;
  prevHash: string;
  createdAt: string;
  actorType: string;
  actorId: string;
  action: string;
  severity: AuditSeverity;
  executionId: string | null;
  machineId: string | null;
  machineHostname: string | null;
  message: string;
  metadata: Record<string, unknown>;
}) {
  return createHash("sha256")
    .update(
      [
        input.id,
        input.prevHash,
        input.createdAt,
        input.actorType,
        input.actorId,
        input.action,
        input.severity,
        input.executionId ?? "",
        input.machineId ?? "",
        input.machineHostname ?? "",
        input.message,
        stableJson(input.metadata),
      ].join("|"),
    )
    .digest("hex");
}

function computeAnchorHash(integrityHash: string) {
  const env = getEnv();
  const secret = env.AGENTLX_AUDIT_ANCHOR_SECRET || env.AGENTLX_PENDING_TOKEN_SECRET;
  return createHmac("sha256", secret).update(integrityHash).digest("hex");
}

function persistExternalAnchor(input: {
  auditLogId: string;
  integrityHash: string;
  anchorHash: string;
  createdAt: string;
}) {
  const anchorFile = getEnv().AGENTLX_AUDIT_ANCHOR_FILE.trim();
  if (!anchorFile) {
    return;
  }

  appendFileSync(anchorFile, `${JSON.stringify({ version: 1, ...input })}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function appendAuditLog(client: Queryable, input: AppendAuditLogInput) {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const severity = input.severity ?? "info";
  const metadata = sortJson(input.metadata ?? {}) as Record<string, unknown>;
  const message = redactAuditMessage(input.message);
  const previous = await client.query<{ integrity_hash: string | null }>(
    `
      SELECT integrity_hash
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
  );
  const prevHash = previous.rows[0]?.integrity_hash ?? "";
  const integrityHash = computeIntegrityHash({
    id,
    prevHash,
    createdAt,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    severity,
    executionId: input.executionId ?? null,
    machineId: input.machineId ?? null,
    machineHostname: input.machineHostname ?? null,
    message,
    metadata,
  });

  await client.query(
    `
      INSERT INTO audit_logs (
        id,
        execution_id,
        machine_id,
        machine_hostname,
        actor_type,
        actor_id,
        action,
        severity,
        message,
        metadata_json,
        integrity_prev_hash,
        integrity_hash,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4, (SELECT hostname FROM machines WHERE id = $3 LIMIT 1)),
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12,
        $13
      )
    `,
    [
      id,
      input.executionId ?? null,
      input.machineId ?? null,
      input.machineHostname ?? null,
      input.actorType,
      input.actorId,
      input.action,
      severity,
      message,
      stableJson(metadata),
      prevHash || null,
      integrityHash,
      createdAt,
    ],
  );

  const anchorHash = computeAnchorHash(integrityHash);
  await client.query(
    `
      INSERT INTO audit_integrity_anchors (
        id,
        audit_log_id,
        integrity_hash,
        anchor_hash,
        anchor_version,
        created_at
      )
      VALUES ($1, $2, $3, $4, 1, $5)
    `,
    [randomUUID(), id, integrityHash, anchorHash, createdAt],
  );
  persistExternalAnchor({
    auditLogId: id,
    integrityHash,
    anchorHash,
    createdAt,
  });

  return {
    id,
    integrityHash,
  };
}

type AuditVerificationRow = {
  id: string;
  execution_id: string | null;
  machine_id: string | null;
  machine_hostname: string | null;
  actor_type: "panel" | "agent" | "system";
  actor_id: string;
  action: string;
  severity: AuditSeverity;
  message: string;
  metadata_json: Record<string, unknown>;
  integrity_prev_hash: string | null;
  integrity_hash: string | null;
  created_at: string | Date;
};

type AuditAnchorRow = {
  audit_log_id: string;
  integrity_hash: string;
  anchor_hash: string;
};

function normalizeDbTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function verifyAuditIntegrityChain(client: Queryable) {
  const logs = await client.query<AuditVerificationRow>(
    `
      SELECT
        id,
        execution_id,
        machine_id,
        machine_hostname,
        actor_type,
        actor_id,
        action,
        severity,
        message,
        metadata_json,
        integrity_prev_hash,
        integrity_hash,
        created_at
      FROM audit_logs
      ORDER BY created_at ASC, id ASC
    `,
  );
  const anchors = await client.query<AuditAnchorRow>(
    `
      SELECT audit_log_id, integrity_hash, anchor_hash
      FROM audit_integrity_anchors
      ORDER BY created_at ASC
    `,
  );
  const anchorByLogId = new Map(anchors.rows.map((anchor) => [anchor.audit_log_id, anchor]));
  const failures: Array<{ id: string; reason: string }> = [];
  let prevHash = "";

  for (const row of logs.rows) {
    const metadata = sortJson(row.metadata_json ?? {}) as Record<string, unknown>;
    const expectedPrevHash = prevHash || null;
    if ((row.integrity_prev_hash ?? null) !== expectedPrevHash) {
      failures.push({ id: row.id, reason: "prev_hash_mismatch" });
    }

    const expectedHash = computeIntegrityHash({
      id: row.id,
      prevHash,
      createdAt: normalizeDbTimestamp(row.created_at),
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      severity: row.severity,
      executionId: row.execution_id,
      machineId: row.machine_id,
      machineHostname: row.machine_hostname,
      message: row.message,
      metadata,
    });
    if (row.integrity_hash !== expectedHash) {
      failures.push({ id: row.id, reason: "integrity_hash_mismatch" });
    }

    const anchor = anchorByLogId.get(row.id);
    if (!anchor) {
      failures.push({ id: row.id, reason: "anchor_missing" });
    } else if (
      anchor.integrity_hash !== row.integrity_hash ||
      anchor.anchor_hash !== computeAnchorHash(expectedHash)
    ) {
      failures.push({ id: row.id, reason: "anchor_mismatch" });
    }

    prevHash = row.integrity_hash ?? "";
  }

  return {
    ok: failures.length === 0,
    checked: logs.rows.length,
    failures,
  };
}
