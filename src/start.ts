import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getEnv } from "./server/env.server";

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
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
