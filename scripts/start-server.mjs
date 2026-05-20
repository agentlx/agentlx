import "dotenv/config";

import { createReadStream, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import http from "node:http";
import { stat } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const clientDistPath = fileURLToPath(new URL("../dist/client/", import.meta.url));

const moduleUrl = new URL("../dist/server/server.js", import.meta.url);
const serverModule = await import(moduleUrl.href);
const fetchHandler = serverModule.default?.fetch;

async function loadRealtimeTerminalInitializer() {
  const readInitializerFromModule = (moduleValue) => {
    if (typeof moduleValue?.initializeRealtimeTerminalServer === "function") {
      return moduleValue.initializeRealtimeTerminalServer;
    }

    if (
      typeof moduleValue?.openRealtimeTerminalSession?.initializeRealtimeTerminalServer ===
      "function"
    ) {
      return moduleValue.openRealtimeTerminalSession.initializeRealtimeTerminalServer;
    }

    if (typeof moduleValue?.t?.initializeRealtimeTerminalServer === "function") {
      return moduleValue.t.initializeRealtimeTerminalServer;
    }

    return undefined;
  };

  const directInitializer =
    readInitializerFromModule(serverModule.default) ?? readInitializerFromModule(serverModule);
  if (directInitializer) {
    return directInitializer;
  }

  const assetsDir = fileURLToPath(new URL("../dist/server/assets/", import.meta.url));
  const assetEntries = await readdir(assetsDir);
  const realtimeChunk = assetEntries.find(
    (entry) => entry.startsWith("terminal-realtime.server-") && entry.endsWith(".js"),
  );

  if (!realtimeChunk) {
    return undefined;
  }

  const runtimeModuleUrl = new URL(`../dist/server/assets/${realtimeChunk}`, import.meta.url);
  const runtimeModule = await import(runtimeModuleUrl.href);
  return readInitializerFromModule(runtimeModule);
}

const initializeRealtimeTerminalServer = await loadRealtimeTerminalInitializer();

if (typeof fetchHandler !== "function") {
  console.error("The TanStack Start server bundle did not export a fetch handler.");
  process.exit(1);
}

const DEFAULT_MAX_BODY_BYTES = Number(process.env.HTTP_MAX_BODY_BYTES || 6 * 1024 * 1024);
const AGENT_MAX_BODY_BYTES = Number(process.env.HTTP_AGENT_MAX_BODY_BYTES || 256 * 1024);
const AGENT_RESULT_MAX_BODY_BYTES = Number(
  process.env.HTTP_AGENT_RESULT_MAX_BODY_BYTES || 128 * 1024,
);
const TERMINAL_CONTROL_MAX_BODY_BYTES = Number(
  process.env.HTTP_TERMINAL_CONTROL_MAX_BODY_BYTES || 32 * 1024,
);

function bodyLimitForPath(pathname) {
  if (pathname === "/api/agent/executions/result") {
    return AGENT_RESULT_MAX_BODY_BYTES;
  }
  if (pathname.startsWith("/api/agent/")) {
    return AGENT_MAX_BODY_BYTES;
  }
  if (pathname.startsWith("/api/terminal/")) {
    return TERMINAL_CONTROL_MAX_BODY_BYTES;
  }
  return DEFAULT_MAX_BODY_BYTES;
}

const readBody = async (req, limitBytes) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > limitBytes) {
    const error = new Error("Payload Too Large");
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > limitBytes) {
      const error = new Error("Payload Too Large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const staticExtensions = new Set(Object.keys(contentTypes));
const appOrigin = (process.env.APP_ORIGIN || "http://localhost:3000").trim();
const trustProxy = /^true$/i.test(process.env.AGENTLX_TRUST_PROXY || "");

function firstHeaderValue(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return (
    rawValue
      ?.toString()
      .split(",")
      .map((item) => item.trim())
      .find(Boolean) || ""
  );
}

function cleanProtocol(value) {
  const protocol = value.replace(/:$/, "").toLowerCase();
  return protocol === "https" || protocol === "http" ? protocol : "";
}

function hostHasPort(value) {
  if (value.startsWith("[")) {
    return /\]:\d+$/.test(value);
  }
  return value.includes(":");
}

function appendForwardedPort(protocol, hostValue, forwardedPort) {
  if (!forwardedPort || !/^\d+$/.test(forwardedPort) || hostHasPort(hostValue)) {
    return hostValue;
  }

  if (
    (protocol === "https" && forwardedPort === "443") ||
    (protocol === "http" && forwardedPort === "80")
  ) {
    return hostValue;
  }

  return `${hostValue}:${forwardedPort}`;
}

function detectRequestOrigin(req) {
  const fallbackHost = firstHeaderValue(req.headers.host) || `${host}:${port}`;
  if (!trustProxy) {
    const protocol = cleanProtocol(firstHeaderValue(req.headers["x-forwarded-proto"])) || "http";
    return {
      origin: `${protocol}://${fallbackHost}`,
      protocol,
    };
  }

  const forwardedProtocol =
    cleanProtocol(firstHeaderValue(req.headers["x-forwarded-proto"])) ||
    (firstHeaderValue(req.headers["x-forwarded-ssl"]).toLowerCase() === "on" ? "https" : "");
  const protocol = forwardedProtocol || "http";
  const forwardedHost = firstHeaderValue(req.headers["x-forwarded-host"]);
  const forwardedPort = firstHeaderValue(req.headers["x-forwarded-port"]);
  const publicHost = appendForwardedPort(protocol, forwardedHost || fallbackHost, forwardedPort);

  return {
    origin: `${protocol}://${publicHost}`,
    protocol,
  };
}

function buildSecurityHeaders(isSecureRequest) {
  const headers = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' ws: wss:",
    ].join("; "),
  };

  if (isSecureRequest || appOrigin.startsWith("https://")) {
    headers["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  }

  return headers;
}

function applyNodeSecurityHeaders(res, isSecureRequest) {
  const headers = buildSecurityHeaders(isSecureRequest);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function isStaticAssetRequest(pathname) {
  const extension = extname(pathname).toLowerCase();

  return (
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    staticExtensions.has(extension)
  );
}

async function tryServeStaticAsset(req, res) {
  const detectedRequest = detectRequestOrigin(req);
  const requestUrl = new URL(req.url || "/", detectedRequest.origin);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const secureRequest = detectedRequest.protocol === "https";
  const normalizedPath = normalize(pathname)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const assetPath = resolve(clientDistPath, normalizedPath);

  if (!assetPath.startsWith(clientDistPath)) {
    return false;
  }

  if (!existsSync(assetPath)) {
    if (pathname === "/favicon.ico") {
      res.statusCode = 204;
      applyNodeSecurityHeaders(res, secureRequest);
      res.end();
      return true;
    }

    if (isStaticAssetRequest(pathname)) {
      console.warn(`[static-miss] ${pathname} -> ${assetPath}`);
      res.statusCode = 404;
      applyNodeSecurityHeaders(res, secureRequest);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("Not Found");
      return true;
    }

    return false;
  }

  const fileStat = await stat(assetPath).catch(() => null);
  if (!fileStat || !fileStat.isFile()) {
    return false;
  }

  const extension = extname(assetPath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  res.statusCode = 200;
  applyNodeSecurityHeaders(res, secureRequest);
  res.setHeader("content-type", contentType);
  if (extension === ".css" || extension === ".js" || extension === ".mjs") {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }

  await pipeline(createReadStream(assetPath), res);
  return true;
}

const nodeServer = http.createServer(async (req, res) => {
  try {
    if (await tryServeStaticAsset(req, res)) {
      return;
    }

    const detectedRequest = detectRequestOrigin(req);
    const url = new URL(req.url || "/", detectedRequest.origin);
    const body = await readBody(req, bodyLimitForPath(url.pathname));

    const request = new Request(url, {
      method: req.method,
      headers: new Headers(
        Object.entries(req.headers).flatMap(([key, value]) => {
          if (Array.isArray(value)) {
            return value.map((entry) => [key, entry]);
          }
          return value == null ? [] : [[key, value]];
        }),
      ),
      body,
    });

    const response = await fetchHandler(request, {}, {});
    res.statusCode = response.status;
    res.statusMessage = response.statusText;
    applyNodeSecurityHeaders(res, detectedRequest.protocol === "https");

    const getSetCookie =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie.bind(response.headers)
        : null;
    const setCookies = getSetCookie?.() ?? [];

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        return;
      }
      res.setHeader(key, value);
    });
    if (setCookies.length > 0) {
      res.setHeader("set-cookie", setCookies);
    }

    if (!response.body) {
      res.end();
      return;
    }

    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    console.error(error);
    res.statusCode = error?.statusCode === 413 ? 413 : 500;
    applyNodeSecurityHeaders(
      res,
      (req.headers["x-forwarded-proto"] || "").toString().includes("https"),
    );
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(error?.statusCode === 413 ? "Payload Too Large" : "Internal Server Error");
  }
});

if (typeof initializeRealtimeTerminalServer === "function") {
  initializeRealtimeTerminalServer(nodeServer);
} else {
  console.warn("Realtime terminal server initializer was not found in the production bundle.");
}

nodeServer.listen(port, host, () => {
  console.log(`agentlx listening on http://${host}:${port}`);
});
