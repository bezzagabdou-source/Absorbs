import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { q, getSetting, setSetting } from "../db.js";
import { json, readJson, readBody, clientIp, rateLimit } from "./http.js";
import { chat, aiHistory, aiActions, clearAiHistory, aiProviders } from "../ai/brain.js";
import { TOOLS, toolSchemas } from "../ai/tools.js";
import { selfDiagnose } from "../ai/shield.js";
import { saveUpload, listUploads, getUpload, deleteUpload } from "../services/uploads.js";
import { customQuestions, addQuestion, removeQuestion, customStats } from "../services/questions.js";
import { CATEGORIES } from "../data/questions.js";

/** واجهة عقل برق: محادثة + رفع صور + إدارة الأدوات والأسئلة */
export async function aiApi(req, res, url) {
  const p = url.pathname;
  const method = req.method ?? "GET";
  const ip = clientIp(req);

  /* ─────────── محادثة ─────────── */
  if (p === "/api/ai/chat" && method === "POST") {
    const rl = rateLimit(`ai:${ip}`, { max: 40, windowMs: 60000 });
    if (!rl.ok) return json(res, 429, { ok: false, error: "طلبات كثيرة على العقل، هدّي شوية." }), true;
    const body = await readJson(req, 256 * 1024);
    if (!body) return json(res, 400, { ok: false, error: "JSON غير صالح" }), true;
    const message = String(body.message ?? "").slice(0, 4000);
    const images = Array.isArray(body.images) ? body.images.filter((x) => typeof x === "string").slice(0, 6) : [];
    if (!message && !images.length) return json(res, 400, { ok: false, error: "اكتب رسالة أو ارفع صورة" }), true;
    let out;
    try {
      out = await chat({ message, images, source: "dashboard" });
    } catch (e) {
      out = { ok: false, text: "⚠️ وقع خطأ غير متوقع: " + String(e?.message ?? e), trace: [] };
    }
    return json(res, 200, out), true;
  }

  if (p === "/api/ai/history") {
    if (method === "DELETE") {
      clearAiHistory();
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 200, { ok: true, messages: aiHistory(60), actions: aiActions(40), providers: aiProviders() }), true;
  }

  if (p === "/api/ai/tools") {
    return json(res, 200, { ok: true, tools: TOOLS.map((t) => ({ name: t.name, category: t.category, description: t.description, parameters: t.parameters })) }), true;
  }

  if (p === "/api/ai/diagnose" && method === "POST") {
    const diag = selfDiagnose();
    const providers = aiProviders();
    const keys = {
      openrouter: providers.openrouter > 0,
      grok: providers.grok > 0,
    };
    const issues = [...diag.issues];
    if (!keys.openrouter && !keys.grok) issues.push("ما كاين حتى مفتاح ذكاء اصطناعي — العقل يخدم بدرع التنفيذ فقط");
    return json(res, 200, { ok: true, ...diag, issues, providers, bot: { demo: config.demo, username: config.botUsername } }), true;
  }

  if (p === "/api/ai/model" && method === "POST") {
    const body = await readJson(req, 4096);
    if (body?.model) setSetting("ai_model", String(body.model).slice(0, 120));
    if (body?.modelGrok) setSetting("ai_model_grok", String(body.modelGrok).slice(0, 120));
    return json(res, 200, { ok: true, model: getSetting("ai_model"), modelGrok: getSetting("ai_model_grok") }), true;
  }

  /* ─────────── الصور ─────────── */
  if (p === "/api/uploads" && method === "GET") {
    return json(res, 200, { ok: true, uploads: listUploads(80) }), true;
  }

  if (p === "/api/uploads" && method === "POST") {
    const rl = rateLimit(`up:${ip}`, { max: 30, windowMs: 60000 });
    if (!rl.ok) return json(res, 429, { ok: false, error: "رفع كثير، هدّي شوية." }), true;
    const ct = String(req.headers["content-type"] ?? "");
    try {
      if (ct.startsWith("application/json")) {
        const body = await readJson(req, 18 * 1024 * 1024);
        const data = String(body?.data ?? "");
        const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(data);
        if (!m) return json(res, 400, { ok: false, error: "صيغة البيانات غير صحيحة" }), true;
        const buf = Buffer.from(m[2], "base64");
        const out = saveUpload(buf, { name: body?.name ?? null, mime: m[1], note: body?.note ?? null });
        return json(res, 200, { ok: true, upload: out }), true;
      }
      // رفع خام (binary) مباشرة
      const buf = await readBody(req, 18 * 1024 * 1024);
      const out = saveUpload(buf, { name: req.headers["x-file-name"] ?? null, note: req.headers["x-note"] ?? null });
      return json(res, 200, { ok: true, upload: out }), true;
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e?.message ?? e) }), true;
    }
  }

  const upMatch = /^\/api\/uploads\/([A-Za-z0-9_-]+)$/.exec(p);
  if (upMatch) {
    const id = upMatch[1];
    if (method === "DELETE") {
      deleteUpload(id);
      return json(res, 200, { ok: true }), true;
    }
    const row = getUpload(id);
    if (!row) return json(res, 404, { ok: false, error: "غير موجود" }), true;
    res.writeHead(200, {
      "content-type": row.mime || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "content-length": fs.statSync(row.path).size,
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    });
    fs.createReadStream(row.path).pipe(res);
    return true;
  }

  /* ─────────── الأسئلة المخصّصة ─────────── */
  if (p === "/api/questions") {
    if (method === "GET") {
      return json(res, 200, { ok: true, stats: customStats(), questions: customQuestions(80), categories: CATEGORIES }), true;
    }
    const body = await readJson(req, 32 * 1024);
    try {
      const out = addQuestion({
        question: body?.question,
        options: body?.options,
        correct: body?.correct,
        category: body?.category,
        createdBy: "dashboard",
      });
      return json(res, 200, { ok: true, question: out }), true;
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e?.message ?? e) }), true;
    }
  }

  const qMatch = /^\/api\/questions\/(\d+)$/.exec(p);
  if (qMatch && method === "DELETE") {
    try {
      removeQuestion(Number(qMatch[1]));
      return json(res, 200, { ok: true }), true;
    } catch (e) {
      return json(res, 404, { ok: false, error: String(e?.message ?? e) }), true;
    }
  }

  /* ─────────── المفاتيح (تُخزَّن محلياً، تُعرض مقنّعة فقط) ─────────── */
  if (p === "/api/ai/keys" && method === "POST") {
    const body = await readJson(req, 8192);
    const out = {};
    if (typeof body?.openrouter === "string" && body.openrouter.trim().length > 10) {
      process.env.OPENROUTER_API_KEY = body.openrouter.trim();
      setSetting("key_openrouter", "env");
      out.openrouter = true;
    }
    if (typeof body?.grok === "string" && body.grok.trim().length > 10) {
      process.env.XAI_API_KEY = body.grok.trim();
      setSetting("key_grok", "env");
      out.grok = true;
    }
    return json(res, 200, { ok: true, set: out, providers: aiProviders() }), true;
  }

  return json(res, 404, { ok: false, error: "مسار غير موجود" }), true;
}

export { toolSchemas, path };
