import { createFileRoute } from "@tanstack/react-router";
import { executionResultSchema } from "@/lib/agentlx";
import { authenticateAgentRequest, submitExecutionResult } from "@/server/agent.server";
import { jsonError, jsonResponse } from "@/server/http.server";

export const Route = createFileRoute("/api/agent/executions/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const rawBody = await request.text();
          const authenticated = await authenticateAgentRequest(
            request,
            "/api/agent/executions/result",
            rawBody,
          );
          const body = executionResultSchema.parse(JSON.parse(rawBody));
          const result = await submitExecutionResult(authenticated, body);
          return jsonResponse({
            ok: true,
            executionId: result.execution.id,
            status: result.execution.status,
          });
        } catch (error) {
          const statusCode =
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            typeof error.statusCode === "number"
              ? error.statusCode
              : 400;

          return jsonError(
            error instanceof Error ? error.message : "Falha ao registrar resultado da execucao.",
            statusCode,
          );
        }
      },
    },
  },
});
