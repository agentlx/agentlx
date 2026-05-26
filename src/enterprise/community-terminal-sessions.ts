import type { EnterpriseTerminalSessionLimitState } from "@/lib/edition";
import type { EnterpriseRuntimeContext, EnterpriseTerminalSessions } from "./types";

const COMMUNITY_TERMINAL_SESSION_LIMIT = 1;

type TerminalSessionLimitInput = {
  userId: string;
};

type TerminalSessionLimitAssertionInput = TerminalSessionLimitInput & {
  increment?: number;
};

export const communityTerminalSessions: EnterpriseTerminalSessions = {
  async getLimit(input, context) {
    await syncCommunityTerminalSessionLimit(context);
    const used = await countActiveTerminalSessions(input.userId, context);
    return buildLimitState(input.userId, used, COMMUNITY_TERMINAL_SESSION_LIMIT);
  },
  async assertCanOpen(input, context) {
    await lockTerminalSessionLimit(input.userId, context);
    await syncCommunityTerminalSessionLimit(context);
    const used = await countActiveTerminalSessions(input.userId, context);
    const increment = Math.max(1, Math.trunc(input.increment ?? 1));
    const state = buildLimitState(input.userId, used, COMMUNITY_TERMINAL_SESSION_LIMIT, increment);

    if (!state.allowed) {
      throw new Error(state.message);
    }

    return state;
  },
};

async function syncCommunityTerminalSessionLimit(context: EnterpriseRuntimeContext) {
  await context.query(
    `
      INSERT INTO terminal_session_limit_enforcement (scope, limit_value, updated_at)
      VALUES ('per_user', $1, now())
      ON CONFLICT (scope) DO UPDATE
      SET limit_value = EXCLUDED.limit_value,
          updated_at = EXCLUDED.updated_at
    `,
    [COMMUNITY_TERMINAL_SESSION_LIMIT],
  );
}

async function lockTerminalSessionLimit(userId: string, context: EnterpriseRuntimeContext) {
  await context.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `agentlx-terminal-session-limit:${userId}`,
  ]);
}

async function countActiveTerminalSessions(userId: string, context: EnterpriseRuntimeContext) {
  const result = await context.query<{ total: string }>(
    `
      SELECT COUNT(*)::text AS total
      FROM realtime_terminal_session_leases
      WHERE user_id = $1
        AND closed_at IS NULL
        AND expires_at > now()
    `,
    [userId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

function buildLimitState(
  userId: string,
  used: number,
  limit: number | null,
  increment = 0,
): EnterpriseTerminalSessionLimitState {
  if (limit === null) {
    return {
      userId,
      used,
      limit,
      remaining: null,
      allowed: true,
      message: "Limite Enterprise ilimitado para terminais simultaneos.",
    };
  }

  const remaining = Math.max(0, limit - used);
  const allowed = used + increment <= limit;

  return {
    userId,
    used,
    limit,
    remaining,
    allowed,
    message: allowed
      ? `Limite Community de terminal disponivel: ${remaining} restante(s).`
      : `AgentLX Community permite ate ${limit} terminal aberto por usuario ao mesmo tempo. Use o AgentLX Enterprise para mais terminais simultaneos.`,
  };
}
