import { createFileRoute } from "@tanstack/react-router";
import { securityEventExportInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { exportEnterpriseSecurityEvents } from "@/server/edition.server";
import { jsonError } from "@/server/http.server";
import { getErrorStatusCode, publicErrorMessage } from "@/server/request-body.server";
import {
  securityMonitoringFeatureGate,
  toSecurityPrincipal,
} from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/security/events/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const input = securityEventExportInputSchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          );
          const exported = await exportEnterpriseSecurityEvents({
            ...input,
            principal: toSecurityPrincipal(viewer),
          });
          return new Response(exported.body, {
            headers: {
              "content-type": exported.contentType,
              "content-disposition": `attachment; filename="${exported.filename}"`,
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao exportar eventos de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
