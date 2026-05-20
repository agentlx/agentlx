import { createFileRoute } from "@tanstack/react-router";
import { executionResultSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, submitExecutionResult } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";
import {
  BODY_LIMITS,
  getErrorStatusCode,
  publicErrorMessage,
  readJsonBody,
} from "@/server/request-body.server";

export const Route = createFileRoute("/api/agent/executions/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { rawBody, data } = await readJsonBody(
            request,
            executionResultSchema,
            BODY_LIMITS.agentResult,
          );
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/executions/result",
            rawBody,
          );
          const result = await submitExecutionResult(authenticated, data);
          return jsonResponse({
            ok: true,
            executionId: result.execution.id,
            status: result.execution.status,
          });
        } catch (error) {
          return jsonError(
            publicErrorMessage(error, "Falha ao registrar resultado da execucao."),
            getErrorStatusCode(error) ?? 400,
          );
        }
      },
    },
  },
});
