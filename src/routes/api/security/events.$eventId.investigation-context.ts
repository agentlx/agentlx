import { createFileRoute } from "@tanstack/react-router";
import { securityInvestigationContextInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { getEnterpriseSecurityEventInvestigationContext } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/events/$eventId/investigation-context")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const query = Object.fromEntries(new URL(request.url).searchParams);
          const input = securityInvestigationContextInputSchema.parse({
            ...query,
            eventId: params.eventId,
          });
          return jsonResponse(
            await getEnterpriseSecurityEventInvestigationContext({
              ...input,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao carregar contexto investigativo."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
