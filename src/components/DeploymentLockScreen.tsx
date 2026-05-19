import { ExternalLink, LockKeyhole, Server, ShieldAlert } from "lucide-react";
import { BrandLockup } from "@/components/Brand";
import type { DeploymentSecurityState } from "@/lib/deployment";

export function DeploymentLockScreen({ status }: { status: DeploymentSecurityState }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,#0b1018_0%,#06080d_40%,#05070b_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between gap-4">
          <BrandLockup badgeClassName="size-8" />
          <div className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-warning">
            <ShieldAlert className="size-3.5" />
            HTTPS required
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-surface/95 shadow-2xl backdrop-blur-sm">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="inline-flex items-center gap-2 rounded-md border border-success/20 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
                <Server className="size-3.5" />
                Online
              </div>

              <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
                agentlx subiu corretamente
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                O painel reconheceu a configuracao atual, mas permanece bloqueado porque a origem
                publica nao esta usando HTTPS. Configure um dominio com certificado valido para
                liberar login, agents, terminal remoto e execucoes.
              </p>

              <div className="mt-8 rounded-lg border border-border bg-background/70 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <LockKeyhole className="size-3.5 text-warning" />
                  Origem configurada
                </div>
                <p className="mt-3 break-all font-mono text-sm text-foreground">
                  {status.appOrigin || "nao informada"}
                </p>
              </div>

              <a
                href={status.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Abrir documentacao
                <ExternalLink className="size-4" />
              </a>
            </div>

            <div className="p-6 sm:p-8">
              <h2 className="text-sm font-semibold tracking-tight">Bloqueios ativos</h2>
              <ul className="mt-4 space-y-3">
                {status.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="rounded-md border border-warning/20 bg-warning/10 px-3 py-3 text-sm leading-5 text-warning"
                  >
                    {reason}
                  </li>
                ))}
              </ul>

              <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm leading-6 text-muted-foreground">
                <p>
                  Enquanto o bloqueio estiver ativo, o painel nao aceita login nem APIs sensiveis.
                </p>
                <p>
                  O container pode continuar ligado para validar rede, DNS, proxy e healthcheck.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
