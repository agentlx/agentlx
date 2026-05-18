import { createFileRoute } from "@tanstack/react-router";
import { agentDecommissionSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, decommissionCurrentAgent } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";

export const Route = createFileRoute("/api/agent/decommission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/decommission",
            rawBody,
          );
          const body = agentDecommissionSchema.parse(JSON.parse(rawBody));
          const result = await decommissionCurrentAgent(authenticated, body);
          return jsonResponse(result, { status: 200 });
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number"
              ? error.statusCode
              : 400;

          return jsonError(
            error instanceof Error ? error.message : "Falha ao desinstalar o agent.",
            statusCode,
          );
        }
      },
    },
  },
});
