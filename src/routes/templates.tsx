import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "react-dom";
import { CalendarClock, Pencil, Play, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { AppShell, Crumb, StatusLabel } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import {
  MAX_RECURRING_INTERVAL_DAYS,
  type ActionRisk,
  type ActionTemplateView,
  type RealtimeTerminalSessionView,
} from "@/lib/agentlx";
import { APP_NAME } from "@/lib/brand";
import {
  createTemplateAction,
  createRecurringTemplateScheduleAction,
  deleteTemplateAction,
  getTemplateCatalogData,
  queueTemplateExecutionAction,
  updateTemplateAction,
} from "@/lib/panel-api";
import { requireRouteScreen } from "@/lib/route-protection";
import { storePendingTemplateTerminalLaunch } from "@/lib/template-terminal-handoff";
import { ServiceTag } from "./index";

const LazyTemplateShellModal = lazy(() =>
  import("@/components/terminal/TemplateShellModal").then((module) => ({
    default: module.TemplateShellModal,
  })),
);

export const Route = createFileRoute("/templates")({
  loader: async () => {
    await requireRouteScreen("templates");
    return getTemplateCatalogData();
  },
  head: () => ({
    meta: [
      { title: APP_NAME },
      {
        name: "description",
        content: "Catalogo de acoes pre-definidas executaveis pelos agents nas maquinas.",
      },
    ],
  }),
  component: Templates,
});

type CreateFormState = {
  name: string;
  description: string;
  risk: ActionRisk;
  command: string;
};

type TemplateFormMode = { type: "create" } | { type: "edit"; template: ActionTemplateView };

const TERMINAL_COLS = 140;
const TERMINAL_ROWS = 36;
const PAGE_SIZE = 10;

function toDatetimeLocalMinuteValue(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getNextScheduleStartMin(now = new Date()) {
  const nextMinute = new Date(now);
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);

  return toDatetimeLocalMinuteValue(nextMinute);
}

const emptyCreateState = (): CreateFormState => ({
  name: "",
  description: "",
  risk: "low",
  command: "",
});

function toFormState(template: ActionTemplateView): CreateFormState {
  return {
    name: template.name,
    description: template.description,
    risk: template.risk,
    command: template.command,
  };
}

function Templates() {
  const router = useRouter();
  const createTemplate = useServerFn(createTemplateAction);
  const deleteTemplate = useServerFn(deleteTemplateAction);
  const updateTemplate = useServerFn(updateTemplateAction);
  const queueTemplateExecution = useServerFn(queueTemplateExecutionAction);
  const createRecurringTemplateSchedule = useServerFn(createRecurringTemplateScheduleAction);
  const navigate = useNavigate();
  const { templates, machines, enterpriseFeatures } = Route.useLoaderData();
  const [formMode, setFormMode] = useState<TemplateFormMode | null>(null);
  const [createState, setCreateState] = useState<CreateFormState>(() => emptyCreateState());
  const [savedTemplateForExecution, setSavedTemplateForExecution] =
    useState<ActionTemplateView | null>(null);
  const [executeTemplate, setExecuteTemplate] = useState<ActionTemplateView | null>(null);
  const [machineSelectorOpen, setMachineSelectorOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [pendingMachineId, setPendingMachineId] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled" | "recurring">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recurringIntervalDays, setRecurringIntervalDays] = useState("1");
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [shellSession, setShellSession] = useState<RealtimeTerminalSessionView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActionTemplateView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [scheduleStartMin, setScheduleStartMin] = useState(() => getNextScheduleStartMin());

  const sortedTemplates = useMemo(
    () =>
      [...templates].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return sortedTemplates;
    }

    return sortedTemplates.filter((template) =>
      [template.name, template.description, template.service, template.systemScope, template.risk]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [appliedSearch, sortedTemplates]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedTemplates = filteredTemplates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const availableMachines = useMemo(() => {
    if (!executeTemplate) {
      return [];
    }

    return [...machines].sort((left, right) => left.hostname.localeCompare(right.hostname));
  }, [executeTemplate, machines]);

  const selectedMachine =
    availableMachines.find((machine) => machine.id === selectedMachineId) ?? null;

  useEffect(() => {
    if (!executeTemplate) {
      setSelectedMachineId("");
      setPendingMachineId("");
      setMachineSelectorOpen(false);
      setScheduleMode("now");
      setScheduledFor("");
      setRecurringIntervalDays("1");
      return;
    }

    const nextId = availableMachines[0]?.id ?? "";
    setSelectedMachineId(nextId);
    setPendingMachineId(nextId);
  }, [executeTemplate, availableMachines]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setScheduleStartMin(getNextScheduleStartMin());
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const openCreateModal = () => {
    setFormMode({ type: "create" });
    setCreateState(emptyCreateState());
    setSavedTemplateForExecution(null);
  };

  const openEditModal = (template: ActionTemplateView) => {
    setFormMode({ type: "edit", template });
    setCreateState(toFormState(template));
    setSavedTemplateForExecution(null);
  };

  const closeFormModal = () => {
    setFormMode(null);
    setSavedTemplateForExecution(null);
    setSaving(false);
  };

  const submitTemplate = async () => {
    if (!formMode) {
      return;
    }

    setSaving(true);

    try {
      if (formMode.type === "create") {
        const created = await createTemplate({
          data: {
            name: createState.name,
            description: createState.description,
            risk: createState.risk,
            command: createState.command,
          },
        });
        setSavedTemplateForExecution(created);
        toast.success("Template criado com sucesso.");
      } else {
        await updateTemplate({
          data: {
            templateId: formMode.template.id,
            name: createState.name,
            description: createState.description,
            risk: createState.risk,
            command: createState.command,
          },
        });
        toast.success("Template atualizado com sucesso.");
        setFormMode(null);
      }

      await router.invalidate();
    } catch (error) {
      toast.error(formatTemplateError(error, "Nao foi possivel salvar o template."));
    } finally {
      setSaving(false);
    }
  };

  const submitExecution = async () => {
    if (!executeTemplate || !selectedMachineId) {
      toast.error("Selecione uma maquina.");
      return;
    }

    if (
      executeTemplate.risk === "high" &&
      !window.confirm(
        `O template "${executeTemplate.name}" esta marcado como alto risco e sera executado com privilegios do agent no host remoto.\n\nConfirma continuar?`,
      )
    ) {
      return;
    }

    setExecuting(true);

    try {
      if (scheduleMode === "scheduled") {
        if (!scheduledFor) {
          throw new Error("Informe a data e horario do agendamento.");
        }

        const scheduledDate = new Date(scheduledFor);
        if (Number.isNaN(scheduledDate.getTime())) {
          throw new Error("Informe uma data valida para o agendamento.");
        }
        if (scheduledDate.getTime() < Date.now()) {
          throw new Error("O agendamento so pode ser criado para uma data e horario futuros.");
        }

        await queueTemplateExecution({
          data: {
            machineId: selectedMachineId,
            templateId: executeTemplate.id,
            scheduledFor: scheduledDate.toISOString(),
          },
        });

        toast.success("Agendamento criado e enviado para a fila.");
        setExecuteTemplate(null);
        await router.invalidate();
        return;
      }

      if (scheduleMode === "recurring") {
        if (!scheduledFor) {
          throw new Error("Informe a data e horario inicial da recorrencia.");
        }

        const recurrenceStartDate = new Date(scheduledFor);
        if (Number.isNaN(recurrenceStartDate.getTime())) {
          throw new Error("Informe uma data inicial valida para a recorrencia.");
        }
        if (recurrenceStartDate.getTime() < Date.now()) {
          throw new Error("A recorrencia so pode comecar a partir da data e horario atuais.");
        }

        const intervalDays = Number(recurringIntervalDays);
        if (!Number.isInteger(intervalDays) || intervalDays < 1) {
          throw new Error("Informe um intervalo inteiro em dias.");
        }
        if (intervalDays > MAX_RECURRING_INTERVAL_DAYS) {
          throw new Error(`O intervalo maximo e de ${MAX_RECURRING_INTERVAL_DAYS} dias.`);
        }

        await createRecurringTemplateSchedule({
          data: {
            machineId: selectedMachineId,
            templateId: executeTemplate.id,
            startsAt: recurrenceStartDate.toISOString(),
            intervalDays,
          },
        });

        toast.success("Recorrencia criada com sucesso.");
        setExecuteTemplate(null);
        await router.invalidate();
        return;
      }

      const handoffStored = storePendingTemplateTerminalLaunch({
        machineId: selectedMachineId,
        templateId: executeTemplate.id,
      });
      if (!handoffStored) {
        throw new Error("Nao foi possivel preparar o redirecionamento para o terminal da maquina.");
      }

      setExecuteTemplate(null);
      await navigate({
        to: "/machines/$machineId",
        params: { machineId: selectedMachineId },
      });
      return;
    } catch (error) {
      toast.error(formatTemplateError(error, "Nao foi possivel solicitar a execucao do template."));
    } finally {
      setExecuting(false);
    }
  };

  const submitDeleteTemplate = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      const result = await deleteTemplate({
        data: {
          templateId: deleteTarget.id,
        },
      });

      if (formMode?.type === "edit" && formMode.template.id === deleteTarget.id) {
        setFormMode(null);
      }
      if (executeTemplate?.id === deleteTarget.id) {
        setExecuteTemplate(null);
      }
      if (savedTemplateForExecution?.id === deleteTarget.id) {
        setSavedTemplateForExecution(null);
      }

      setDeleteTarget(null);
      toast.success(
        result.cancelledExecutions > 0
          ? `Template excluido com sucesso. ${result.cancelledExecutions} execucoes pendentes foram canceladas.`
          : "Template excluido com sucesso.",
      );
      await router.invalidate();
    } catch (error) {
      toast.error(formatTemplateError(error, "Nao foi possivel excluir o template."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "templates" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Templates de acoes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredTemplates.length} de {templates.length} templates disponiveis.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-80">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Buscar por nome, escopo, risco ou servico"
                className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applySearch}
                aria-label="Buscar templates"
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" /> Novo template
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[980px] w-full border-collapse text-left">
              <thead className="border-b border-border bg-background/40">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Escopo</th>
                  <th className="px-4 py-3">Risco</th>
                  <th className="px-4 py-3">Tempo</th>
                  <th className="px-4 py-3 text-right">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-mono">
                {pagedTemplates.map((template) => (
                  <tr key={template.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-foreground">{template.name}</p>
                          <ServiceTag name={template.service} />
                        </div>
                        {template.description ? (
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {template.description}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{template.systemScope}</td>
                    <td className="px-4 py-3">
                      <RiskBadge risk={template.risk} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{template.estimatedTime}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(template)}
                          className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                        >
                          <Pencil className="size-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => setExecuteTemplate(template)}
                          className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          <Play className="size-3.5" /> Executar
                        </button>
                        <button
                          onClick={() => setDeleteTarget(template)}
                          className="inline-flex items-center gap-1.5 rounded border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedTemplates.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      Nenhum template encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {pagedTemplates.map((template) => (
              <div key={template.id} className="space-y-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{template.name}</p>
                      <ServiceTag name={template.service} />
                    </div>
                    {template.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                    ) : null}
                  </div>
                  <RiskBadge risk={template.risk} />
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>{template.systemScope}</p>
                  <p>Tempo estimado: {template.estimatedTime}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openEditModal(template)}
                    className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => setExecuteTemplate(template)}
                    className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Play className="size-3.5" /> Executar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(template)}
                    className="inline-flex items-center gap-1.5 rounded border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" /> Excluir
                  </button>
                </div>
              </div>
            ))}
            {pagedTemplates.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum template encontrado.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
          <span>
            Pagina {safePage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="rounded border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="rounded border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>

        {formMode && (
          <ModalShell onClose={closeFormModal} maxWidthClass="max-w-3xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {formMode.type === "create" ? "Novo template" : "Editar template"}
                </h2>
              </div>
              <button
                onClick={closeFormModal}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              {savedTemplateForExecution ? (
                <div className="space-y-4 rounded-lg border border-success/30 bg-success/10 p-4">
                  <p className="text-sm font-medium text-success">Template criado com sucesso.</p>
                  <p className="text-sm text-success/90">
                    O template ja esta disponivel e pode ser executado agora.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Nome">
                    <input
                      value={createState.name}
                      onChange={(event) =>
                        setCreateState((current) => ({ ...current, name: event.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                    />
                  </Field>

                  <Field label="Descricao (opcional)" fullWidth>
                    <input
                      value={createState.description}
                      onChange={(event) =>
                        setCreateState((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                    />
                  </Field>

                  <Field label="Risco">
                    <select
                      value={createState.risk}
                      onChange={(event) =>
                        setCreateState((current) => ({
                          ...current,
                          risk: event.target.value as ActionRisk,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </Field>

                  <Field label="Comando" fullWidth>
                    <textarea
                      value={createState.command}
                      onChange={(event) =>
                        setCreateState((current) => ({ ...current, command: event.target.value }))
                      }
                      rows={8}
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm font-mono outline-none focus:border-primary"
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              {formMode.type === "edit" ? (
                <button
                  onClick={() => setDeleteTarget(formMode.template)}
                  className="mr-auto inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Excluir
                </button>
              ) : null}
              <button
                onClick={closeFormModal}
                className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
              >
                Fechar
              </button>
              {savedTemplateForExecution ? (
                <button
                  onClick={() => {
                    setFormMode(null);
                    setExecuteTemplate(savedTemplateForExecution);
                    setSavedTemplateForExecution(null);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Play className="size-4" /> Executar agora
                </button>
              ) : (
                <button
                  onClick={() => void submitTemplate()}
                  disabled={saving || !createState.name.trim() || !createState.command.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {formMode.type === "create" ? (
                    <Plus className="size-4" />
                  ) : (
                    <Pencil className="size-4" />
                  )}
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              )}
            </div>
          </ModalShell>
        )}

        {executeTemplate && (
          <ModalShell onClose={() => setExecuteTemplate(null)} maxWidthClass="max-w-3xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Executar template</h2>
              </div>
              <button
                onClick={() => setExecuteTemplate(null)}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-2 rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{executeTemplate.name}</p>
                  <RiskBadge risk={executeTemplate.risk} />
                </div>
                {executeTemplate.description ? (
                  <p className="text-xs text-muted-foreground">{executeTemplate.description}</p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Escopo: disponivel para qualquer maquina registrada.
                </p>
              </div>

              <Field label="Maquina">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setPendingMachineId(selectedMachineId);
                      setMachineSelectorOpen(true);
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    Selecionar maquina
                  </button>
                  {selectedMachine ? (
                    <div className="flex min-w-0 items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm">
                      <span className="truncate">{selectedMachine.hostname}</span>
                      <StatusLabel status={selectedMachine.status} />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Nenhuma maquina selecionada.
                    </span>
                  )}
                </div>
              </Field>

              <div className="space-y-3">
                <Field label="Modo">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setScheduleMode("now")}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        scheduleMode === "now"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      Executar agora
                    </button>
                    <button
                      onClick={() => {
                        setScheduleMode("scheduled");
                        setScheduledFor((currentValue) => {
                          if (!currentValue) {
                            return scheduleStartMin;
                          }

                          const currentDate = new Date(currentValue);
                          if (
                            Number.isNaN(currentDate.getTime()) ||
                            currentDate.getTime() < Date.now()
                          ) {
                            return scheduleStartMin;
                          }

                          return currentValue;
                        });
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        scheduleMode === "scheduled"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      Agendar
                    </button>
                    <button
                      onClick={() => {
                        if (!enterpriseFeatures.recurringJobs) {
                          toast.error("Recorrencias estao disponiveis na edicao Enterprise.");
                          return;
                        }
                        setScheduleMode("recurring");
                        setScheduledFor((currentValue) => {
                          if (!currentValue) {
                            return scheduleStartMin;
                          }

                          const currentDate = new Date(currentValue);
                          if (
                            Number.isNaN(currentDate.getTime()) ||
                            currentDate.getTime() < Date.now()
                          ) {
                            return scheduleStartMin;
                          }

                          return currentValue;
                        });
                      }}
                      title={
                        enterpriseFeatures.recurringJobs
                          ? "Criar recorrencia"
                          : "Disponivel na edicao Enterprise"
                      }
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                        scheduleMode === "recurring"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : enterpriseFeatures.recurringJobs
                            ? "border-border hover:bg-secondary"
                            : "border-border text-muted-foreground opacity-70"
                      }`}
                    >
                      Recorrente
                    </button>
                  </div>
                </Field>

                {(scheduleMode === "scheduled" || scheduleMode === "recurring") && (
                  <Field label="Data e horario">
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      min={
                        scheduleMode === "scheduled" || scheduleMode === "recurring"
                          ? scheduleStartMin
                          : undefined
                      }
                      onChange={(event) => setScheduledFor(event.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                    />
                  </Field>
                )}

                {scheduleMode === "recurring" && (
                  <Field label="Intervalo em dias">
                    <input
                      type="number"
                      min={1}
                      max={MAX_RECURRING_INTERVAL_DAYS}
                      step={1}
                      value={recurringIntervalDays}
                      onChange={(event) => setRecurringIntervalDays(event.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                    />
                  </Field>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setExecuteTemplate(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
              >
                Fechar
              </button>
              <button
                onClick={() => void submitExecution()}
                disabled={
                  executing ||
                  !selectedMachineId ||
                  (scheduleMode === "scheduled" && !scheduledFor) ||
                  (scheduleMode === "recurring" && (!scheduledFor || !recurringIntervalDays))
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {scheduleMode === "scheduled" || scheduleMode === "recurring" ? (
                  <CalendarClock className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {executing
                  ? "Enviando..."
                  : scheduleMode === "scheduled"
                    ? "Criar agendamento"
                    : scheduleMode === "recurring"
                      ? "Criar recorrencia"
                      : "Executar"}
              </button>
            </div>
          </ModalShell>
        )}

        {machineSelectorOpen && executeTemplate && (
          <ModalShell onClose={() => setMachineSelectorOpen(false)} maxWidthClass="max-w-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Selecionar maquina</h2>
              </div>
              <button
                onClick={() => setMachineSelectorOpen(false)}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {availableMachines.length === 0 ? (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-4 text-sm text-warning">
                    Nenhuma maquina registrada disponivel.
                  </div>
                ) : (
                  availableMachines.map((machine) => (
                    <button
                      key={machine.id}
                      onClick={() => setPendingMachineId(machine.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        pendingMachineId === machine.id
                          ? "border-primary/30 bg-primary/10"
                          : "border-border bg-background hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{machine.hostname}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {machine.os} · {machine.ip}
                          </p>
                        </div>
                        <StatusLabel status={machine.status} />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setMachineSelectorOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setSelectedMachineId(pendingMachineId);
                  setMachineSelectorOpen(false);
                }}
                disabled={!pendingMachineId}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                Aplicar
              </button>
            </div>
          </ModalShell>
        )}

        {shellSession && (
          <Suspense fallback={null}>
            <LazyTemplateShellModal session={shellSession} onClose={() => setShellSession(null)} />
          </Suspense>
        )}

        {deleteTarget && (
          <ModalShell
            onClose={() => (deleting ? null : setDeleteTarget(null))}
            maxWidthClass="max-w-lg"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Excluir template</h2>
              </div>
              <button
                onClick={() => (deleting ? null : setDeleteTarget(null))}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-sm font-medium">Confirma a exclusao de {deleteTarget.name}?</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  O template sera removido do sistema e qualquer execucao pendente sera cancelada.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-60"
              >
                Fechar
              </button>
              <button
                onClick={() => void submitDeleteTemplate()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                {deleting ? "Excluindo..." : "Excluir template"}
              </button>
            </div>
          </ModalShell>
        )}
      </div>
    </AppShell>
  );
}

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" }) {
  const map = {
    low: "border-success/20 bg-success/10 text-success",
    medium: "border-warning/30 bg-warning/10 text-warning",
    high: "border-destructive/30 bg-destructive/10 text-destructive",
  } as const;

  return (
    <span
      className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${map[risk]}`}
    >
      {risk === "high" && <ShieldAlert className="size-2.5" />}
      {risk}
    </span>
  );
}

function formatTemplateError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Array<{
      code?: string;
      minimum?: number;
      path?: string[];
      message?: string;
    }>;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return raw;
    }

    const fieldLabels: Record<string, string> = {
      name: "Nome",
      description: "Descricao",
      command: "Comando",
      risk: "Risco",
      machineId: "Maquina",
      scheduledFor: "Data e horario",
      templateId: "Template",
    };

    const messages = parsed.map((item) => {
      const field = item.path?.[0] ?? "";
      const label = fieldLabels[field] ?? field;

      if (item.code === "too_small" && typeof item.minimum === "number") {
        return `${label} deve ter pelo menos ${item.minimum} caracteres.`;
      }

      return label ? `${label}: ${item.message ?? "valor invalido."}` : (item.message ?? fallback);
    });

    return messages.join(" ");
  } catch {
    return raw;
  }
}

function Field({
  label,
  children,
  fullWidth = false,
}: {
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={`space-y-1 ${fullWidth ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  children,
  onClose,
  maxWidthClass,
  scrollContent = true,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidthClass: string;
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
        className={`w-full ${maxWidthClass} overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={
            scrollContent ? "max-h-[88vh] overflow-y-auto" : "max-h-[92vh] overflow-hidden"
          }
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
