import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cpu,
  HardDrive,
  Info,
  MemoryStick,
  Pencil,
  Plus,
  PlugZap,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  X,
} from "lucide-react";
import { AppShell, Crumb, StatusDot, StatusLabel } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import type {
  ExecutionDetailView,
  MachineGroupAccessView,
  MachineControlAction,
  MachineView,
  RealtimeTerminalPresenceView,
} from "@/lib/agentlx";
import { MAX_MACHINE_SCHEDULED_TASK_LIMIT } from "@/lib/agentlx";
import { APP_NAME } from "@/lib/brand";
import {
  assignMachineGroupsAction,
  getExecutionDetailData,
  getMachineDetailData,
  getRealtimeTerminalPresenceAction,
  queueMachineControlAction,
  queueMachineSyncAction,
  updateMachineAgentNameAction,
  updateMachineScheduledTaskLimitAction,
} from "@/lib/panel-api";
import { hasPendingTemplateTerminalLaunch } from "@/lib/template-terminal-handoff";
import { ServiceTag } from "./index";

const LazyRemoteTerminal = lazy(() =>
  import("@/components/terminal/RemoteTerminal").then((module) => ({
    default: module.RemoteTerminal,
  })),
);

export const Route = createFileRoute("/machines/$machineId")({
  loader: async ({ params }) => {
    const detail = await getMachineDetailData({ data: { machineId: params.machineId } });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ params }) => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: `Detalhes da maquina ${params.machineId}.` },
    ],
  }),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-12 text-center text-muted-foreground">Maquina nao encontrada.</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <div className="p-12 text-center text-destructive">{error.message}</div>
    </AppShell>
  ),
  component: MachineDetail,
});

