import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Filter,
  LockKeyhole,
  RefreshCcw,
  Search,
  Server,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import {
  securityAlertStatusValues,
  securitySeverityValues,
  type SecurityAlertStatus,
  type SecurityDashboardInput,
  type SecurityDashboardPeriod,
  type SecurityDashboardView,
  type SecuritySeverity,
} from "@/lib/security-monitoring";
import { getSecurityDashboardData } from "@/lib/security-monitoring-api";
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
        content: "Dashboard de eventos e alertas de seguranca das maquinas Linux.",
      },
    ],
  }),
  component: MonitoringPage,
});

type DashboardFilters = {
  period: SecurityDashboardPeriod;
  machineId: string;
  severity: "all" | SecuritySeverity;
  status: "all" | SecurityAlertStatus;
  eventType: string;
  ruleId: string;
  minLevel: string;
};

const periodOptions: Array<{ value: SecurityDashboardPeriod; label: string }> = [
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const severityLabels: Record<SecuritySeverity, string> = {
  low: "Baixo",
  medium: "Medio",
  high: "Alto",
  critical: "Critico",
};

const statusLabels: Record<SecurityAlertStatus, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  investigating: "Investigando",
  resolved: "Resolvido",
  false_positive: "Falso positivo",
};

const severityColors: Record<SecuritySeverity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const statusColors: Record<SecurityAlertStatus, string> = {
  open: "#ef4444",
  acknowledged: "#3b82f6",
  investigating: "#f59e0b",
  resolved: "#22c55e",
  false_positive: "#94a3b8",
};

const mitreColors = ["#3b82f6", "#14b8a6", "#f59e0b", "#a855f7", "#ef4444", "#94a3b8"];
const numberFormatter = new Intl.NumberFormat("pt-BR");

