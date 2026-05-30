import { createFileRoute } from "@tanstack/react-router";
import { MonitoringAlertDetailPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityAlertDetailData,
  hasSecurityMonitoringFeatureData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/alerts/$alertId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return getSecurityAlertDetailData({ data: { alertId: params.alertId } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringAlertDetailRoute,
});

function MonitoringAlertDetailRoute() {
  const detail = Route.useLoaderData();
  if (!detail) {
    return <SecurityMonitoringEnterprisePlaceholder title="Detalhe do alerta" />;
  }
  return <MonitoringAlertDetailPage detail={detail} />;
}
