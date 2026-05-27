import { createFileRoute } from "@tanstack/react-router";
import { securityDashboardInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { getEnterpriseSecurityDashboard } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const input = securityDashboardInputSchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          return jsonResponse(
            await getEnterpriseSecurityDashboard({
              ...input,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao carregar dashboard de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
