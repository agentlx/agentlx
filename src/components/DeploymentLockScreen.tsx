import { ExternalLink, LockKeyhole, Server, ShieldAlert } from "lucide-react";
import { BrandLockup } from "@/components/Brand";
import type { DeploymentSecurityState } from "@/lib/deployment";

export function DeploymentLockScreen({ status }: { status: DeploymentSecurityState }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_30%),linear-gradient(180deg,#0b1018_0%,#06080d_40%,#05070b_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-center justify-between gap-4">
          <BrandLockup badgeClassName="size-8" />
          <div className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-warning">
            <ShieldAlert className="size-3.5" />
            HTTPS required
          </div>
        </div>

        <section className="rounded-xl border border-border/80 bg-surface/95 p-6 text-center shadow-2xl backdrop-blur-sm sm:p-8">
          <div className="mx-auto inline-flex items-center gap-2 rounded-md border border-success/20 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
            <Server className="size-3.5" />
            Online
          </div>

          <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">
            agentlx subiu corretamente
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            O painel reconheceu a configuracao atual, mas permanece bloqueado porque a origem
            publica nao esta usando HTTPS. Configure um dominio com certificado valido para liberar
            login, agents, terminal remoto e execucoes.
          </p>

          <div className="mt-8 rounded-lg border border-border bg-background/70 p-4 text-left">
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
        </section>
      </div>
    </div>
  );
}
