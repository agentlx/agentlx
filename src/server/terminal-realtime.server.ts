import type http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  OpenRealtimeTerminalSessionInput,
  RealtimeTerminalPresenceView,
  RealtimeTerminalSessionView,
} from "@/lib/agentlx";
import { authenticateAgentMessage } from "./agent.server";
import { appendAuditLog } from "./audit.server";
import { getViewerFromCookieHeader } from "./auth.server";
import { dbQuery } from "./db.server";
import { getEnv } from "./env.server";

type AgentSocketContext = {
  machineId: string;
  socket: WebSocket;
};

type TerminalSession = {
  sessionId: string;
  machineId: string;
  openedByUserId: string;
  openedByActorId: string;
  cols: number;
  rows: number;
  browserSocket: WebSocket | null;
  openedAt: number;
  expiresAt: number;
  connectedToAgent: boolean;
  browserAttached: boolean;
  inputAudited: boolean;
  lastBrowserHeartbeatAt: number;
  browserHeartbeatTimer: NodeJS.Timeout | null;
  bootstrapExecution: {
    executionId: string;
    command: string;
    timeoutSec: number;
  } | null;
};

type MachineRow = {
  id: string;
  hostname: string;
  status: "online" | "offline" | "warning";
};

type UserIdentityRow = {
  id: string;
  full_name: string;
  email: string;
};

const PRECONNECT_TTL_MS = 30_000;
const BROWSER_HEARTBEAT_INTERVAL_MS = 25_000;
const BROWSER_HEARTBEAT_TIMEOUT_MS = 75_000;
const sessions = new Map<string, TerminalSession>();
const agentSockets = new Map<string, AgentSocketContext>();
const presenceSubscribers = new Map<
  string,
  Set<(presence: RealtimeTerminalPresenceView) => void>
>();

const browserWss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });

let initialized = false;
let lastUnauthorizedAgentTunnelLogAt = 0;

const UNAUTHORIZED_AGENT_TUNNEL_LOG_INTERVAL_MS = 60_000;

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(statusCode) ? statusCode : null;
}

