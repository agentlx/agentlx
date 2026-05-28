import { createFileRoute } from "@tanstack/react-router";
import { jsonError, textResponse } from "@/server/http.server";
import { readAgentRuntimeFile } from "@/server/agent-runtime.server";
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

export const Route = createFileRoute("/api/agent/files/runtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const relativePath = new URL(request.url).searchParams.get("path") ?? "";
          if (!relativePath) {
            return jsonError("Parametro path e obrigatorio.", 400);
          }

          const includeEnterpriseExtensions = await canReadEnterpriseRuntime(
            request,
            "/api/agent/files/runtime",
          );
          const file = await readAgentRuntimeFile(relativePath, { includeEnterpriseExtensions });
          return textResponse(file.body, {
            headers: {
              "content-type": file.contentType,
              "cache-control": "no-store",
            },
          });
        } catch {
          return jsonError("Arquivo de runtime nao encontrado.", 404);
        }
      },
    },
  },
});
