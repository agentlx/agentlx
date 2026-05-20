import { createFileRoute } from "@tanstack/react-router";
import { agentRegistrationSchema } from "@/lib/agentlx";
import { registerAgent } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";

export const Route = createFileRoute("/api/agent/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const enrollmentToken = request.headers.get("x-agent-enrollment-token");
          if (!enrollmentToken) {
            return jsonError("Token de enrollment ausente.", 401);
          }

          const { data } = await readJsonBody(request, agentRegistrationSchema, BODY_LIMITS.json);
          const result = await registerAgent(data, enrollmentToken);
          return jsonResponse(result, { status: 201 });
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao registrar agent."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
