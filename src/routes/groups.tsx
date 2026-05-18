import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Pencil, Plus, Search, Users, X } from "lucide-react";
import { AppShell, Crumb } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import type { GroupSelectableUserView, MachineGroupView } from "@/lib/agentlx";
import { APP_NAME } from "@/lib/brand";
import {
  createMachineGroupAction,
  getMachineGroupsData,
  updateMachineGroupAction,
} from "@/lib/panel-api";

export const Route = createFileRoute("/groups")({
  loader: () => getMachineGroupsData(),
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Gestao de grupos de acesso para maquinas." },
    ],
  }),
  component: GroupsPage,
});

type GroupFormState = {
  name: string;
  description: string;
  memberUserIds: string[];
  ownerUserIds: string[];
};

const PAGE_SIZE = 10;
const SELECTOR_PAGE_SIZE = 10;

function emptyFormState(): GroupFormState {
  return {
    name: "",
    description: "",
    memberUserIds: [],
    ownerUserIds: [],
  };
}

function toFormState(group: MachineGroupView): GroupFormState {
  return {
    name: group.name,
    description: group.description,
    memberUserIds: group.members.map((member) => member.id),
    ownerUserIds: group.owners.map((owner) => owner.id),
  };
}

function sortSelectableUsers(users: GroupSelectableUserView[]) {
  return [...users].sort((left, right) => {
    const nameComparison = left.fullName.localeCompare(right.fullName, "pt-BR", {
      sensitivity: "base",
    });

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.email.localeCompare(right.email, "pt-BR", { sensitivity: "base" });
  });
}

function buildIdSignature(ids: string[]) {
  return [...ids].sort((left, right) => left.localeCompare(right)).join("|");
}

