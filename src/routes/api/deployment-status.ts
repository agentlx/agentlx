import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/http.server";
import { getDeploymentSecurityState } from "@/server/env.server";

export const Route = createFileRoute("/api/deployment-status")({
  server: {
    handlers: {
      GET: async () => {
        return jsonResponse(getDeploymentSecurityState(), {
          headers: {
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
