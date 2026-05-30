import { createFileRoute } from "@tanstack/react-router";
import { MonitoringBaselineDetailPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityEventDetailData,
  hasSecurityMonitoringFeatureData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/baseline/$diffId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return getSecurityEventDetailData({ data: { eventId: params.diffId } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringBaselineDetailRoute,
});

function MonitoringBaselineDetailRoute() {
  const detail = Route.useLoaderData();
  if (!detail) {
    return <SecurityMonitoringEnterprisePlaceholder title="Detalhe do baseline" />;
  }
  return <MonitoringBaselineDetailPage detail={detail} />;
}
