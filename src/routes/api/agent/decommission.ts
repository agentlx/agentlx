import { createFileRoute } from "@tanstack/react-router";
import { agentDecommissionSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, decommissionCurrentAgent } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";

export const Route = createFileRoute("/api/agent/decommission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { rawBody, data } = await readJsonBody(
            request,
            agentDecommissionSchema,
            BODY_LIMITS.json,
          );
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/decommission",
            rawBody,
          );
          const result = await decommissionCurrentAgent(authenticated, data);
          return jsonResponse(result, { status: 200 });
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao desinstalar o agent."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
