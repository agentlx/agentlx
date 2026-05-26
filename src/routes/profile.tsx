import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  LayoutDashboard,
  Monitor,
  ScrollText,
  ShieldCheck,
  UserCircle2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { AppShell, Crumb } from "@/components/AppShell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/components/ui/sonner";
import {
  screenPath,
  screenPermissionLabels,
  profilePhotoAllowedMimeTypes,
  type MfaSetupView,
  type ScreenPermission,
} from "@/lib/auth";
import {
  changeOwnPasswordAction,
  createOwnMfaSetupAction,
  updateOwnProfilePhotoAction,
  verifyOwnMfaSetupAction,
} from "@/lib/auth-api";
import { useAuthState } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/brand";
import { prepareSquareProfilePhoto } from "@/lib/profile-photo";
import { requireRouteViewer } from "@/lib/route-protection";

export const Route = createFileRoute("/profile")({
  loader: () => requireRouteViewer(),
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Dados da conta autenticada no agentlx." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const router = useRouter();
  const viewer = Route.useLoaderData();
  const { refreshViewer } = useAuthState();
  const changePassword = useServerFn(changeOwnPasswordAction);
  const createMfaSetup = useServerFn(createOwnMfaSetupAction);
  const verifyMfaSetup = useServerFn(verifyOwnMfaSetupAction);
  const updateProfilePhoto = useServerFn(updateOwnProfilePhotoAction);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaSetup, setMfaSetup] = useState<MfaSetupView | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("A confirmacao da nova senha nao confere.");
      return;
    }

    setSaving(true);

    try {
      await changePassword({
        data: {
          currentPassword,
          newPassword,
        },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha atualizada com sucesso.");
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a senha.");
    } finally {
      setSaving(false);
    }
  };

  const startMfaSetup = async () => {
    setMfaLoading(true);

    try {
      const setup = await createMfaSetup();
      setMfaSetup(setup);
      setMfaCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel preparar o MFA.");
    } finally {
      setMfaLoading(false);
    }
  };

  const submitMfaSetup = async () => {
    if (mfaCode.length !== 6) {
      toast.error("Digite os 6 numeros gerados pelo autenticador.");
      return;
    }

    setMfaSaving(true);

    try {
      await verifyMfaSetup({
        data: {
          code: mfaCode,
        },
      });
      setMfaSetup(null);
      setMfaCode("");
      toast.success(
        viewer.mfaEnabled ? "MFA reconfigurado com sucesso." : "MFA configurado com sucesso.",
      );
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel confirmar o MFA.");
    } finally {
      setMfaSaving(false);
    }
  };

  const cancelMfaSetup = () => {
    setMfaSetup(null);
    setMfaCode("");
  };

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setPhotoSaving(true);

    try {
      const { imageDataUrl } = await prepareSquareProfilePhoto(file);
      await updateProfilePhoto({
        data: {
          imageDataUrl,
        },
      });
      toast.success("Foto de perfil atualizada.");
      await refreshViewer();
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a foto.");
    } finally {
      setPhotoSaving(false);
    }
  };

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "profile" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie suas informacoes e seguranca da conta.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-5 sm:p-6 lg:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoSaving}
                  className="group relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-primary/20 bg-primary/20 text-primary transition-colors hover:border-primary/45 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Alterar foto de perfil"
                >
                  {viewer.profilePhotoUrl ? (
                    <img src={viewer.profilePhotoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <UserRound className="size-6" />
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-background/65 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="size-4" />
                  </span>
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept={profilePhotoAllowedMimeTypes.join(",")}
                  className="hidden"
                  onChange={(event) => void handleProfilePhotoChange(event)}
                />
                <div>
                  <h2 className="text-base font-semibold">Dados da conta</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Informacoes basicas do seu perfil.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void startMfaSetup()}
                disabled={mfaLoading}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="size-4" />
                {mfaLoading
                  ? "Preparando..."
                  : viewer.mfaEnabled
                    ? "Reconfigurar MFA"
                    : "Configurar MFA"}
              </button>
            </div>

            <dl className="mt-8 divide-y divide-border text-sm">
              <div className="pb-5">
                <dt className="text-xs font-semibold text-muted-foreground">Nome</dt>
                <dd className="mt-2 font-medium">{viewer.fullName}</dd>
              </div>
              <div className="py-5">
                <dt className="text-xs font-semibold text-muted-foreground">E-mail</dt>
                <dd className="mt-2 font-medium">{viewer.email}</dd>
              </div>
              <div className="py-5">
                <dt className="text-xs font-semibold text-muted-foreground">Funcao</dt>
                <dd className="mt-2">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">
                    {viewer.role === "admin" ? "Administrador" : "Membro"}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="border-t border-border pt-5">
              <p className="text-xs font-semibold text-muted-foreground">Telas liberadas</p>
              <div className="mt-4 grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {viewer.accessibleScreens.map((screen) => {
                  const Icon = screenIconMap[screen];
                  return (
                    <Link
                      key={screen}
                      to={screenPath(screen)}
                      className="group flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background/35 px-2 py-3 text-center transition-colors hover:border-primary/40 hover:bg-primary/10"
                    >
                      <span className="grid size-9 place-items-center rounded-md border border-primary/20 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="size-5" />
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                        {screenPermissionLabels[screen]}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5 sm:p-6 lg:p-8">
            <div className="flex items-center gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
                <KeyRound className="size-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Alterar senha</h2>
                <p className="mt-1 text-sm text-muted-foreground">Mantenha sua conta segura.</p>
              </div>
            </div>

            <div className="mt-8 grid gap-7">
              <Field
                label="Senha atual"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />
              <Field
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
              <Field
                label="Confirmar nova senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => void submit()}
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar nova senha"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {mfaSetup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
          <form
            className="w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMfaSetup();
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {viewer.mfaEnabled ? "Reconfigurar MFA" : "Configurar MFA"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escaneie o QR Code ou use a chave manual e confirme com o codigo gerado.
                </p>
              </div>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                <img
                  src={mfaSetup.qrCodeDataUrl}
                  alt="QR Code para configurar MFA"
                  className="size-56 max-w-full"
                />
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Codigo manual
                  </p>
                  <p className="mt-2 break-all rounded-md border border-border bg-background px-3 py-3 font-mono text-sm">
                    {mfaSetup.manualEntryKey}
                  </p>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Codigo do autenticador
                  </span>
                  <InputOTP
                    maxLength={6}
                    value={mfaCode}
                    onChange={setMfaCode}
                    pattern="^[0-9]+$"
                    containerClassName="grid w-full max-w-md grid-cols-6 gap-2"
                  >
                    <InputOTPGroup className="contents">
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-12 w-full rounded-md border border-border bg-background text-sm font-semibold first:rounded-md last:rounded-md"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={cancelMfaSetup}
                disabled={mfaSaving}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mfaSaving || mfaCode.length !== 6}
                className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {mfaSaving ? "Confirmando..." : "Confirmar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}

const screenIconMap: Record<ScreenPermission, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  machines: Monitor,
  groups: UsersRound,
  templates: FileText,
  policies: ShieldCheck,
  logs: ScrollText,
  users: UserCircle2,
};

function Field({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const VisibilityIcon = visible ? EyeOff : Eye;

  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background py-3 pl-4 pr-12 text-sm outline-none transition-colors focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <VisibilityIcon className="size-4" />
        </button>
      </span>
    </label>
  );
}
