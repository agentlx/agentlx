import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { AppShell, Crumb } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import { listSecurityRulesData, updateSecurityRuleData } from "@/lib/security-monitoring-api";
import type { SecurityRuleView } from "@/lib/security-monitoring";
import { formatDateTime, MonitoringNav, SeverityBadge, StatusPill } from "@/lib/monitoring-ui";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/rules")({
  loader: async () => {
    const viewer = await requireRouteScreen("monitoring");
    if (viewer.role !== "admin") {
      throw Object.assign(new Error("Esta area e restrita a administradores."), {
        statusCode: 403,
      });
    }
    return listSecurityRulesData({ data: { limit: 100, offset: 0, enabled: "all" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Regras de monitoramento` },
      { name: "description", content: "Administracao de regras de monitoramento Enterprise." },
    ],
  }),
  component: MonitoringRulesPage,
});

function MonitoringRulesPage() {
  const initial = Route.useLoaderData();
  const loadRules = useServerFn(listSecurityRulesData);
  const updateRule = useServerFn(updateSecurityRuleData);
  const [rules, setRules] = useState<SecurityRuleView[]>(initial.items);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadRules({ data: { limit: 100, offset: 0, enabled: "all" } });
      setRules(next.items);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (rule: SecurityRuleView) => {
    setSavingId(rule.id);
    try {
      await updateRule({ data: { ruleId: rule.id, enabled: !rule.enabled } });
      await refresh();
      toast.success(`Regra ${!rule.enabled ? "habilitada" : "desabilitada"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar a regra.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppShell
      breadcrumb={
        <Crumb
          items={[
            { label: "root", to: "/" },
            { label: "monitoring", to: "/monitoring" },
            { label: "regras" },
          ]}
        />
      }
    >
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Regras</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Thresholds, status e classificacao das deteccoes Enterprise.
            </p>
          </div>
          <MonitoringNav active="/monitoring/rules" />
        </header>

        <section className="rounded-lg border border-border bg-surface p-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCcw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[1fr_130px_120px_160px_160px] border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>Regra</span>
            <span>Severidade</span>
            <span>Status</span>
            <span>Tipo</span>
            <span>Atualizada</span>
          </div>
          <div className="divide-y divide-border">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_130px_120px_160px_160px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.eventType ?? rule.ruleKind} · {rule.description}
                  </p>
                </div>
                <SeverityBadge severity={rule.severity} />
                <button
                  type="button"
                  onClick={() => void toggle(rule)}
                  disabled={savingId === rule.id}
                  className={`h-8 rounded-md border px-3 text-xs font-semibold ${
                    rule.enabled
                      ? "border-primary/40 text-primary hover:bg-primary/10"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  } disabled:opacity-60`}
                >
                  {rule.enabled ? "Ativa" : "Pausada"}
                </button>
                <StatusPill>{rule.ruleKind}</StatusPill>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(rule.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
