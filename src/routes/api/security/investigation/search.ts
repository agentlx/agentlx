import { createFileRoute } from "@tanstack/react-router";
import { securityInvestigationSearchInputSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { searchEnterpriseSecurityInvestigationEvents } from "@/server/edition.server";
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

export const Route = createFileRoute("/api/security/investigation/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          assertTrustedCookieRequest(request);
          const viewer = await requireScreenAccess("monitoring");
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const { data } = await readJsonBody(
            request,
            securityInvestigationSearchInputSchema,
            BODY_LIMITS.json,
          );
          return jsonResponse(
            await searchEnterpriseSecurityInvestigationEvents({
              ...data,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao executar busca investigativa."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
