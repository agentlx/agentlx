import { createFileRoute } from "@tanstack/react-router";
import { agentSecurityEventsIngestSchema } from "@/lib/security-monitoring";
import { authenticateAgentRequest } from "@/server/agent.server";
import { ingestEnterpriseSecurityEvents } from "@/server/edition.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";
import { securityMonitoringFeatureGate } from "@/server/security-monitoring.server";

export const Route = createFileRoute("/api/agent/security/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { rawBody, data } = await readJsonBody(
            request,
            agentSecurityEventsIngestSchema,
            BODY_LIMITS.securityEvents,
          );
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/security/events",
            rawBody,
          );
          const unavailable = await securityMonitoringFeatureGate();
          if (unavailable) {
            return unavailable;
          }
          return jsonResponse(
            await ingestEnterpriseSecurityEvents({
              agentId: authenticated.agent.id,
              machineId: authenticated.agent.machine_id,
              payload: data,
            }),
          );
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao processar eventos de seguranca."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
