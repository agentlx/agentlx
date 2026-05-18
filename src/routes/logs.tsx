import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Repeat2,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { AppShell, Crumb, StatusLabel } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/brand";
import type { ExecutionLogView, RecurringScheduleView } from "@/lib/agentlx";
import { cancelRecurringTemplateScheduleAction, getExecutionLogsData } from "@/lib/panel-api";

export const Route = createFileRoute("/logs")({
  loader: () => getExecutionLogsData(),
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Historico de execucoes, agendamentos e auditoria." },
    ],
  }),
  component: Logs,
});

const PAGE_SIZE = 10;

type ModalState =
  | { type: "event"; item: typeof Route.useLoaderData extends never ? never : never }
  | { type: "audit"; item: typeof Route.useLoaderData extends never ? never : never };

type ScheduledListItem =
  | {
      kind: "execution";
      id: string;
      templateName: string;
      description: string;
      requestedBy: string;
      machineId: string;
      machineHostname: string;
      machineAvailable: boolean;
      scheduledAt: string;
      execution: ExecutionLogView;
    }
  | {
      kind: "recurring";
      id: string;
      templateName: string;
      description: string;
      requestedBy: string;
      machineId: string;
      machineHostname: string;
      machineAvailable: boolean;
      scheduledAt: string;
      schedule: RecurringScheduleView;
    };

