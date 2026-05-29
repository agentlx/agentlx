import { createFileRoute } from "@tanstack/react-router";
import { MonitoringAlertsPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  hasSecurityMonitoringFeatureData,
  listSecurityAlertsData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/alerts")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return listSecurityAlertsData({
      data: { limit: 50, offset: 0, severity: "all", status: "all" },
    });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringAlertsRoute,
});

function MonitoringAlertsRoute() {
  const initial = Route.useLoaderData();
  if (!initial) {
    return <SecurityMonitoringEnterprisePlaceholder title="Alertas" />;
  }
  return <MonitoringAlertsPage initial={initial} />;
}
