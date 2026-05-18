import { createFileRoute } from "@tanstack/react-router";
import { agentRegistrationSchema } from "@/lib/agentlx";
import { registerAgent } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";

export const Route = createFileRoute("/api/agent/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const enrollmentToken = request.headers.get("x-agent-enrollment-token");
          if (!enrollmentToken) {
            return jsonError("Token de enrollment ausente.", 401);
          }

          const body = agentRegistrationSchema.parse(await request.json());
          const result = await registerAgent(body, enrollmentToken);
          return jsonResponse(result, { status: 201 });
        } catch (error) {
          return jsonError(error instanceof Error ? error.message : "Falha ao registrar agent.");
        }
      },
    },
  },
});
