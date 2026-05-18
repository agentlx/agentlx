import { createFileRoute } from "@tanstack/react-router";
import { agentHeartbeatSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, submitHeartbeat } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";

export const Route = createFileRoute("/api/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/heartbeat",
            rawBody,
          );
          const body = agentHeartbeatSchema.parse(JSON.parse(rawBody));
          const result = await submitHeartbeat(authenticated, body);
          return jsonResponse(result);
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number"
              ? error.statusCode
              : 400;
          return jsonError(
            error instanceof Error ? error.message : "Falha ao processar heartbeat.",
            statusCode,
          );
        }
      },
    },
  },
});
