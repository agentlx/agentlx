import { createFileRoute } from "@tanstack/react-router";
import { createSecurityAlertCommentSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { createEnterpriseSecurityAlertComment } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
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

export const Route = createFileRoute("/api/security/alerts/$alertId/comments")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const { data } = await readJsonBody(
            request,
            createSecurityAlertCommentSchema,
            BODY_LIMITS.json,
          );
          return jsonResponse(
            await createEnterpriseSecurityAlertComment({
              ...data,
              alertId: params.alertId,
              principal: toSecurityPrincipal(viewer),
              createdBy: viewer.email,
            }),
            { status: 201 },
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao comentar alerta de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
