const PENDING_TEMPLATE_TERMINAL_LAUNCH_KEY = "agentlx.pending-template-terminal-launch";
const MAX_PENDING_AGE_MS = 5 * 60 * 1000;

type PendingTemplateTerminalLaunch = {
  machineId: string;
  templateId: string;
  createdAt: number;
};

export function storePendingTemplateTerminalLaunch(input: {
  machineId: string;
  templateId: string;
}) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const payload: PendingTemplateTerminalLaunch = {
      machineId: input.machineId,
      templateId: input.templateId,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(PENDING_TEMPLATE_TERMINAL_LAUNCH_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumePendingTemplateTerminalLaunch(machineId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_TEMPLATE_TERMINAL_LAUNCH_KEY);
    if (!raw) {
      return null;
    }

    window.sessionStorage.removeItem(PENDING_TEMPLATE_TERMINAL_LAUNCH_KEY);

    const payload = JSON.parse(raw) as Partial<PendingTemplateTerminalLaunch>;
    if (
      typeof payload.machineId !== "string" ||
      typeof payload.templateId !== "string" ||
      typeof payload.createdAt !== "number"
    ) {
      return null;
    }

    if (payload.machineId !== machineId) {
      return null;
    }

    if (Date.now() - payload.createdAt > MAX_PENDING_AGE_MS) {
      return null;
    }

    return {
      machineId: payload.machineId,
      templateId: payload.templateId,
    };
  } catch {
    return null;
  }
}

export function hasPendingTemplateTerminalLaunch(machineId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_TEMPLATE_TERMINAL_LAUNCH_KEY);
    if (!raw) {
      return false;
    }

    const payload = JSON.parse(raw) as Partial<PendingTemplateTerminalLaunch>;
    return (
      payload.machineId === machineId &&
      typeof payload.templateId === "string" &&
      typeof payload.createdAt === "number" &&
      Date.now() - payload.createdAt <= MAX_PENDING_AGE_MS
    );
  } catch {
    return false;
  }
}
