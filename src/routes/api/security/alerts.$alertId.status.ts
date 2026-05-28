import { createFileRoute } from "@tanstack/react-router";
import { updateSecurityAlertStatusSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { updateEnterpriseSecurityAlertStatus } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { assertTrustedCookieRequest } from "@/server/http-security.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/alerts/$alertId/status")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          assertTrustedCookieRequest(request);
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const { data } = await readJsonBody(
            request,
            updateSecurityAlertStatusSchema,
            BODY_LIMITS.json,
          );
          return jsonResponse(
            await updateEnterpriseSecurityAlertStatus({
              ...data,
              alertId: params.alertId,
              principal: toSecurityPrincipal(viewer),
              changedBy: viewer.email,
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao atualizar alerta de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
