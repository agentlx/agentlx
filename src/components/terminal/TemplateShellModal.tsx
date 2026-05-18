import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TerminalQuickActions } from "@/components/terminal/TerminalQuickActions";
import type { RealtimeTerminalSessionView } from "@/lib/agentlx";
import { requestRealtimeTerminalSessionClose } from "@/lib/realtime-terminal-client";
import { setupTerminalClipboard } from "@/lib/xterm-clipboard";
import "@xterm/xterm/css/xterm.css";

type XtermTerminal = {
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
  cols: number;
  dispose(): void;
  focus(): void;
  getSelection(): string;
  hasSelection(): boolean;
  loadAddon(addon: unknown): void;
  onData(handler: (data: string) => void): { dispose(): void };
  onResize(handler: (size: { cols: number; rows: number }) => void): { dispose(): void };
  open(container: HTMLElement): void;
  rows: number;
  write(data: string): void;
  writeln(data: string): void;
};

type XtermFitAddon = {
  dispose(): void;
  fit(): void;
};

export function TemplateShellModal({
  session,
  onClose,
}: {
  session: RealtimeTerminalSessionView;
  onClose: () => void;
}) {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<XtermFitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const activeSessionIdRef = useRef<string | null>(session.sessionId);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tmuxState, setTmuxState] = useState<"active" | "inactive" | "unknown">("unknown");

  const sendTerminalInput = (text: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({ type: "terminal.input", data: text }));
    return true;
  };

  const focusTerminal = () => {
    terminalRef.current?.focus();
  };

  const startTmux = () => {
    setTmuxState("unknown");
    return sendTerminalInput("tmux new-session -A -s main\r");
  };

  const resetTerminalSessionState = () => {
    setConnected(false);
    setTmuxState("unknown");
  };

  const releaseTerminalSession = (options?: { preferBeacon?: boolean; keepalive?: boolean }) => {
    const sessionId = activeSessionIdRef.current;
    activeSessionIdRef.current = null;

    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    resetTerminalSessionState();

    if (!sessionId) {
      return;
    }

    void requestRealtimeTerminalSessionClose(sessionId, {
      keepalive: options?.keepalive ?? true,
      preferBeacon: options?.preferBeacon ?? false,
    });
  };

  const closeShellModal = () => {
    releaseTerminalSession();
    onClose();
  };

  useEffect(() => {
    if (!terminalContainerRef.current || terminalRef.current) {
      return;
    }

    activeSessionIdRef.current = session.sessionId;
    let cancelled = false;
    let onDataDispose: { dispose(): void } | null = null;
    let onResizeDispose: { dispose(): void } | null = null;
    let disposeClipboard = () => {};
    let handleWindowResize: (() => void) | null = null;

    const initializeTerminal = async () => {
      const [{ Terminal: TerminalCtor }, fitAddonModule] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (cancelled || !terminalContainerRef.current) {
        return;
      }

      const FitAddonCtor = fitAddonModule.FitAddon;
      const terminal = new TerminalCtor({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 12,
        scrollback: 5000,
        theme: {
          background: "#05070b",
          foreground: "#f4f7fb",
          cursor: "#3b82f6",
        },
      });
      const fitAddon = new FitAddonCtor();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalContainerRef.current);
      fitAddon.fit();
      terminal.writeln("agentlx realtime shell ready.");
      terminal.writeln("Conectando ao tunel persistente...\r");

      onDataDispose = terminal.onData((data) => {
        sendTerminalInput(data);
      });

      onResizeDispose = terminal.onResize(({ cols, rows }) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(JSON.stringify({ type: "terminal.resize", cols, rows }));
      });

      disposeClipboard = setupTerminalClipboard({
        terminal,
        container: terminalContainerRef.current,
        sendInput: (text) => {
          sendTerminalInput(text);
        },
      });

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${wsProtocol}//${window.location.host}${session.wsPath}`);
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
      }
      heartbeatIntervalRef.current = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(JSON.stringify({ type: "terminal.ping" }));
      }, 25_000);
      socketRef.current = socket;

      socket.onopen = () => {
        terminal.focus();
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(String(event.data)) as {
          type: string;
          data?: string;
          message?: string;
          exitCode?: number | null;
          active?: boolean;
        };

        if (payload.type === "session.ready") {
          terminal.writeln("\r\n[INFO] Sessao pronta. Abrindo shell remoto...");
          return;
        }

        if (payload.type === "session.opened") {
          setConnected(true);
          setTmuxState("unknown");
          terminal.writeln("\r\n[INFO] Shell conectado. A execucao do template foi iniciada.");
          terminal.focus();
          return;
        }

        if (payload.type === "terminal.output") {
          terminal.write(payload.data ?? "");
          return;
        }

        if (payload.type === "terminal.tmux") {
          setTmuxState(payload.active ? "active" : "inactive");
          return;
        }

        if (payload.type === "session.error") {
          setErrorMessage(payload.message ?? "Erro no shell remoto.");
          terminal.writeln(`\r\n[ERRO] ${payload.message ?? "Erro no shell remoto."}`);
          return;
        }

        if (payload.type === "terminal.closed") {
          activeSessionIdRef.current = null;
          socketRef.current = null;
          setConnected(false);
          setTmuxState("unknown");
          terminal.writeln(
            `\r\n[INFO] Shell encerrado. Exit code: ${payload.exitCode ?? "desconhecido"}`,
          );
        }
      };

      socket.onclose = () => {
        if (heartbeatIntervalRef.current !== null) {
          window.clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        const sessionId = activeSessionIdRef.current;
        activeSessionIdRef.current = null;
        socketRef.current = null;
        resetTerminalSessionState();
        if (sessionId) {
          void requestRealtimeTerminalSessionClose(sessionId, { keepalive: true });
        }
      };

      socket.onerror = () => {
        if (heartbeatIntervalRef.current !== null) {
          window.clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        resetTerminalSessionState();
        setErrorMessage("Falha ao conectar no WebSocket do shell remoto.");
      };

      handleWindowResize = () => fitAddon.fit();
      window.addEventListener("resize", handleWindowResize);
    };

    void initializeTerminal();

    return () => {
      cancelled = true;
      if (handleWindowResize) {
        window.removeEventListener("resize", handleWindowResize);
      }
      const sessionId = activeSessionIdRef.current;
      activeSessionIdRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (sessionId) {
        void requestRealtimeTerminalSessionClose(sessionId, { keepalive: true });
      }
      disposeClipboard();
      onDataDispose?.dispose();
      onResizeDispose?.dispose();
      fitAddonRef.current?.dispose();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session.sessionId, session.wsPath]);

  useEffect(() => {
    const handlePageHide = () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }

      activeSessionIdRef.current = null;

      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      void requestRealtimeTerminalSessionClose(sessionId, {
        keepalive: true,
        preferBeacon: true,
      });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return (
    <TerminalModalShell onClose={closeShellModal}>
      <div className="flex justify-end px-4 pt-4">
        <button
          onClick={closeShellModal}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 px-4 pb-4">
        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-black">
          <div
            ref={terminalContainerRef}
            className="h-[72vh] min-h-[420px] w-full px-3 py-2 [&_.xterm]:h-full [&_.xterm-viewport]:!overflow-y-auto"
          />
        </div>

        <TerminalQuickActions
          canExecute={connected}
          tmuxState={tmuxState}
          onExecute={sendTerminalInput}
          onStartTmux={startTmux}
          onFocusTerminal={focusTerminal}
        />
      </div>
    </TerminalModalShell>
  );
}
function TerminalModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="max-h-[92vh] overflow-hidden">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
