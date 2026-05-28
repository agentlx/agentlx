import { createFileRoute } from "@tanstack/react-router";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getAgentRuntimeManifest } from "@/server/agent-runtime.server";
import { authenticateAgentRequest, validateAgentEnrollmentToken } from "@/server/agent.server";

async function canReadEnterpriseRuntime(request: Request, requestPath: string) {
  if (await validateAgentEnrollmentToken(request.headers.get("x-agent-enrollment-token"))) {
    return true;
  }

  try {
    await authenticateAgentRequest(request, requestPath, "");
    return true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/agent/files/runtime-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const includeEnterpriseExtensions = await canReadEnterpriseRuntime(
            request,
            "/api/agent/files/runtime-manifest",
          );
          return jsonResponse(await getAgentRuntimeManifest({ includeEnterpriseExtensions }), {
            headers: {
              "cache-control": "no-store",
            },
          });
        } catch {
          return jsonError("Nao foi possivel carregar o manifesto do agent.", 500);
        }
      },
    },
  },
});
