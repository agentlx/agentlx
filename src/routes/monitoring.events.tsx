import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Monitor,
  RefreshCcw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import {
  securityEventComputedStatusValues,
  securitySeverityValues,
  type SecurityDashboardPeriod,
  type SecurityDashboardView,
  type SecurityEventComputedStatus,
  type SecurityMachineEventsInput,
  type SecurityMachineEventsOverviewView,
  type SecuritySeverity,
} from "@/lib/security-monitoring";
import {
  exportSecurityEventsData,
  getSecurityDashboardData,
  getSecurityMachineEventsOverviewData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/events")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    return getSecurityDashboardData({ data: { period: "24h" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Eventos` },
      {
        name: "description",
        content: "Eventos de seguranca por maquina monitorada.",
      },
    ],
  }),
  component: MonitoringEventsPage,
});

type EventFilters = {
  machineId: string;
  period: SecurityDashboardPeriod;
  search: string;
  severity: "all" | SecuritySeverity;
  status: "all" | SecurityEventComputedStatus;
  eventType: string;
  source: string;
};

const PAGE_SIZE = 5;

const periodOptions: Array<{ value: SecurityDashboardPeriod; label: string }> = [
  { value: "1h", label: "Ultima hora" },
  { value: "24h", label: "Ultimas 24 horas" },
  { value: "7d", label: "Ultimos 7 dias" },
  { value: "30d", label: "Ultimos 30 dias" },
];

const severityLabels: Record<SecuritySeverity, string> = {
  low: "Informativo",
  medium: "Alerta",
  high: "Alto",
  critical: "Critico",
};

const statusLabels: Record<SecurityEventComputedStatus, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  investigating: "Investigando",
  resolved: "Resolvido",
  false_positive: "Falso positivo",
  no_alert: "Sem alerta",
};

const severityColors: Record<SecuritySeverity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const statusColors: Record<SecurityEventComputedStatus, string> = {
  open: "#ef4444",
  acknowledged: "#3b82f6",
  investigating: "#f59e0b",
  resolved: "#22c55e",
  false_positive: "#94a3b8",
  no_alert: "#64748b",
};

const numberFormatter = new Intl.NumberFormat("pt-BR");

