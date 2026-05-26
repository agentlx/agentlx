import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/http.server";
import {
  dbQuery,
  getResourceLimitEnforcementState,
  getTerminalSessionLimitEnforcementState,
} from "@/server/db.server";
import { getBuildInfo } from "@/server/build-info.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        await dbQuery("SELECT 1");
        const resourceLimitEnforcement = await getResourceLimitEnforcementState();
        const terminalSessionLimitEnforcement = await getTerminalSessionLimitEnforcementState();
        return jsonResponse({
          ok: true,
          service: "agentlx-api",
          database: "ok",
          build: getBuildInfo(),
          resourceLimitEnforcement,
          terminalSessionLimitEnforcement,
          now: new Date().toISOString(),
        });
      },
    },
  },
});
