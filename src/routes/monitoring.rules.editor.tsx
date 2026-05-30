import { createFileRoute } from "@tanstack/react-router";
import { MonitoringRuleEditorPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import { hasSecurityMonitoringFeatureData } from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/rules/editor")({
  loader: async () => {
    const viewer = await requireRouteScreen("monitoring");
    if (viewer.role !== "admin") {
      throw Object.assign(new Error("Esta area e restrita a administradores."), {
        statusCode: 403,
      });
    }
    return hasSecurityMonitoringFeatureData();
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: MonitoringRuleEditorRoute,
});

function MonitoringRuleEditorRoute() {
  const enabled = Route.useLoaderData();
  if (!enabled) {
    return <SecurityMonitoringEnterprisePlaceholder title="Editor de Regra" />;
  }
  return <MonitoringRuleEditorPage />;
}
