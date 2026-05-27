import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppShell, Crumb } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import type {
  MachinePoliciesPageView,
  MachinePolicyMfaMode,
  MachinePolicyView,
  UpdateMachinePolicyInput,
} from "@/lib/agentlx";
import { APP_NAME } from "@/lib/brand";
import { getMachinePoliciesData, updateMachinePolicyAction } from "@/lib/panel-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/policies")({
  loader: async () => {
    await requireRouteScreen("policies");
    return getMachinePoliciesData();
  },
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Politicas Enterprise aplicadas a maquinas e grupos." },
    ],
  }),
  component: PoliciesPage,
});

const PAGE_SIZE = 10;
const SELECTOR_PAGE_SIZE = 10;

function PoliciesPage() {
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const updatePolicy = useServerFn(updateMachinePolicyAction);
  const [data, setData] = useState<MachinePoliciesPageView>(loaderData);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingPolicy, setEditingPolicy] = useState<MachinePolicyView | null>(null);

  useEffect(() => {
    setData(loaderData);
  }, [loaderData]);

  const sortedPolicies = useMemo(
    () =>
      [...data.policies].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [data.policies],
  );

  const filteredPolicies = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return sortedPolicies;
    }
    return sortedPolicies.filter((policy) =>
      [policy.name, policy.description, policy.key]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [appliedSearch, sortedPolicies]);

  const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedPolicies = filteredPolicies.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
  };

  const savePolicy = async (input: UpdateMachinePolicyInput) => {
    try {
      const next = await updatePolicy({ data: input });
      setData(next);
      setEditingPolicy(null);
      toast.success("Politica atualizada.");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar a politica.");
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "policies" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Politicas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredPolicies.length} de {data.policies.length} politicas Enterprise.
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
              placeholder="Buscar por politica ou descricao"
              className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={applySearch}
              aria-label="Buscar politicas"
              className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_140px] border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
            <div>Politica</div>
            <div>Status</div>
            <div>Aplicacao</div>
            <div className="text-right">Acao</div>
          </div>
          <ul className="divide-y divide-border">
            {pagedPolicies.map((policy) => (
              <li
                key={policy.key}
                className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_140px] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{policy.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      policy.enabled
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {policy.enabled ? "Habilitado" : "Desabilitado"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {policy.targets.length > 0
                    ? `${policy.targets.length} alvo${policy.targets.length > 1 ? "s" : ""}`
                    : "Nenhum alvo selecionado"}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingPolicy(policy)}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-3.5" /> Editar
                  </button>
                </div>
              </li>
            ))}
            {pagedPolicies.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma politica encontrada.
              </li>
            )}
          </ul>
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
          </div>
        </div>
      </div>

      {editingPolicy && (
        <PolicyEditorModal
          policy={editingPolicy}
          data={data}
          onClose={() => setEditingPolicy(null)}
          onSave={(input) => void savePolicy(input)}
        />
      )}
    </AppShell>
  );
}

