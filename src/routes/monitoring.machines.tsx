import { createFileRoute } from "@tanstack/react-router";
import { MonitoringMachinesPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityDashboardData,
  hasSecurityMonitoringFeatureData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/machines")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return getSecurityDashboardData({ data: { period: "24h" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringMachinesRoute,
});

function MonitoringMachinesRoute() {
  const dashboard = Route.useLoaderData();
  if (!dashboard) {
    return <SecurityMonitoringEnterprisePlaceholder title="Maquinas monitoradas" />;
  }
  return <MonitoringMachinesPage dashboard={dashboard} />;
}
