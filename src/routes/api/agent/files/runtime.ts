import { createFileRoute } from "@tanstack/react-router";
import { jsonError, textResponse } from "@/server/http.server";
import { readAgentRuntimeFile } from "@/server/agent-runtime.server";

export const Route = createFileRoute("/api/agent/files/runtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const relativePath = new URL(request.url).searchParams.get("path") ?? "";
          if (!relativePath) {
            return jsonError("Parametro path e obrigatorio.", 400);
          }

          const file = await readAgentRuntimeFile(relativePath);
          return textResponse(file.body, {
            headers: {
              "content-type": file.contentType,
              "cache-control": "no-store",
            },
          });
        } catch {
          return jsonError("Nao foi possivel carregar o arquivo do runtime.", 500);
        }
      },
    },
  },
});
