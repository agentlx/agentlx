import { createFileRoute } from "@tanstack/react-router";
import { MonitoringCollectorDetailPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  hasSecurityMonitoringFeatureData,
  searchSecurityInvestigationEventsData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/collection-health/collector/$collectorName")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return searchSecurityInvestigationEventsData({
      data: {
        limit: 50,
        filters: { eventFamily: "agent" },
        sort: { field: "created_at", direction: "desc" },
      },
    });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringCollectorDetailRoute,
});

function MonitoringCollectorDetailRoute() {
  const params = Route.useParams();
  const initial = Route.useLoaderData();
  if (!initial) {
    return <SecurityMonitoringEnterprisePlaceholder title="Detalhe do collector" />;
  }
  return <MonitoringCollectorDetailPage collectorName={params.collectorName} initial={initial} />;
}
