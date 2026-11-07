import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, assertProduction, isAdmin } from "./config.js";
import { q, seedSettings, pruneOld, logEvent, getSetting } from "./db.js";
import { tg } from "./services/telegram.js";
import { handleUpdate, setupBot } from "./bot.js";
import { resolveRefToken, subToken } from "./services/referral.js";
import { dashboardApi } from "./web/dashboard.js";
import { json, text, html, clientIp, rateLimit, checkWebhookSecret, readJson, serveStatic, cookie } from "./web/http.js";
import { sha256, now } from "./util.js";
import { seedDemo } from "./demo.js";
import { safetyReport } from "./services/crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

seedSettings();
if (config.demo) seedDemo();

/* ────────────────────────── Webhook ────────────────────────── */

const secretPath = config.botToken ? sha256(config.botToken).slice(0, 32) : "demo";

async function handleWebhook(req, res) {
  if (!checkWebhookSecret(req)) {
    // لا نكشف أي معلومة — 403 فقط
    logEvent("webhook_denied", { severity: "warn", ip: clientIp(req), detail: "bad secret header" });
    return text(res, 403, "forbidden");
  }
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body || typeof body !== "object") return text(res, 400, "bad");

  // تيليغرام يحتاج رداً سريعاً: نردّ 200 فوراً ونعالج في الخلفية
  text(res, 200, "ok");
  setImmediate(() => {
    handleUpdate(body, { ipHint: clientIp(req) }).catch((e) =>
      logEvent("update_error", { severity: "error", detail: String(e?.stack ?? e).slice(0, 1200) })
    );
  });
}

/* ────────────────────────── صفحة الإحالة ────────────────────────── */

function referralLanding(token, to) {
  const user = resolveRefToken(token);
  const bot = config.botUsername || "YourBot";
  const target = to ?? `https://t.me/${bot}?start=ref_${token}`;
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(" ") || `@${user.username ?? ""}` : "صاحبك";
  const valid = Boolean(user);
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${valid ? `دعوة من ${escapeHtml(name)} — برق ⚡` : "رابط غير صالح — برق"}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 50% -10%,#1e3a8a55,transparent),#070b14;color:#e5edff;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:20px}
.card{width:min(440px,100%);background:#0e1526;border:1px solid #1e2a45;border-radius:26px;padding:30px 24px;text-align:center;box-shadow:0 30px 80px #00000088}
.bolt{font-size:56px;line-height:1;filter:drop-shadow(0 0 20px #38bdf855)}
h1{font-size:23px;margin:14px 0 8px}
p{color:#93a4c4;font-size:15px;line-height:1.7}
.btn{display:block;margin-top:22px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;padding:16px;border-radius:16px;font-weight:800;font-size:17px}
.pts{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.chip{background:#132038;border:1px solid #22304d;color:#bfd0ee;padding:8px 14px;border-radius:999px;font-size:13px}
.err{color:#fca5a5}
</style></head>
<body><div class="card">
<div class="bolt">⚡</div>
${
  valid
    ? `<h1>${escapeHtml(name)} عازمك!</h1><p>ادخل لبوت <b>برق</b>، جاوب على الأسئلة، اجمع النقاط، وتنافس في لوحة الشرف.</p>
<div class="pts"><span class="chip">🎯 مسابقات</span><span class="chip">🎁 مكافآت يومية</span><span class="chip">🏆 لوحة شرف</span></div>`
    : `<h1 class="err">الرابط ماشي صالح</h1><p>يمكن الرابط قديم ولا صاحبه محظور. تقدر تدخل البوت عادي.</p>`
}
<a class="btn" href="${escapeAttr(target)}">افتح البوت في تيليغرام</a>
</div>
<script>
try{fetch('/api/track',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)}})});}catch(e){}
setTimeout(function(){location.replace(${JSON.stringify(target)});},2200);
</script>
</body></html>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#96;");
}

/* ────────────────────────── السيرفر ────────────────────────── */

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ip = clientIp(req);

  try {
    // ترويسات أمان عامة
    res.setHeader("x-frame-options", "SAMEORIGIN");
    res.setHeader("referrer-policy", "same-origin");
    res.setHeader("x-content-type-options", "nosniff");

    /* فحص الصحة */
    if (url.pathname === "/healthz" || url.pathname === "/api/public/health") {
      return json(res, 200, {
        ok: true,
        uptime: Math.round(process.uptime()),
        demo: config.demo,
        level: config.protectionLevel,
        users: q.get("SELECT COUNT(*) AS n FROM users").n,
        issues: safetyReport(),
      });
    }

    /* الـ webhook */
    if (url.pathname === `/tg/${secretPath}` && req.method === "POST") {
      return await handleWebhook(req, res);
    }

    /* لوحة التحكم API */
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/track" && req.method === "POST") {
        const rl = rateLimit(`track:${ip}`, { max: 30, windowMs: 60000 });
        if (!rl.ok) return json(res, 429, { ok: false });
        const body = await readJson(req, 2048);
        const token = typeof body?.token === "string" ? body.token.slice(0, 24) : null;
        if (token) {
          q.run(
            "INSERT INTO visits(at, path, ip, country, ua, ref_token) VALUES(?,?,?,?,?,?)",
            now(),
            url.pathname,
            ip,
            req.headers["x-vercel-ip-country"] ?? null,
            String(req.headers["user-agent"] ?? "").slice(0, 200),
            token
          );
        }
        return json(res, 200, { ok: true });
      }
      // حماية API: قيود معدّل + نفس الأصل
      const rl = rateLimit(`api:${ip}`, { max: 240, windowMs: 60000 });
      if (!rl.ok) return json(res, 429, { ok: false, error: "طلبات كثيرة" });
      await dashboardApi(req, res, url);
      return;
    }

    /* صفحة الإحالة القصيرة */
    const rMatch = /^\/r\/([A-Za-z0-9]{6,24})$/.exec(url.pathname);
    if (rMatch) {
      const to = url.searchParams.get("to");
      const safeTo = to && /^https:\/\/t\.me\//.test(to) ? to : null;
      return html(res, 200, referralLanding(rMatch[1], safeTo));
    }

    /* الصفحة الرئيسية: إعادة توجيه للبوت أو صفحة تعريفية */
    if (url.pathname === "/") {
      if (config.botUsername && !config.demo) {
        return html(res, 200, landingPage());
      }
      return html(res, 200, landingPage());
    }

    /* الملفات الثابتة (اللوحة) */
    if (serveStatic(res, PUBLIC_DIR, url.pathname)) return;

    /* SPA fallback لمسارات اللوحة */
    if (!url.pathname.startsWith("/api/") && !url.pathname.includes(".")) {
      const idx = path.join(PUBLIC_DIR, "index.html");
      if (fs.existsSync(idx)) return html(res, 200, fs.readFileSync(idx, "utf8"));
    }

    text(res, 404, "not found");
  } catch (e) {
    logEvent("http_error", { severity: "error", detail: `${req.method} ${url.pathname} — ${String(e?.stack ?? e).slice(0, 800)}` });
    if (!res.headersSent) json(res, 500, { ok: false, error: "خطأ في السيرفر" });
  } finally {
    const ms = Date.now() - started;
    if (url.pathname.startsWith("/api/") && ms > 400) {
      logEvent("slow_api", { severity: "warn", detail: `${url.pathname} ${ms}ms` });
    }
  }
});

