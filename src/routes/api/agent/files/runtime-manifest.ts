import { createFileRoute } from "@tanstack/react-router";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getAgentRuntimeManifest } from "@/server/agent-runtime.server";

export const Route = createFileRoute("/api/agent/files/runtime-manifest")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return jsonResponse(await getAgentRuntimeManifest(), {
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