function Logs() {
  const router = useRouter();
  const cancelRecurringTemplateSchedule = useServerFn(cancelRecurringTemplateScheduleAction);
  const { executions, scheduled, recurringSchedules, audits } = Route.useLoaderData();
  const [view, setView] = useState<"events" | "audits" | "scheduled">("events");
  const [filter, setFilter] = useState<"all" | "success" | "failed" | "queued">("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [eventsPage, setEventsPage] = useState(1);
  const [auditsPage, setAuditsPage] = useState(1);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [expandedText, setExpandedText] = useState<{ title: string; content: string } | null>(null);
  const [cancellingScheduleId, setCancellingScheduleId] = useState<string | null>(null);

  const filteredEvents = useMemo(
    () =>
      executions.filter(
        (log) =>
          (filter === "all" || log.status === filter) && matchesExecutionSearch(log, appliedSearch),
      ),
    [appliedSearch, executions, filter],
  );
  const filteredScheduled = useMemo(
    () => scheduled.filter((log) => matchesExecutionSearch(log, appliedSearch)),
    [appliedSearch, scheduled],
  );
  const filteredAudits = useMemo(
    () => audits.filter((audit) => matchesAuditSearch(audit, appliedSearch)),
    [appliedSearch, audits],
  );

  const filteredRecurringSchedules = useMemo(
    () =>
      recurringSchedules.filter((schedule) =>
        [
          schedule.templateName,
          schedule.machineHostname,
          schedule.requestedBy,
          schedule.description,
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(appliedSearch.trim().toLocaleLowerCase("pt-BR")),
      ),
    [appliedSearch, recurringSchedules],
  );
  const scheduledRows = useMemo<ScheduledListItem[]>(() => {
    const executionRows: ScheduledListItem[] = filteredScheduled.map((execution) => ({
      kind: "execution",
      id: execution.id,
      templateName: execution.templateName,
      description: execution.description,
      requestedBy: execution.requestedBy,
      machineId: execution.machineId,
      machineHostname: execution.machineHostname,
      machineAvailable: execution.machineAvailable,
      scheduledAt: execution.availableAt,
      execution,
    }));
    const recurringRows: ScheduledListItem[] = filteredRecurringSchedules.map((schedule) => ({
      kind: "recurring",
      id: schedule.id,
      templateName: schedule.templateName,
      description: `${schedule.description} A cada ${formatIntervalHours(schedule.intervalHours)}.`,
      requestedBy: schedule.requestedBy,
      machineId: schedule.machineId,
      machineHostname: schedule.machineHostname,
      machineAvailable: schedule.machineAvailable,
      scheduledAt: schedule.nextRunAt,
      schedule,
    }));

    return [...executionRows, ...recurringRows].sort((left, right) =>
      left.scheduledAt.localeCompare(right.scheduledAt),
    );
  }, [filteredRecurringSchedules, filteredScheduled]);

  const pagedEvents = paginate(filteredEvents, eventsPage, PAGE_SIZE);
  const pagedAudits = paginate(filteredAudits, auditsPage, PAGE_SIZE);
  const pagedScheduled = paginate(scheduledRows, scheduledPage, PAGE_SIZE);

  const selectedEvent =
    filteredEvents.find((item) => item.id === selectedEventId) ??
    filteredScheduled.find((item) => item.id === selectedEventId) ??
    null;
  const selectedAudit = filteredAudits.find((item) => item.id === selectedAuditId) ?? null;

  useEffect(() => {
    setEventsPage(1);
  }, [appliedSearch, filter]);

  useEffect(() => {
    setScheduledPage(1);
    setAuditsPage(1);
  }, [appliedSearch]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
  };

  const cancelSchedule = async (scheduleId: string) => {
    setCancellingScheduleId(scheduleId);
    try {
      const result = await cancelRecurringTemplateSchedule({
        data: { scheduleId },
      });
      toast.success(
        result.cancelledExecutions > 0
          ? `Recorrencia cancelada. ${result.cancelledExecutions} execucao pendente foi cancelada.`
          : "Recorrencia cancelada.",
      );
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel cancelar a recorrencia.",
      );
    } finally {
      setCancellingScheduleId(null);
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "logs" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Eventos de execucao, fila de agendamentos e trilha de auditoria.
            </p>
          </div>
          <div className="relative w-full sm:w-96">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applySearch();
                }
              }}
              placeholder="Buscar por palavra-chave nos logs"
              className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={applySearch}
              aria-label="Buscar logs"
              className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-xs font-mono">
          {(
            [
              { key: "events", label: "EVENTOS" },
              { key: "scheduled", label: "AGENDAMENTOS" },
              { key: "audits", label: "AUDITORIA" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`rounded border px-3 py-1.5 transition-colors ${
                view === item.key
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === "events" && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-1 text-xs font-mono">
              {(["all", "success", "failed", "queued"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded border px-3 py-1.5 transition-colors ${
                    filter === item
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="hidden grid-cols-12 border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
                <div className="col-span-1" />
                <div className="col-span-4">Acao</div>
                <div className="col-span-2">Conta</div>
                <div className="col-span-2">Maquina</div>
                <div className="col-span-2">Quando</div>
                <div className="col-span-1 text-right">Status</div>
              </div>

              <ul className="divide-y divide-border">
                {pagedEvents.items.map((log) => (
                  <li key={log.id}>
                    <button
                      onClick={() => setSelectedEventId(log.id)}
                      className="hidden w-full grid-cols-12 items-center px-4 py-3 text-left text-xs font-mono transition-colors hover:bg-white/[0.02] md:grid"
                    >
                      <div className="col-span-1 text-muted-foreground">
                        <ChevronRight className="size-4" />
                      </div>
                      <div className="col-span-4 min-w-0">
                        <p className="truncate font-semibold text-foreground">{log.templateName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {log.description}
                        </p>
                      </div>
                      <div className="col-span-2 truncate text-muted-foreground">
                        {log.requestedBy}
                      </div>
                      <div className="col-span-2 truncate text-muted-foreground">
                        {log.machineAvailable ? (
                          <Link
                            to="/machines/$machineId"
                            params={{ machineId: log.machineId }}
                            onClick={(event) => event.stopPropagation()}
                            className="transition-colors hover:text-primary"
                          >
                            {log.machineHostname}
                          </Link>
                        ) : (
                          <span>{log.machineHostname}</span>
                        )}
                      </div>
                      <div className="col-span-2 text-muted-foreground">{log.executedAt}</div>
                      <div className="col-span-1 flex justify-end">
                        <StatusLabel
                          status={
                            log.status === "success"
                              ? "online"
                              : log.status === "failed"
                                ? "offline"
                                : "warning"
                          }
                        />
                      </div>
                    </button>

                    <button
                      onClick={() => setSelectedEventId(log.id)}
                      className="block w-full space-y-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] md:hidden"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{log.templateName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {log.requestedBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ChevronRight className="size-4 text-muted-foreground" />
                          <StatusLabel
                            status={
                              log.status === "success"
                                ? "online"
                                : log.status === "failed"
                                  ? "offline"
                                  : "warning"
                            }
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{log.description}</p>
                    </button>
                  </li>
                ))}

                {pagedEvents.items.length === 0 && (
                  <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Sem registros.
                  </li>
                )}
              </ul>
            </div>

            <Pagination
              page={pagedEvents.page}
              totalPages={pagedEvents.totalPages}
              onPageChange={setEventsPage}
            />
          </section>
        )}

        {view === "scheduled" && (
          <section className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="hidden grid-cols-12 border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
                <div className="col-span-1" />
                <div className="col-span-4">Template</div>
                <div className="col-span-2">Conta</div>
                <div className="col-span-2">Maquina</div>
                <div className="col-span-2">Agendado para</div>
                <div className="col-span-1" />
              </div>

              <ul className="divide-y divide-border">
                {pagedScheduled.items.map((item) => (
                  <li key={`${item.kind}:${item.id}`}>
                    <div
                      role={item.kind === "execution" ? "button" : undefined}
                      tabIndex={item.kind === "execution" ? 0 : undefined}
                      onClick={() => {
                        if (item.kind === "execution") {
                          setSelectedEventId(item.id);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          item.kind === "execution" &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          setSelectedEventId(item.id);
                        }
                      }}
                      className="hidden w-full grid-cols-12 items-center px-4 py-3 text-left text-xs font-mono transition-colors hover:bg-white/[0.02] md:grid"
                    >
                      <div className="col-span-1 text-muted-foreground">
                        {item.kind === "recurring" ? (
                          <Repeat2 className="size-4 text-primary" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </div>
                      <div className="col-span-4 min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {item.templateName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <div className="col-span-2 truncate text-muted-foreground">
                        {item.requestedBy}
                      </div>
                      <div className="col-span-2 truncate text-muted-foreground">
                        {item.machineAvailable ? (
                          <Link
                            to="/machines/$machineId"
                            params={{ machineId: item.machineId }}
                            onClick={(event) => event.stopPropagation()}
                            className="transition-colors hover:text-primary"
                          >
                            {item.machineHostname}
                          </Link>
                        ) : (
                          <span>{item.machineHostname}</span>
                        )}
                      </div>
                      <div className="col-span-2 text-muted-foreground">{item.scheduledAt}</div>
                      <div className="col-span-1 flex justify-end">
                        {item.kind === "recurring" && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void cancelSchedule(item.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                void cancelSchedule(item.id);
                              }
                            }}
                            disabled={cancellingScheduleId === item.id}
                            className="inline-flex items-center justify-center gap-1.5 rounded border border-destructive/30 px-2 py-1 text-[11px] text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                          >
                            <Ban className="size-3" />
                            {cancellingScheduleId === item.id ? "..." : "Cancelar"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="block space-y-3 px-4 py-4 md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.templateName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.scheduledAt}
                          </p>
                        </div>
                        {item.kind === "recurring" ? (
                          <Repeat2 className="size-4 text-primary" />
                        ) : (
                          <button
                            onClick={() => setSelectedEventId(item.id)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label="Abrir detalhes do agendamento"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.machineHostname} · {item.requestedBy}
                      </p>
                      {item.kind === "recurring" && (
                        <button
                          onClick={() => void cancelSchedule(item.id)}
                          disabled={cancellingScheduleId === item.id}
                          className="inline-flex items-center justify-center gap-2 rounded border border-destructive/30 px-3 py-2 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                        >
                          <Ban className="size-3.5" />
                          {cancellingScheduleId === item.id ? "Cancelando..." : "Cancelar"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}

                {pagedScheduled.items.length === 0 && (
                  <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Sem agendamentos.
                  </li>
                )}
              </ul>
            </div>

            <Pagination
              page={pagedScheduled.page}
              totalPages={pagedScheduled.totalPages}
              onPageChange={setScheduledPage}
            />
          </section>
        )}

        {view === "audits" && (
          <section className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="hidden grid-cols-12 border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
                <div className="col-span-1" />
                <div className="col-span-2">Acao</div>
                <div className="col-span-2">Ator</div>
                <div className="col-span-5">Descricao</div>
                <div className="col-span-2">Quando</div>
              </div>

              <ul className="divide-y divide-border">
                {pagedAudits.items.map((audit) => (
                  <li key={audit.id}>
                    <button
                      onClick={() => setSelectedAuditId(audit.id)}
                      className="hidden w-full grid-cols-12 items-center px-4 py-3 text-left text-xs font-mono transition-colors hover:bg-white/[0.02] md:grid"
                    >
                      <div className="col-span-1 text-muted-foreground">
                        <ChevronRight className="size-4" />
                      </div>
                      <div className="col-span-2 truncate text-foreground">{audit.action}</div>
                      <div className="col-span-2 truncate text-muted-foreground">
                        {audit.actorType} · {audit.actorId}
                      </div>
                      <div className="col-span-5 truncate text-muted-foreground">
                        {audit.message}
                      </div>
                      <div className="col-span-2 text-muted-foreground">{audit.createdAt}</div>
                    </button>

                    <button
                      onClick={() => setSelectedAuditId(audit.id)}
                      className="block w-full space-y-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] md:hidden"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{audit.action}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {audit.actorType} · {audit.actorId}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground">{audit.message}</p>
                    </button>
                  </li>
                ))}

                {pagedAudits.items.length === 0 && (
                  <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Sem auditoria.
                  </li>
                )}
              </ul>
            </div>

            <Pagination
              page={pagedAudits.page}
              totalPages={pagedAudits.totalPages}
              onPageChange={setAuditsPage}
            />
          </section>
        )}

        {selectedEvent && (
          <LogModal title={selectedEvent.templateName} onClose={() => setSelectedEventId(null)}>
            <div className="space-y-4">
              <EventDetailRow label="Conta" value={selectedEvent.requestedBy} />
              <EventDetailRow label="Maquina" value={selectedEvent.machineHostname} />
              <EventDetailRow label="Status" value={selectedEvent.status} />
              <EventDetailRow label="Solicitado em" value={selectedEvent.requestedAt} />
              <EventDetailRow
                label={selectedEvent.isScheduled ? "Agendado para" : "Disponivel em"}
                value={selectedEvent.availableAt}
              />

              <DetailBlock title="Descricao">{selectedEvent.description}</DetailBlock>
              <ExpandableDetailBlock
                title="Comando"
                content={selectedEvent.command}
                onExpand={(content) => setExpandedText({ title: "Comando", content })}
              />
              <ExpandableDetailBlock
                title="Saida"
                content={
                  selectedEvent.output || selectedEvent.errorOutput || "Sem saida registrada."
                }
                onExpand={(content) => setExpandedText({ title: "Saida", content })}
              />
            </div>
          </LogModal>
        )}

        {selectedAudit && (
          <LogModal title={selectedAudit.action} onClose={() => setSelectedAuditId(null)}>
            <div className="space-y-4">
              <EventDetailRow
                label="Ator"
                value={`${selectedAudit.actorType} · ${selectedAudit.actorId}`}
              />
              <EventDetailRow label="Quando" value={selectedAudit.createdAt} />
              {selectedAudit.machineHostname && (
                <EventDetailRow label="Maquina" value={selectedAudit.machineHostname} />
              )}
              {selectedAudit.executionId && (
                <EventDetailRow label="Execucao" value={selectedAudit.executionId} />
              )}
              <DetailBlock title="Mensagem">{selectedAudit.message}</DetailBlock>
            </div>
          </LogModal>
        )}

        {expandedText && (
          <LogModal
            title={expandedText.title}
            onClose={() => setExpandedText(null)}
            size="wide"
            scrollContent={false}
          >
            <div className="rounded border border-border bg-background p-4">
              <div className="max-h-[78vh] overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {expandedText.content}
              </div>
            </div>
          </LogModal>
        )}
      </div>
    </AppShell>
  );
}

function normalizeKeywords(input: string) {
  return input.trim().toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
}

function matchesKeywords(input: string, search: string) {
  const keywords = normalizeKeywords(search);
  if (keywords.length === 0) {
    return true;
  }

  const haystack = input.toLocaleLowerCase("pt-BR");
  return keywords.every((keyword) => haystack.includes(keyword));
}

function matchesExecutionSearch(
  log: {
    templateName: string;
    description: string;
    requestedBy: string;
    machineHostname: string;
    status: string;
    command: string;
    output: string;
    errorOutput: string;
    requestedAt: string;
    availableAt: string;
  },
  search: string,
) {
  return matchesKeywords(
    [
      log.templateName,
      log.description,
      log.requestedBy,
      log.machineHostname,
      log.status,
      log.command,
      log.output,
      log.errorOutput,
      log.requestedAt,
      log.availableAt,
    ].join(" "),
    search,
  );
}

function matchesAuditSearch(
  audit: {
    action: string;
    actorType: string;
    actorId: string;
    message: string;
    machineHostname: string;
    executionId: string;
    createdAt: string;
  },
  search: string,
) {
  return matchesKeywords(
    [
      audit.action,
      audit.actorType,
      audit.actorId,
      audit.message,
      audit.machineHostname,
      audit.executionId,
      audit.createdAt,
    ].join(" "),
    search,
  );
}

function formatIntervalHours(intervalHours: number) {
  if (intervalHours % 24 === 0) {
    const days = intervalHours / 24;
    return days === 1 ? "1 dia" : `${days} dias`;
  }

  return intervalHours === 1 ? "1 hora" : `${intervalHours} horas`;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    page: safePage,
  };
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
      <span>
        Pagina {page} de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Anterior
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Proxima
        </button>
      </div>
    </div>
  );
}

function LogModal({
  title,
  children,
  onClose,
  size = "default",
  scrollContent = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "default" | "wide";
  scrollContent?: boolean;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl ${
          size === "wide" ? "max-w-6xl" : "max-w-3xl"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className={scrollContent ? "max-h-[75vh] overflow-y-auto p-5" : "p-5"}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function EventDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-background px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all text-foreground">{value}</span>
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded border border-border bg-background p-4">
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <FileText className="size-3.5" />
        {title}
      </p>
      <div className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function ExpandableDetailBlock({
  title,
  content,
  onExpand,
}: {
  title: string;
  content: string;
  onExpand: (content: string) => void;
}) {
  const lines = content.split(/\r?\n/);
  const shouldCollapse = lines.length > 10;
  const preview = shouldCollapse ? `${lines.slice(0, 10).join("\n")}\n...` : content;

  return (
    <div className="rounded border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          <FileText className="size-3.5" />
          {title}
        </p>
        {shouldCollapse && (
          <button
            type="button"
            onClick={() => onExpand(content)}
            className="text-[11px] font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Ver mais
          </button>
        )}
      </div>

      <div className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{preview}</div>
    </div>
  );
}
