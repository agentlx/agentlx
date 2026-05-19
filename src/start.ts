import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getDeploymentSecurityState, getEnv } from "./server/env.server";

const deploymentLockMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  const deployment = getDeploymentSecurityState(request);
  const isAllowedLockStatusEndpoint = ["/api/health", "/api/deployment-status"].includes(
    url.pathname,
  );

  if (deployment.locked && !isAllowedLockStatusEndpoint) {
    const payload = {
      ok: false,
      code: "DEPLOYMENT_LOCKED",
      message: "Configure APP_ORIGIN com HTTPS para liberar o painel agentlx.",
      docsUrl: deployment.docsUrl,
      appOrigin: deployment.appOrigin,
      reasons: deployment.reasons,
    };

    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify(payload), {
        status: 423,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    return new Response(
      `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>agentlx bloqueado</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #05070b; color: #f8fafc;">
    <main style="max-width: 680px; padding: 32px;">
      <p style="margin: 0 0 12px; color: #f59e0b; font-weight: 700; text-transform: uppercase; letter-spacing: .14em;">HTTPS required</p>
      <h1 style="margin: 0 0 16px; font-size: 32px;">agentlx bloqueado</h1>
      <p style="line-height: 1.6; color: #cbd5e1;">O painel foi bloqueado porque a origem acessada nao corresponde a uma publicacao HTTPS segura.</p>
      <pre style="white-space: pre-wrap; overflow-wrap: anywhere; background: #0f172a; border: 1px solid #334155; padding: 16px; border-radius: 8px;">${deployment.reasons.join("\n")}</pre>
    </main>
  </body>
</html>`,
      {
        status: 423,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }

  return next();
});

const csrfMiddleware = createMiddleware().server(async (context) => {
  const { next, request } = context;
  const handlerType = (context as { handlerType?: string }).handlerType;
  if (handlerType === "serverFn" && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const expectedOrigin = getEnv().APP_ORIGIN;
    if (!origin || new URL(origin).origin !== expectedOrigin) {
      throw new Error("Origin check failed");
    }
  }

  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [deploymentLockMiddleware, csrfMiddleware, errorMiddleware],
}));
