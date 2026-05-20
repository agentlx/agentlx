import { createFileRoute } from "@tanstack/react-router";
import { agentHeartbeatSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, submitHeartbeat } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";

export const Route = createFileRoute("/api/agent/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { rawBody, data } = await readJsonBody(
            request,
            agentHeartbeatSchema,
            BODY_LIMITS.json,
          );
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/heartbeat",
            rawBody,
          );
          const result = await submitHeartbeat(authenticated, data);
          return jsonResponse(result);
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao processar heartbeat."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
