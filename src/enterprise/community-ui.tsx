import { Link } from "@tanstack/react-router";
import { AppShell, Crumb } from "@/components/AppShell";

type PlaceholderProps = {
  title?: string;
};

export function SecurityMonitoringEnterprisePlaceholder({
  title = "Security Monitoring",
}: PlaceholderProps) {
  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "monitoring" }]} />}>
      <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-4xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="w-full rounded-lg border border-border bg-surface p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Enterprise
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Security Monitoring esta disponivel no AgentLX Enterprise. A edicao Community mantem
            apenas os contratos publicos, o feature gate e os endpoints delegados para permitir a
            integracao com o overlay privado.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/license"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ver licenca
            </Link>
            <Link
              to="/"
              className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Voltar ao painel
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export function MonitoringDashboardPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder />;
}

export function MonitoringMachinesPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Maquinas monitoradas" />;
}

export function MonitoringMachineDetailPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Detalhe da maquina" />;
}

export function MonitoringAlertsPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Alertas" />;
}

export function MonitoringEventsPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Eventos" />;
}

export function SecurityEventDetailPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Detalhe do evento" />;
}

export function MonitoringRulesPage(_: Record<string, unknown>) {
  return <SecurityMonitoringEnterprisePlaceholder title="Regras" />;
}
