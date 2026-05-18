import "dotenv/config";

import { createReadStream, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import http from "node:http";
import { stat } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";
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

const readBody = async (req) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
      "script-src 'self' 'unsafe-inline'",
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
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const secureRequest = (req.headers["x-forwarded-proto"] || "").toString().includes("https");
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

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const url = new URL(req.url || "/", `${protocol}://${req.headers.host || `${host}:${port}`}`);
    const body = await readBody(req);

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
    applyNodeSecurityHeaders(res, protocol === "https");

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

    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    applyNodeSecurityHeaders(
      res,
      (req.headers["x-forwarded-proto"] || "").toString().includes("https"),
    );
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
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
