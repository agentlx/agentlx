import { getEnv } from "./env.server";

function safeOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function requestInitiatorOrigin(request: Request) {
  return safeOrigin(request.headers.get("origin")) ?? safeOrigin(request.headers.get("referer"));
}

export function isTrustedRequestOrigin(request: Request) {
  return requestInitiatorOrigin(request) === getEnv().APP_ORIGIN;
}

export function assertTrustedCookieRequest(
  request: Request,
  options: {
    message?: string;
  } = {},
) {
  if (isTrustedRequestOrigin(request)) {
    return;
  }

  throw new Error(options.message ?? "Origin da requisicao nao corresponde ao APP_ORIGIN.");
}

export function applySecurityHeaders(
  response: Response,
  options: {
    includeHsts?: boolean;
  } = {},
) {
  const headers = new Headers(response.headers);
  const env = getEnv();

  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws: wss:",
    ].join("; "),
  );

  if (options.includeHsts ?? env.APP_ORIGIN.startsWith("https://")) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