function landingPage() {
  const bot = config.botUsername || "YourBot";
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>برق ⚡ — بوت المسابقات</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:grid;place-items:center;background:radial-gradient(900px 500px at 50% -10%,#1d4ed855,transparent),#070b14;color:#e6edff;font-family:system-ui,Tahoma,sans-serif;padding:22px}
.card{width:min(520px,100%);background:#0d1424;border:1px solid #1e2a45;border-radius:28px;padding:40px 28px;text-align:center}
.b{font-size:64px;filter:drop-shadow(0 0 22px #38bdf877)}
h1{font-size:30px;margin:12px 0}
p{color:#93a4c4;line-height:1.8;font-size:15px}
a.btn{display:inline-block;margin-top:26px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;padding:16px 34px;border-radius:16px;font-weight:800}
.small{margin-top:22px;font-size:12px;color:#5b6c8c}
</style></head><body><div class="card">
<div class="b">⚡</div><h1>برق</h1>
<p>بوت مسابقات تيليغرام: أسئلة، نقاط، إحالات، لوحة شرف.<br>وحماية قصوى من الحظر ورشق النقاط.</p>
<a class="btn" href="https://t.me/${escapeAttr(bot)}">افتح البوت</a>
<div class="small">لوحة التحكم: <a href="/dashboard" style="color:#7aa2ff">/dashboard</a></div>
</div></body></html>`;
}

/* ────────────────────────── الإقلاع ────────────────────────── */

const problems = assertProduction();
if (problems.length) {
  console.warn("⚠️  إعدادات ناقصة:\n  - " + problems.join("\n  - "));
}

server.listen(config.port, config.host, async () => {
  console.log(`⚡ برق — سيرفر شغّال على http://${config.host}:${config.port}`);
  console.log(`   مستوى الحماية: ${config.protectionLevel} · وضع: ${config.demo ? "تجريبي" : "إنتاج"}`);
  if (!config.demo) {
    try {
      const me = await setupBot();
      console.log(`   البوت: @${me?.username ?? "?"}`);
      console.log(`   Webhook: ${config.publicUrl}/tg/${secretPath.slice(0, 8)}…`);
    } catch (e) {
      console.error("تعذّر ضبط البوت:", e?.message ?? e);
    }
  } else {
    console.log("   وضع تجريبي: لا اتصال حقيقي بتيليغرام. لوحة التحكم: /dashboard (كلمة السر من .env)");
  }
  setInterval(() => pruneOld(), 6 * 3600 * 1000).unref();
});

process.on("unhandledRejection", (e) => {
  logEvent("unhandled_rejection", { severity: "error", detail: String(e?.stack ?? e).slice(0, 1200) });
  console.error("unhandledRejection", e);
});
process.on("uncaughtException", (e) => {
  logEvent("uncaught_exception", { severity: "error", detail: String(e?.stack ?? e).slice(0, 1200) });
  console.error("uncaughtException", e);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("إيقاف...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
