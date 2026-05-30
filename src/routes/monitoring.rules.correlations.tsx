import { createFileRoute } from "@tanstack/react-router";
import { MonitoringCorrelationsPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import { hasSecurityMonitoringFeatureData } from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/rules/correlations")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    return hasSecurityMonitoringFeatureData();
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringCorrelationsRoute,
});

function MonitoringCorrelationsRoute() {
  const enabled = Route.useLoaderData();
  if (!enabled) {
    return <SecurityMonitoringEnterprisePlaceholder title="Correlacoes" />;
  }
  return <MonitoringCorrelationsPage />;
}