function PolicyEditorModal({
  policy,
  data,
  onClose,
  onSave,
}: {
  policy: MachinePolicyView;
  data: MachinePoliciesPageView;
  onClose: () => void;
  onSave: (input: UpdateMachinePolicyInput) => void;
}) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [mfaMode, setMfaMode] = useState<MachinePolicyMfaMode>(policy.mfaMode);
  const [userScope, setUserScope] = useState(policy.userScope.scope);
  const [pickerMode, setPickerMode] = useState<"machines" | "groups" | "users" | null>(null);
  const [targetMachineIds, setTargetMachineIds] = useState(
    policy.targets.filter((target) => target.type === "machine").map((target) => target.id),
  );
  const [targetGroupIds, setTargetGroupIds] = useState(
    policy.targets.filter((target) => target.type === "group").map((target) => target.id),
  );
  const [selectedUserIds, setSelectedUserIds] = useState(
    policy.userScope.users.map((user) => user.id),
  );

  const machineOptions = useMemo(
    () =>
      data.machines
        .map((machine) => ({
          id: machine.id,
          name: machine.hostname,
          description: `${machine.agentName} - ${machine.ip}`,
          meta: machine.status,
        }))
        .sort(sortSelectableItems),
    [data.machines],
  );

  const groupOptions = useMemo(
    () =>
      data.groups
        .map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description || "Sem descricao.",
          meta: `${group.machineCount} maquina${group.machineCount === 1 ? "" : "s"}`,
        }))
        .sort(sortSelectableItems),
    [data.groups],
  );

  const userOptions = useMemo(
    () =>
      data.users
        .map((user) => ({
          id: user.id,
          name: user.fullName,
          description: user.email,
          meta: user.disabled ? "Desativado" : user.role === "admin" ? "Administrador" : "Operador",
        }))
        .sort(sortSelectableItems),
    [data.users],
  );

  const selectedMachines = selectedItemsFromIds(targetMachineIds, machineOptions, policy.targets);
  const selectedGroups = selectedItemsFromIds(targetGroupIds, groupOptions, policy.targets);
  const selectedUsers = selectedItemsFromIds(
    selectedUserIds,
    userOptions,
    policy.userScope.users.map((user) => ({
      id: user.id,
      name: user.fullName,
      description: user.email,
    })),
  );

  const submit = () => {
    onSave({
      policyKey: policy.key,
      enabled,
      targetMachineIds,
      targetGroupIds,
      mfaMode,
      userScope: policy.key === "require_mfa" ? "all" : userScope,
      selectedUserIds: policy.key === "require_mfa" ? [] : selectedUserIds,
    });
  };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-5xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{policy.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-[72vh] space-y-5 overflow-y-auto p-5">
        <section className="grid gap-4 rounded-md border border-border bg-background/50 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-medium">Status da politica</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Politicas desabilitadas ficam cadastradas, mas nao sao aplicadas.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
            <button
              type="button"
              onClick={() => setEnabled((current) => !current)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                enabled
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Check className="size-4" />
              {enabled ? "Habilitado" : "Desabilitado"}
            </button>

            {policy.key === "require_mfa" ? (
              <select
                value={mfaMode}
                onChange={(event) => setMfaMode(event.target.value as MachinePolicyMfaMode)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">Tudo</option>
                <option value="machine_access">Apenas acessar maquina</option>
                <option value="terminal">Apenas conectar terminal remoto</option>
              </select>
            ) : (
              <select
                value={userScope}
                onChange={(event) => setUserScope(event.target.value as "all" | "selected")}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="all">Todos</option>
                <option value="selected">Selecionar usuarios</option>
              </select>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <PolicySelectionPanel
            title="Maquinas"
            description="Maquinas individuais que recebem esta politica."
            actionLabel="Selecionar maquinas"
            selectedItems={selectedMachines}
            emptyLabel="Nenhuma maquina adicionada."
            onOpen={() => setPickerMode("machines")}
          />
          <PolicySelectionPanel
            title="Grupos"
            description="Grupos cujas maquinas recebem esta politica."
            actionLabel="Selecionar grupos"
            selectedItems={selectedGroups}
            emptyLabel="Nenhum grupo adicionado."
            onOpen={() => setPickerMode("groups")}
          />
        </div>

        {policy.key !== "require_mfa" ? (
          <PolicySelectionPanel
            title="Usuarios"
            description={
              userScope === "selected"
                ? "Somente os usuarios selecionados sao afetados."
                : "A politica afeta todos os usuarios."
            }
            actionLabel="Selecionar usuarios"
            selectedItems={userScope === "selected" ? selectedUsers : []}
            emptyLabel={
              userScope === "selected"
                ? "Nenhum usuario adicionado."
                : "Todos os usuarios serao afetados."
            }
            disabled={userScope !== "selected"}
            onOpen={() => setPickerMode("users")}
          />
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t border-border bg-background/50 px-5 py-4">
        <button
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Salvar politica
        </button>
      </div>

      {pickerMode === "machines" && (
        <PolicyItemPickerModal
          title="Selecionar maquinas"
          description="Escolha as maquinas individuais que receberao esta politica."
          items={machineOptions}
          selectedIds={targetMachineIds}
          onClose={() => setPickerMode(null)}
          onApply={(ids) => {
            setTargetMachineIds(ids);
            setPickerMode(null);
          }}
        />
      )}

      {pickerMode === "groups" && (
        <PolicyItemPickerModal
          title="Selecionar grupos"
          description="Escolha os grupos cujas maquinas receberao esta politica."
          items={groupOptions}
          selectedIds={targetGroupIds}
          onClose={() => setPickerMode(null)}
          onApply={(ids) => {
            setTargetGroupIds(ids);
            setPickerMode(null);
          }}
        />
      )}

      {pickerMode === "users" && (
        <PolicyItemPickerModal
          title="Selecionar usuarios"
          description="Escolha os usuarios afetados por esta politica."
          items={userOptions}
          selectedIds={selectedUserIds}
          onClose={() => setPickerMode(null)}
          onApply={(ids) => {
            setSelectedUserIds(ids);
            setPickerMode(null);
          }}
        />
      )}
    </ModalShell>
  );
}

type SelectableItem = {
  id: string;
  name: string;
  description: string;
  meta?: string;
};

function sortSelectableItems(left: SelectableItem, right: SelectableItem) {
  const nameComparison = left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return left.description.localeCompare(right.description, "pt-BR", { sensitivity: "base" });
}

function selectedItemsFromIds(
  selectedIds: string[],
  options: SelectableItem[],
  fallbackItems: Array<{ id: string; name: string; description?: string }>,
) {
  const optionById = new Map(options.map((item) => [item.id, item]));
  const fallbackById = new Map(fallbackItems.map((item) => [item.id, item]));

  return selectedIds
    .map((id) => {
      const option = optionById.get(id);
      if (option) {
        return option;
      }
      const fallback = fallbackById.get(id);
      return fallback
        ? {
            id,
            name: fallback.name,
            description: fallback.description ?? "Item selecionado.",
          }
        : null;
    })
    .filter((item): item is SelectableItem => Boolean(item))
    .sort(sortSelectableItems);
}

function buildIdSignature(ids: string[]) {
  return [...ids].sort((left, right) => left.localeCompare(right)).join("|");
}

function PolicySelectionPanel({
  title,
  description,
  actionLabel,
  selectedItems,
  emptyLabel,
  disabled = false,
  onOpen,
}: {
  title: string;
  description: string;
  actionLabel: string;
  selectedItems: SelectableItem[];
  emptyLabel: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="rounded-md border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="size-3.5" /> {actionLabel}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {selectedItems.map((item) => (
          <span
            key={item.id}
            className="max-w-full rounded-sm border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground"
            title={`${item.name} - ${item.description}`}
          >
            {item.name}
          </span>
        ))}
        {selectedItems.length === 0 && (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
    </section>
  );
}

function PolicyItemPickerModal({
  title,
  description,
  items,
  selectedIds,
  onClose,
  onApply,
}: {
  title: string;
  description: string;
  items: SelectableItem[];
  selectedIds: string[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const hasChanges = buildIdSignature(draftSelectedIds) !== buildIdSignature(selectedIds);

  useEffect(() => {
    setDraftSelectedIds(selectedIds);
    setSearch("");
    setPage(1);
  }, [selectedIds, title]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return items;
    }
    return items.filter((item) =>
      [item.name, item.description, item.meta ?? ""]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / SELECTOR_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedItems = filteredItems.slice(
    (safePage - 1) * SELECTOR_PAGE_SIZE,
    safePage * SELECTOR_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleItem = (itemId: string) => {
    setDraftSelectedIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
            placeholder="Buscar"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="max-h-[54vh] divide-y divide-border overflow-y-auto">
            {pagedItems.map((item) => {
              const active = draftSelectedIds.includes(item.id);

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                      {item.meta ? (
                        <span className="mt-2 inline-flex rounded-sm border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.meta}
                        </span>
                      ) : null}
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

            {pagedItems.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum item encontrado.
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
          onClick={() => onApply(draftSelectedIds)}
          disabled={!hasChanges}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aplicar
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
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
