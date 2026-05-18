import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getViewerFromCookieHeader } from "@/server/auth.server";
import { assertTrustedCookieRequest } from "@/server/http-security.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { closeRealtimeTerminalSession } from "@/server/terminal-realtime.server";

const closeRealtimeTerminalSessionSchema = z.object({
  sessionId: z.string().min(1).max(120),
});

async function parseCloseRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return closeRealtimeTerminalSessionSchema.parse(await request.json());
  }

  const raw = await request.text();
  if (!raw) {
    throw new Error("SessionId do tunel nao informado.");
  }

  try {
    return closeRealtimeTerminalSessionSchema.parse(JSON.parse(raw));
  } catch {
    const params = new URLSearchParams(raw);
    return closeRealtimeTerminalSessionSchema.parse({
      sessionId: params.get("sessionId") ?? "",
    });
  }
}

export const Route = createFileRoute("/api/terminal/close")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertTrustedCookieRequest(request, {
            message: "Origin da requisicao nao autorizada para encerrar o terminal.",
          });
        } catch (error) {
          return jsonError(error instanceof Error ? error.message : "Origin nao autorizada.", 403);
        }

        const viewer = await getViewerFromCookieHeader(request.headers.get("cookie") ?? undefined);
        if (!viewer) {
          return jsonError("Sessao expirada ou ausente. Faca login novamente.", 401);
        }

        try {
          const body = await parseCloseRequestBody(request);
          const result = closeRealtimeTerminalSession(body.sessionId, viewer.id);
          return jsonResponse({
            ok: true,
            ...result,
          });
        } catch (error) {
          return jsonError(
            error instanceof Error ? error.message : "Nao foi possivel encerrar o tunel remoto.",
            400,
          );
        }
      },
    },
  },
});
