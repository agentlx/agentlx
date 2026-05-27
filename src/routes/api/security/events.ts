import { createFileRoute } from "@tanstack/react-router";
import { securityEventListInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { listEnterpriseSecurityEvents } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const viewer = await requireScreenAccess("logs");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const input = securityEventListInputSchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          return jsonResponse(
            await listEnterpriseSecurityEvents({
              ...input,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao listar eventos de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
