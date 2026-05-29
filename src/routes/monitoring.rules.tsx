import { createFileRoute } from "@tanstack/react-router";
import { MonitoringRulesPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  hasSecurityMonitoringFeatureData,
  listSecurityRulesData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/rules")({
  loader: async () => {
    const viewer = await requireRouteScreen("monitoring");
    if (viewer.role !== "admin") {
      throw Object.assign(new Error("Esta area e restrita a administradores."), {
        statusCode: 403,
      });
    }
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return listSecurityRulesData({ data: { limit: 10, offset: 0, enabled: "all" } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringRulesRoute,
});

function MonitoringRulesRoute() {
  const initial = Route.useLoaderData();
  if (!initial) {
    return <SecurityMonitoringEnterprisePlaceholder title="Regras" />;
  }
  return <MonitoringRulesPage initial={initial} />;
}