function rejectUpgrade(socket: import("node:stream").Duplex, statusCode: number) {
  const reason = statusCode === 401 ? "Unauthorized" : "Bad Request";
  try {
    socket.write(
      `HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    );
  } catch {
    // Socket may already be closed by the peer.
  }
  socket.destroy();
}

function logUnauthorizedAgentTunnelOnce(error: unknown) {
  const now = Date.now();
  if (now - lastUnauthorizedAgentTunnelLogAt < UNAUTHORIZED_AGENT_TUNNEL_LOG_INTERVAL_MS) {
    return;
  }

  lastUnauthorizedAgentTunnelLogAt = now;
  const message = error instanceof Error ? error.message : "upgrade nao autorizado";
  console.warn(`[terminal][agent-tunnel] upgrade recusado: ${message}`);
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    return false;
  }
  socket.send(JSON.stringify(payload));
  return true;
}

function scheduleSessionExpiry(sessionId: string) {
  setTimeout(() => {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.browserAttached || session.connectedToAgent) {
      return;
    }

    if (Date.now() < session.expiresAt) {
      return;
    }

    if (session.browserSocket && session.browserSocket.readyState === session.browserSocket.OPEN) {
      sendJson(session.browserSocket, {
        type: "session.error",
        message: "Sessão de terminal expirada.",
      });
      session.browserSocket.close();
    }

    sessions.delete(sessionId);
  }, PRECONNECT_TTL_MS + 1_000);
}

function clearBrowserHeartbeatTimer(session: TerminalSession) {
  if (session.browserHeartbeatTimer) {
    clearTimeout(session.browserHeartbeatTimer);
    session.browserHeartbeatTimer = null;
  }
}

function noteBrowserPresence(session: TerminalSession) {
  session.lastBrowserHeartbeatAt = Date.now();
}

function scheduleBrowserHeartbeatTimeout(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  clearBrowserHeartbeatTimer(session);
  session.browserHeartbeatTimer = setTimeout(() => {
    const current = sessions.get(sessionId);
    if (!current) {
      return;
    }

    if (!current.browserAttached) {
      closeTerminalSession(sessionId);
      return;
    }

    if (Date.now() - current.lastBrowserHeartbeatAt >= BROWSER_HEARTBEAT_TIMEOUT_MS) {
      closeTerminalSession(sessionId, {
        reason: "Sessao encerrada por perda de presenca do navegador.",
      });
      return;
    }

    scheduleBrowserHeartbeatTimeout(sessionId);
  }, BROWSER_HEARTBEAT_INTERVAL_MS);
}

function closeTerminalSession(
  sessionId: string,
  options: {
    reason?: string;
    notifyBrowser?: boolean;
  } = {},
) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  clearBrowserHeartbeatTimer(session);

  if (session.browserSocket && session.browserSocket.readyState === session.browserSocket.OPEN) {
    if (options.notifyBrowser !== false && options.reason) {
      sendJson(session.browserSocket, {
        type: "session.error",
        sessionId,
        message: options.reason,
      });
    }
    session.browserSocket.close();
  }

  const agent = agentSockets.get(session.machineId);
  if (agent) {
    sendJson(agent.socket, {
      type: "terminal.close",
      sessionId,
    });
  }

  sessions.delete(sessionId);
  void broadcastRealtimeTerminalPresence(session.machineId);
}

async function loadMachine(machineId: string) {
  const result = await dbQuery<MachineRow>(
    `
      SELECT id, hostname, status
      FROM machines
      WHERE id = $1
      LIMIT 1
    `,
    [machineId],
  );

  return result.rows[0] ?? null;
}

function closeSessionsForMachine(machineId: string, reason: string) {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.machineId !== machineId) {
      continue;
    }

    closeTerminalSession(sessionId, { reason });
  }
}

function handleAgentMessage(machineId: string, raw: string) {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }

  if (!message || typeof message !== "object") {
    return;
  }

  const payload = message as Record<string, unknown>;
  const type = typeof payload.type === "string" ? payload.type : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session || session.machineId !== machineId) {
    return;
  }

  const browserSocket = session.browserSocket;

  switch (type) {
    case "terminal.opened":
      session.connectedToAgent = true;
      if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
        sendJson(browserSocket, { type: "session.opened", sessionId });
      }
      void broadcastRealtimeTerminalPresence(session.machineId);
      return;
    case "terminal.output":
      if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
        sendJson(browserSocket, {
          type: "terminal.output",
          sessionId,
          data: typeof payload.data === "string" ? payload.data : "",
        });
      }
      return;
    case "terminal.tmux":
      if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
        sendJson(browserSocket, {
          type: "terminal.tmux",
          sessionId,
          active: Boolean(payload.active),
        });
      }
      return;
    case "terminal.closed":
      clearBrowserHeartbeatTimer(session);
      if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
        sendJson(browserSocket, {
          type: "terminal.closed",
          sessionId,
          exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
        });
        browserSocket.close();
      }
      sessions.delete(sessionId);
      void broadcastRealtimeTerminalPresence(session.machineId);
      return;
    case "terminal.error":
      if (browserSocket && browserSocket.readyState === browserSocket.OPEN) {
        sendJson(browserSocket, {
          type: "session.error",
          sessionId,
          message:
            typeof payload.message === "string"
              ? payload.message
              : "Falha no túnel do terminal remoto.",
        });
      }
      return;
    default:
      return;
  }
}

function openTerminalOnAgent(session: TerminalSession) {
  const agent = agentSockets.get(session.machineId);
  if (!agent) {
    throw new Error("O agent da máquina não possui túnel persistente ativo.");
  }

  sendJson(agent.socket, {
    type: "terminal.open",
    sessionId: session.sessionId,
    cols: session.cols,
    rows: session.rows,
    executionId: session.bootstrapExecution?.executionId ?? null,
    command: session.bootstrapExecution?.command ?? null,
    timeoutSec: session.bootstrapExecution?.timeoutSec ?? null,
  });
}

async function auditTerminalInputStarted(session: TerminalSession) {
  const machine = await loadMachine(session.machineId);
  await appendAuditLog(
    {
      query: (text, params) => dbQuery(text, params),
    },
    {
      actorType: "panel",
      actorId: session.openedByActorId,
      action: "terminal.session.input_started",
      severity: "warn",
      machineId: session.machineId,
      machineHostname: machine?.hostname ?? null,
      executionId: session.bootstrapExecution?.executionId ?? null,
      message: `Conta ${session.openedByActorId} iniciou entrada interativa em terminal ao vivo na maquina ${machine?.hostname ?? session.machineId}.`,
      metadata: {
        alert: true,
        openedByUserId: session.openedByUserId,
        sessionId: session.sessionId,
        bootstrapExecutionId: session.bootstrapExecution?.executionId ?? null,
        privileged: true,
      },
    },
  );
}

function attachAgentHandlers(socket: WebSocket, machineId: string) {
  socket.on("message", (buffer) => {
    const raw = typeof buffer === "string" ? buffer : buffer.toString("utf-8");
    handleAgentMessage(machineId, raw);
  });

  socket.on("close", () => {
    agentSockets.delete(machineId);
    closeSessionsForMachine(machineId, "O túnel persistente do agent foi desconectado.");
  });
}

function attachBrowserHandlers(socket: WebSocket, session: TerminalSession) {
  socket.on("message", (buffer) => {
    const raw = typeof buffer === "string" ? buffer : buffer.toString("utf-8");
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (!message || typeof message !== "object") {
      return;
    }

    const payload = message as Record<string, unknown>;
    const type = typeof payload.type === "string" ? payload.type : "";
    const agent = agentSockets.get(session.machineId);
    if (!agent) {
      sendJson(socket, {
        type: "session.error",
        message: "Túnel do agent indisponível.",
      });
      return;
    }

    if (type === "terminal.input") {
      noteBrowserPresence(session);
      scheduleBrowserHeartbeatTimeout(session.sessionId);
      if (!session.inputAudited) {
        session.inputAudited = true;
        auditTerminalInputStarted(session).catch((error) => {
          console.error("[terminal][audit] falha ao registrar entrada interativa", error);
        });
      }
      sendJson(agent.socket, {
        type: "terminal.input",
        sessionId: session.sessionId,
        data: typeof payload.data === "string" ? payload.data : "",
      });
      return;
    }

    if (type === "terminal.resize") {
      noteBrowserPresence(session);
      scheduleBrowserHeartbeatTimeout(session.sessionId);
      session.cols = typeof payload.cols === "number" ? payload.cols : session.cols;
      session.rows = typeof payload.rows === "number" ? payload.rows : session.rows;
      sendJson(agent.socket, {
        type: "terminal.resize",
        sessionId: session.sessionId,
        cols: session.cols,
        rows: session.rows,
      });
      return;
    }

    if (type === "terminal.ping") {
      noteBrowserPresence(session);
      scheduleBrowserHeartbeatTimeout(session.sessionId);
    }
  });

  socket.on("close", () => {
    const current = sessions.get(session.sessionId);
    if (!current) {
      return;
    }

    current.browserSocket = null;
    current.browserAttached = false;
    closeTerminalSession(current.sessionId);
  });
}

function verifyBrowserOrigin(originHeader: string | string[] | undefined) {
  if (!originHeader || Array.isArray(originHeader)) {
    return false;
  }

  return originHeader === getEnv().APP_ORIGIN;
}

async function handleBrowserUpgrade(
  request: http.IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
) {
  if (!verifyBrowserOrigin(request.headers.origin)) {
    socket.destroy();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const sessionId = requestUrl.searchParams.get("sessionId");
  if (!sessionId) {
    socket.destroy();
    return;
  }

  const session = sessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt || session.browserAttached) {
    socket.destroy();
    return;
  }

  const viewer = await getViewerFromCookieHeader(request.headers.cookie);
  if (!viewer || viewer.id !== session.openedByUserId) {
    socket.destroy();
    return;
  }

  browserWss.handleUpgrade(request, socket, head, (ws) => {
    session.browserSocket = ws;
    session.browserAttached = true;
    noteBrowserPresence(session);

    browserWss.emit("connection", ws, request);
    sendJson(ws, {
      type: "session.ready",
      sessionId: session.sessionId,
      machineId: session.machineId,
    });

    attachBrowserHandlers(ws, session);
    scheduleBrowserHeartbeatTimeout(session.sessionId);

    try {
      openTerminalOnAgent(session);
    } catch (error) {
      console.warn(
        "[terminal][browser] falha ao abrir sessao no agent",
        error instanceof Error ? error.message : error,
      );
      sendJson(ws, {
        type: "session.error",
        message: "Falha ao abrir o terminal no agent remoto.",
      });
      ws.close();
      closeTerminalSession(session.sessionId, { notifyBrowser: false });
    }
  });
}

async function handleAgentUpgrade(
  request: http.IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
) {
  const headerValue = (name: string) => {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const authenticated = await authenticateAgentMessage({
    authorizationHeader: headerValue("authorization"),
    method: request.method ?? "GET",
    requestPath: "/api/agent/tunnel",
    rawBody: "",
    getHeader: headerValue,
  });
  const agent = authenticated.agent;
  if (agent.state !== "active") {
    socket.destroy();
    return;
  }

  agentWss.handleUpgrade(request, socket, head, (ws) => {
    agentSockets.set(agent.machine_id, { machineId: agent.machine_id, socket: ws });
    attachAgentHandlers(ws, agent.machine_id);
    agentWss.emit("connection", ws, request);
    sendJson(ws, { type: "agent.ready", machineId: agent.machine_id });
  });
}

export function initializeRealtimeTerminalServer(nodeServer: http.Server) {
  if (initialized) {
    return;
  }

  initialized = true;
  nodeServer.on("upgrade", async (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    try {
      if (requestUrl.pathname === "/api/agent/tunnel") {
        await handleAgentUpgrade(request, socket, head);
        return;
      }

      if (requestUrl.pathname === "/api/terminal/ws") {
        await handleBrowserUpgrade(request, socket, head);
        return;
      }

      socket.destroy();
    } catch (error) {
      const statusCode = getErrorStatusCode(error);
      if (requestUrl.pathname === "/api/agent/tunnel" && statusCode === 401) {
        logUnauthorizedAgentTunnelOnce(error);
        rejectUpgrade(socket, 401);
        return;
      }

      console.error(error);
      rejectUpgrade(socket, 400);
    }
  });
}

export function notifyAgentQueueAvailable(machineId: string) {
  const agent = agentSockets.get(machineId);
  if (!agent) {
    return false;
  }

  return sendJson(agent.socket, {
    type: "queue.refresh",
    machineId,
  });
}

export async function openRealtimeTerminalSession(
  input: OpenRealtimeTerminalSessionInput,
  openedBy: {
    userId: string;
    actorId: string;
  },
  bootstrapExecution?: {
    executionId: string;
    command: string;
    timeoutSec: number;
  },
): Promise<RealtimeTerminalSessionView> {
  void (
    openRealtimeTerminalSession as typeof openRealtimeTerminalSession & {
      initializeRealtimeTerminalServer?: typeof initializeRealtimeTerminalServer;
    }
  ).initializeRealtimeTerminalServer;

  const machine = await loadMachine(input.machineId);
  if (!machine) {
    throw new Error("Máquina não encontrada.");
  }

  if (machine.status === "offline") {
    throw new Error("A máquina está offline.");
  }

  if (!agentSockets.has(machine.id)) {
    throw new Error(
      "O agent ainda não abriu o túnel persistente. Reinicie o agent atualizado e tente novamente.",
    );
  }

  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    sessionId,
    machineId: machine.id,
    openedByUserId: openedBy.userId,
    openedByActorId: openedBy.actorId,
    cols: input.cols,
    rows: input.rows,
    browserSocket: null,
    openedAt: Date.now(),
    expiresAt: Date.now() + PRECONNECT_TTL_MS,
    connectedToAgent: false,
    browserAttached: false,
    inputAudited: false,
    lastBrowserHeartbeatAt: Date.now(),
    browserHeartbeatTimer: null,
    bootstrapExecution: bootstrapExecution ?? null,
  });
  scheduleSessionExpiry(sessionId);

  const createdAt = new Date().toISOString();
  await appendAuditLog(
    {
      query: (text, params) => dbQuery(text, params),
    },
    {
      executionId: bootstrapExecution?.executionId ?? null,
      machineId: machine.id,
      machineHostname: machine.hostname,
      actorType: "panel",
      actorId: openedBy.actorId,
      action: "terminal.session.opened",
      message: bootstrapExecution
        ? `Conta ${openedBy.actorId} abriu um terminal ao vivo em ${machine.hostname} para acompanhar a execucao ${bootstrapExecution.executionId}.`
        : `Conta ${openedBy.actorId} abriu um terminal ao vivo na maquina ${machine.hostname}.`,
      createdAt,
      severity: "warn",
      metadata: {
        alert: true,
        openedByUserId: openedBy.userId,
        bootstrapExecutionId: bootstrapExecution?.executionId ?? null,
      },
    },
  );

  return {
    sessionId,
    machineId: machine.id,
    wsPath: `/api/terminal/ws?sessionId=${sessionId}`,
  };
}

Object.assign(openRealtimeTerminalSession, {
  initializeRealtimeTerminalServer,
});

export function closeRealtimeTerminalSession(sessionId: string, openedByUserId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return { closed: false };
  }

  if (session.openedByUserId !== openedByUserId) {
    throw new Error("Sessao de terminal nao encontrada para este usuario.");
  }

  closeTerminalSession(sessionId, { notifyBrowser: false });
  return { closed: true };
}

export async function getRealtimeTerminalPresence(
  machineId: string,
): Promise<RealtimeTerminalPresenceView> {
  const activeSessions = Array.from(sessions.values()).filter(
    (session) =>
      session.machineId === machineId && session.browserAttached && session.connectedToAgent,
  );

  if (activeSessions.length === 0) {
    return {
      machineId,
      onlineCount: 0,
      participants: [],
    };
  }

  const presenceByUserId = new Map<
    string,
    {
      connectedAt: number;
      tunnelCount: number;
    }
  >();

  for (const session of activeSessions) {
    const current = presenceByUserId.get(session.openedByUserId);
    if (!current) {
      presenceByUserId.set(session.openedByUserId, {
        connectedAt: session.openedAt,
        tunnelCount: 1,
      });
      continue;
    }

    current.connectedAt = Math.min(current.connectedAt, session.openedAt);
    current.tunnelCount += 1;
  }

  const userIds = [...presenceByUserId.keys()];
  const usersResult = await dbQuery<UserIdentityRow>(
    `
      SELECT id, full_name, email
      FROM users
      WHERE id = ANY($1::text[])
    `,
    [userIds],
  );

  const usersById = new Map(usersResult.rows.map((row) => [row.id, row] as const));
  const participants = userIds
    .map((userId) => {
      const presence = presenceByUserId.get(userId);
      const user = usersById.get(userId);
      if (!presence || !user) {
        return null;
      }

      return {
        userId,
        fullName: user.full_name,
        email: user.email,
        connectedAt: new Date(presence.connectedAt).toISOString(),
        tunnelCount: presence.tunnelCount,
      };
    })
    .filter((participant): participant is NonNullable<typeof participant> => participant !== null)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "pt-BR"));

  return {
    machineId,
    onlineCount: participants.length,
    participants,
  };
}

async function broadcastRealtimeTerminalPresence(machineId: string) {
  const subscribers = presenceSubscribers.get(machineId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  try {
    const presence = await getRealtimeTerminalPresence(machineId);
    for (const subscriber of subscribers) {
      subscriber(presence);
    }
  } catch (error) {
    console.error("[terminal][presence] falha ao emitir atualizacao", {
      machineId,
      error,
    });
  }
}

export function subscribeRealtimeTerminalPresence(
  machineId: string,
  subscriber: (presence: RealtimeTerminalPresenceView) => void,
) {
  const current = presenceSubscribers.get(machineId);
  if (current) {
    current.add(subscriber);
  } else {
    presenceSubscribers.set(machineId, new Set([subscriber]));
  }

  return () => {
    const subscribers = presenceSubscribers.get(machineId);
    if (!subscribers) {
      return;
    }

    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      presenceSubscribers.delete(machineId);
    }
  };
}