function GroupsPage() {
  const router = useRouter();
  const { groups, users } = Route.useLoaderData();
  const createGroup = useServerFn(createMachineGroupAction);
  const updateGroup = useServerFn(updateMachineGroupAction);
  const [editingGroup, setEditingGroup] = useState<MachineGroupView | null>(null);
  const [creating, setCreating] = useState(false);
  const [formState, setFormState] = useState<GroupFormState>(() => emptyFormState());
  const [saving, setSaving] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickerMode, setPickerMode] = useState<"members" | "owners" | null>(null);
  const sortedUsers = useMemo(() => sortSelectableUsers(users), [users]);

  const sortedGroups = useMemo(
    () =>
      [...groups].sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" }),
      ),
    [groups],
  );

  const filteredGroups = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return sortedGroups;
    }

    return sortedGroups.filter((group) =>
      [
        group.name,
        group.description,
        ...group.owners.map((owner) => `${owner.fullName} ${owner.email}`),
        ...group.members.map((member) => `${member.fullName} ${member.email}`),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [appliedSearch, sortedGroups]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedGroups = filteredGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const openCreate = () => {
    setCreating(true);
    setEditingGroup(null);
    setFormState(emptyFormState());
    setPickerMode(null);
  };

  const openEdit = (group: MachineGroupView) => {
    setCreating(false);
    setEditingGroup(group);
    setFormState(toFormState(group));
    setPickerMode(null);
  };

  const closeModal = () => {
    setCreating(false);
    setEditingGroup(null);
    setPickerMode(null);
    setSaving(false);
  };

  const selectedOwners = sortedUsers.filter((user) => formState.ownerUserIds.includes(user.id));
  const selectedMembers = sortedUsers.filter(
    (user) =>
      formState.memberUserIds.includes(user.id) && !formState.ownerUserIds.includes(user.id),
  );

  const applyOwners = (ownerUserIds: string[]) => {
    setFormState((current) => ({
      ...current,
      ownerUserIds,
      memberUserIds: current.memberUserIds.filter((item) => !ownerUserIds.includes(item)),
    }));
  };

  const applyMembers = (memberUserIds: string[]) => {
    setFormState((current) => ({
      ...current,
      memberUserIds: memberUserIds.filter((item) => !current.ownerUserIds.includes(item)),
    }));
  };

  const submit = async () => {
    setSaving(true);

    try {
      const payload = {
        name: formState.name,
        description: formState.description,
        ownerUserIds: formState.ownerUserIds,
        memberUserIds: formState.memberUserIds.filter(
          (userId) => !formState.ownerUserIds.includes(userId),
        ),
      };

      if (creating) {
        await createGroup({ data: payload });
        toast.success("Grupo criado com sucesso.");
      } else if (editingGroup) {
        await updateGroup({
          data: {
            groupId: editingGroup.id,
            ...payload,
          },
        });
        toast.success("Grupo atualizado com sucesso.");
      }

      closeModal();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o grupo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "groups" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Grupos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredGroups.length} de {groups.length} grupos configurados para acesso a maquinas.
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
                placeholder="Buscar por nome, descricao ou usuario"
                className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applySearch}
                aria-label="Buscar grupos"
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
            </div>
            <button
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" /> Novo grupo
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_170px_170px_120px_150px] border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
            <div>Grupo</div>
            <div className="text-center">Proprietarios</div>
            <div className="text-center">Membros</div>
            <div className="text-center">Maquinas</div>
            <div className="text-right">Acao</div>
          </div>

          <ul className="divide-y divide-border">
            {pagedGroups.map((group) => (
              <li key={group.id} className="px-4 py-3">
                <div className="hidden items-center gap-4 text-xs font-mono md:grid md:grid-cols-[minmax(0,2.2fr)_170px_170px_120px_150px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{group.name}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {group.description || "Sem descricao."}
                    </p>
                  </div>
                  <GroupCountBadge icon={Crown} label={`${group.ownerCount}`} />
                  <GroupCountBadge icon={Users} label={`${group.memberCount}`} />
                  <div className="text-center text-muted-foreground">{group.machineCount}</div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => openEdit(group)}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{group.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.description || "Sem descricao."}
                      </p>
                    </div>
                    <button
                      onClick={() => openEdit(group)}
                      className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                    >
                      <Pencil className="size-3.5" /> Editar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {group.ownerCount} proprietario(s)
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {group.memberCount} membro(s)
                    </span>
                    <span className="rounded-full border border-border px-2.5 py-1">
                      {group.machineCount} maquina(s)
                    </span>
                  </div>
                </div>
              </li>
            ))}

            {pagedGroups.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum grupo encontrado.
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
      </div>

      {(creating || editingGroup) && (
        <ModalShell onClose={closeModal} maxWidthClass="max-w-4xl">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">{creating ? "Novo grupo" : "Editar grupo"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina o grupo, os proprietarios responsáveis e os membros que podem acessar as
                maquinas vinculadas.
              </p>
            </div>
            <button
              onClick={closeModal}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nome do grupo">
                <input
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Descricao">
                <input
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, description: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                />
              </FormField>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SelectionPanel
                title="Proprietarios"
                description="Podem administrar o grupo e vincular maquinas agrupadas."
                count={selectedOwners.length}
                actionLabel="Selecionar proprietarios"
                onOpen={() => setPickerMode("owners")}
                users={selectedOwners}
                tone="primary"
              />
              <SelectionPanel
                title="Membros"
                description="Ganham visibilidade e acesso as maquinas vinculadas ao grupo."
                count={selectedMembers.length}
                actionLabel="Selecionar membros"
                onOpen={() => setPickerMode("members")}
                users={selectedMembers}
                tone="default"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button
              onClick={closeModal}
              className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() => void submit()}
              disabled={saving || !formState.name.trim() || formState.ownerUserIds.length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Salvando..." : creating ? "Criar grupo" : "Salvar alteracoes"}
            </button>
          </div>

          {pickerMode === "owners" && (
            <UserSelectorModal
              title="Selecionar proprietarios"
              description="Escolha quem pode administrar este grupo e gerenciar maquinas agrupadas."
              users={sortedUsers}
              selectedIds={formState.ownerUserIds}
              onClose={() => setPickerMode(null)}
              onApply={applyOwners}
            />
          )}

          {pickerMode === "members" && (
            <UserSelectorModal
              title="Selecionar membros"
              description="Escolha quem passa a ter visibilidade e acesso nas maquinas deste grupo."
              users={sortedUsers}
              selectedIds={formState.memberUserIds}
              blockedIds={formState.ownerUserIds}
              onClose={() => setPickerMode(null)}
              onApply={applyMembers}
            />
          )}
        </ModalShell>
      )}
    </AppShell>
  );
}

function GroupCountBadge({ icon: Icon, label }: { icon: typeof Crown; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground">
      <Icon className="size-3.5" />
      <span>{label}</span>
    </div>
  );
}

