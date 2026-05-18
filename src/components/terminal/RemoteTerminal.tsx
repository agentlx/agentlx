import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plug2, PlugZap } from "lucide-react";
import { TerminalQuickActions } from "@/components/terminal/TerminalQuickActions";
import {
  openRealtimeTerminalSessionAction,
  startRealtimeTemplateExecutionAction,
} from "@/lib/panel-api";
import { requestRealtimeTerminalSessionClose } from "@/lib/realtime-terminal-client";
import { consumePendingTemplateTerminalLaunch } from "@/lib/template-terminal-handoff";
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

type RemoteTerminalTemplate = {
  id: string;
  name: string;
  description: string;
  command: string;
  risk: "low" | "medium" | "high";
};

export function RemoteTerminal({
  machineId,
  machineStatus,
  templates,
}: {
  machineId: string;
  machineStatus: "online" | "offline" | "warning";
  templates: RemoteTerminalTemplate[];
}) {
  const router = useRouter();
  const openSession = useServerFn(openRealtimeTerminalSessionAction);
  const startRealtimeTemplateExecution = useServerFn(startRealtimeTemplateExecutionAction);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<XtermFitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const autoLaunchHandledRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tmuxState, setTmuxState] = useState<"active" | "inactive" | "unknown">("unknown");
  const [terminalReady, setTerminalReady] = useState(false);

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

  const executeTemplateCommand = (template: RemoteTerminalTemplate) => {
    const normalizedCommand = template.command.replaceAll("\r\n", "\n").replaceAll("\n", "\r");
    return sendTerminalInput(
      normalizedCommand.endsWith("\r") ? normalizedCommand : `${normalizedCommand}\r`,
    );
  };

  const startTmux = () => {
    setTmuxState("unknown");
    return sendTerminalInput("tmux new-session -A -s main\r");
  };

  const resetTerminalSessionState = useCallback(() => {
    setConnected(false);
    setConnecting(false);
    setTmuxState("unknown");
  }, []);

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

  useEffect(() => {
    if (!terminalContainerRef.current || terminalRef.current) {
      return;
    }

    let cancelled = false;
    let handleWindowResize: (() => void) | null = null;
    let disposeClipboard: (() => void) | null = null;
    let onDataDispose: { dispose(): void } | null = null;
    let onResizeDispose: { dispose(): void } | null = null;
    let createdTerminal: XtermTerminal | null = null;
    let createdFitAddon: XtermFitAddon | null = null;

    void (async () => {
      const [{ Terminal: TerminalCtor }, fitAddonModule] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      const FitAddonCtor = fitAddonModule.FitAddon;
      if (!TerminalCtor || !FitAddonCtor || cancelled || !terminalContainerRef.current) {
        return;
      }

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
      }) as XtermTerminal;
      const fitAddon = new FitAddonCtor() as XtermFitAddon;
      createdTerminal = terminal;
      createdFitAddon = fitAddon;

      terminal.loadAddon(fitAddon);
      terminal.open(terminalContainerRef.current);
      fitAddon.fit();
      terminal.writeln("agentlx realtime terminal ready.");
      terminal.writeln("Clique em Conectar terminal para abrir uma sessao PTY persistente.\r");

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
      setTerminalReady(true);

      handleWindowResize = () => fitAddon.fit();
      window.addEventListener("resize", handleWindowResize);
    })();

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
      disposeClipboard?.();
      onDataDispose?.dispose();
      onResizeDispose?.dispose();
      createdFitAddon?.dispose();
      createdTerminal?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminalReady(false);
    };
  }, []);

  const attachToSession = useCallback(
    (
      session: { sessionId: string; wsPath: string },
      options?: { readyMessage?: string; openedMessage?: string },
    ) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      activeSessionIdRef.current = session.sessionId;

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
          terminal.writeln(
            options?.readyMessage ?? "\r\n[INFO] Tunel conectado. Aguardando shell remoto...",
          );
          return;
        }

        if (payload.type === "session.opened") {
          setConnected(true);
          setConnecting(false);
          setTmuxState("unknown");
          if (options?.openedMessage) {
            terminal.writeln(options.openedMessage);
          }
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
          setErrorMessage(payload.message ?? "Erro no terminal remoto.");
          terminal.writeln(`\r\n[ERRO] ${payload.message ?? "Erro no terminal remoto."}`);
          return;
        }

        if (payload.type === "terminal.closed") {
          activeSessionIdRef.current = null;
          socketRef.current = null;
          setConnected(false);
          setConnecting(false);
          setTmuxState("unknown");
          terminal.writeln(
            `\r\n[INFO] Sessao encerrada. Exit code: ${payload.exitCode ?? "desconhecido"}`,
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
        setErrorMessage("Falha ao conectar no WebSocket do terminal remoto.");
      };
    },
    [resetTerminalSessionState],
  );

  const connectTerminal = async () => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }

    setConnecting(true);
    setErrorMessage("");

    try {
      fitAddon.fit();
      const session = await openSession({
        data: {
          machineId,
          cols: terminal.cols || 120,
          rows: terminal.rows || 30,
        },
      });
      attachToSession(session);
      void router.invalidate();
    } catch (error) {
      activeSessionIdRef.current = null;
      setConnecting(false);
      setConnected(false);
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel abrir o terminal remoto.",
      );
    }
  };

  const disconnectTerminal = () => {
    releaseTerminalSession();
  };

  useEffect(() => {
    if (!terminalReady || connected || connecting || autoLaunchHandledRef.current) {
      return;
    }

    const pendingLaunch = consumePendingTemplateTerminalLaunch(machineId);
    if (!pendingLaunch) {
      return;
    }

    autoLaunchHandledRef.current = true;
    setConnecting(true);
    setErrorMessage("");
    terminalRef.current?.writeln(
      "\r\n[INFO] Redirecionado de Templates. Preparando execucao do template na maquina...",
    );

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;

    void (async () => {
      try {
        fitAddon?.fit();
        const launched = await startRealtimeTemplateExecution({
          data: {
            machineId,
            templateId: pendingLaunch.templateId,
            cols: terminal?.cols || 120,
            rows: terminal?.rows || 30,
          },
        });

        attachToSession(launched.session, {
          readyMessage: "\r\n[INFO] Tunel conectado. Preparando execucao do template...",
          openedMessage: "\r\n[INFO] Shell conectado. O comando do template foi iniciado.",
        });
        void router.invalidate();
      } catch (error) {
        setConnecting(false);
        setConnected(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel iniciar o template no terminal da maquina.",
        );
      }
    })();
  }, [
    attachToSession,
    connected,
    connecting,
    machineId,
    router,
    startRealtimeTemplateExecution,
    terminalReady,
  ]);

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
    <Section title="Terminal remoto">
      <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
        {machineStatus === "offline" && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            A maquina esta offline. O terminal remoto so e liberado quando o agent volta a enviar
            heartbeat.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 font-mono text-xs text-muted-foreground">
            {connected
              ? "Sessao conectada em tempo real."
              : connecting
                ? "Conectando ao tunel persistente..."
                : "Sessao desconectada."}
          </div>
          <div className="flex justify-start gap-2 sm:justify-end">
            {!connected ? (
              <button
                onClick={() => void connectTerminal()}
                disabled={machineStatus === "offline" || connecting}
                className="flex h-10 w-full min-w-[178px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:w-[178px]"
              >
                <PlugZap className="size-3.5" />
                {connecting ? "Conectando..." : "Conectar terminal"}
              </button>
            ) : (
              <button
                onClick={disconnectTerminal}
                className="flex h-10 w-full min-w-[178px] items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary sm:w-[178px]"
              >
                <Plug2 className="size-3.5" /> Desconectar
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-black">
          <div
            ref={terminalContainerRef}
            className="h-[340px] w-full px-3 py-2 sm:h-[420px] xl:h-[460px] [&_.xterm]:h-full [&_.xterm-viewport]:!overflow-y-auto"
          />
        </div>

        <TerminalQuickActions
          canExecute={connected}
          tmuxState={tmuxState}
          onExecute={sendTerminalInput}
          templates={templates}
          onExecuteTemplate={executeTemplateCommand}
          onStartTmux={startTmux}
          onFocusTerminal={focusTerminal}
        />
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