function MonitoringEventsPage() {
  const dashboard = Route.useLoaderData();
  const loadOverview = useServerFn(getSecurityMachineEventsOverviewData);
  const exportEvents = useServerFn(exportSecurityEventsData);
  const initialMachineId = dashboard.machineOptions[0]?.machineId ?? "";
  const [filters, setFilters] = useState<EventFilters>({
    machineId: initialMachineId,
    period: "24h",
    search: "",
    severity: "all",
    status: "all",
    eventType: "",
    source: "",
  });
  const [overview, setOverview] = useState<SecurityMachineEventsOverviewView | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const machineOptions = useMemo(() => dashboard.machineOptions, [dashboard.machineOptions]);

  useEffect(() => {
    if (!filters.machineId) {
      return;
    }
    void applyFilters(filters, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = async (nextFilters = filters, nextOffset = offset) => {
    if (!nextFilters.machineId) {
      setOverview(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextOverview = await loadOverview({
        data: toOverviewInput(nextFilters, nextOffset),
      });
      setOverview(nextOverview);
      setFilters(nextFilters);
      setOffset(nextOffset);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel carregar os eventos da maquina.",
      );
    } finally {
      setLoading(false);
    }
  };

  const exportCurrent = async (format: "csv" | "json") => {
    if (!filters.machineId) {
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const exported = await exportEvents({
        data: {
          ...toOverviewInput(filters, 0),
          format,
          limit: 10_000,
          offset: 0,
        },
      });
      downloadText(exported.filename, exported.body, exported.contentType);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Nao foi possivel exportar os eventos.",
      );
    } finally {
      setExporting(false);
    }
  };

  const currentPage = overview ? Math.floor(overview.page.offset / overview.page.limit) + 1 : 1;
  const seriesData = useMemo(
    () =>
      overview?.series.map((item) => ({
        label: formatBucketLabel(item.timestamp, overview.filters.period),
        todos: item.total,
        criticos: item.critical,
        alertas: item.alerts,
        informativos: item.informational,
      })) ?? [],
    [overview],
  );

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "eventos" },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1480px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Eventos por maquina</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualize eventos e alertas de uma maquina especifica.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border bg-surface p-1 text-xs">
              <Link
                to="/monitoring"
                className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Dashboard
              </Link>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
              >
                Eventos
              </button>
            </div>
            <button
              type="button"
              onClick={() => void applyFilters(filters, offset)}
              disabled={loading || !filters.machineId}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-surface p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_180px] xl:grid-cols-[260px_190px_1fr_170px_170px_170px]">
            <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
              Maquina
              <select
                value={filters.machineId}
                onChange={(event) => {
                  const nextFilters = { ...filters, machineId: event.target.value };
                  setFilters(nextFilters);
                  void applyFilters(nextFilters, 0);
                }}
                className="h-10 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
              >
                {machineOptions.length === 0 && <option value="">Sem maquinas</option>}
                {machineOptions.map((machine) => (
                  <option key={machine.machineId} value={machine.machineId}>
                    {machine.hostname}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
              Periodo
              <select
                value={filters.period}
                onChange={(event) => {
                  const nextFilters = {
                    ...filters,
                    period: event.target.value as SecurityDashboardPeriod,
                  };
                  setFilters(nextFilters);
                  void applyFilters(nextFilters, 0);
                }}
                className="h-10 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
              Busca
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, search: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void applyFilters(filters, 0);
                    }
                  }}
                  placeholder="Buscar em eventos..."
                  className="h-10 w-full rounded-md border border-border bg-background px-3 pr-10 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            </label>
            <FilterSelect
              label="Tipo"
              value={filters.eventType}
              onChange={(value) => setFilters((current) => ({ ...current, eventType: value }))}
              options={overview?.facets.eventTypes.map((item) => ({
                value: item.value,
                label: item.value,
              }))}
              allLabel="Todos os tipos"
            />
            <FilterSelect
              label="Severidade"
              value={filters.severity}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  severity: value as EventFilters["severity"],
                }))
              }
              options={securitySeverityValues.map((severity) => ({
                value: severity,
                label: severityLabels[severity],
              }))}
              allLabel="Todas severidades"
            />
            <button
              type="button"
              onClick={() => void applyFilters(filters, 0)}
              disabled={loading || !filters.machineId}
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Search className="size-3.5" />
              Aplicar
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!filters.machineId ? (
          <EmptyState label="Nenhuma maquina disponivel para monitoramento." />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard icon={Activity} label="Eventos" value={overview?.kpis.totalEvents ?? 0} />
              <MetricCard
                icon={ShieldAlert}
                label="Alertas abertos"
                value={overview?.kpis.openAlerts ?? 0}
                tone="warning"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Criticos"
                value={overview?.kpis.criticalEvents ?? 0}
                tone="danger"
              />
              <MetricCard
                icon={CheckCircle2}
                label="Resolvidos"
                value={overview?.kpis.resolvedAlerts ?? 0}
                tone="success"
              />
              <MetricCard
                icon={XCircle}
                label="Falhas auth"
                value={overview?.kpis.authenticationFailures ?? 0}
                tone="danger"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
              <Panel title="Evolucao de eventos">
                {seriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={seriesData}
                      margin={{ top: 12, right: 12, left: -14, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={42} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="todos"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="criticos"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="alertas"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="informativos"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart
                    label={loading ? "Carregando eventos..." : "Sem eventos no periodo."}
                  />
                )}
              </Panel>
              <Panel title="Detalhes da maquina">
                {overview ? (
                  <MachineDetails overview={overview} />
                ) : (
                  <EmptyList label={loading ? "Carregando maquina..." : "Selecione uma maquina."} />
                )}
              </Panel>
            </section>

            <section className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <QuickFilter
                    active={filters.status === "all"}
                    onClick={() => updateStatus("all")}
                  >
                    Todos eventos
                  </QuickFilter>
                  <QuickFilter
                    active={filters.status === "open" || filters.status === "investigating"}
                    onClick={() => updateStatus("open")}
                  >
                    Apenas alertas
                  </QuickFilter>
                  <QuickFilter
                    active={filters.severity === "critical"}
                    onClick={() => updateSeverity("critical")}
                  >
                    Criticos
                  </QuickFilter>
                  <QuickFilter
                    active={filters.status === "resolved"}
                    onClick={() => updateStatus("resolved")}
                  >
                    Resolvidos
                  </QuickFilter>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect
                    label="Origem"
                    hideLabel
                    value={filters.source}
                    onChange={(value) => {
                      const nextFilters = { ...filters, source: value };
                      setFilters(nextFilters);
                      void applyFilters(nextFilters, 0);
                    }}
                    options={overview?.facets.sources.map((item) => ({
                      value: item.value,
                      label: item.value,
                    }))}
                    allLabel="Todas origens"
                  />
                  <button
                    type="button"
                    onClick={() => void exportCurrent("csv")}
                    disabled={exporting || !overview}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    <Download className="size-3.5" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportCurrent("json")}
                    disabled={exporting || !overview}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    <Download className="size-3.5" />
                    JSON
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] table-fixed text-left text-xs">
                  <thead className="border-b border-border bg-background/40 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="w-40 px-4 py-3">Quando</th>
                      <th className="w-36 px-3 py-3">Severidade</th>
                      <th className="w-48 px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Descricao</th>
                      <th className="w-40 px-3 py-3">Origem</th>
                      <th className="w-36 px-3 py-3">Status</th>
                      <th className="w-12 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview?.items.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                          {formatDateTime(item.timestamp)}
                        </td>
                        <td className="px-3 py-3">
                          <SeverityBadge severity={item.severity} />
                        </td>
                        <td className="truncate px-3 py-3 font-medium">{item.typeLabel}</td>
                        <td className="px-3 py-3">
                          <p className="truncate">{item.summary || item.message}</p>
                          {item.alert && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              Vinculado ao alerta {item.alert.ruleId}
                            </p>
                          )}
                        </td>
                        <td className="truncate px-3 py-3 text-muted-foreground">
                          {item.origin ?? item.source}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            to="/monitoring/events/$eventId"
                            params={{ eventId: item.id }}
                            className="inline-grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label="Abrir detalhe do evento"
                          >
                            <ChevronRight className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {overview && overview.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          Nenhum evento encontrado.
                        </td>
                      </tr>
                    )}
                    {!overview && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-10 text-center text-sm text-muted-foreground"
                        >
                          {loading
                            ? "Carregando eventos..."
                            : "Aplique os filtros para carregar eventos."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span>
                  {overview
                    ? `Mostrando ${overview.items.length} de ${numberFormatter.format(overview.page.total)} eventos`
                    : "Sem pagina carregada"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void applyFilters(filters, Math.max(0, offset - PAGE_SIZE))}
                    disabled={loading || !overview || offset === 0}
                    className="grid size-8 place-items-center rounded-md border border-border bg-background transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="rounded-md bg-primary px-3 py-2 font-mono text-primary-foreground">
                    {currentPage}
                  </span>
                  <span>de {overview?.page.totalPages ?? 1}</span>
                  <button
                    type="button"
                    onClick={() => void applyFilters(filters, offset + PAGE_SIZE)}
                    disabled={loading || !overview?.page.hasMore}
                    className="grid size-8 place-items-center rounded-md border border-border bg-background transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );

  function updateStatus(status: EventFilters["status"]) {
    const nextFilters = {
      ...filters,
      status,
      severity: status === "all" ? "all" : filters.severity,
    };
    setFilters(nextFilters);
    void applyFilters(nextFilters, 0);
  }

  function updateSeverity(severity: EventFilters["severity"]) {
    const nextFilters = { ...filters, severity, status: "all" as const };
    setFilters(nextFilters);
    void applyFilters(nextFilters, 0);
  }
}

function toOverviewInput(filters: EventFilters, offset: number): SecurityMachineEventsInput {
  return {
    machineId: filters.machineId,
    period: filters.period,
    search: filters.search,
    severity: filters.severity,
    status: filters.status,
    eventType: cleanOptional(filters.eventType),
    source: cleanOptional(filters.source),
    limit: PAGE_SIZE,
    offset,
  };
}

function MachineDetails({ overview }: { overview: SecurityMachineEventsOverviewView }) {
  const machine = overview.machine;
  return (
    <dl className="grid gap-4 text-sm">
      <DetailRow label="Hostname" value={machine.hostname} />
      <DetailRow label="SO" value={machine.os || machine.distroId || "Linux"} />
      <DetailRow label="IP" value={machine.ip || "-"} />
      <DetailRow
        label="Ultimo evento"
        value={overview.kpis.lastEventAt ? formatRelative(overview.kpis.lastEventAt) : "-"}
      />
      <DetailRow
        label="Agente"
        value={machine.status === "online" ? "Online" : machine.status}
        tone={machine.status === "online" ? "success" : "warning"}
      />
      <DetailRow
        label="Uptime do agente"
        value={machine.uptime || formatSeconds(machine.uptimeSec)}
      />
    </dl>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options = [],
  allLabel,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  allLabel: string;
  hideLabel?: boolean;
}) {
  return (
    <label
      className={`grid gap-1 text-[11px] font-semibold text-muted-foreground ${hideLabel ? "min-w-40" : ""}`}
    >
      {!hideLabel && label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
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
      <p className={`mt-3 font-mono text-2xl font-bold tabular-nums ${toneClass}`}>
        {numberFormatter.format(value)}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function QuickFilter({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 font-medium transition-colors ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <span
      className="inline-flex min-w-24 justify-center rounded-md border px-2 py-1 text-[11px] font-semibold"
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

function StatusBadge({ status }: { status: SecurityEventComputedStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="size-2 rounded-full" style={{ background: statusColors[status] }} />
      {statusLabels[status]}
    </span>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid min-h-[250px] place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-16 text-center text-sm text-muted-foreground">
      <Monitor className="mx-auto mb-3 size-8" />
      {label}
    </div>
  );
}

function EmptyList({ label }: { label: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{label}</div>;
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
            <span className="font-mono font-semibold">
              {numberFormatter.format(Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function cleanOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
    second: "2-digit",
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

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  if (diffMin < 1) {
    return "agora";
  }
  if (diffMin < 60) {
    return `ha ${diffMin} min`;
  }
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 48) {
    return `ha ${diffHours} h`;
  }
  return formatDateTime(value);
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
}

function downloadText(filename: string, body: string, contentType: string) {
  const blob = new Blob([body], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
