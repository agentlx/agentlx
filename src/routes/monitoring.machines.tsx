import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import { getSecurityDashboardData } from "@/lib/security-monitoring-api";
import {
  formatDateTime,
  formatPercent,
  MonitoringNav,
  numberFormatter,
  SeverityBadge,
  StatusPill,
} from "@/lib/monitoring-ui";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/machines")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    return getSecurityDashboardData({ data: { period: "24h" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Maquinas monitoradas` },
      { name: "description", content: "Maquinas Linux monitoradas por risco e heartbeat." },
    ],
  }),
  component: MonitoringMachinesPage,
});

function MonitoringMachinesPage() {
  const dashboard = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState<"all" | "critical" | "high">("all");

  const topById = useMemo(
    () => new Map(dashboard.topMachines.map((machine) => [machine.machineId, machine])),
    [dashboard.topMachines],
  );
  const machines = useMemo(
    () =>
      dashboard.machineOptions
        .map((machine) => {
          const metrics = topById.get(machine.machineId);
          return {
            ...machine,
            totalEvents: metrics?.totalEvents ?? 0,
            totalAlerts: metrics?.totalAlerts ?? 0,
            criticalAlerts: metrics?.criticalAlerts ?? 0,
            highAlerts: metrics?.highAlerts ?? 0,
            status: machine.status ?? metrics?.status,
            cpu: machine.cpu ?? metrics?.cpu ?? 0,
            ramUsed: machine.ramUsed ?? metrics?.ramUsed ?? 0,
            ramTotal: machine.ramTotal ?? metrics?.ramTotal ?? 0,
            disk: machine.disk ?? metrics?.disk ?? 0,
          };
        })
        .filter((machine) => {
          const term = search.trim().toLowerCase();
          const matchesSearch =
            !term ||
            machine.hostname.toLowerCase().includes(term) ||
            machine.os.toLowerCase().includes(term);
          const matchesRisk =
            risk === "all" ||
            (risk === "critical" && machine.criticalAlerts > 0) ||
            (risk === "high" && machine.criticalAlerts + machine.highAlerts > 0);
          return matchesSearch && matchesRisk;
        }),
    [dashboard.machineOptions, risk, search, topById],
  );

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "maquinas" },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Maquinas monitoradas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Status, heartbeat e risco operacional por maquina.
            </p>
          </div>
          <MonitoringNav active="/monitoring/machines" />
        </header>

        <section className="rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <label className="relative block md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar maquina"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-2 text-xs">
              {[
                ["all", "Todas"],
                ["critical", "Criticas"],
                ["high", "Criticas/altas"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRisk(value as typeof risk)}
                  className={`h-9 rounded-md border px-3 font-medium ${
                    risk === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[1fr_110px_110px_170px_130px_150px] border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>Maquina</span>
            <span>Status</span>
            <span>Alertas</span>
            <span>Eventos</span>
            <span>Recursos</span>
            <span>Risco</span>
            <span>Ultimo heartbeat</span>
          </div>
          <div className="divide-y divide-border">
            {machines.map((machine) => (
              <Link
                key={machine.machineId}
                to="/monitoring/machines/$machineId"
                params={{ machineId: machine.machineId }}
                className="grid gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[1fr_110px_110px_170px_130px_150px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{machine.hostname}</p>
                  <p className="text-xs text-muted-foreground">{machine.os || "Linux"}</p>
                </div>
                <div>
                  {machine.status ? (
                    <StatusPill>{machineStatusLabel[machine.status]}</StatusPill>
                  ) : (
                    "-"
                  )}
                </div>
                <CompactMetric value={machine.totalAlerts} />
                <CompactMetric value={machine.totalEvents} />
                <ResourceTriplet
                  cpu={machine.cpu}
                  ramUsed={machine.ramUsed}
                  ramTotal={machine.ramTotal}
                  disk={machine.disk}
                />
                <div className="flex flex-wrap gap-1">
                  {machine.criticalAlerts > 0 && <SeverityBadge severity="critical" />}
                  {machine.criticalAlerts === 0 && machine.highAlerts > 0 && (
                    <SeverityBadge severity="high" />
                  )}
                  {machine.criticalAlerts + machine.highAlerts === 0 && (
                    <span className="text-xs text-muted-foreground">Sem alto risco</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(machine.lastSeenAt)}
                </span>
              </Link>
            ))}
            {machines.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhuma maquina encontrada.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function CompactMetric({ value }: { value: number }) {
  return <span className="text-sm font-semibold">{numberFormatter.format(value)}</span>;
}

const machineStatusLabel = {
  online: "Online",
  warning: "Atenção",
  offline: "Offline",
} as const;

function ResourceTriplet({
  cpu,
  ramUsed,
  ramTotal,
  disk,
}: {
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  disk: number;
}) {
  const memory = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
  return (
    <div className="grid grid-cols-3 gap-1 text-xs">
      <span title="CPU" className="rounded border border-border bg-background px-1.5 py-1">
        CPU {formatPercent(cpu)}
      </span>
      <span title="Memoria" className="rounded border border-border bg-background px-1.5 py-1">
        MEM {formatPercent(memory)}
      </span>
      <span title="Disco" className="rounded border border-border bg-background px-1.5 py-1">
        DISK {formatPercent(disk)}
      </span>
    </div>
  );
}
