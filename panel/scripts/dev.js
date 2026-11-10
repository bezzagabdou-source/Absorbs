/* FT AI — سيرفر تطوير محلي يحاكي Vercel (بلا تبعيات) */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/* إعادة كتابة المسارات (نفس vercel.json) */
const REWRITES = {
  "/api/password": "/api/auth/password",
  "/api/ai/chat": "/api/ai",
  "/api/ai/history": "/api/ai",
  "/api/auth/login": "/api/login",
  "/api/auth/session": "/api/session",
  "/api/auth/logout": "/api/logout",
};

const cache = new Map();
async function loadHandler(route) {
  // /api/a/b → api/a/b.js
  const file = path.join(ROOT, "api", `${route.replace(/^\/api\//, "")}.js`);
  if (!fs.existsSync(file)) return null;
  const mod = await import(`file://${file}?t=${fs.statSync(file).mtimeMs}`);
  return mod.default;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const target = REWRITES[url.pathname] ?? url.pathname;
      const handler = await loadHandler(target);
      if (!handler) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        return res.end(JSON.stringify({ ok: false, error: "endpoint غير موجود" }));
      }
      return await handler(req, res);
    }
    let rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(PUBLIC, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
      res.setHeader("cache-control", "no-cache, must-revalidate");
      return res.end(fs.readFileSync(file));
    }
    // SPA
    res.setHeader("content-type", MIME[".html"]);
    res.setHeader("cache-control", "no-store");
    return res.end(fs.readFileSync(path.join(PUBLIC, "index.html")));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(e?.message ?? e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FT AI — dev server على http://${HOST}:${PORT}`);
  console.log(`   تخزين: ${process.env.REDIS_URL ? "Redis" : "ذاكرة محلية (بلا Redis)"}`);
});
