import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config, isAdmin } from "../config.js";
import { q } from "../db.js";
import { safeEqual, now } from "../util.js";

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function json(res, status, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  res.end(data);
}

export function text(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  res.end(body);
}

export function html(res, status, body, extra = {}) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    ...extra,
  });
  res.end(body);
}

export function redirect(res, location, status = 302) {
  res.writeHead(status, { location, "cache-control": "no-store" });
  res.end();
}

export async function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson(req, limit = 1024 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  const ip = req.socket?.remoteAddress ?? "";
  return ip.replace(/^::ffff:/, "");
}

export function cookie(req, name) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function serveStatic(res, root, urlPath, req_headers = null) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  const stat = fs.statSync(file);
  const mtime = new Date(stat.mtimeMs);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (req_headers?.["if-none-match"] === etag) {
    res.writeHead(304, { etag, "cache-control": "no-cache" });
    res.end();
    return true;
  }
  const headers = {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "last-modified": mtime.toUTCString(),
    // المتصفح يعيد التحقق دائماً ⇒ أي تعديل يبان فوراً بلا «الموقع مازال كيما كان»
    "cache-control": ext === ".html" ? "no-store" : "no-cache, must-revalidate",
    etag,
    "x-content-type-options": "nosniff",
  };
  if (ext === ".html") {
    headers["content-security-policy"] =
      "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https:";
  }
  res.writeHead(200, headers);
  res.end(body);
  return true;
}

/** تحقق من ترويسة تيليغرام السرّية */
export function checkWebhookSecret(req) {
  if (!config.webhookSecret) return false;
  const got = req.headers["x-telegram-bot-api-secret-token"];
  return typeof got === "string" && safeEqual(got, config.webhookSecret);
}

/* ───────────── محدد معدّل بسيط لكل IP (للـ API) ───────────── */

const hits = new Map();
export function rateLimit(key, { max = 60, windowMs = 60000 } = {}) {
  const t = now();
  const arr = hits.get(key) ?? [];
  const from = t - windowMs;
  const kept = arr.filter((x) => x > from);
  if (kept.length >= max) {
    hits.set(key, kept);
    return { ok: false, remaining: 0, retryMs: kept[0] + windowMs - t };
  }
  kept.push(t);
  hits.set(key, kept);
  if (hits.size > 20000) hits.clear();
  return { ok: true, remaining: max - kept.length, retryMs: 0 };
}

export { isAdmin };
