import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/http.server";
import { dbQuery, getResourceLimitEnforcementState } from "@/server/db.server";
import { getBuildInfo } from "@/server/build-info.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        await dbQuery("SELECT 1");
        const resourceLimitEnforcement = await getResourceLimitEnforcementState();
        return jsonResponse({
          ok: true,
          service: "agentlx-api",
          database: "ok",
          build: getBuildInfo(),
          resourceLimitEnforcement,
          now: new Date().toISOString(),
        });
      },
    },
  },
});
