#!/usr/bin/env node
/**
 * opencode-gateway
 *
 * Tiny zero-dependency reverse proxy that sits in front of the opencode server.
 * Why it exists:
 *   - opencode's HTTP server only answers CORS for explicitly allowed origins, and it
 *     returns no access-control-allow-origin at all for unknown ones. The mobile app
 *     (WebView / browser engine) then reads plain REST calls fine but its SSE stream
 *     gets blocked, which shows up as "Connecting..." forever.
 *   - Some tunnels buffer responses; SSE needs immediate flushing.
 *
 * It also keeps the upstream on loopback so nothing bypasses the gateway.
 *
 * usage: node opencode-gateway.mjs [--listen 0.0.0.0:8080] [--upstream 127.0.0.1:8081]
 */
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = process.env.OPENCODE_WEB_ROOT || path.join(__dirname, "..", "web");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function parseHostPort(value) {
  const idx = value.lastIndexOf(":");
  return { host: value.slice(0, idx), port: Number(value.slice(idx + 1)) };
}

const listen = parseHostPort(arg("listen", "0.0.0.0:8080"));
const upstream = parseHostPort(arg("upstream", "127.0.0.1:8081"));
// the chat site's own API (instant answers + uploads) lives on its own port
const webapi = parseHostPort(arg("webapi", process.env.OPENCODE_WEBAPI || "127.0.0.1:8090"));

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const ALLOW_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "accept-language",
  "x-requested-with",
  "x-opencode-directory",
  "x-opencode-session",
  "x-opencode-agent",
  "last-event-id",
  "cache-control",
  "pragma",
].join(", ");

const EXPOSE_HEADERS = "content-type, content-length, cache-control, last-event-id, x-opencode-*, *";

function corsHeaders(req) {
  const origin = req.headers.origin;
  return {
    // reflect the caller's origin (works for file://, capacitor://, http://localhost, https://…)
    "access-control-allow-origin": origin || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-expose-headers": EXPOSE_HEADERS,
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

// Drops a small chat UI on the tunnel root so the same origin serves both the page
// and the opencode API (no cross-origin at all: sticky even where CORS is stripped).
function serveStatic(req, res, urlPath) {
  if (!fs.existsSync(WEB_ROOT)) return false;
  let rel = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(WEB_ROOT, path.normalize(rel).replace(/^([.][.][/\\])+/, "").replace(/^[/\\]+/, ""));
  if (!file.startsWith(WEB_ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    ...corsHeaders(req),
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

const server = http.createServer((req, res) => {
  // preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...corsHeaders(req), "content-length": "0" });
    res.end();
    return;
  }

  const urlPath = (req.url || "/").split("?")[0];
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  const isApi = urlPath.startsWith("/api/") || urlPath.startsWith("/web/") || urlPath === "/event" || urlPath === "/global/event" ||
    urlPath === "/config" || urlPath === "/session" || urlPath.startsWith("/session/") ||
    urlPath === "/doc" || urlPath === "/openapi.json" || urlPath === "/global/health" ||
    urlPath === "/project" || urlPath.startsWith("/project/") || urlPath === "/agent" ||
    urlPath === "/provider" || urlPath.startsWith("/provider/");
  if ((req.method === "GET" || req.method === "HEAD") && !isApi) {
    if (serveStatic(req, res, urlPath)) return;
    // SPA-ish fallback for the chat page
    if (wantsHtml && serveStatic(req, res, "/index.html")) return;
  }

  // /web/* goes to the chat api, everything else to opencode
  const target = urlPath.startsWith("/web/") ? webapi : upstream;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers.host = `${target.host}:${target.port}`;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
  // always ask the upstream for an uncompressed stream: SSE must not sit in a gzip buffer
  delete headers["accept-encoding"];

  const proxied = http.request(
    {
      host: target.host,
      port: target.port,
      method: req.method,
      path: req.url,
      headers,
    },
    (upRes) => {
      const outHeaders = { ...corsHeaders(req) };
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v;
      }
      const type = String(upRes.headers["content-type"] || "");
      const isStream = type.includes("text/event-stream");
      if (isStream) {
        outHeaders["cache-control"] = "no-cache, no-transform";
        outHeaders["x-accel-buffering"] = "no";
        outHeaders.connection = "keep-alive";
      }

      res.writeHead(upRes.statusCode || 502, outHeaders);
      res.flushHeaders?.();

      if (isStream) {
        res.socket?.setNoDelay(true);
        res.socket?.setKeepAlive(true, 15000);
        res.socket?.setTimeout(0);
      }

      upRes.on("data", (chunk) => {
        const ok = res.write(chunk);
        if (isStream || !ok) res.flushHeaders?.();
      });
      upRes.on("end", () => res.end());
      upRes.on("error", () => res.destroy());
      // client gone -> stop upstream work
      req.on("close", () => {
        if (!res.writableEnded) {
          upRes.destroy();
        }
      });
    },
  );

  proxied.setTimeout(0);
  // forward the request body (POST/PATCH) - without this the upstream waits forever
  proxied.on("error", (err) => {
    log("upstream error", req.method, req.url, target.host + ":" + target.port, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { ...corsHeaders(req), "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: "upstream_unreachable", message: err.message }));
  });

  req.pipe(proxied);
  req.on("error", () => proxied.destroy());
});

// long-lived SSE + mobile networks: disable every default timeout
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 0;
server.timeout = 0;

// websocket / upgrade passthrough (some clients use it for live events)
server.on("upgrade", (req, socket, head) => {
  const target = net.connect(upstream.port, upstream.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    const headers = { ...req.headers, host: `${upstream.host}:${upstream.port}` };
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    target.write(lines.join("\r\n") + "\r\n\r\n");
    if (head?.length) target.write(head);
    socket.pipe(target).pipe(socket);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
});

server.listen(listen.port, listen.host, () => {
  log(`gateway on http://${listen.host}:${listen.port} | api -> ${upstream.host}:${upstream.port} | web -> ${webapi.host}:${webapi.port}`);
});
