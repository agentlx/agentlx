import { createFileRoute } from "@tanstack/react-router";
import { MonitoringInvestigationPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  hasSecurityMonitoringFeatureData,
  searchSecurityInvestigationEventsData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/investigation")({
  loader: async () => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return searchSecurityInvestigationEventsData({
      data: {
        limit: 10,
        filters: {},
        sort: { field: "risk_score", direction: "desc" },
      },
    });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringInvestigationRoute,
});

function MonitoringInvestigationRoute() {
  const initial = Route.useLoaderData();
  if (!initial) {
    return <SecurityMonitoringEnterprisePlaceholder title="Investigacao" />;
  }
  return <MonitoringInvestigationPage initial={initial} />;
}
