import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/http.server";
import { dbQuery } from "@/server/db.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        await dbQuery("SELECT 1");
        return jsonResponse({
          ok: true,
          service: "agentlx-api",
          database: "ok",
          now: new Date().toISOString(),
        });
      },
    },
  },
});
