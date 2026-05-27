import { createFileRoute } from "@tanstack/react-router";
import { securityAlertListInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { listEnterpriseSecurityAlerts } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const viewer = await requireScreenAccess("logs");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const input = securityAlertListInputSchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          return jsonResponse(
            await listEnterpriseSecurityAlerts({
              ...input,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao listar alertas de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
