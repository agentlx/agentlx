import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createPortal } from "react-dom";
import { Check, KeyRound, Pencil, Plus, Search, Settings2, Shield, X } from "lucide-react";
import { AppShell, Crumb } from "@/components/AppShell";
import { toast } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/brand";
import {
  getAllScreenPermissions,
  screenPermissionLabels,
  type ScreenPermission,
  type UserListItem,
  type UserRole,
} from "@/lib/auth";
import {
  createUserAction,
  listUsersAction,
  resetUserMfaAction,
  updateUserAction,
} from "@/lib/auth-api";
import { getEditionStatusAction } from "@/lib/edition-api";
import { requireAdminRoute } from "@/lib/route-protection";

export const Route = createFileRoute("/users")({
  loader: async () => {
    const viewer = await requireAdminRoute();
    const [users, editionStatus] = await Promise.all([listUsersAction(), getEditionStatusAction()]);
    return {
      viewer,
      users,
      canAssignPolicies: editionStatus.featureCatalog.some(
        (feature) => feature.id === "machine_policy" && feature.enabled,
      ),
    };
  },
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Gestao de usuarios autenticados do agentlx." },
    ],
  }),
  component: UsersPage,
});

type UserFormState = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  allowedScreens: ScreenPermission[];
  disabled: boolean;
};

const baseMemberPermissionOptions = getAllScreenPermissions().filter(
  (screen) => screen !== "users",
);
const PAGE_SIZE = 10;
const SCREEN_SELECTOR_PAGE_SIZE = 10;

function buildIdSignature(ids: string[]) {
  return [...ids].sort((left, right) => left.localeCompare(right)).join("|");
}

