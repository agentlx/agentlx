const TERMINAL_CLOSE_ENDPOINT = "/api/terminal/close";

type RequestRealtimeTerminalSessionCloseOptions = {
  keepalive?: boolean;
  preferBeacon?: boolean;
};

export async function requestRealtimeTerminalSessionClose(
  sessionId: string,
  options: RequestRealtimeTerminalSessionCloseOptions = {},
) {
  if (!sessionId || typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify({ sessionId });

  if (options.preferBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      TERMINAL_CLOSE_ENDPOINT,
      new Blob([body], { type: "application/json" }),
    );

    if (sent) {
      return;
    }
  }

  try {
    await fetch(TERMINAL_CLOSE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      credentials: "same-origin",
      keepalive: options.keepalive ?? false,
    });
  } catch {
    // O fechamento por WebSocket ainda serve como fallback quando o POST falha.
  }
}
