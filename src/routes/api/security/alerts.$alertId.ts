import { createFileRoute } from "@tanstack/react-router";
import { requireScreenAccess } from "@/server/auth.server";
import { getEnterpriseSecurityAlert } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/alerts/$alertId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const viewer = await requireScreenAccess("logs");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          return jsonResponse(
            await getEnterpriseSecurityAlert({
              alertId: params.alertId,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao carregar alerta de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