function SelectionPanel({
  title,
  description,
  count,
  actionLabel,
  onOpen,
  users,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  actionLabel: string;
  onOpen: () => void;
  users: GroupSelectableUserView[];
  tone: "primary" | "default";
}) {
  return (
    <div className="rounded-md border border-border bg-background/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          onClick={onOpen}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
            tone === "primary"
              ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-border hover:bg-secondary"
          }`}
        >
          <Users className="size-4" /> {actionLabel}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {users.map((user) => (
          <span
            key={user.id}
            className={`rounded-sm border px-2.5 py-1 text-xs ${
              tone === "primary"
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground"
            }`}
          >
            {user.fullName}
          </span>
        ))}
        {count === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum usuario selecionado.</span>
        )}
      </div>
    </div>
  );
}

function UserSelectorModal({
  title,
  description,
  users,
  selectedIds,
  blockedIds = [],
  onClose,
  onApply,
}: {
  title: string;
  description: string;
  users: GroupSelectableUserView[];
  selectedIds: string[];
  blockedIds?: string[];
  onClose: () => void;
  onApply: (userIds: string[]) => void;
}) {
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setDraftSelectedIds(selectedIds);
    setSearch("");
    setPage(1);
    setPickerOpen(false);
  }, [selectedIds, title]);

  const selectedUsers = useMemo(
    () => users.filter((user) => draftSelectedIds.includes(user.id)),
    [draftSelectedIds, users],
  );

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return selectedUsers;
    }

    return selectedUsers.filter((user) =>
      [user.fullName, user.email, user.role].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [search, selectedUsers]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / SELECTOR_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedUsers = filteredUsers.slice(
    (safePage - 1) * SELECTOR_PAGE_SIZE,
    safePage * SELECTOR_PAGE_SIZE,
  );
  const hasChanges = buildIdSignature(draftSelectedIds) !== buildIdSignature(selectedIds);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const removeUser = (userId: string) => {
    setDraftSelectedIds((current) => current.filter((item) => item !== userId));
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
            placeholder="Buscar selecionados por nome ou e-mail"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Selecionados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Remova usuarios desta lista ou adicione novos pela busca.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary"
          >
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="divide-y divide-border">
            {pagedUsers.map((user) => (
              <li key={user.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.fullName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <UserMetaBadge label={user.role === "admin" ? "Administrador" : "Operador"} />
                    {user.disabled && <UserMetaBadge label="Desativado" tone="destructive" />}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeUser(user.id)}
                  className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`Remover usuario ${user.fullName}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}

            {pagedUsers.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                {selectedUsers.length === 0
                  ? "Nenhum usuario selecionado."
                  : "Nenhum usuario selecionado corresponde a busca."}
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
          onClick={() => {
            onApply(draftSelectedIds);
            onClose();
          }}
          disabled={!hasChanges}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aplicar
        </button>
      </div>

      {pickerOpen && (
        <UserPickerModal
          title={title}
          users={users}
          selectedIds={draftSelectedIds}
          blockedIds={blockedIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(userIds) => {
            setDraftSelectedIds(userIds);
            setPickerOpen(false);
          }}
        />
      )}
    </ModalShell>
  );
}

function UserPickerModal({
  title,
  users,
  selectedIds,
  blockedIds,
  onClose,
  onConfirm,
}: {
  title: string;
  users: GroupSelectableUserView[];
  selectedIds: string[];
  blockedIds: string[];
  onClose: () => void;
  onConfirm: (userIds: string[]) => void;
}) {
  const [draftSelectedIds, setDraftSelectedIds] = useState(selectedIds);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return users;
    }

    return users.filter((user) =>
      [user.fullName, user.email, user.role].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [search, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / SELECTOR_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedUsers = filteredUsers.slice(
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

  const toggleUser = (userId: string) => {
    if (blockedIds.includes(userId)) {
      return;
    }

    setDraftSelectedIds((current) =>
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId],
    );
  };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-3xl">
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Busque e selecione usuarios para incluir nesta lista.
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
            placeholder="Buscar usuarios por nome ou e-mail"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="max-h-[54vh] divide-y divide-border overflow-y-auto">
            {pagedUsers.map((user) => {
              const active = draftSelectedIds.includes(user.id);
              const blocked = blockedIds.includes(user.id);

              return (
                <li key={user.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => toggleUser(user.id)}
                    className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                      blocked
                        ? "cursor-not-allowed opacity-50"
                        : active
                          ? "bg-primary/10"
                          : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.fullName}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {blocked && <UserMetaBadge label="Proprietario" tone="primary" />}
                        <UserMetaBadge
                          label={user.role === "admin" ? "Administrador" : "Operador"}
                        />
                        {user.disabled && <UserMetaBadge label="Desativado" tone="destructive" />}
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

            {pagedUsers.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum usuario encontrado.
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
          onClick={() => onConfirm(draftSelectedIds)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ok
        </button>
      </div>
    </ModalShell>
  );
}

function UserMetaBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "primary" | "destructive";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/20 bg-primary/10 text-primary"
      : tone === "destructive"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : "border-border bg-surface text-muted-foreground";

  return (
    <span
      className={`rounded-sm border px-2 py-1 text-[10px] uppercase tracking-wider ${toneClass}`}
    >
      {label}
    </span>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