function MachineDetail() {
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const { templates, groupAccess } = loaderData;
  const getExecution = useServerFn(getExecutionDetailData);
  const queueMachineSync = useServerFn(queueMachineSyncAction);
  const updateMachineAgentName = useServerFn(updateMachineAgentNameAction);
  const updateMachineScheduledTaskLimit = useServerFn(updateMachineScheduledTaskLimitAction);
  const [machine, setMachine] = useState(loaderData.machine);
  const [serverInfoOpen, setServerInfoOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [controlAction, setControlAction] = useState<MachineControlAction | null>(null);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [syncExecutionId, setSyncExecutionId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncCooldownUntil, setSyncCooldownUntil] = useState(0);
  const [syncNow, setSyncNow] = useState(() => Date.now());
  const sortedServices = useMemo(
    () =>
      Array.from(new Set(machine.services))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "pt-BR", { sensitivity: "base" })),
    [machine.services],
  );
  const headerServices = sortedServices.slice(0, 8);
  const hiddenServicesCount = Math.max(sortedServices.length - headerServices.length, 0);

  useEffect(() => {
    setMachine(loaderData.machine);
  }, [loaderData.machine]);

  useEffect(() => {
    setSyncExecutionId(null);
    setSyncing(false);
    setSyncCooldownUntil(0);
  }, [machine.id]);

  useEffect(() => {
    if (syncCooldownUntil <= Date.now()) {
      return;
    }

    setSyncNow(Date.now());
    const interval = window.setInterval(() => {
      const now = Date.now();
      setSyncNow(now);
      if (now >= syncCooldownUntil) {
        window.clearInterval(interval);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [syncCooldownUntil]);

  useEffect(() => {
    if (!syncExecutionId) {
      return;
    }

    const interval = window.setInterval(() => {
      void getExecution({ data: { executionId: syncExecutionId } })
        .then(async (execution) => {
          if (!execution) {
            return;
          }

          if (execution.status === "success") {
            setSyncExecutionId(null);
            setSyncing(false);
            await router.invalidate();
            toast.success("Dados da maquina sincronizados.");
            return;
          }

          if (execution.status === "failed" || execution.status === "cancelled") {
            setSyncExecutionId(null);
            setSyncing(false);
            await router.invalidate();
            toast.error(execution.errorOutput || "Nao foi possivel sincronizar a maquina.");
          }
        })
        .catch(() => {
          setSyncExecutionId(null);
          setSyncing(false);
          toast.error("Nao foi possivel acompanhar a sincronizacao da maquina.");
        });
    }, 2_000);

    return () => window.clearInterval(interval);
  }, [getExecution, router, syncExecutionId]);

  const saveMachineAgentName = useCallback(
    async (agentName: string) => {
      const result = await updateMachineAgentName({
        data: {
          machineId: machine.id,
          agentName,
        },
      });
      setMachine((current) => ({ ...current, agentName: result.agentName }));
      await router.invalidate();
    },
    [machine.id, router, updateMachineAgentName],
  );

  const saveMachineScheduledTaskLimit = useCallback(
    async (scheduledTaskLimit: number) => {
      const result = await updateMachineScheduledTaskLimit({
        data: {
          machineId: machine.id,
          scheduledTaskLimit,
        },
      });
      setMachine((current) => ({
        ...current,
        scheduledTaskLimit: result.scheduledTaskLimit,
      }));
      await router.invalidate();
    },
    [machine.id, router, updateMachineScheduledTaskLimit],
  );

  const syncCooldownSeconds = Math.max(0, Math.ceil((syncCooldownUntil - syncNow) / 1000));
  const refreshDisabled = syncing || syncCooldownSeconds > 0;

  const requestMachineSync = useCallback(async () => {
    if (refreshDisabled) {
      return;
    }

    setSyncing(true);

    try {
      const created = await queueMachineSync({
        data: {
          machineId: machine.id,
        },
      });
      setSyncCooldownUntil(Date.now() + 15_000);
      setSyncNow(Date.now());
      setSyncExecutionId(created.id);
      toast.success("Sincronizacao solicitada ao agent.");
      await router.invalidate();
    } catch (error) {
      setSyncing(false);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a maquina.");
    }
  }, [machine.id, queueMachineSync, refreshDisabled, router]);

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "machines", to: "/machines" },
            { label: machine.hostname },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <StatusDot status={machine.status} />
              <h1 className="font-mono text-2xl font-semibold tracking-tight">
                {machine.hostname}
              </h1>
              <StatusLabel status={machine.status} />
            </div>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              {machine.ip} · {machine.os} · kernel {machine.kernel} · {machine.location}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {headerServices.length > 0 ? (
                <>
                  {headerServices.map((service) => (
                    <ServiceTag key={service} name={service} />
                  ))}
                  {hiddenServicesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setServicesOpen(true)}
                      className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      Ver mais +{hiddenServicesCount}
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Nenhum servico identificado no ultimo inventario.
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {groupAccess.assignedGroups.length > 0 ? (
                groupAccess.assignedGroups.map((group) => (
                  <span
                    key={group.id}
                    className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
                  >
                    {group.name}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  Grupo padrao
                </span>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:w-auto lg:max-w-[640px] lg:flex-wrap lg:justify-end">
            <button
              onClick={() => void requestMachineSync()}
              disabled={refreshDisabled}
              title={
                syncCooldownSeconds > 0
                  ? `Aguarde ${syncCooldownSeconds}s para atualizar novamente.`
                  : undefined
              }
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60 lg:w-[150px]"
            >
              <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="min-w-0 truncate">
                {syncing
                  ? "Sincronizando..."
                  : syncCooldownSeconds > 0
                    ? `Atualizar (${syncCooldownSeconds}s)`
                    : "Atualizar"}
              </span>
            </button>
            <TunnelPresenceButton machineId={machine.id} />
            <button
              onClick={() => setServerInfoOpen(true)}
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:bg-secondary lg:w-[126px]"
            >
              <Info className="size-3.5" /> Informacoes
            </button>
            {groupAccess.canManage && (
              <button
                onClick={() => setGroupManagerOpen(true)}
                className="flex h-9 items-center justify-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-xs transition-colors hover:bg-secondary lg:w-[112px]"
              >
                <Users className="size-3.5" /> Grupos
              </button>
            )}
            <button
              onClick={() => setControlAction("poweroff")}
              disabled={machine.status === "offline"}
              title={machine.status === "offline" ? "A maquina precisa estar online." : undefined}
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60 lg:w-[112px]"
            >
              <Power className="size-3.5" /> Desligar
            </button>
            <button
              onClick={() => setControlAction("restart")}
              disabled={machine.status === "offline"}
              title={machine.status === "offline" ? "A maquina precisa estar online." : undefined}
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs text-warning transition-colors hover:bg-warning/15 disabled:cursor-not-allowed disabled:opacity-60 lg:w-[112px]"
            >
              <RotateCcw className="size-3.5" /> Reiniciar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Telemetry icon={Cpu} label="CPU" value={`${machine.cpu}%`} pct={machine.cpu} />
          <Telemetry
            icon={MemoryStick}
            label="RAM"
            value={`${machine.ramUsed} / ${machine.ramTotal} GB`}
            pct={(machine.ramUsed / machine.ramTotal) * 100}
          />
          <Telemetry icon={HardDrive} label="Disco" value={`${machine.disk}%`} pct={machine.disk} />
        </div>

        <RemoteTerminalLazySection
          machineId={machine.id}
          machineStatus={machine.status}
          templates={templates}
        />
      </div>

      {serverInfoOpen && (
        <ServerInfoModal
          machine={machine}
          onClose={() => setServerInfoOpen(false)}
          onSaveAgentName={saveMachineAgentName}
          onSaveScheduledTaskLimit={saveMachineScheduledTaskLimit}
        />
      )}
      {servicesOpen && (
        <ActiveServicesModal
          services={sortedServices}
          machineHostname={machine.hostname}
          onClose={() => setServicesOpen(false)}
        />
      )}
      {controlAction && (
        <MachineControlModal
          action={controlAction}
          machineId={machine.id}
          machineHostname={machine.hostname}
          onClose={() => setControlAction(null)}
        />
      )}
      {groupManagerOpen && (
        <MachineGroupsModal
          machineId={machine.id}
          machineHostname={machine.hostname}
          groupAccess={groupAccess}
          onClose={() => setGroupManagerOpen(false)}
        />
      )}
    </AppShell>
  );
}

function MachineGroupsModal({
  machineId,
  machineHostname,
  groupAccess,
  onClose,
}: {
  machineId: string;
  machineHostname: string;
  groupAccess: MachineGroupAccessView;
  onClose: () => void;
}) {
  const router = useRouter();
  const assignGroups = useServerFn(assignMachineGroupsAction);
  const APPLIED_GROUPS_PAGE_SIZE = 10;
  const initialGroupIds = useMemo(
    () =>
      [...groupAccess.assignedGroups]
        .map((group) => group.id)
        .sort((left, right) => left.localeCompare(right)),
    [groupAccess.assignedGroups],
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState(initialGroupIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const sortedGroups = useMemo(
    () =>
      [...groupAccess.availableGroups].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [groupAccess.availableGroups],
  );

  const selectedGroups = useMemo(
    () =>
      sortedGroups
        .filter((group) => selectedGroupIds.includes(group.id))
        .sort((left, right) =>
          left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
        ),
    [selectedGroupIds, sortedGroups],
  );

  const filteredSelectedGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return selectedGroups;
    }

    return selectedGroups.filter((group) =>
      [group.name, group.description].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [search, selectedGroups]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredSelectedGroups.length / APPLIED_GROUPS_PAGE_SIZE),
  );
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedSelectedGroups = filteredSelectedGroups.slice(
    (safePage - 1) * APPLIED_GROUPS_PAGE_SIZE,
    safePage * APPLIED_GROUPS_PAGE_SIZE,
  );

  const hasChanges = useMemo(() => {
    const current = [...selectedGroupIds].sort((left, right) => left.localeCompare(right));
    if (current.length !== initialGroupIds.length) {
      return true;
    }

    return current.some((groupId, index) => groupId !== initialGroupIds[index]);
  }, [initialGroupIds, selectedGroupIds]);

  const removeGroup = (groupId: string) => {
    setSelectedGroupIds((current) => current.filter((item) => item !== groupId));
  };

  useEffect(() => {
    setPage(1);
  }, [search, selectedGroupIds]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const submit = async () => {
    if (!hasChanges) {
      return;
    }

    setSaving(true);

    try {
      await assignGroups({
        data: {
          machineId,
          groupIds: selectedGroupIds,
        },
      });
      toast.success("Grupos da maquina atualizados com sucesso.");
      onClose();
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel atualizar os grupos da maquina.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ViewportModal onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Grupos da maquina</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione um ou mais grupos para controlar quem pode visualizar e acessar{" "}
            {machineHostname}.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-5">
        <div className="relative">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar grupos aplicados por nome ou descricao"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div aria-hidden="true" />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary"
          >
            <Plus className="size-3.5" /> Adicionar grupo
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="divide-y divide-border">
            {pagedSelectedGroups.map((group) => (
              <li key={group.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {group.description || "Sem descricao."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span>{group.ownerCount} proprietario(s)</span>
                    <span>{group.memberCount} membro(s)</span>
                    <span>{group.machineCount} maquina(s)</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeGroup(group.id)}
                  className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`Remover grupo ${group.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}

            {pagedSelectedGroups.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                {selectedGroups.length === 0
                  ? "Nenhum grupo aplicado. A maquina continua no grupo padrao."
                  : "Nenhum grupo aplicado corresponde a busca."}
              </li>
            )}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
          <span>
            Pagina {safePage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-background/50 px-5 py-4">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          onClick={() => void submit()}
          disabled={saving || !hasChanges}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Aplicando..." : "Aplicar grupos"}
        </button>
      </div>

      {pickerOpen && (
        <MachineGroupPickerModal
          availableGroups={sortedGroups}
          selectedGroupIds={selectedGroupIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(groupIds) => {
            setSelectedGroupIds(groupIds);
            setPickerOpen(false);
          }}
        />
      )}
    </ViewportModal>
  );
}

function MachineGroupPickerModal({
  availableGroups,
  selectedGroupIds,
  onClose,
  onConfirm,
}: {
  availableGroups: MachineGroupAccessView["availableGroups"];
  selectedGroupIds: string[];
  onClose: () => void;
  onConfirm: (groupIds: string[]) => void;
}) {
  const GROUPS_PAGE_SIZE = 10;
  const [draftGroupIds, setDraftGroupIds] = useState(selectedGroupIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return availableGroups;
    }

    return availableGroups.filter((group) =>
      [group.name, group.description].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [availableGroups, search]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / GROUPS_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedGroups = filteredGroups.slice(
    (safePage - 1) * GROUPS_PAGE_SIZE,
    safePage * GROUPS_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleGroup = (groupId: string) => {
    setDraftGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId],
    );
  };

  return (
    <ViewportModal onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Adicionar grupos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Busque e selecione grupos para incluir na maquina.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-5">
        <div className="relative">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar grupos por nome ou descricao"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="max-h-[54vh] divide-y divide-border overflow-y-auto">
            {pagedGroups.map((group) => {
              const active = draftGroupIds.includes(group.id);

              return (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{group.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.description || "Sem descricao."}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{group.ownerCount} proprietario(s)</span>
                        <span>{group.memberCount} membro(s)</span>
                        <span>{group.machineCount} maquina(s)</span>
                      </div>
                    </div>
                    <span
                      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border ${
                        active
                          ? "border-primary/30 bg-primary text-primary-foreground"
                          : "border-border bg-surface text-transparent"
                      }`}
                    >
                      <Check className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}

            {pagedGroups.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum grupo encontrado.
              </li>
            )}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
          <span>
            Pagina {safePage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Proxima
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-background/50 px-5 py-4">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          onClick={() => onConfirm(draftGroupIds)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ok
        </button>
      </div>
    </ViewportModal>
  );
}

function TunnelPresenceButton({ machineId }: { machineId: string }) {
  const loadPresence = useServerFn(getRealtimeTerminalPresenceAction);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastRealtimePresenceAtRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [presence, setPresence] = useState<RealtimeTerminalPresenceView>({
    machineId,
    onlineCount: 0,
    participants: [],
  });

  const refreshPresence = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }

      try {
        const nextPresence = await loadPresence({
          data: {
            machineId,
          },
        });
        setPresence(nextPresence);
        setLoadError("");
      } catch (error) {
        if (!options?.silent) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Nao foi possivel carregar os usuarios online.",
          );
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [loadPresence, machineId],
  );

  useEffect(() => {
    if (!open) {
      setLoading(false);
      return;
    }

    void refreshPresence();

    const eventSource = new EventSource(
      `/api/terminal/presence?machineId=${encodeURIComponent(machineId)}`,
    );
    eventSourceRef.current = eventSource;

    const handlePresence = (event: MessageEvent<string>) => {
      try {
        const nextPresence = JSON.parse(event.data) as RealtimeTerminalPresenceView;
        lastRealtimePresenceAtRef.current = Date.now();
        setPresence(nextPresence);
        setLoadError("");
        setLoading(false);
      } catch {
        setLoadError("Nao foi possivel interpretar a atualizacao dos usuarios online.");
        setLoading(false);
      }
    };

    const handlePresenceError = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { message?: string };
        setLoadError(payload.message ?? "Nao foi possivel carregar os usuarios online.");
      } catch {
        setLoadError("Nao foi possivel carregar os usuarios online.");
      }
      setLoading(false);
    };

    eventSource.onopen = () => {
      lastRealtimePresenceAtRef.current = Date.now();
      setLoadError("");
    };

    eventSource.addEventListener("presence", handlePresence as EventListener);
    eventSource.addEventListener("presence-error", handlePresenceError as EventListener);
    eventSource.onerror = () => {
      setLoading(false);
    };

    return () => {
      eventSource.removeEventListener("presence", handlePresence as EventListener);
      eventSource.removeEventListener("presence-error", handlePresenceError as EventListener);
      eventSource.close();
      if (eventSourceRef.current === eventSource) {
        eventSourceRef.current = null;
      }
    };
  }, [machineId, open, refreshPresence]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const interval = window.setInterval(() => {
      const eventSource = eventSourceRef.current;
      const streamIsOpen = eventSource?.readyState === EventSource.OPEN;
      const realtimeIsFresh = Date.now() - lastRealtimePresenceAtRef.current < 10_000;

      if (streamIsOpen && realtimeIsFresh) {
        return;
      }

      void refreshPresence({ silent: true });
    }, 3_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [open, refreshPresence]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  const onlineLabel = `${presence.onlineCount} Online`;

  return (
    <div ref={containerRef} className="relative w-full lg:w-[142px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
          open
            ? "border-primary/30 bg-primary/10 text-foreground"
            : "border-border bg-surface hover:bg-secondary"
        } h-9 w-full justify-center`}
      >
        <Users className="size-3.5" />
        <span>{onlineLabel}</span>
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-border bg-surface-raised p-2 shadow-2xl">
          <div className="border-b border-border/70 px-2 pb-2">
            <p className="text-xs font-semibold text-foreground">Usuarios com tunel ativo</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{onlineLabel}</p>
          </div>

          <div className="mt-2 space-y-1">
            {loading && presence.participants.length === 0 ? (
              <div className="rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Carregando usuarios...
              </div>
            ) : loadError && presence.participants.length === 0 ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {loadError}
              </div>
            ) : presence.participants.length === 0 ? (
              <div className="rounded-xl px-3 py-2 text-xs text-muted-foreground">
                Nenhum usuario com tunel ativo nesta maquina.
              </div>
            ) : (
              presence.participants.map((participant) => (
                <div
                  key={participant.userId}
                  className="rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {participant.fullName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {participant.email}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {participant.tunnelCount} {participant.tunnelCount === 1 ? "tunel" : "tuneis"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RemoteTerminalLazySection({
  machineId,
  machineStatus,
  templates,
}: {
  machineId: string;
  machineStatus: "online" | "offline" | "warning";
  templates: Array<{
    id: string;
    name: string;
    description: string;
    command: string;
    risk: "low" | "medium" | "high";
  }>;
}) {
  const [enabled, setEnabled] = useState(() => hasPendingTemplateTerminalLaunch(machineId));

  useEffect(() => {
    setEnabled(hasPendingTemplateTerminalLaunch(machineId));
  }, [machineId]);

  if (enabled) {
    return (
      <Suspense
        fallback={
          <Section title="Terminal remoto">
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted-foreground">
              Carregando terminal...
            </div>
          </Section>
        }
      >
        <LazyRemoteTerminal
          machineId={machineId}
          machineStatus={machineStatus}
          templates={templates}
        />
      </Suspense>
    );
  }

  return (
    <Section title="Terminal remoto">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Terminal nao carregado</p>
            <p className="max-w-2xl text-xs text-muted-foreground">
              O terminal e as acoes rapidas so serao carregados quando uma sessao for aberta.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            disabled={machineStatus === "offline"}
            title={machineStatus === "offline" ? "A maquina precisa estar online." : undefined}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlugZap className="size-3.5" /> Conectar terminal
          </button>
        </div>
        {machineStatus === "offline" && (
          <p className="mt-3 text-xs text-warning">
            A maquina precisa estar online para iniciar uma sessao de terminal.
          </p>
        )}
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Telemetry({
  icon: Icon,
  label,
  value,
  pct,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  pct: number;
}) {
  const tone = pct > 80 ? "bg-destructive" : pct > 60 ? "bg-warning" : "bg-primary";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Icon className="size-3" /> {label}
        </span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className={`h-full ${tone} transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ServerInfoModal({
  machine,
  onClose,
  onSaveAgentName,
  onSaveScheduledTaskLimit,
}: {
  machine: MachineView;
  onClose: () => void;
  onSaveAgentName: (agentName: string) => Promise<void>;
  onSaveScheduledTaskLimit: (scheduledTaskLimit: number) => Promise<void>;
}) {
  const [draftAgentName, setDraftAgentName] = useState(machine.agentName);
  const [draftScheduledTaskLimit, setDraftScheduledTaskLimit] = useState(
    String(machine.scheduledTaskLimit),
  );
  const [editingAgentName, setEditingAgentName] = useState(false);
  const [editingScheduledTaskLimit, setEditingScheduledTaskLimit] = useState(false);
  const [savingAgentName, setSavingAgentName] = useState(false);
  const [savingScheduledTaskLimit, setSavingScheduledTaskLimit] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scheduledTaskLimitInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedAgentName = draftAgentName.trim();
  const agentNameChanged = normalizedAgentName !== machine.agentName;
  const canSaveAgentName = agentNameChanged && normalizedAgentName.length > 0 && !savingAgentName;
  const normalizedScheduledTaskLimit = Number(draftScheduledTaskLimit);
  const scheduledTaskLimitChanged = normalizedScheduledTaskLimit !== machine.scheduledTaskLimit;
  const canSaveScheduledTaskLimit =
    machine.canEditScheduledTaskLimit &&
    scheduledTaskLimitChanged &&
    Number.isInteger(normalizedScheduledTaskLimit) &&
    normalizedScheduledTaskLimit >= 1 &&
    normalizedScheduledTaskLimit <= MAX_MACHINE_SCHEDULED_TASK_LIMIT &&
    !savingScheduledTaskLimit;

  useEffect(() => {
    setDraftAgentName(machine.agentName);
    setDraftScheduledTaskLimit(String(machine.scheduledTaskLimit));
    setEditingAgentName(false);
    setEditingScheduledTaskLimit(false);
    setErrorMessage("");
  }, [machine.agentName, machine.scheduledTaskLimit]);

  useEffect(() => {
    if (editingAgentName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingAgentName]);

  useEffect(() => {
    if (editingScheduledTaskLimit) {
      scheduledTaskLimitInputRef.current?.focus();
      scheduledTaskLimitInputRef.current?.select();
    }
  }, [editingScheduledTaskLimit]);

  const stopEditingAgentName = () => {
    setDraftAgentName((current) => current.trim());
    setEditingAgentName(false);
  };

  const stopEditingScheduledTaskLimit = () => {
    setDraftScheduledTaskLimit((current) => current.trim());
    setEditingScheduledTaskLimit(false);
  };

  const saveAgentName = async () => {
    const nextAgentName = draftAgentName.trim();
    if (!nextAgentName) {
      setErrorMessage("Informe o nome do agent.");
      return;
    }
    if (!agentNameChanged) {
      return;
    }

    setSavingAgentName(true);
    setErrorMessage("");

    try {
      await onSaveAgentName(nextAgentName);
      toast.success("Nome do agent atualizado.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel salvar o nome do agent.",
      );
    } finally {
      setSavingAgentName(false);
    }
  };

  const saveScheduledTaskLimit = async () => {
    const nextLimit = Number(draftScheduledTaskLimit);
    if (!Number.isInteger(nextLimit) || nextLimit < 1) {
      setErrorMessage("Informe um numero inteiro maior ou igual a 1.");
      return;
    }
    if (nextLimit > MAX_MACHINE_SCHEDULED_TASK_LIMIT) {
      setErrorMessage(`Informe um numero de no maximo ${MAX_MACHINE_SCHEDULED_TASK_LIMIT}.`);
      return;
    }
    if (!scheduledTaskLimitChanged) {
      return;
    }

    setSavingScheduledTaskLimit(true);
    setErrorMessage("");

    try {
      await onSaveScheduledTaskLimit(nextLimit);
      toast.success("Limite de tarefas agendadas atualizado.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o limite de tarefas agendadas.",
      );
    } finally {
      setSavingScheduledTaskLimit(false);
    }
  };

  return (
    <ViewportModal onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Informacoes do servidor</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Resumo do ultimo inventario recebido para {machine.hostname}.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5">
        <dl className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border text-xs font-mono">
          <Row k="Hostname" v={machine.hostname} />
          <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground">Nome do agent</dt>
            <dd className="min-w-0 text-foreground">
              {editingAgentName ? (
                <input
                  ref={inputRef}
                  value={draftAgentName}
                  onChange={(event) => {
                    setDraftAgentName(event.target.value);
                    setErrorMessage("");
                  }}
                  onBlur={stopEditingAgentName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      stopEditingAgentName();
                    }
                    if (event.key === "Escape") {
                      setDraftAgentName(machine.agentName);
                      setEditingAgentName(false);
                      setErrorMessage("");
                    }
                  }}
                  maxLength={12}
                  className="h-7 w-full rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary sm:w-72 sm:text-right"
                />
              ) : (
                <div className="flex min-w-0 items-center gap-1.5 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingAgentName(true)}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Editar nome do agent"
                    title="Editar nome do agent"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <span className="truncate text-foreground">
                    {normalizedAgentName || "Nao definido"}
                  </span>
                </div>
              )}
              {errorMessage && <p className="mt-2 text-[11px] text-destructive">{errorMessage}</p>}
            </dd>
          </div>
          <div className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <dt className="text-muted-foreground">Execucao de tarefas agendadas</dt>
            <dd className="min-w-0 text-foreground">
              {editingScheduledTaskLimit ? (
                <input
                  ref={scheduledTaskLimitInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={draftScheduledTaskLimit}
                  onChange={(event) => {
                    setDraftScheduledTaskLimit(event.target.value.replace(/\D/g, ""));
                    setErrorMessage("");
                  }}
                  onBlur={stopEditingScheduledTaskLimit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      stopEditingScheduledTaskLimit();
                    }
                    if (event.key === "Escape") {
                      setDraftScheduledTaskLimit(String(machine.scheduledTaskLimit));
                      setEditingScheduledTaskLimit(false);
                      setErrorMessage("");
                    }
                  }}
                  className="h-7 w-full rounded border border-border bg-background px-2 py-1 text-foreground outline-none focus:border-primary sm:w-28 sm:text-right"
                />
              ) : (
                <div className="flex min-w-0 items-center gap-1.5 sm:justify-end">
                  {machine.canEditScheduledTaskLimit && (
                    <button
                      type="button"
                      onClick={() => setEditingScheduledTaskLimit(true)}
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label="Editar execucao de tarefas agendadas"
                      title="Editar execucao de tarefas agendadas"
                    >
                      <Pencil className="size-3" />
                    </button>
                  )}
                  <span className="truncate text-foreground">
                    {machine.scheduledTaskLimit} por vez
                  </span>
                </div>
              )}
            </dd>
          </div>
          <Row k="IP" v={machine.ip} />
          <Row k="Sistema" v={machine.os} />
          <Row k="Distro ID" v={machine.distroId} />
          <Row k="Familia" v={machine.distroFamily} />
          <Row k="Versao distro" v={machine.distroVersion || "-"} />
          <Row k="Kernel" v={machine.kernel} />
          <Row k="Arquitetura" v={machine.arch} />
          <Row k="Local" v={machine.location} />
          <Row k="Uptime" v={machine.uptime} />
          <Row k="Last seen" v={machine.lastSeen} />
        </dl>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-background/50 px-5 py-3">
        <button
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          Fechar
        </button>
        {agentNameChanged && (
          <button
            onClick={() => void saveAgentName()}
            disabled={!canSaveAgentName}
            className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Check className="size-3.5" />
            {savingAgentName ? "Salvando..." : "Salvar"}
          </button>
        )}
        {scheduledTaskLimitChanged && machine.canEditScheduledTaskLimit && (
          <button
            onClick={() => void saveScheduledTaskLimit()}
            disabled={!canSaveScheduledTaskLimit}
            className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Check className="size-3.5" />
            {savingScheduledTaskLimit ? "Salvando..." : "Salvar limite"}
          </button>
        )}
      </div>
    </ViewportModal>
  );
}

function ActiveServicesModal({
  services,
  machineHostname,
  onClose,
}: {
  services: string[];
  machineHostname: string;
  onClose: () => void;
}) {
  const pageSize = 10;
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const filteredServices = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return services;
    }

    return services.filter((service) => service.toLocaleLowerCase("pt-BR").includes(term));
  }, [appliedSearch, services]);
  const totalPages = Math.max(Math.ceil(filteredServices.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages - 1);
  const pageServices = filteredServices.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  useEffect(() => {
    setPage(0);
  }, [services]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(0);
  };

  return (
    <ViewportModal onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Servicos ativos</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Servicos identificados no ultimo inventario recebido para {machineHostname}.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5">
        <div className="relative mb-4">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                applySearch();
              }
            }}
            placeholder="Buscar servico ativo"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={applySearch}
            className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Buscar servico"
            title="Buscar servico"
          >
            <Search className="size-4" />
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border text-xs font-mono">
          {pageServices.map((service) => (
            <div key={service} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="truncate text-foreground">{service}</span>
              <ServiceTag name={service} />
            </div>
          ))}
          {pageServices.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              Nenhum servico ativo encontrado.
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/50 px-5 py-3">
        <span className="text-xs text-muted-foreground">
          Pagina {currentPage + 1} de {totalPages} · {filteredServices.length} servicos
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 0))}
            disabled={currentPage === 0}
            className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
            disabled={currentPage >= totalPages - 1}
            className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Proxima
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Fechar
          </button>
        </div>
      </div>
    </ViewportModal>
  );
}

function MachineControlModal({
  action,
  machineId,
  machineHostname,
  onClose,
}: {
  action: MachineControlAction;
  machineId: string;
  machineHostname: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const queueControl = useServerFn(queueMachineControlAction);
  const getExecution = useServerFn(getExecutionDetailData);
  const [state, setState] = useState<"idle" | "queued" | "running" | "done" | "error">("idle");
  const [execution, setExecution] = useState<ExecutionDetailView | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!execution?.id || !["queued", "dispatched", "running"].includes(execution.status)) {
      return;
    }

    const interval = setInterval(() => {
      void getExecution({ data: { executionId: execution.id } }).then((next) => {
        if (!next) {
          return;
        }

        setExecution(next);
        if (next.status === "success") {
          setState("done");
          void router.invalidate();
          clearInterval(interval);
          return;
        }
        if (next.status === "failed" || next.status === "cancelled") {
          setState("error");
          void router.invalidate();
          clearInterval(interval);
          return;
        }

        setState(next.status === "queued" ? "queued" : "running");
      });
    }, 2_000);

    return () => clearInterval(interval);
  }, [execution?.id, execution?.status, getExecution, router]);

  const run = async () => {
    setState("queued");
    setErrorMessage("");

    try {
      const created = await queueControl({ data: { machineId, action } });
      setExecution(created);
      void router.invalidate();
    } catch (error) {
      setState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Nao foi possivel solicitar a operacao.",
      );
    }
  };

  const isRestart = action === "restart";
  const title = isRestart ? "Reiniciar maquina" : "Desligar maquina";
  const impactLabel = isRestart ? "interrupcao breve" : "indisponibilidade total";
  const idleMessage = isRestart
    ? "[INFO] O reinicio sera disparado pelo agent com fallback generico para diferentes Linux."
    : "[INFO] O desligamento sera disparado pelo agent com fallback generico para diferentes Linux.";
  const queuedMessage = isRestart
    ? `[INFO] Operacao enfileirada para ${machineHostname}.\n[INFO] Aguardando o agent consultar a fila.`
    : `[INFO] Desligamento enfileirado para ${machineHostname}.\n[INFO] Aguardando o agent consultar a fila.`;
  const runningMessage = isRestart
    ? "[INFO] Comando despachado ao agent.\n[INFO] Aguardando confirmacao do agendamento do reinicio."
    : "[INFO] Comando despachado ao agent.\n[INFO] Aguardando confirmacao do agendamento do desligamento.";
  const successMessage = isRestart
    ? "[SUCCESS] Reinicio solicitado. A maquina pode ficar offline por alguns instantes."
    : "[SUCCESS] Desligamento solicitado. A maquina deve ficar offline em instantes.";
  const failureMessage = isRestart
    ? "[FAIL] Nao foi possivel concluir a solicitacao do reinicio."
    : "[FAIL] Nao foi possivel concluir a solicitacao do desligamento.";
  const commandOutput = execution?.output || execution?.errorOutput || "";
  const showScan = state === "queued" || state === "running";

  return (
    <ViewportModal onClose={onClose} maxWidthClass="max-w-xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-3">
        <div className="min-w-0 flex items-center gap-2 font-mono text-xs">
          <span
            className={`size-2 rounded-full ${
              state === "running" || state === "queued"
                ? "animate-pulse-dot bg-warning"
                : state === "done"
                  ? "bg-success"
                  : state === "error"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
            }`}
          />
          <span className="text-muted-foreground">OPERACAO:</span>
          <span className="truncate text-foreground">{execution?.id ?? title}</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            O agent agenda o reinicio com um pequeno atraso para conseguir confirmar a execucao
            antes de a maquina sair do ar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 text-[10px] font-mono sm:grid-cols-3">
          <Meta label="Maquina" value={machineHostname} />
          <Meta label="Acao" value={action} />
          <Meta label="Impacto" value={impactLabel} tone={isRestart ? "warning" : "destructive"} />
        </div>

        {state === "idle" && (
          <div className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {isRestart
                ? "Esta operacao derruba temporariamente shell, servicos e sessoes ativas da maquina."
                : "Esta operacao encerra shell, servicos e a propria maquina ate uma nova inicializacao manual ou automatica."}
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="relative h-44 overflow-y-auto rounded border border-border bg-background p-4 font-mono text-[11px]">
          {commandOutput ? (
            <pre className="whitespace-pre-wrap leading-relaxed">{commandOutput}</pre>
          ) : (
            <pre className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {state === "idle"
                ? idleMessage
                : state === "queued"
                  ? queuedMessage
                  : state === "running"
                    ? runningMessage
                    : state === "done"
                      ? successMessage
                      : failureMessage}
            </pre>
          )}
          {showScan && (
            <div className="pointer-events-none absolute inset-0 h-20 w-full animate-scan bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-background/50 px-5 py-3">
        <button
          onClick={onClose}
          className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          {state === "done" || state === "error" ? "Fechar" : "Cancelar"}
        </button>
        {state === "idle" && (
          <button
            onClick={() => void run()}
            className={`rounded px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors ${
              isRestart
                ? "bg-primary hover:bg-primary/90"
                : "bg-destructive hover:bg-destructive/90"
            }`}
          >
            {isRestart ? "Confirmar reinicio" : "Confirmar desligamento"}
          </button>
        )}
      </div>
    </ViewportModal>
  );
}

function ViewportModal({
  children,
  onClose,
  maxWidthClass,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidthClass: string;
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in sm:p-6"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Meta({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "destructive" | "warning" | "success";
}) {
  const cls = {
    default: "text-foreground",
    destructive: "text-destructive",
    warning: "text-warning",
    success: "text-success",
  }[tone];

  return (
    <div className="space-y-1">
      <p className="uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cls}>{value}</p>
    </div>
  );
}