function UsersPage() {
  const router = useRouter();
  const { users, viewer, canAssignPolicies } = Route.useLoaderData();
  const createUser = useServerFn(createUserAction);
  const updateUser = useServerFn(updateUserAction);
  const resetUserMfa = useServerFn(resetUserMfaAction);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [formState, setFormState] = useState<UserFormState>(() => emptyFormState());
  const [saving, setSaving] = useState(false);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [mfaResetConfirmOpen, setMfaResetConfirmOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const memberPermissionOptions = useMemo(
    () =>
      baseMemberPermissionOptions.filter((screen) => canAssignPolicies || screen !== "policies"),
    [canAssignPolicies],
  );

  const sortedUsers = useMemo(
    () =>
      [...users].sort((left, right) =>
        left.fullName.localeCompare(right.fullName, "pt-BR", { sensitivity: "base" }),
      ),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return sortedUsers;
    }

    return sortedUsers.filter((user) =>
      [user.fullName, user.email, user.role].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [appliedSearch, sortedUsers]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openCreate = () => {
    setCreating(true);
    setEditingUser(null);
    setPermissionsOpen(false);
    setFormState(emptyFormState());
  };

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const openEdit = (user: UserListItem) => {
    if (user.id === viewer.id) {
      return;
    }

    setCreating(false);
    setEditingUser(user);
    setPermissionsOpen(false);
    setFormState({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: user.role,
      allowedScreens: user.allowedScreens,
      disabled: user.disabled,
    });
  };

  const closeModal = () => {
    setCreating(false);
    setEditingUser(null);
    setMfaResetConfirmOpen(false);
    setPermissionsOpen(false);
  };

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const submit = async () => {
    setSaving(true);

    try {
      if (creating) {
        await createUser({
          data: {
            fullName: formState.fullName,
            email: formState.email,
            password: formState.password,
            role: formState.role,
            allowedScreens: formState.allowedScreens,
          },
        });
        toast.success("Usuario criado com sucesso.");
      } else if (editingUser) {
        await updateUser({
          data: {
            userId: editingUser.id,
            fullName: formState.fullName,
            email: formState.email,
            password: formState.password || undefined,
            role: formState.role,
            allowedScreens: formState.allowedScreens,
            disabled: formState.disabled,
          },
        });
        toast.success("Usuario atualizado com sucesso.");
      }

      closeModal();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o usuario.");
    } finally {
      setSaving(false);
    }
  };

  const requestResetMfa = () => {
    if (!editingUser || !editingUser.mfaEnabled) {
      return;
    }

    setMfaResetConfirmOpen(true);
  };

  const resetMfa = async () => {
    if (!editingUser) {
      return;
    }

    setResettingMfa(true);

    try {
      await resetUserMfa({
        data: {
          userId: editingUser.id,
        },
      });
      toast.success("MFA resetado com sucesso.");
      setMfaResetConfirmOpen(false);
      closeModal();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel resetar o MFA.");
    } finally {
      setResettingMfa(false);
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "users" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filteredUsers.length} de {users.length} usuarios com acesso autenticado.
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
                placeholder="Buscar por nome, e-mail ou funcao"
                className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applySearch}
                aria-label="Buscar usuarios"
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
            </div>
            <button
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" /> Novo usuario
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.7fr)_120px_140px] border-b border-border bg-background/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:grid">
            <div>Usuario</div>
            <div>E-mail</div>
            <div>Funcao</div>
            <div className="text-right">Acao</div>
          </div>

          <ul className="divide-y divide-border">
            {pagedUsers.map((user) => (
              <li key={user.id} className="px-4 py-3">
                <div className="hidden items-center gap-4 text-xs font-mono md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.7fr)_120px_140px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="truncate font-semibold text-foreground">{user.fullName}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                          user.disabled
                            ? "border border-destructive/30 bg-destructive/10 text-destructive"
                            : "border border-success/30 bg-success/10 text-success"
                        }`}
                      >
                        {user.disabled ? "Desativado" : "Ativo"}
                      </span>
                    </div>
                  </div>

                  <div className="truncate text-muted-foreground">{user.email}</div>

                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="size-3.5" />
                    <span className="capitalize">{user.role}</span>
                  </div>

                  <div className="flex justify-end">
                    {user.id === viewer.id ? (
                      <span className="text-xs text-muted-foreground">Conta atual</span>
                    ) : (
                      <button
                        onClick={() => openEdit(user)}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                      >
                        <Pencil className="size-3.5" /> Editar
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{user.fullName}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                        user.disabled
                          ? "border border-destructive/30 bg-destructive/10 text-destructive"
                          : "border border-success/30 bg-success/10 text-success"
                      }`}
                    >
                      {user.disabled ? "Desativado" : "Ativo"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield className="size-3.5" />
                    <span className="capitalize">{user.role}</span>
                  </div>

                  <div className="pt-1">
                    {user.id === viewer.id ? (
                      <span className="text-xs text-muted-foreground">Conta atual</span>
                    ) : (
                      <button
                        onClick={() => openEdit(user)}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
                      >
                        <Pencil className="size-3.5" /> Editar
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}

            {pagedUsers.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhum usuario encontrado.
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

      {(creating || editingUser) && (
        <ModalShell onClose={closeModal} maxWidthClass="max-w-3xl">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">
                {creating ? "Novo usuario" : "Configurar usuario"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Defina credenciais, funcao e telas liberadas para essa conta.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!creating && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      formState.disabled ? "text-destructive" : "text-success"
                    }`}
                  >
                    {formState.disabled ? "Desativado" : "Ativo"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormState((current) => ({ ...current, disabled: !current.disabled }))
                    }
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      formState.disabled ? "bg-destructive/70" : "bg-success/70"
                    }`}
                    aria-label={formState.disabled ? "Habilitar usuario" : "Desabilitar usuario"}
                    aria-pressed={!formState.disabled}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform ${
                        formState.disabled ? "translate-x-0" : "translate-x-5"
                      }`}
                    />
                  </button>
                  {editingUser && (
                    <button
                      type="button"
                      onClick={requestResetMfa}
                      disabled={resettingMfa || !editingUser.mfaEnabled}
                      title={
                        editingUser.mfaEnabled
                          ? "Resetar MFA da conta"
                          : "Esta conta nao possui MFA configurado"
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <KeyRound className="size-3.5" />
                      {resettingMfa ? "Resetando" : "Reset MFA"}
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={closeModal}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nome completo">
                <input
                  value={formState.fullName}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, fullName: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="E-mail">
                <input
                  type="email"
                  value={formState.email}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label={creating ? "Senha inicial" : "Nova senha (opcional)"}>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, password: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                />
              </FormField>
              <FormField label="Funcao">
                <div className="grid grid-cols-2 gap-2">
                  {(["admin", "member"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() =>
                        setFormState((current) => ({
                          ...current,
                          role,
                          allowedScreens:
                            role === "admin"
                              ? getAllScreenPermissions()
                              : current.allowedScreens.filter((screen) => screen !== "users"),
                        }))
                      }
                      className={`rounded-2xl border px-3 py-3 text-sm transition-colors ${
                        formState.role === role
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {role === "admin" ? "Administrador" : "Membro"}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>

            <div className="rounded-md border border-border bg-background/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Acesso a telas</p>
                  <p className="text-xs text-muted-foreground">
                    Escolha exatamente o que o usuario pode enxergar na barra lateral.
                  </p>
                </div>
                <button
                  onClick={() => setPermissionsOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary"
                >
                  <Settings2 className="size-4" /> Selecionar telas
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(formState.role === "admin"
                  ? getAllScreenPermissions()
                  : formState.allowedScreens
                ).map((screen) => (
                  <span
                    key={screen}
                    className="rounded-sm border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs text-primary"
                  >
                    {screenPermissionLabels[screen]}
                  </span>
                ))}
                {formState.role === "member" && formState.allowedScreens.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Nenhuma tela selecionada. O usuario ainda podera acessar apenas o perfil.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button
              onClick={closeModal}
              className="rounded-2xl border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() => void submit()}
              disabled={
                saving ||
                !formState.fullName.trim() ||
                !formState.email.trim() ||
                (creating && formState.password.length < 8)
              }
              className="rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Salvando..." : creating ? "Criar usuario" : "Salvar alteracoes"}
            </button>
          </div>

          {permissionsOpen && (
            <PermissionPickerModal
              role={formState.role}
              selected={formState.allowedScreens}
              availableScreens={memberPermissionOptions}
              onClose={() => setPermissionsOpen(false)}
              onApply={(screens) =>
                setFormState((current) => ({
                  ...current,
                  allowedScreens: screens,
                }))
              }
            />
          )}

          {mfaResetConfirmOpen && editingUser && (
            <ResetMfaConfirmModal
              email={editingUser.email}
              loading={resettingMfa}
              onClose={() => setMfaResetConfirmOpen(false)}
              onConfirm={() => void resetMfa()}
            />
          )}
        </ModalShell>
      )}
    </AppShell>
  );
}

function PermissionPickerModal({
  role,
  selected,
  availableScreens,
  onClose,
  onApply,
}: {
  role: UserRole;
  selected: ScreenPermission[];
  availableScreens: ScreenPermission[];
  onClose: () => void;
  onApply: (screens: ScreenPermission[]) => void;
}) {
  const [draftSelected, setDraftSelected] = useState(selected);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedScreens = useMemo(
    () => availableScreens.filter((screen) => draftSelected.includes(screen)),
    [availableScreens, draftSelected],
  );
  const filteredScreens = useMemo(() => {
    const term = appliedSearch.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return selectedScreens;
    }

    return selectedScreens.filter((screen) =>
      [screen, screenPermissionLabels[screen]].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [appliedSearch, selectedScreens]);
  const totalPages = Math.max(1, Math.ceil(filteredScreens.length / SCREEN_SELECTOR_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedScreens = filteredScreens.slice(
    (safePage - 1) * SCREEN_SELECTOR_PAGE_SIZE,
    safePage * SCREEN_SELECTOR_PAGE_SIZE,
  );
  const hasChanges = buildIdSignature(draftSelected) !== buildIdSignature(selected);

  useEffect(() => {
    setDraftSelected(selected);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
    setPickerOpen(false);
  }, [selected]);

  const applySearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const removeScreen = (screen: ScreenPermission) => {
    setDraftSelected((current) => current.filter((item) => item !== screen));
  };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-3xl" elevated>
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Selecionar telas</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste o que aparece para o usuario na navegacao lateral.
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
        {role === "admin" ? (
          <div className="rounded-md border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
            Administradores possuem acesso total ao sistema, inclusive a tela de Usuarios.
          </div>
        ) : (
          <>
            <div className="relative">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applySearch();
                  }
                }}
                placeholder="Buscar selecionadas por nome"
                className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applySearch}
                aria-label="Buscar telas selecionadas"
                className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Selecionadas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Remova telas desta lista ou adicione novas pela busca.
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
                {pagedScreens.map((screen) => (
                  <li key={screen} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {screenPermissionLabels[screen]}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Liberar esta secao na interface.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ScreenMetaBadge label={screen} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScreen(screen)}
                      className="rounded-sm border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      aria-label={`Remover tela ${screenPermissionLabels[screen]}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}

                {pagedScreens.length === 0 && (
                  <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {selectedScreens.length === 0
                      ? "Nenhuma tela selecionada."
                      : "Nenhuma tela selecionada corresponde a busca."}
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
          </>
        )}
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
            if (role !== "admin") {
              onApply(draftSelected);
            }
            onClose();
          }}
          disabled={role !== "admin" && !hasChanges}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aplicar
        </button>
      </div>

      {pickerOpen && (
        <ScreenPickerModal
          selected={draftSelected}
          availableScreens={availableScreens}
          onClose={() => setPickerOpen(false)}
          onConfirm={(screens) => {
            setDraftSelected(screens);
            setPickerOpen(false);
          }}
        />
      )}
    </ModalShell>
  );
}

function ScreenPickerModal({
  selected,
  availableScreens,
  onClose,
  onConfirm,
}: {
  selected: ScreenPermission[];
  availableScreens: ScreenPermission[];
  onClose: () => void;
  onConfirm: (screens: ScreenPermission[]) => void;
}) {
  const [draftSelected, setDraftSelected] = useState(selected);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filteredScreens = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) {
      return availableScreens;
    }

    return availableScreens.filter((screen) =>
      [screen, screenPermissionLabels[screen]].join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [availableScreens, search]);
  const totalPages = Math.max(1, Math.ceil(filteredScreens.length / SCREEN_SELECTOR_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedScreens = filteredScreens.slice(
    (safePage - 1) * SCREEN_SELECTOR_PAGE_SIZE,
    safePage * SCREEN_SELECTOR_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const toggleScreen = (screen: ScreenPermission) => {
    setDraftSelected((current) =>
      current.includes(screen) ? current.filter((item) => item !== screen) : [...current, screen],
    );
  };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-3xl" elevated>
      <div className="flex items-center justify-between gap-4 border-b border-border bg-background/50 px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Selecionar telas</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Busque e selecione telas para incluir nesta lista.
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
            placeholder="Buscar telas por nome"
            className="w-full rounded-md border border-border bg-background py-2.5 pl-3 pr-11 text-sm outline-none focus:border-primary"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Search className="size-4" />
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <ul className="max-h-[54vh] divide-y divide-border overflow-y-auto">
            {pagedScreens.map((screen) => {
              const active = draftSelected.includes(screen);

              return (
                <li key={screen}>
                  <button
                    type="button"
                    onClick={() => toggleScreen(screen)}
                    className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                      active ? "bg-primary/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {screenPermissionLabels[screen]}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Liberar esta secao na interface.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ScreenMetaBadge label={screen} />
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

            {pagedScreens.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                Nenhuma tela encontrada.
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
          onClick={() => onConfirm(draftSelected)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ok
        </button>
      </div>
    </ModalShell>
  );
}

function ScreenMetaBadge({ label }: { label: string }) {
  return (
    <span className="rounded-sm border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}

function ResetMfaConfirmModal({
  email,
  loading,
  onClose,
  onConfirm,
}: {
  email: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={loading ? () => undefined : onClose} maxWidthClass="max-w-md" elevated>
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-warning/25 bg-warning/10 text-warning">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Resetar MFA</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Esta acao remove o autenticador configurado.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-5">
        <p className="text-sm text-foreground">
          Deseja resetar o MFA de <span className="font-semibold">{email}</span>?
        </p>
        <p className="text-sm text-muted-foreground">
          As sessoes atuais desta conta serao encerradas e o usuario podera autenticar apenas com
          e-mail e senha ate configurar o MFA novamente.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="rounded-2xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          <KeyRound className="size-4" />
          {loading ? "Resetando..." : "Confirmar reset"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  children,
  onClose,
  maxWidthClass,
  elevated = false,
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidthClass: string;
  elevated?: boolean;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const content = (
    <div
      className={`fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm ${
        elevated ? "z-[95]" : ""
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} overflow-hidden rounded-[28px] border border-border bg-surface-raised shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function emptyFormState(): UserFormState {
  return {
    fullName: "",
    email: "",
    password: "",
    role: "member",
    allowedScreens: ["dashboard", "machines"],
    disabled: false,
  };
}
