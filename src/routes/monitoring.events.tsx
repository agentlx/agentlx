import { createFileRoute } from "@tanstack/react-router";
import { MonitoringEventsPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityDashboardData,
  hasSecurityMonitoringFeatureData,
  searchSecurityInvestigationEventsData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/events")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    const [dashboard, initial] = await Promise.all([
      getSecurityDashboardData({ data: { period: "24h" } }),
      searchSecurityInvestigationEventsData({
        data: {
          limit: 10,
          filters: {},
          sort: { field: "created_at", direction: "desc" },
        },
      }),
    ]);
    return { dashboard, initial };
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringEventsRoute,
});

function MonitoringEventsRoute() {
  const dashboard = Route.useLoaderData();
  if (!dashboard) {
    return <SecurityMonitoringEnterprisePlaceholder title="Eventos" />;
  }
  return <MonitoringEventsPage dashboard={dashboard.dashboard} initial={dashboard.initial} />;
}