function MonitoringPage() {
  const initialDashboard = Route.useLoaderData();
  const loadDashboard = useServerFn(getSecurityDashboardData);
  const [dashboard, setDashboard] = useState<SecurityDashboardView>(initialDashboard);
  const [filters, setFilters] = useState<DashboardFilters>({
    period: initialDashboard.period,
    machineId: "",
    severity: "all",
    status: "all",
    eventType: "",
    ruleId: "",
    minLevel: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaData = useMemo(
    () =>
      dashboard.eventsOverTime.map((item) => ({
        label: formatBucketLabel(item.timestamp, dashboard.period),
        eventos: item.totalEvents,
        falhas: item.failedLogins,
        sucessos: item.successfulLogins,
        alertas: item.alerts,
      })),
    [dashboard.eventsOverTime, dashboard.period],
  );

  const severityData = useMemo(
    () =>
      securitySeverityValues.map((severity) => ({
        name: severityLabels[severity],
        key: severity,
        value: dashboard.alertsBySeverity[severity],
        color: severityColors[severity],
      })),
    [dashboard.alertsBySeverity],
  );

  const statusData = useMemo(
    () =>
      securityAlertStatusValues.map((status) => ({
        name: statusLabels[status],
        key: status,
        value: dashboard.alertsByStatus[status],
        color: statusColors[status],
      })),
    [dashboard.alertsByStatus],
  );

  const mitreData = useMemo(
    () =>
      dashboard.mitreSummary.byTechnique.map((item, index) => ({
        name: item.technique,
        id: item.techniqueId,
        value: item.count,
        color: mitreColors[index % mitreColors.length],
      })),
    [dashboard.mitreSummary.byTechnique],
  );

  const machineBarData = useMemo(
    () =>
      dashboard.topMachines.map((machine) => ({
        hostname: machine.hostname,
        eventos: machine.totalEvents,
        alertas: machine.totalAlerts,
      })),
    [dashboard.topMachines],
  );

  const applyFilters = async (nextFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const nextDashboard = await loadDashboard({ data: toDashboardInput(nextFilters) });
      setDashboard(nextDashboard);
      setFilters(nextFilters);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar o monitoramento.",
      );
    } finally {
      setLoading(false);
    }
  };

  const updatePeriod = (period: SecurityDashboardPeriod) => {
    void applyFilters({ ...filters, period });
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "monitoring" }]} />}>
      <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Monitoramento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Eventos, alertas e sinais de autenticacao das maquinas Linux.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border bg-surface p-1 text-xs">
              <button className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground">
                Dashboard
              </button>
              <Link
                to="/monitoring/events"
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Eventos
              </Link>
            </div>
            <button
              type="button"
              onClick={() => void applyFilters()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2 pr-1 text-xs font-semibold text-muted-foreground">
            <Filter className="size-3.5" />
            Filtros
          </div>
          <div className="flex rounded-md border border-border bg-background p-1 text-xs">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updatePeriod(option.value)}
                className={`rounded px-2.5 py-1.5 transition-colors ${
                  filters.period === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            value={filters.severity}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                severity: event.target.value as DashboardFilters["severity"],
              }))
            }
            className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          >
            <option value="all">Todas severidades</option>
            {securitySeverityValues.map((severity) => (
              <option key={severity} value={severity}>
                {severityLabels[severity]}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as DashboardFilters["status"],
              }))
            }
            className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary"
          >
            <option value="all">Todos status</option>
            {securityAlertStatusValues.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <FilterInput
            value={filters.machineId}
            onChange={(value) => setFilters((current) => ({ ...current, machineId: value }))}
            placeholder="Machine ID"
          />
          <FilterInput
            value={filters.eventType}
            onChange={(value) => setFilters((current) => ({ ...current, eventType: value }))}
            placeholder="Tipo de evento"
          />
          <FilterInput
            value={filters.ruleId}
            onChange={(value) => setFilters((current) => ({ ...current, ruleId: value }))}
            placeholder="Regra"
          />
          <FilterInput
            value={filters.minLevel}
            onChange={(value) => setFilters((current) => ({ ...current, minLevel: value }))}
            placeholder="Nivel minimo"
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={() => void applyFilters()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Search className="size-3.5" />
            Aplicar
          </button>
        </section>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            icon={Activity}
            label="Eventos"
            value={dashboard.summary.totalEvents}
            hint={`${dashboard.period}`}
          />
          <KpiCard
            icon={XCircle}
            label="Falhas auth"
            value={dashboard.summary.authenticationFailures}
            tone="danger"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Sucessos auth"
            value={dashboard.summary.authenticationSuccess}
            tone="success"
          />
          <KpiCard
            icon={ShieldAlert}
            label="Alertas abertos"
            value={dashboard.summary.openAlerts}
            tone="warning"
          />
          <KpiCard
            icon={AlertTriangle}
            label="Criticos"
            value={dashboard.summary.criticalAlerts}
            tone="danger"
          />
          <KpiCard
            icon={Server}
            label="Maquinas"
            value={dashboard.summary.monitoredMachines}
            hint={`${dashboard.summary.machinesWithAlerts} com alerta`}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <ChartPanel title="Evolucao de eventos e alertas" className="xl:col-span-3">
            {areaData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={areaData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="eventos"
                    stackId="1"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.32}
                  />
                  <Area
                    type="monotone"
                    dataKey="falhas"
                    stackId="2"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="alertas"
                    stackId="3"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.24}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="Sem eventos no periodo." />
            )}
          </ChartPanel>

          <ChartPanel title="MITRE ATT&CK" className="xl:col-span-2">
            {mitreData.length > 0 ? (
              <div className="grid min-h-[260px] grid-cols-1 items-center gap-4 md:grid-cols-[minmax(180px,0.8fr)_1fr]">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={mitreData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={86}
                    >
                      {mitreData.map((item) => (
                        <Cell key={item.id} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <LegendList
                  items={mitreData.map((item) => ({
                    label: `${item.id} ${item.name}`,
                    value: item.value,
                    color: item.color,
                  }))}
                />
              </div>
            ) : (
              <EmptyChart label="Sem alertas mapeados para MITRE." />
            )}
          </ChartPanel>

          <ChartPanel title="Alertas por severidade" className="xl:col-span-2">
            <div className="grid min-h-[240px] grid-cols-1 items-center gap-4 md:grid-cols-[180px_1fr]">
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={82}
                  >
                    {severityData.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <LegendList
                items={severityData.map((item) => ({
                  label: item.name,
                  value: item.value,
                  color: item.color,
                }))}
              />
            </div>
          </ChartPanel>

          <ChartPanel title="Top maquinas" className="xl:col-span-3">
            {machineBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={machineBarData}
                  margin={{ top: 12, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
                  <XAxis
                    dataKey="hostname"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="eventos" stackId="a" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="alertas" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="Sem maquinas com dados no periodo." />
            )}
          </ChartPanel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <DataPanel title="Status dos alertas">
            <LegendList
              items={statusData.map((item) => ({
                label: item.name,
                value: item.value,
                color: item.color,
              }))}
            />
          </DataPanel>

          <DataPanel title="Top IPs de origem">
            <div className="divide-y divide-border">
              {dashboard.topSourceIps.map((item) => (
                <div key={item.srcIp} className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{item.srcIp}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.failedLogins} falhas · {item.affectedMachines} maquinas
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold">
                    {numberFormatter.format(item.totalEvents)}
                  </span>
                </div>
              ))}
              {dashboard.topSourceIps.length === 0 && <EmptyList label="Sem IPs de origem." />}
            </div>
          </DataPanel>

          <DataPanel title="Maquinas com alerta">
            <div className="divide-y divide-border">
              {dashboard.topMachines.map((machine) => (
                <div
                  key={machine.machineId}
                  className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <Link
                      to="/machines/$machineId"
                      params={{ machineId: machine.machineId }}
                      className="truncate font-medium transition-colors hover:text-primary"
                    >
                      {machine.hostname}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {machine.os || "Linux"} · visto {formatDateTime(machine.lastSeenAt)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold">
                    {numberFormatter.format(machine.totalAlerts)}
                  </span>
                </div>
              ))}
              {dashboard.topMachines.length === 0 && <EmptyList label="Sem maquinas." />}
            </div>
          </DataPanel>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Alertas recentes</h2>
            <span className="text-xs text-muted-foreground">
              {numberFormatter.format(dashboard.recentAlerts.length)} registros
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed text-left text-xs">
              <thead className="border-b border-border bg-background/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="w-36 px-4 py-3">Quando</th>
                  <th className="w-44 px-3 py-3">Maquina</th>
                  <th className="w-44 px-3 py-3">Tecnica</th>
                  <th className="w-36 px-3 py-3">Tatica</th>
                  <th className="px-3 py-3">Descricao</th>
                  <th className="w-20 px-3 py-3 text-right">Nivel</th>
                  <th className="w-36 px-4 py-3">Regra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboard.recentAlerts.map((alert) => (
                  <tr key={alert.alertId} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {formatDateTime(alert.lastSeenAt)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to="/machines/$machineId"
                        params={{ machineId: alert.machineId }}
                        className="block truncate font-medium transition-colors hover:text-primary"
                      >
                        {alert.hostname}
                      </Link>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {alert.machineId}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate text-muted-foreground">
                        {alert.mitreTechniqueId ?? "-"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {alert.mitreTechnique ?? "-"}
                      </p>
                    </td>
                    <td className="truncate px-3 py-3 text-muted-foreground">
                      {alert.mitreTactic ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="truncate font-medium">{alert.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {statusLabels[alert.status]} · {alert.eventCount} eventos
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <SeverityBadge severity={alert.severity} level={alert.level} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate font-mono text-[11px] text-primary">{alert.ruleId}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{alert.ruleName}</p>
                    </td>
                  </tr>
                ))}
                {dashboard.recentAlerts.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Sem alertas recentes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function toDashboardInput(filters: DashboardFilters): SecurityDashboardInput {
  return {
    period: filters.period,
    severity: filters.severity,
    status: filters.status,
    machineId: cleanOptional(filters.machineId),
    eventType: cleanOptional(filters.eventType),
    ruleId: cleanOptional(filters.ruleId),
    minLevel: filters.minLevel.trim() ? Number(filters.minLevel) : undefined,
  };
}

function cleanOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBucketLabel(value: string, period: SecurityDashboardPeriod) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (period === "1h" || period === "24h") {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function FilterInput({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric";
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="h-9 w-36 rounded-md border border-border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
    />
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <Icon className={`size-4 ${toneClass}`} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className={`font-mono text-2xl font-bold tabular-nums ${toneClass}`}>
          {formatNumber(value)}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-surface ${className}`}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function LegendList({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const visibleItems = items.filter((item) => item.value > 0);

  return (
    <div className="space-y-2">
      {(visibleItems.length > 0 ? visibleItems : items).map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="truncate text-muted-foreground">{item.label}</span>
          </div>
          <span className="font-mono text-xs font-semibold">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SeverityBadge({ severity, level }: { severity: SecuritySeverity; level: number | null }) {
  return (
    <span
      className="inline-flex min-w-12 items-center justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-semibold"
      style={{
        borderColor: `${severityColors[severity]}66`,
        color: severityColors[severity],
        background: `${severityColors[severity]}1a`,
      }}
    >
      {level ?? severityLabels[severity]}
    </span>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function EmptyList({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>;
}

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-xl">
      {label && <p className="mb-1 font-medium">{label}</p>}
      <div className="space-y-1">
        {payload.map((item) => (
          <div
            key={`${item.name}:${item.dataKey}`}
            className="flex items-center justify-between gap-5"
          >
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-mono font-semibold">{formatNumber(Number(item.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
