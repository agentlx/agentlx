import path from "node:path";
import { readFile } from "node:fs/promises";
import { createFileRoute } from "@tanstack/react-router";
import { jsonError, textResponse } from "@/server/http.server";

const FILE_PATH = path.resolve(process.cwd(), "agent-linux", "requirements.txt");

export const Route = createFileRoute("/api/agent/files/requirements")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const body = await readFile(FILE_PATH, "utf8");
          return textResponse(body, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          return jsonError(
            error instanceof Error ? error.message : "Nao foi possivel carregar requirements.",
            500,
          );
        }
      },
    },
  },
});
