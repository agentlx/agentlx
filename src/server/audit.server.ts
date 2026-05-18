import { createHash, randomUUID } from "node:crypto";
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

  return {
    id,
    integrityHash,
  };
}
