import { createFileRoute } from "@tanstack/react-router";
import { MonitoringMachineDetailPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityMachineEventsOverviewData,
  hasSecurityMonitoringFeatureData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/machines/$machineId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return getSecurityMachineEventsOverviewData({
      data: { machineId: params.machineId, period: "24h", limit: 10, offset: 0 },
    });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringMachineDetailRoute,
});

function MonitoringMachineDetailRoute() {
  const overview = Route.useLoaderData();
  if (!overview) {
    return <SecurityMonitoringEnterprisePlaceholder title="Detalhe da maquina" />;
  }
  return <MonitoringMachineDetailPage overview={overview} />;
}
