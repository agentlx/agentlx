import { createFileRoute } from "@tanstack/react-router";
import { requireScreenAccess } from "@/server/auth.server";
import { getEnterpriseSecurityEventDetail } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/events/$eventId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          return jsonResponse(
            await getEnterpriseSecurityEventDetail({
              eventId: params.eventId,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao carregar detalhe do evento."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
