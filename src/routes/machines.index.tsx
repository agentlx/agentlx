import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "react-dom";
import { Copy, Plus, Search, Trash2, X } from "lucide-react";
import { AppShell, Crumb, StatusDot, StatusLabel } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import type {
  MachineEnrollmentCommandView,
  PendingMachineEnrollmentCreateView,
} from "@/lib/agentlx";
import { APP_NAME } from "@/lib/brand";
import { isDocumentVisible } from "@/lib/browser-visibility";
import {
  createMachineEnrollmentCommandAction,
  createPendingMachineEnrollmentAction,
  getMachinesData,
  getMachinesPageAction,
  queueMachineAgentUninstallAction,
} from "@/lib/panel-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/machines/")({
  loader: async () => {
    await requireRouteScreen("machines");
    return getMachinesData();
  },
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Listagem completa das maquinas Linux com agent instalado." },
    ],
  }),
  component: MachinesList,
});

const PAGE_SIZE = 10;

function formatRemainingTime(expiresAt: string, nowTimestamp: number) {
  const remainingMs = new Date(expiresAt).getTime() - nowTimestamp;
  if (remainingMs <= 0) {
    return "menos de 1 min";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function MachinesList() {
  const loaderData = Route.useLoaderData();
  const createMachineEnrollmentCommand = useServerFn(createMachineEnrollmentCommandAction);
  const createPendingMachineEnrollment = useServerFn(createPendingMachineEnrollmentAction);
  const loadMachinesPage = useServerFn(getMachinesPageAction);
  const queueMachineAgentUninstall = useServerFn(queueMachineAgentUninstallAction);
  const [machinesData, setMachinesData] = useState(loaderData);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline" | "warning">("all");
  const [showAddMachineModal, setShowAddMachineModal] = useState(false);
  const [installLocation, setInstallLocation] = useState("");
  const [installAgentName, setInstallAgentName] = useState("");
  const [installDir, setInstallDir] = useState("/opt/agentlx");
  const [installResult, setInstallResult] = useState<MachineEnrollmentCommandView | null>(null);
  const [creatingInstallCommand, setCreatingInstallCommand] = useState(false);
  const [finalizingInstallPending, setFinalizingInstallPending] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<(typeof loaderData.machines)[number] | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const [hiddenMachineIds, setHiddenMachineIds] = useState<string[]>([]);
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [page, setPage] = useState(1);
  const [loadingMoreMachines, setLoadingMoreMachines] = useState(false);
  const skippedInitialRefreshRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await loadMachinesPage({
          data: { cursor: null, search: appliedSearch, status: filter },
        });
        if (!cancelled) {
          setMachinesData(next);
          setPage(1);
        }
      } catch {
        // Ignore transient polling errors and preserve the last good state.
      }
    };

    if (skippedInitialRefreshRef.current) {
      void refresh();
    } else {
      skippedInitialRefreshRef.current = true;
    }

    const intervalId = window.setInterval(() => {
      if (!isDocumentVisible()) {
        return;
      }
      void refresh();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [appliedSearch, filter, loadMachinesPage]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
  };

  const visibleMachines = useMemo(
    () =>
      machinesData.machines
        .filter((machine) => !hiddenMachineIds.includes(machine.id))
        .sort((left, right) => {
          const hostnameComparison = left.hostname.localeCompare(right.hostname, "pt-BR", {
            sensitivity: "base",
          });

          if (hostnameComparison !== 0) {
            return hostnameComparison;
          }

          return left.agentName.localeCompare(right.agentName, "pt-BR", { sensitivity: "base" });
        }),
    [hiddenMachineIds, machinesData.machines],
  );

  const filteredMachines = useMemo(() => {
    const normalized = appliedSearch.trim().toLocaleLowerCase("pt-BR");

    return visibleMachines.filter((machine) => {
      if (filter !== "all" && machine.status !== filter) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return (
        machine.hostname.toLocaleLowerCase("pt-BR").includes(normalized) ||
        machine.agentName.toLocaleLowerCase("pt-BR").includes(normalized) ||
        machine.ip.includes(normalized) ||
        machine.os.toLocaleLowerCase("pt-BR").includes(normalized) ||
        machine.distroId.toLocaleLowerCase("pt-BR").includes(normalized) ||
        machine.distroFamily.toLocaleLowerCase("pt-BR").includes(normalized)
      );
    });
  }, [appliedSearch, filter, visibleMachines]);

  const visiblePendingEnrollments = useMemo(() => {
    const normalized = appliedSearch.trim().toLocaleLowerCase("pt-BR");

    return machinesData.pendingEnrollments
      .filter((entry) => {
        if (new Date(entry.expiresAt).getTime() <= nowTimestamp) {
          return false;
        }

        if (filter !== "all") {
          return false;
        }

        if (!normalized) {
          return true;
        }

        return (
          entry.token.toLocaleLowerCase("pt-BR").includes(normalized) ||
          entry.location.toLocaleLowerCase("pt-BR").includes(normalized) ||
          entry.agentName.toLocaleLowerCase("pt-BR").includes(normalized) ||
          entry.installDir.toLocaleLowerCase("pt-BR").includes(normalized)
        );
      })
      .sort((left, right) => {
        const agentComparison = left.agentName.localeCompare(right.agentName, "pt-BR", {
          sensitivity: "base",
        });

        if (agentComparison !== 0) {
          return agentComparison;
        }

        return left.location.localeCompare(right.location, "pt-BR", { sensitivity: "base" });
      });
  }, [appliedSearch, filter, machinesData.pendingEnrollments, nowTimestamp]);

  const filteredRecords = useMemo(
    () => [
      ...visiblePendingEnrollments.map((entry) => ({
        type: "pending" as const,
        entry,
      })),
      ...filteredMachines.map((machine) => ({
        type: "machine" as const,
        machine,
      })),
    ],
    [filteredMachines, visiblePendingEnrollments],
  );
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pagedPendingEnrollments = pagedRecords.flatMap((record) =>
    record.type === "pending" ? [record.entry] : [],
  );
  const pagedMachines = pagedRecords.flatMap((record) =>
    record.type === "machine" ? [record.machine] : [],
  );

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, filter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const loadMoreMachinesFromCursor = async () => {
    const cursor = machinesData.machinesPageInfo.nextCursor;
    if (!cursor || loadingMoreMachines) {
      return;
    }

    setLoadingMoreMachines(true);
    try {
      const next = await loadMachinesPage({
        data: { cursor, search: appliedSearch, status: filter },
      });
      setMachinesData((current) => ({
        ...next,
        pendingEnrollments: current.pendingEnrollments,
        machines: [
          ...current.machines,
          ...next.machines.filter(
            (machine) =>
              !current.machines.some((currentMachine) => currentMachine.id === machine.id),
          ),
        ],
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel carregar mais maquinas.",
      );
    } finally {
      setLoadingMoreMachines(false);
    }
  };

  const requestRemoval = async () => {
    if (!removeTarget) {
      return;
    }

    setRemoving(true);

    try {
      await queueMachineAgentUninstall({
        data: {
          machineId: removeTarget.id,
        },
      });

      setHiddenMachineIds((current) => [...current, removeTarget.id]);
      toast.success(
        `Exclusao solicitada para ${removeTarget.hostname}. A maquina sera removida do painel em instantes.`,
      );
      setRemoveTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nao foi possivel solicitar a desinstalacao do agent.",
      );
    } finally {
      setRemoving(false);
    }
  };

  const openAddMachineModal = () => {
    setInstallResult(null);
    setCopiedCommand(false);
    setShowAddMachineModal(true);
  };

  const closeAddMachineModal = () => {
    if (creatingInstallCommand || finalizingInstallPending) {
      return;
    }
    setShowAddMachineModal(false);
  };

  const generateInstallCommand = async () => {
    const agentName = installAgentName.trim();
    if (!agentName) {
      toast.error("Informe o nome do agent.");
      return;
    }

    setCreatingInstallCommand(true);
    setCopiedCommand(false);

    try {
      const result = await createMachineEnrollmentCommand({
        data: {
          location: installLocation,
          agentName,
          installDir,
        },
      });
      setInstallResult(result);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel gerar o comando de instalacao.",
      );
    } finally {
      setCreatingInstallCommand(false);
    }
  };

  const createPendingEnrollment = async () => {
    if (!installResult) {
      return;
    }

    const agentName = installAgentName.trim();
    if (!agentName) {
      toast.error("Informe o nome do agent.");
      return;
    }

    setFinalizingInstallPending(true);

    try {
      const result = await createPendingMachineEnrollment({
        data: {
          location: installLocation,
          agentName,
          installDir,
          enrollmentToken: installResult.enrollmentToken,
        },
      });

      applyCreatedPendingEnrollment(result);
      toast.success(
        "Instalacao pendente criada. O token fica visivel por 10 minutos ou ate a maquina concluir o registro.",
      );
      setShowAddMachineModal(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel criar a instalacao pendente.",
      );
    } finally {
      setFinalizingInstallPending(false);
    }
  };

  const applyCreatedPendingEnrollment = (result: PendingMachineEnrollmentCreateView) => {
    setMachinesData((current) => ({
      ...current,
      pendingEnrollments: [
        {
          id: result.enrollmentId,
          token: result.enrollmentToken,
          location: result.location,
          agentName: result.agentName,
          installDir: result.installDir,
          createdAt: result.createdAt,
          expiresAt: result.expiresAt,
          command: result.command,
        },
        ...current.pendingEnrollments.filter((entry) => entry.id !== result.enrollmentId),
      ],
    }));
  };

  const copyInstallCommand = async () => {
    if (!installResult) {
      return;
    }

    try {
      await navigator.clipboard.writeText(installResult.command);
      setCopiedCommand(true);
      toast.success("Comando de instalacao copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o comando automaticamente.");
    }
  };

  const copyPendingInstallCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Comando de instalacao copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o comando automaticamente.");
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "machines" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Maquinas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredMachines.length} de {visibleMachines.length} maquinas ativas
              {visiblePendingEnrollments.length > 0
                ? ` · ${visiblePendingEnrollments.length} pendente${visiblePendingEnrollments.length > 1 ? "s" : ""}`
                : ""}
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
                placeholder="Filtrar por host, IP, SO ou servico..."
                className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applySearch}
                aria-label="Buscar maquinas"
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={openAddMachineModal}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Adicionar maquina
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 text-xs font-mono">
          {(["all", "online", "warning", "offline"] as const).map((item) => (
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
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[860px] w-full border-collapse text-left">
              <thead className="border-b border-border bg-background/40">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Hostname</th>
                  <th className="px-4 py-3">Nome do agent</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Sistema</th>
                  <th className="px-4 py-3 text-right">Last seen</th>
                  <th className="px-4 py-3 text-right">Acao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-mono">
                {pagedPendingEnrollments.map((entry) => (
                  <tr key={entry.id} className="bg-warning/5">
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
                        <StatusDot status="warning" />
                        Pendente
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-bold text-foreground">Aguardando registro</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Criada em {new Date(entry.createdAt).toLocaleString("pt-BR")}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-semibold text-foreground">{entry.agentName}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      Token
                      <div className="mt-1 break-all text-foreground">{entry.token}</div>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{entry.location || "Sem local definido"}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                        {entry.installDir}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-warning">
                      Expira em {formatRemainingTime(entry.expiresAt, nowTimestamp)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void copyPendingInstallCommand(entry.command)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                        >
                          <Copy className="size-3.5" /> Copiar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedMachines.map((machine) => (
                  <tr key={machine.id} className="group transition-colors hover:bg-white/[0.02]">
                    <td className="px-4 py-4">
                      <Link
                        to="/machines/$machineId"
                        params={{ machineId: machine.id }}
                        className="flex items-center gap-2"
                      >
                        <StatusDot status={machine.status} />
                        <StatusLabel status={machine.status} />
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        to="/machines/$machineId"
                        params={{ machineId: machine.id }}
                        className="font-bold text-foreground transition-colors hover:text-primary"
                      >
                        {machine.hostname}
                      </Link>
                    </td>
                    <td className="px-4 py-4 font-semibold text-foreground">{machine.agentName}</td>
                    <td className="px-4 py-4 text-muted-foreground">{machine.ip}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      <div>{machine.os}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                        ID {machine.distroId}
                        {machine.distroFamily !== machine.distroId
                          ? ` · familia ${machine.distroFamily}`
                          : ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-muted-foreground">
                      {machine.lastSeen}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        {machine.canDelete && (
                          <button
                            onClick={() => setRemoveTarget(machine)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" /> Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pagedRecords.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma maquina encontrada com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {pagedPendingEnrollments.map((entry) => (
              <div key={entry.id} className="space-y-3 bg-warning/5 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Aguardando registro</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      Agent: {entry.agentName}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      Token: {entry.token}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning">
                    <StatusDot status="warning" />
                    Pendente
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>{entry.location || "Sem local definido"}</p>
                  <p className="mt-1 font-mono text-[11px]">{entry.installDir}</p>
                  <p className="mt-1 text-warning">
                    Expira em {formatRemainingTime(entry.expiresAt, nowTimestamp)}
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => void copyPendingInstallCommand(entry.command)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    <Copy className="size-3.5" /> Copiar
                  </button>
                </div>
              </div>
            ))}
            {pagedMachines.map((machine) => (
              <div
                key={machine.id}
                className="space-y-3 px-4 py-4 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/machines/$machineId"
                      params={{ machineId: machine.id }}
                      className="truncate text-sm font-semibold transition-colors hover:text-primary"
                    >
                      {machine.hostname}
                    </Link>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      Agent: {machine.agentName}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {machine.ip} · {machine.lastSeen}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot status={machine.status} />
                    <StatusLabel status={machine.status} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>{machine.os}</p>
                  <p className="mt-1 font-mono text-[11px]">
                    ID {machine.distroId}
                    {machine.distroFamily !== machine.distroId
                      ? ` · familia ${machine.distroFamily}`
                      : ""}
                  </p>
                </div>
                {machine.canDelete && (
                  <div className="pt-1">
                    <button
                      onClick={() => setRemoveTarget(machine)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" /> Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pagedRecords.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma maquina encontrada com os filtros atuais.
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
              className="rounded-2xl border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="rounded-2xl border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Proxima
            </button>
            {machinesData.machinesPageInfo.hasMore && (
              <button
                onClick={() => void loadMoreMachinesFromCursor()}
                disabled={loadingMoreMachines}
                className="rounded-2xl border border-border px-3 py-1.5 transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {loadingMoreMachines ? "Carregando..." : "Carregar mais"}
              </button>
            )}
          </div>
        </div>

        {showAddMachineModal && (
          <AddMachineModal
            location={installLocation}
            agentName={installAgentName}
            installDir={installDir}
            result={installResult}
            copiedCommand={copiedCommand}
            generating={creatingInstallCommand}
            creating={finalizingInstallPending}
            onLocationChange={(value) => {
              setInstallLocation(value);
              setInstallResult(null);
              setCopiedCommand(false);
            }}
            onAgentNameChange={(value) => {
              setInstallAgentName(value);
              setInstallResult(null);
              setCopiedCommand(false);
            }}
            onInstallDirChange={(value) => {
              setInstallDir(value);
              setInstallResult(null);
              setCopiedCommand(false);
            }}
            onClose={closeAddMachineModal}
            onGenerateCode={() => void generateInstallCommand()}
            onCreate={() => void createPendingEnrollment()}
            onCopy={() => void copyInstallCommand()}
          />
        )}

        {removeTarget && (
          <RemoveMachineModal
            machine={removeTarget}
            removing={removing}
            onClose={() => (removing ? null : setRemoveTarget(null))}
            onConfirm={() => void requestRemoval()}
          />
        )}
      </div>
    </AppShell>
  );
}

function AddMachineModal({
  location,
  agentName,
  installDir,
  result,
  copiedCommand,
  generating,
  creating,
  onLocationChange,
  onAgentNameChange,
  onInstallDirChange,
  onClose,
  onGenerateCode,
  onCreate,
  onCopy,
}: {
  location: string;
  agentName: string;
  installDir: string;
  result: MachineEnrollmentCommandView | null;
  copiedCommand: boolean;
  generating: boolean;
  creating: boolean;
  onLocationChange: (value: string) => void;
  onAgentNameChange: (value: string) => void;
  onInstallDirChange: (value: string) => void;
  onClose: () => void;
  onGenerateCode: () => void;
  onCreate: () => void;
  onCopy: () => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const hasAgentName = agentName.trim().length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Adicionar maquina</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere um comando unico de instalacao do agent com token de uso exclusivo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Local</span>
              <input
                value={location}
                onChange={(event) => onLocationChange(event.target.value)}
                placeholder="Ex.: DC-SP-01"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Nome do agent *</span>
              <input
                value={agentName}
                onChange={(event) => onAgentNameChange(event.target.value)}
                placeholder="Ex.: srv-kali-prod"
                required
                aria-required="true"
                maxLength={12}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm">
            <span className="text-muted-foreground">Caminho de instalacao</span>
            <input
              value={installDir}
              onChange={(event) => onInstallDirChange(event.target.value)}
              placeholder="/opt/agentlx"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-primary"
            />
          </label>

          {result && (
            <div className="space-y-3 rounded-2xl border border-border bg-background/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Token unico gerado para a instalacao pendente.</p>
                  <p>Instalador servido por {result.installScriptUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  <Copy className="size-4" />
                  {copiedCommand ? "Copiado" : "Copiar comando"}
                </button>
              </div>

              <textarea
                readOnly
                value={result.command}
                rows={7}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-3 font-mono text-xs outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            disabled={generating || creating}
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Fechar
          </button>
          {result && (
            <button
              onClick={onGenerateCode}
              disabled={generating || creating || !hasAgentName}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Plus className="size-4" />
              {generating ? "Gerando..." : "Gerar novo codigo"}
            </button>
          )}
          {!result && (
            <button
              onClick={onGenerateCode}
              disabled={generating || creating || !hasAgentName}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Plus className="size-4" />
              {generating ? "Gerando..." : "Gerar codigo"}
            </button>
          )}
          {result && (
            <button
              onClick={onCreate}
              disabled={generating || creating || !hasAgentName}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Plus className="size-4" />
              {creating ? "Criando..." : "Criar"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RemoveMachineModal({
  machine,
  removing,
  onClose,
  onConfirm,
}: {
  machine: {
    hostname: string;
    ip: string;
    os: string;
  };
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Excluir maquina</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium">
              Confirma a exclusao da maquina {machine.hostname}?
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              O agent sera desinstalado remotamente, com remocao de servico, arquivos locais e
              cadastro no painel quando a operacao for confirmada pelo agent.
            </p>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{machine.ip}</p>
            <p>{machine.os}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            disabled={removing}
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Fechar
          </button>
          <button
            onClick={onConfirm}
            disabled={removing}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
          >
            <Trash2 className="size-4" />
            {removing ? "Excluindo..." : "Excluir maquina"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
