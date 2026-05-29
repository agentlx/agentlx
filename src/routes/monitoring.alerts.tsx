import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import {
  listSecurityAlertsData,
  updateSecurityAlertStatusData,
} from "@/lib/security-monitoring-api";
import {
  securityAlertStatusValues,
  securitySeverityValues,
  type SecurityAlertStatus,
  type SecurityAlertView,
  type SecuritySeverity,
} from "@/lib/security-monitoring";
import {
  formatDateTime,
  MonitoringNav,
  numberFormatter,
  SeverityBadge,
  statusLabels,
} from "@/lib/monitoring-ui";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/alerts")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    return listSecurityAlertsData({
      data: { limit: 50, offset: 0, status: "all", severity: "all" },
    });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Alertas` },
      { name: "description", content: "Alertas de seguranca separados dos eventos." },
    ],
  }),
  component: MonitoringAlertsPage,
});

function MonitoringAlertsPage() {
  const initial = Route.useLoaderData();
  const loadAlerts = useServerFn(listSecurityAlertsData);
  const updateStatus = useServerFn(updateSecurityAlertStatusData);
  const [alerts, setAlerts] = useState<SecurityAlertView[]>(initial.items);
  const [severity, setSeverity] = useState<"all" | SecuritySeverity>("all");
  const [status, setStatus] = useState<"all" | SecurityAlertStatus>("all");
  const [loading, setLoading] = useState(false);

  const refresh = async (nextSeverity = severity, nextStatus = status) => {
    setLoading(true);
    try {
      const next = await loadAlerts({
        data: { limit: 50, offset: 0, severity: nextSeverity, status: nextStatus },
      });
      setAlerts(next.items);
      setSeverity(nextSeverity);
      setStatus(nextStatus);
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (alertId: string, nextStatus: SecurityAlertStatus) => {
    try {
      await updateStatus({ data: { alertId, status: nextStatus } });
      await refresh();
      toast.success("Status do alerta atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar o alerta.");
    }
  };

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "alertas" },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Incidentes acionaveis, separados do fluxo bruto de eventos.
            </p>
          </div>
          <MonitoringNav active="/monitoring/alerts" />
        </header>

        <section className="rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={severity}
              onChange={(event) => void refresh(event.target.value as typeof severity, status)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none"
            >
              <option value="all">Todas severidades</option>
              {securitySeverityValues.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => void refresh(severity, event.target.value as typeof status)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none"
            >
              <option value="all">Todos status</option>
              {securityAlertStatusValues.map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[1fr_150px_150px_180px_180px] border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>Alerta</span>
            <span>Severidade</span>
            <span>Status</span>
            <span>Maquina</span>
            <span>Ultima ocorrencia</span>
          </div>
          <div className="divide-y divide-border">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_150px_150px_180px_180px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {alert.ruleId} · {numberFormatter.format(alert.eventCount)} eventos
                  </p>
                </div>
                <SeverityBadge severity={alert.severity} />
                <select
                  value={alert.status}
                  onChange={(event) =>
                    void changeStatus(alert.id, event.target.value as SecurityAlertStatus)
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs outline-none"
                >
                  {securityAlertStatusValues.map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item]}
                    </option>
                  ))}
                </select>
                <Link
                  to="/monitoring/machines/$machineId"
                  params={{ machineId: alert.machineId }}
                  className="truncate text-sm text-primary hover:underline"
                >
                  {alert.machineId}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(alert.lastSeenAt)}
                </span>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum alerta encontrado.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
