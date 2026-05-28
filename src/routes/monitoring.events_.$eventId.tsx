import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Clock3,
  FileJson,
  Globe2,
  LockKeyhole,
  Monitor,
  RefreshCcw,
  ShieldAlert,
  Target,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import {
  type SecurityEventComputedStatus,
  type SecurityEventDetailView,
  type SecurityEventEvidenceView,
  type SecurityEventTimelineItemView,
  type SecuritySeverity,
} from "@/lib/security-monitoring";
import { getSecurityEventDetailData } from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/events_/$eventId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    return getSecurityEventDetailData({ data: { eventId: params.eventId } });
  },
  head: ({ params }) => ({
    meta: [
      { title: `${APP_NAME} | Evento ${params.eventId}` },
      {
        name: "description",
        content: "Detalhes do evento de seguranca monitorado.",
      },
    ],
  }),
  component: SecurityEventDetailPage,
});

const severityLabels: Record<SecuritySeverity, string> = {
  low: "Baixo",
  medium: "Medio",
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

function SecurityEventDetailPage() {
  const initialDetail = Route.useLoaderData();
  const params = Route.useParams();
  const loadDetail = useServerFn(getSecurityEventDetailData);
  const [detail, setDetail] = useState<SecurityEventDetailView>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const payloadJson = useMemo(() => JSON.stringify(detail.event.payload, null, 2), [detail]);

  const refresh = async () => {
    setLoading(true);
    try {
      const nextDetail = await loadDetail({ data: { eventId: params.eventId } });
      setDetail(nextDetail);
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(payloadJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const event = detail.event;
  const context = detail.context;
  const alert = detail.alert;

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "eventos", to: "/monitoring/events" },
            { label: params.eventId },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1580px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Detalhes do evento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Visualize contexto, impacto, evidencias e eventos relacionados.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/monitoring/events"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:bg-secondary"
            >
              <ArrowLeft className="size-3.5" />
              Voltar para eventos
            </Link>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs font-semibold transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="grid gap-5 xl:grid-cols-[1fr_520px]">
            <div className="grid gap-4 md:grid-cols-[72px_1fr]">
              <div
                className="grid size-16 place-items-center rounded-full border"
                style={{
                  borderColor: `${severityColors[event.severity]}99`,
                  color: severityColors[event.severity],
                }}
              >
                <LockKeyhole className="size-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold">{event.typeLabel}</h2>
                  <SeverityBadge severity={event.severity} />
                  <StatusBadge status={event.status} />
                  {context.mitreTechniqueId && <SoftBadge>{context.mitreTechniqueId}</SoftBadge>}
                  {event.source && <SoftBadge>{event.source}</SoftBadge>}
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <HeaderFact
                    label="Maquina"
                    value={detail.machine.hostname}
                    hint={detail.machine.agentName}
                  />
                  <HeaderFact label="IP de origem" value={context.srcIp ?? "-"} />
                  <HeaderFact
                    label="Usuario alvo"
                    value={context.targetUser ?? context.username ?? "-"}
                  />
                  <HeaderFact label="Detectado em" value={formatDateTime(event.timestamp)} />
                  <HeaderFact
                    label="Ultimo visto"
                    value={
                      alert?.lastSeenAt ? formatTime(alert.lastSeenAt) : formatTime(event.timestamp)
                    }
                  />
                </div>
                <p className="mt-4 max-w-5xl text-sm text-muted-foreground">
                  {event.summary || event.message}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniMetric
                icon={Activity}
                label="Ocorrencias"
                value={String(alert?.eventCount ?? 1)}
                tone="danger"
              />
              <MiniMetric
                icon={ShieldAlert}
                label="Severidade"
                value={formatSeverityLevel(alert?.level, event.severity)}
                tone="danger"
              />
              <MiniMetric
                icon={Clock3}
                label="Tempo aberto"
                value={formatOpenTime(alert?.firstSeenAt, alert?.lastSeenAt)}
                tone="warning"
              />
              <MiniMetric
                icon={Target}
                label="Relacionado"
                value={`${detail.relatedEvents.length} eventos`}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <ContextCard icon={Monitor} label="Maquina afetada" value={detail.machine.hostname} />
          <ContextCard
            icon={Globe2}
            label="Origem"
            value={context.srcIp ?? event.origin ?? event.source}
          />
          <ContextCard
            icon={UserRound}
            label="Usuario alvo"
            value={context.targetUser ?? context.username ?? "-"}
          />
          <ContextCard
            icon={FileJson}
            label="Regra"
            value={context.ruleId ?? alert?.ruleId ?? "-"}
          />
          <ContextCard
            icon={Target}
            label="Tecnica MITRE"
            value={context.mitreTechniqueId ?? "-"}
          />
          <ContextCard
            icon={ShieldAlert}
            label="Risco"
            value={severityLabels[context.risk]}
            tone="danger"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Linha do tempo do evento">
            <Timeline items={detail.timeline} />
          </Panel>
          <Panel title="Maquina relacionada">
            <MachinePanel detail={detail} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <Panel title="Evidencias e contexto">
              <EvidenceList evidences={detail.evidences} />
            </Panel>
            <Panel title="Eventos relacionados">
              <RelatedEvents detail={detail} />
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Classificacao">
              <ClassificationPanel detail={detail} />
            </Panel>
            <Panel title="Acoes seguras">
              <SafeActions detail={detail} onCopyJson={() => void copyJson()} copied={copied} />
            </Panel>
          </div>
        </section>

        <Panel title="Anotacoes do analista">
          <div className="divide-y divide-border">
            {detail.comments.map((comment) => (
              <div
                key={comment.id}
                className="grid gap-2 py-3 text-sm md:grid-cols-[220px_160px_1fr]"
              >
                <div className="font-medium">{comment.createdBy}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(comment.createdAt)}
                </div>
                <div className="text-muted-foreground">{comment.body}</div>
              </div>
            ))}
            {detail.comments.length === 0 && <EmptyList label="Sem anotacoes registradas." />}
          </div>
        </Panel>

        <Panel
          title={
            <div className="flex items-center justify-between gap-3">
              <span>Payload do evento / JSON bruto</span>
              <button
                type="button"
                onClick={() => void copyJson()}
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs transition-colors hover:bg-secondary"
              >
                <Clipboard className="size-3.5" />
                {copied ? "Copiado" : "Copiar JSON"}
              </button>
            </div>
          }
        >
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {payloadJson}
          </pre>
        </Panel>
      </div>
    </AppShell>
  );
}

function HeaderFact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-sm font-semibold">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "default" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4 text-center">
      <Icon className={`mx-auto size-4 ${toneClass}`} />
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ContextCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Monitor;
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="grid grid-cols-[36px_1fr] gap-3 rounded-lg border border-border bg-surface p-4">
      <Icon
        className={`mt-1 size-5 ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`truncate font-mono text-sm font-semibold ${tone === "danger" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Timeline({ items }: { items: SecurityEventTimelineItemView[] }) {
  if (items.length === 0) {
    return <EmptyList label="Sem timeline registrada." />;
  }

  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[130px_20px_1fr] gap-3 text-sm">
          <time className="font-mono text-xs text-muted-foreground">
            {formatDateTime(item.timestamp)}
          </time>
          <span className="mt-1 size-3 rounded-full border-2 border-primary bg-background" />
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            {item.actor && (
              <p className="mt-1 text-[11px] text-muted-foreground">Ator: {item.actor}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MachinePanel({ detail }: { detail: SecurityEventDetailView }) {
  const machine = detail.machine;
  return (
    <div className="space-y-3 text-sm">
      <DetailRow label="Hostname" value={machine.hostname} />
      <DetailRow label="SO" value={machine.os || machine.distroId || "Linux"} />
      <DetailRow label="IP" value={machine.ip || "-"} />
      <DetailRow
        label="Agente"
        value={machine.status === "online" ? "Online" : machine.status}
        tone={machine.status === "online" ? "success" : undefined}
      />
      <DetailRow label="Ultimo check-in" value={formatRelative(machine.lastSeenAt)} />
      {machine.tags.length > 0 && (
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <dt className="text-muted-foreground">Tags</dt>
          <dd className="flex flex-wrap gap-1">
            {machine.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px]"
              >
                {tag}
              </span>
            ))}
          </dd>
        </div>
      )}
      <Link
        to="/machines/$machineId"
        params={{ machineId: machine.id }}
        className="inline-flex text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        Ver detalhes da maquina
      </Link>
    </div>
  );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={tone === "success" ? "text-success" : "font-medium"}>{value}</dd>
    </div>
  );
}

function EvidenceList({ evidences }: { evidences: SecurityEventEvidenceView[] }) {
  if (evidences.length === 0) {
    return <EmptyList label="Sem evidencias estruturadas." />;
  }
  return (
    <div className="divide-y divide-border">
      {evidences.map((evidence) => (
        <div key={evidence.id} className="grid gap-2 py-3 text-sm md:grid-cols-[160px_1fr]">
          <div>
            <p className="font-medium">{evidence.label}</p>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {evidence.type}
            </p>
          </div>
          <pre className="overflow-x-auto rounded-md bg-background p-2 font-mono text-xs text-muted-foreground">
            {evidence.sensitive ? "[sensivel]" : evidence.value}
          </pre>
        </div>
      ))}
    </div>
  );
}

function RelatedEvents({ detail }: { detail: SecurityEventDetailView }) {
  if (detail.relatedEvents.length === 0) {
    return <EmptyList label="Sem eventos relacionados." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] table-fixed text-left text-xs">
        <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="w-32 py-2">Hora</th>
            <th className="w-32 py-2">Severidade</th>
            <th className="w-44 py-2">Evento</th>
            <th className="py-2">Descricao</th>
            <th className="w-10 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {detail.relatedEvents.map((event) => (
            <tr key={event.id}>
              <td className="py-2 font-mono text-muted-foreground">
                {formatDateTime(event.timestamp)}
              </td>
              <td className="py-2">
                <SeverityBadge severity={event.severity} />
              </td>
              <td className="truncate py-2">{event.typeLabel}</td>
              <td className="truncate py-2 text-muted-foreground">
                {event.summary || event.message}
              </td>
              <td className="py-2 text-right">
                <Link
                  to="/monitoring/events/$eventId"
                  params={{ eventId: event.id }}
                  className="text-primary transition-colors hover:text-primary/80"
                >
                  Abrir
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassificationPanel({ detail }: { detail: SecurityEventDetailView }) {
  const context = detail.context;
  return (
    <dl className="space-y-3 text-sm">
      <DetailRow label="Categoria" value={context.category} />
      <DetailRow label="Tatica" value={context.tactic ?? "-"} />
      <DetailRow label="Tecnica" value={context.technique ?? "-"} />
      <DetailRow label="MITRE ATT&CK" value={context.mitreTechniqueId ?? "-"} />
      <DetailRow
        label="Confianca"
        value={context.confidence}
        tone={context.confidence === "high" ? "success" : undefined}
      />
    </dl>
  );
}

function SafeActions({
  detail,
  onCopyJson,
  copied,
}: {
  detail: SecurityEventDetailView;
  onCopyJson: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-2 text-sm">
      <Link
        to="/machines/$machineId"
        params={{ machineId: detail.machine.id }}
        className="flex h-10 items-center justify-between rounded-md border border-border bg-background px-3 transition-colors hover:bg-secondary"
      >
        Abrir maquina
        <Monitor className="size-4 text-muted-foreground" />
      </Link>
      <button
        type="button"
        onClick={onCopyJson}
        className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left transition-colors hover:bg-secondary"
      >
        {copied ? "JSON copiado" : "Copiar payload JSON"}
        <Clipboard className="size-4 text-muted-foreground" />
      </button>
      {detail.alert && (
        <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
          Alerta vinculado: <span className="font-mono text-foreground">{detail.alert.id}</span>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  return (
    <span
      className="inline-flex min-w-20 justify-center rounded-md border px-2 py-1 text-[11px] font-semibold"
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
    <span className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-[11px]">
      <span className="size-2 rounded-full" style={{ background: statusColors[status] }} />
      {statusLabels[status]}
    </span>
  );
}

function SoftBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary">
      {children}
    </span>
  );
}

function EmptyList({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>;
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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

function formatSeverityLevel(level: number | null | undefined, severity: SecuritySeverity) {
  if (typeof level === "number") {
    return `${level}/10`;
  }
  return severityLabels[severity];
}

function formatOpenTime(firstSeenAt?: string, lastSeenAt?: string) {
  if (!firstSeenAt) {
    return "-";
  }
  const first = new Date(firstSeenAt);
  const last = lastSeenAt ? new Date(lastSeenAt) : new Date();
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
    return "-";
  }
  const diffMin = Math.max(0, Math.round((last.getTime() - first.getTime()) / 60_000));
  if (diffMin < 60) {
    return `${diffMin} min`;
  }
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  return `${hours}h ${minutes}min`;
}
