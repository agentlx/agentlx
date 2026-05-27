import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, ExternalLink, KeyRound, ShieldAlert } from "lucide-react";
import { AppShell, Crumb } from "@/components/AppShell";
import { getEditionStatusAction } from "@/lib/edition-api";
import { APP_NAME } from "@/lib/brand";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/license")({
  loader: async () => {
    await requireRouteScreen("license");
    return getEditionStatusAction();
  },
  head: () => ({
    meta: [{ title: APP_NAME }, { name: "description", content: "Licenca e edicao do AgentLX." }],
  }),
  component: LicensePage,
});

function LicensePage() {
  const status = Route.useLoaderData();
  const enabledCount = status.featureCatalog.filter((feature) => feature.enabled).length;

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "license" }]} />}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Edicao atual
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  AgentLX {status.edition === "enterprise" ? "Enterprise" : "Community"}
                </h1>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-medium ${
                  status.status === "valid"
                    ? "border-success/30 bg-success/10 text-success"
                    : status.status === "community"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-warning/30 bg-warning/10 text-warning"
                }`}
              >
                {status.status === "valid" ? (
                  <BadgeCheck className="size-3.5" />
                ) : (
                  <ShieldAlert className="size-3.5" />
                )}
                {status.status}
              </span>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
              {status.message}
            </p>

            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <InfoRow label="Cliente" value={status.customerId ?? "-"} />
              <InfoRow label="Licenca" value={status.licenseId ?? "-"} />
              <InfoRow label="Plano" value={status.tier ?? "-"} />
              <InfoRow label="Emitida em" value={formatDate(status.issuedAt)} />
              <InfoRow label="Valida ate" value={formatDate(status.expiresAt)} />
              <InfoRow
                label="Features ativas"
                value={`${enabledCount}/${status.featureCatalog.length}`}
              />
              <InfoRow
                label="Instalacao"
                value={status.canInstallLicense ? "habilitada" : "community"}
              />
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <h2 className="text-base font-semibold">Atualizacao de licenca</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              A ativacao e a troca de licenca sao feitas pelo painel do cliente no AgentLX Cloud.
              Use a opcao de gerar instalacao para ambientes novos ou atualizar ambiente para uma
              instalacao Enterprise existente.
            </p>
            <div className="mt-5 rounded-md border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
              Este painel exibe o estado local da licenca. Ele nao recebe licencas coladas
              manualmente.
            </div>
            <div className="mt-4">
              <a
                href="https://cloud.agentlx.com.br"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Abrir AgentLX Cloud
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Recursos Enterprise</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-b-lg bg-border sm:grid-cols-2 lg:grid-cols-4">
            {status.featureCatalog.map((feature) => (
              <div key={feature.id} className="bg-surface px-4 py-3">
                <p className="text-sm font-medium">{feature.label}</p>
                <p
                  className={`mt-1 text-xs ${
                    feature.enabled ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  {feature.enabled ? "ativo" : "enterprise"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
