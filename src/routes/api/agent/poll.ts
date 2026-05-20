import { createFileRoute } from "@tanstack/react-router";
import { agentPollSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, pollPendingExecutions } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";

export const Route = createFileRoute("/api/agent/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { rawBody, data } = await readJsonBody(request, agentPollSchema, BODY_LIMITS.json);
          const authenticated = await authenticateAgentRequest(request, "/api/agent/poll", rawBody);
          const result = await pollPendingExecutions(authenticated, data);
          return jsonResponse({ ok: true, ...result });
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao consultar execucoes pendentes."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
