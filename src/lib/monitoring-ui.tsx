import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type {
  SecurityAlertStatus,
  SecurityEventComputedStatus,
  SecuritySeverity,
} from "@/lib/security-monitoring";

export const severityLabels: Record<SecuritySeverity, string> = {
  low: "Baixo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico",
};

export const statusLabels: Record<SecurityAlertStatus | SecurityEventComputedStatus, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  investigating: "Investigando",
  resolved: "Resolvido",
  false_positive: "Falso positivo",
  no_alert: "Sem alerta",
};

export const severityColors: Record<SecuritySeverity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export const numberFormatter = new Intl.NumberFormat("pt-BR");

const navItems = [
  { label: "Dashboard", to: "/monitoring" },
  { label: "Maquinas", to: "/monitoring/machines" },
  { label: "Alertas", to: "/monitoring/alerts" },
  { label: "Eventos", to: "/monitoring/events" },
  { label: "Regras", to: "/monitoring/rules" },
] as const;

export function MonitoringNav({ active }: { active: (typeof navItems)[number]["to"] }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            active === item.to
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold"
      style={{
        borderColor: `${severityColors[severity]}66`,
        color: severityColors[severity],
        background: `${severityColors[severity]}1a`,
      }}
    >
      {severityLabels[severity]}
    </span>
  );
}

export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatPercent(value: number | null | undefined) {
  return `${Math.round(Number(value) || 0)}%`;
}
