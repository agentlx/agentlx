import { createFileRoute } from "@tanstack/react-router";
import { SecurityEventDetailPage } from "@agentlx/enterprise-ui";
import { SecurityMonitoringEnterprisePlaceholder } from "@/enterprise/community-ui";
import { APP_NAME } from "@/lib/brand";
import {
  getSecurityEventDetailData,
  hasSecurityMonitoringFeatureData,
} from "@/lib/security-monitoring-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/monitoring/events_/$eventId")({
  loader: async ({ params }) => {
    await requireRouteScreen("monitoring");
    if (!(await hasSecurityMonitoringFeatureData())) return null;
    return getSecurityEventDetailData({ data: { eventId: params.eventId } });
  },
  head: () => ({
    meta: [
      { title: `${APP_NAME} | Monitoring` },
      { name: "description", content: "Security Monitoring disponivel no AgentLX Enterprise." },
    ],
  }),
  component: SecurityEventDetailRoute,
});

function SecurityEventDetailRoute() {
  const params = Route.useParams();
  const initialDetail = Route.useLoaderData();
  if (!initialDetail) {
    return <SecurityMonitoringEnterprisePlaceholder title="Detalhe do evento" />;
  }
  return <SecurityEventDetailPage initialDetail={initialDetail} eventId={params.eventId} />;
}
