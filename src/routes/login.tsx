import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, Terminal } from "lucide-react";
import { BrandLockup } from "@/components/Brand";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "@/components/ui/sonner";
import { resolveDefaultAuthenticatedPath } from "@/lib/auth";
import { loginAction, validateMfaLoginAction } from "@/lib/auth-api";
import { useAuthState } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: APP_NAME },
      { name: "description", content: "Acesso autenticado ao painel agentlx." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const login = useServerFn(loginAction);
  const validateMfaLogin = useServerFn(validateMfaLoginAction);
  const { viewer, refreshViewer } = useAuthState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pendingMfa, setPendingMfa] = useState<{ email: string; fullName: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (viewer) {
      void navigate({ to: resolveDefaultAuthenticatedPath(viewer), replace: true });
    }
  }, [navigate, viewer]);

  const submit = async () => {
    setLoading(true);

    try {
      const response = await login({
        data: {
          email: email.trim(),
          password,
        },
      });

      if ("mfaRequired" in response && response.mfaRequired) {
        setPendingMfa(response.pendingMfa);
        setMfaCode("");
        return;
      }

      if ("accessibleScreens" in response) {
        await refreshViewer();
        await router.invalidate();
        await navigate({ to: resolveDefaultAuthenticatedPath(response) });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel autenticar.");
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async () => {
    if (mfaCode.length !== 6) {
      toast.error("Digite os 6 numeros do autenticador.");
      return;
    }

    setLoading(true);

    try {
      const viewer = await validateMfaLogin({
        data: {
          code: mfaCode,
        },
      });
      await refreshViewer();
      await router.invalidate();
      await navigate({ to: resolveDefaultAuthenticatedPath(viewer) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel validar o MFA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,#0b1018_0%,#06080d_40%,#05070b_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <section className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between gap-4">
            <BrandLockup badgeClassName="size-8" />
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <ShieldCheck className="size-3.5" />
              Secure Access
            </div>
          </div>

          <div className="flex min-h-[540px] flex-col rounded-xl border border-border/80 bg-surface/95 px-5 py-5 shadow-2xl backdrop-blur-sm sm:px-7 sm:py-6">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Terminal className="size-3.5 text-primary" />
                Login
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Acesso ao painel
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pendingMfa
                    ? "Informe o codigo MFA para validar esta conta."
                    : "Use suas credenciais para entrar."}
                </p>
              </div>
            </div>

            <form
              className="mt-12 flex flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void (pendingMfa ? submitMfa() : submit());
              }}
            >
              <div className="space-y-5">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    E-mail
                  </span>
                  <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 transition-colors focus-within:border-primary">
                    <Mail className="size-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="voce@empresa.com"
                      autoComplete="email"
                      disabled={Boolean(pendingMfa)}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Senha
                  </span>
                  <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-3 transition-colors focus-within:border-primary">
                    <LockKeyhole className="size-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Sua senha"
                      autoComplete="current-password"
                      disabled={Boolean(pendingMfa)}
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                </label>

                {pendingMfa && (
                  <div className="space-y-4">
                    <div className="rounded-md border border-primary/20 bg-primary/10 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Conta em validacao
                      </p>
                      <p className="mt-2 break-all text-sm text-muted-foreground">
                        {pendingMfa.email}
                      </p>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Codigo MFA
                      </span>
                      <InputOTP
                        maxLength={6}
                        value={mfaCode}
                        onChange={setMfaCode}
                        pattern="^[0-9]+$"
                        containerClassName="grid w-full grid-cols-6 gap-2"
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
                )}
              </div>

              <div className="mt-auto space-y-3 pt-10">
                <button
                  type="submit"
                  disabled={
                    loading || (pendingMfa ? mfaCode.length !== 6 : !email.trim() || !password)
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {pendingMfa
                      ? loading
                        ? "Validando..."
                        : "Validar e entrar"
                      : loading
                        ? "Entrando..."
                        : "Entrar"}
                  </span>
                  {!loading && <ArrowRight className="size-4" />}
                </button>

                {pendingMfa && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingMfa(null);
                      setMfaCode("");
                      setPassword("");
                    }}
                    className="w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Trocar credenciais
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
