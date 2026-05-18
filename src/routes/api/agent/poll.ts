import { createFileRoute } from "@tanstack/react-router";
import { agentPollSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, pollPendingExecutions } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";

export const Route = createFileRoute("/api/agent/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const authenticated = await authenticateAgentRequest(request, "/api/agent/poll", rawBody);
          const body = agentPollSchema.parse(JSON.parse(rawBody));
          const result = await pollPendingExecutions(authenticated, body);
          return jsonResponse({ ok: true, ...result });
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number"
              ? error.statusCode
              : 400;

          return jsonError(
            error instanceof Error ? error.message : "Falha ao consultar execucoes pendentes.",
            statusCode,
          );
        }
      },
    },
  },
});
