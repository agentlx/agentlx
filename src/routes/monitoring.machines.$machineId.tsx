import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityDashboardData,
  getSecurityMachineEventsOverviewData,
} from "@/lib/security-monitoring-api";
import type { SecurityMachineEventRowView } from "@/lib/security-monitoring";
import {
  formatDateTime,
  formatPercent,
  MonitoringNav,
  numberFormatter,
  SeverityBadge,
  statusLabels,
} from "@/lib/monitoring-ui";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/machines/$machineId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    const [dashboard, overview] = await Promise.all([
      getSecurityDashboardData({ data: { period: "24h", machineId: params.machineId } }),
      getSecurityMachineEventsOverviewData({
        data: { machineId: params.machineId, period: "24h", limit: 25, offset: 0 },
      }),
    ]);
    return { dashboard, overview };
  },
  head: ({ params }) => ({
    meta: [
      { title: `${APP_NAME} | Maquina ${params.machineId}` },
      { name: "description", content: "Detalhes operacionais da maquina monitorada." },
    ],
  }),
  component: MonitoringMachineDetailPage,
});

const tabs = [
  "Resumo",
  "Alertas",
  "Eventos",
  "Metricas",
  "Portas/conexoes",
  "Processos",
  "Servicos",
  "Arquivos/FIM",
  "Pacotes",
  "Auditoria",
  "Configuracoes",
] as const;

type Tab = (typeof tabs)[number];

function MonitoringMachineDetailPage() {
  const { overview } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("Resumo");
  const machine = overview.machine;

  const grouped = useMemo(
    () => ({
      alerts: overview.items.filter((item) => item.alert),
      metrics: byPrefix(overview.items, "metric."),
      network: byPrefix(overview.items, "network."),
      processes: byPrefix(overview.items, "process."),
      services: byPrefix(overview.items, "service."),
      files: overview.items.filter(
        (item) =>
          item.eventType.startsWith("file.") ||
          item.eventType.includes("sudoers") ||
          item.eventType.includes("ssh.config"),
      ),
      packages: byPrefix(overview.items, "package."),
      audit: byPrefix(overview.items, "audit."),
    }),
    [overview.items],
  );

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "maquinas", to: "/monitoring/machines" },
            { label: machine.hostname },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{machine.hostname}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {machine.os || "Linux"} · {machine.ip || "-"} · ultimo heartbeat{" "}
              {formatDateTime(machine.lastSeenAt)}
            </p>
          </div>
          <MonitoringNav active="/monitoring/machines" />
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard
            label="Status"
            value={machine.status === "online" ? "Online" : machine.status}
          />
          <MetricCard label="CPU" value={formatPercent(machine.cpu)} />
          <MetricCard
            label="Memoria"
            value={`${formatPercent((machine.ramUsed / Math.max(machine.ramTotal, 1)) * 100)}`}
          />
          <MetricCard label="Disco" value={formatPercent(machine.disk)} />
        </section>

        <div className="overflow-x-auto rounded-lg border border-border bg-surface p-1">
          <div className="flex min-w-max gap-1">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`h-9 rounded-md px-3 text-xs font-medium ${
                  tab === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {tab === "Resumo" && (
          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Resumo da maquina">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Kernel" value={machine.kernel || "-"} />
                <Detail label="Arquitetura" value={machine.arch || "-"} />
                <Detail label="Uptime" value={machine.uptime || "-"} />
                <Detail label="Localizacao" value={machine.location || "-"} />
                <Detail label="Servicos detectados" value={String(machine.services.length)} />
                <Detail
                  label="Eventos no periodo"
                  value={numberFormatter.format(overview.kpis.totalEvents)}
                />
              </dl>
            </Panel>
            <Panel title="Atencao agora">
              <EventList
                items={overview.items
                  .filter((item) => item.alert || item.severity === "critical")
                  .slice(0, 8)}
              />
            </Panel>
          </section>
        )}

        {tab === "Alertas" && (
          <Panel title="Alertas da maquina">
            <EventList items={grouped.alerts} />
          </Panel>
        )}
        {tab === "Eventos" && (
          <Panel title="Eventos recentes">
            <EventList items={overview.items} />
          </Panel>
        )}
        {tab === "Metricas" && (
          <Panel title="Metricas">
            <EventList items={grouped.metrics} />
          </Panel>
        )}
        {tab === "Portas/conexoes" && (
          <Panel title="Portas e conexoes">
            <EventList items={grouped.network} />
          </Panel>
        )}
        {tab === "Processos" && (
          <Panel title="Processos">
            <EventList items={grouped.processes} />
          </Panel>
        )}
        {tab === "Servicos" && (
          <Panel title="Servicos">
            <EventList items={grouped.services} />
          </Panel>
        )}
        {tab === "Arquivos/FIM" && (
          <Panel title="Arquivos monitorados">
            <EventList items={grouped.files} />
          </Panel>
        )}
        {tab === "Pacotes" && (
          <Panel title="Pacotes">
            <EventList items={grouped.packages} />
          </Panel>
        )}
        {tab === "Auditoria" && (
          <Panel title="Auditoria">
            <EventList items={grouped.audit} />
          </Panel>
        )}
        {tab === "Configuracoes" && (
          <Panel title="Configuracoes de monitoramento">
            <p className="text-sm text-muted-foreground">
              As configuracoes do agent Enterprise ficam no `config.json` da maquina: FIM paths,
              cooldowns, thresholds de metricas, IPs bloqueados e mapa IP/pais.
            </p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function byPrefix(items: SecurityMachineEventRowView[], prefix: string) {
  return items.filter((item) => item.eventType.startsWith(prefix));
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function EventList({ items }: { items: SecurityMachineEventRowView[] }) {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Sem registros neste periodo.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <Link
          key={item.id}
          to="/monitoring/events/$eventId"
          params={{ eventId: item.id }}
          className="grid gap-2 py-3 transition-colors hover:bg-secondary/40 md:grid-cols-[1fr_160px_120px]"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{item.typeLabel}</p>
            <p className="text-xs text-muted-foreground">{item.summary || item.message}</p>
          </div>
          <span className="text-xs text-muted-foreground">{formatDateTime(item.timestamp)}</span>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <span className="text-[11px] text-muted-foreground">{statusLabels[item.status]}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
