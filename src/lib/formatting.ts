import type { MachineStatus } from "./agentlx";

function getRuntimeTimeZone() {
  if (
    typeof process !== "undefined" &&
    typeof process.env?.APP_TIME_ZONE === "string" &&
    process.env.APP_TIME_ZONE
  ) {
    return process.env.APP_TIME_ZONE;
  }

  return undefined;
}

export function formatRelativeTime(isoDate: string, now = new Date()): string {
  const date = new Date(isoDate);
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  if (diffSec < 10) return `${diffSec}s ago`;
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMin % 60}m`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatExecutionDate(isoDate: string): string {
  const date = new Date(isoDate);
  const pad = (value: number) => value.toString().padStart(2, "0");
  const timeZone = getRuntimeTimeZone();

  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .reduce<Record<string, string>>((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {});

    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatEstimatedTime(seconds: number): string {
  return seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)}m`;
}

export function deriveMachineStatus(input: {
  lastSeenAt: string;
  cpuPercent: number;
  diskPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}): MachineStatus {
  const lastSeenMs = new Date(input.lastSeenAt).getTime();
  const secondsSinceSeen = Math.max(0, (Date.now() - lastSeenMs) / 1000);
  const ramPct = input.ramTotalGb > 0 ? (input.ramUsedGb / input.ramTotalGb) * 100 : 0;

  if (secondsSinceSeen >= 180) return "offline";
  if (secondsSinceSeen >= 90 || input.cpuPercent >= 85 || input.diskPercent >= 90 || ramPct >= 90) {
    return "warning";
  }
  return "online";
}
