import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/http.server";
import { getDeploymentSecurityState } from "@/server/env.server";
import { getBuildInfo } from "@/server/build-info.server";

export const Route = createFileRoute("/api/deployment-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return jsonResponse(
          {
            ...getDeploymentSecurityState(request),
            build: getBuildInfo(),
          },
          {
            headers: {
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
