import path from "node:path";
import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import { jsonError, textResponse } from "@/server/http.server";
import { getEnv } from "@/server/env.server";

const UPDATE_SCRIPT_PATH = path.resolve(process.cwd(), "agent-linux", "update.sh");

export const Route = createFileRoute("/api/agent/update.sh")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const script = await readFile(UPDATE_SCRIPT_PATH, "utf8");
          void request;
          const origin = getEnv().APP_ORIGIN.replace(/\/+$/, "");
          const replacements: Array<[string, string]> = [
            [
              'DEFAULT_RUNTIME_MANIFEST_URL=""',
              `DEFAULT_RUNTIME_MANIFEST_URL=${JSON.stringify(`${origin}/api/agent/files/runtime-manifest`)}`,
            ],
            [
              'DEFAULT_RUNTIME_FILE_URL=""',
              `DEFAULT_RUNTIME_FILE_URL=${JSON.stringify(`${origin}/api/agent/files/runtime`)}`,
            ],
          ];

          let rendered = script;
          for (const [search, replacement] of replacements) {
            rendered = rendered.replace(search, replacement);
          }

          return textResponse(rendered, {
            headers: {
              "content-type": "text/x-shellscript; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        } catch {
          return jsonError("Nao foi possivel carregar o atualizador do agent.", 500);
        }
      },
    },
  },
});
