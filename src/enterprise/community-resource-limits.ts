import type { EnterpriseResourceLimitState, ManagedResourceKind } from "@/lib/edition";
import type { EnterpriseResourceLimits, EnterpriseRuntimeContext } from "./types";

const COMMUNITY_RESOURCE_LIMIT = 10;

type ResourceLimitInput = {
  resource: ManagedResourceKind;
  includePendingEnrollments?: boolean;
};

export const communityResourceLimits: EnterpriseResourceLimits = {
  async getLimit(input, context) {
    const used = await countResource(input, context);
    return buildLimitState(input.resource, used, COMMUNITY_RESOURCE_LIMIT);
  },
  async assertCanCreate(input, context) {
    await lockResourceLimit(input.resource, context);
    const used = await countResource(input, context);
    const increment = Math.max(1, Math.trunc(input.increment ?? 1));
    const state = buildLimitState(input.resource, used, COMMUNITY_RESOURCE_LIMIT, increment);

    if (!state.allowed) {
      throw new Error(state.message);
    }

    return state;
  },
};

async function lockResourceLimit(resource: ManagedResourceKind, context: EnterpriseRuntimeContext) {
  await context.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `agentlx-resource-limit:${resource}`,
  ]);
}

async function countResource(input: ResourceLimitInput, context: EnterpriseRuntimeContext) {
  if (input.resource === "machines") {
    const result = await context.query<{ total: string }>(
      `
        SELECT (
          (SELECT COUNT(*) FROM machines)
          +
          CASE
            WHEN $1::boolean THEN (
              SELECT COUNT(*)
              FROM agent_enrollment_tokens
              WHERE consumed_at IS NULL
                AND expires_at > now()
            )
            ELSE 0
          END
        )::text AS total
      `,
      [Boolean(input.includePendingEnrollments)],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  const tableName = input.resource === "templates" ? "action_templates" : "machine_groups";
  const result = await context.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM ${tableName}`,
  );
  return Number(result.rows[0]?.total ?? 0);
}

function buildLimitState(
  resource: ManagedResourceKind,
  used: number,
  limit: number,
  increment = 0,
): EnterpriseResourceLimitState {
  const remaining = Math.max(0, limit - used);
  const allowed = used + increment <= limit;

  return {
    resource,
    used,
    limit,
    remaining,
    allowed,
    message: allowed
      ? `Limite Community disponivel: ${remaining} restante(s).`
      : resourceLimitMessage(resource, limit),
  };
}

function resourceLimitMessage(resource: ManagedResourceKind, limit: number) {
  const labels: Record<ManagedResourceKind, string> = {
    machines: "maquinas",
    templates: "templates",
    groups: "grupos",
  };
  return `AgentLX Community permite ate ${limit} ${labels[resource]}. Use o AgentLX Enterprise para limites maiores.`;
}
