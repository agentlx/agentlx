import { createFileRoute } from "@tanstack/react-router";
import { assertViewerCanAccessMachine } from "@/server/panel.server";
import { getViewerFromCookieHeader } from "@/server/auth.server";
import { assertTrustedCookieRequest } from "@/server/http-security.server";
import {
  getRealtimeTerminalPresence,
  subscribeRealtimeTerminalPresence,
} from "@/server/terminal-realtime.server";

const encoder = new TextEncoder();

function encodeSseEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function encodeSseComment(comment: string) {
  return encoder.encode(`: ${comment}\n\n`);
}

function encodeSsePadding(size: number) {
  return encoder.encode(`:${" ".repeat(Math.max(0, size))}\n\n`);
}

export const Route = createFileRoute("/api/terminal/presence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          assertTrustedCookieRequest(request, {
            message: "Origin da requisicao nao autorizada para o stream de presenca.",
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : "Origin nao autorizada.", {
            status: 403,
          });
        }

        const viewer = await getViewerFromCookieHeader(request.headers.get("cookie") ?? undefined);
        if (!viewer || !viewer.accessibleScreens.includes("machines")) {
          return new Response("Sessao expirada ou acesso negado.", { status: 401 });
        }

        const requestUrl = new URL(request.url);
        const machineId = requestUrl.searchParams.get("machineId")?.trim() ?? "";
        if (!machineId) {
          return new Response("MachineId nao informado.", { status: 400 });
        }

        try {
          await assertViewerCanAccessMachine(machineId, viewer.id);
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : "Acesso negado a esta maquina.",
            { status: 403 },
          );
        }

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            let closed = false;

            const sendPresence = (
              presence: Awaited<ReturnType<typeof getRealtimeTerminalPresence>>,
            ) => {
              if (closed) {
                return;
              }

              controller.enqueue(encodeSseEvent("presence", presence));
            };

            const sendError = (message: string) => {
              if (closed) {
                return;
              }

              controller.enqueue(encodeSseEvent("presence-error", { message }));
            };

            const unsubscribe = subscribeRealtimeTerminalPresence(machineId, sendPresence);
            const heartbeatInterval = setInterval(() => {
              if (closed) {
                return;
              }

              controller.enqueue(encodeSseComment("keepalive"));
            }, 25_000);

            controller.enqueue(encoder.encode("retry: 3000\n\n"));
            controller.enqueue(encodeSsePadding(2048));
            void getRealtimeTerminalPresence(machineId)
              .then(sendPresence)
              .catch(() => {
                sendError("Nao foi possivel carregar os usuarios online.");
              });

            const closeStream = () => {
              if (closed) {
                return;
              }

              closed = true;
              clearInterval(heartbeatInterval);
              unsubscribe();
              controller.close();
            };

            request.signal.addEventListener("abort", closeStream, { once: true });
          },
        });

        return new Response(stream, {
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
