import { createFileRoute } from "@tanstack/react-router";
import { updateSecurityRuleSchema } from "@/lib/security-monitoring";
import { requireScreenAccess } from "@/server/auth.server";
import { updateEnterpriseSecurityRule } from "@/server/edition.server";
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

export const Route = createFileRoute("/api/security/rules/$ruleId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          assertTrustedCookieRequest(request);
          const viewer = await requireScreenAccess("monitoring");
          if (viewer.role !== "admin") {
            throw Object.assign(new Error("Esta operacao e restrita a administradores."), {
              statusCode: 403,
            });
          }
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          const { data } = await readJsonBody(request, updateSecurityRuleSchema, BODY_LIMITS.json);
          return jsonResponse(
            await updateEnterpriseSecurityRule({
              ...data,
              ruleId: params.ruleId,
              principal: toSecurityPrincipal(viewer),
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao atualizar regra de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
