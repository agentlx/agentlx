import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, Server, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import { getSecurityDashboardData } from "@/lib/security-monitoring-api";
import {
  formatDateTime,
  MonitoringNav,
  numberFormatter,
  SeverityBadge,
  statusLabels,
} from "@/lib/monitoring-ui";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    return getSecurityDashboardData({ data: { period: "24h" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoramento` },
      {
        name: "description",
        content: "Visao executiva de risco e alertas das maquinas Linux.",
      },
    ],
  }),
  component: MonitoringPage,
});

function MonitoringPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dashboard = Route.useLoaderData();

  if (pathname !== "/monitoring") {
    return <Outlet />;
  }

  const criticalOrHighAlerts = dashboard.recentAlerts.filter(
    (alert) => alert.severity === "critical" || alert.severity === "high",
  );

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "monitoring" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prioridades operacionais das ultimas 24 horas.
            </p>
          </div>
          <MonitoringNav active="/monitoring" />
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={Server}
            label="Maquinas monitoradas"
            value={dashboard.summary.monitoredMachines}
          />
          <Kpi
            icon={AlertTriangle}
            label="Maquinas com alerta"
            value={dashboard.summary.machinesWithAlerts}
            tone="warn"
          />
          <Kpi
            icon={ShieldAlert}
            label="Alertas criticos"
            value={dashboard.summary.criticalAlerts}
            tone="danger"
          />
          <Kpi icon={Activity} label="Eventos recentes" value={dashboard.summary.totalEvents} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel
            title="Maquinas em maior risco"
            action={<Link to="/monitoring/machines">Ver maquinas</Link>}
          >
            <div className="divide-y divide-border">
              {dashboard.topMachines.slice(0, 8).map((machine) => (
                <Link
                  key={machine.machineId}
                  to="/monitoring/machines/$machineId"
                  params={{ machineId: machine.machineId }}
                  className="grid gap-2 px-1 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[1fr_120px_120px_140px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{machine.hostname}</p>
                    <p className="text-xs text-muted-foreground">
                      {machine.os || "Linux"} · visto {formatDateTime(machine.lastSeenAt)}
                    </p>
                  </div>
                  <Metric label="Eventos" value={machine.totalEvents} />
                  <Metric label="Alertas" value={machine.totalAlerts} />
                  <Metric label="Crit/alto" value={machine.criticalAlerts + machine.highAlerts} />
                </Link>
              ))}
              {dashboard.topMachines.length === 0 && (
                <EmptyState>Nenhuma maquina com alerta.</EmptyState>
              )}
            </div>
          </Panel>

          <Panel
            title="Alertas criticos e altos"
            action={<Link to="/monitoring/alerts">Ver alertas</Link>}
          >
            <div className="divide-y divide-border">
              {criticalOrHighAlerts.slice(0, 8).map((alert) => (
                <Link
                  key={alert.alertId}
                  to="/monitoring/alerts"
                  className="block px-1 py-3 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {alert.hostname} · {alert.ruleName} · {statusLabels[alert.status]}
                      </p>
                    </div>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                </Link>
              ))}
              {criticalOrHighAlerts.length === 0 && (
                <EmptyState>Nenhum alerta critico ou alto.</EmptyState>
              )}
            </div>
          </Panel>
        </section>

        <Panel title="Sinais recentes" action={<Link to="/monitoring/events">Ver eventos</Link>}>
          <div className="divide-y divide-border">
            {dashboard.eventsOverTime.length === 0 ? (
              <EmptyState>Nenhum evento recente.</EmptyState>
            ) : (
              dashboard.recentAlerts.slice(0, 6).map((alert) => (
                <div
                  key={alert.alertId}
                  className="grid gap-2 px-1 py-3 md:grid-cols-[1fr_170px_120px]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.hostname} · {alert.eventCount} eventos relacionados
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(alert.lastSeenAt)}
                  </span>
                  <SeverityBadge severity={alert.severity} />
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Server;
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div
        className={`mb-3 inline-flex size-9 items-center justify-center rounded-md border ${toneClass}`}
      >
        <Icon className="size-4" />
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{numberFormatter.format(value)}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && <div className="text-xs font-medium text-primary hover:underline">{action}</div>}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{numberFormatter.format(value)}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-2 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}
