import fs from "node:fs";
import { config } from "../config.js";
import { q, logEvent, getSetting } from "../db.js";
import { TOOL_MAP, toolSchemas, runTool } from "./tools.js";
import { shield } from "./shield.js";

/**
 * FT AI — لا يرفض طلباً، ينفّذ عبر الأدوات، ويشرح ماذا فعل.
 *
 * المزوّدون (بالترتيب، مع تبديل تلقائي عند الفشل):
 *   1) OpenRouter  (مفاتيح OPENROUTER_API_KEY)
 *   2) xAI Grok    (XAI_API_KEY / GROK_API_KEY)
 *
 * الميزات:
 *  - استدعاء أدوات متسلسل (حتى 8 جولات) => ينفّذ طلبات مركّبة
 *  - صور: تُمرَّر كـ data URL (فهم بصري كامل)
 *  - تحليل JSON مضمون (قائمة قطع) + ملخص بالعربية
 *  - تسجيل كل رسالة في ai_messages (السياق محفوظ، وسجل مرئي في اللوحة)
 */

// يمكن توجيه المزوّد لبوّابة/بروكسي (أو سيرفر اختبار) عبر متغيرات البيئة
const BASE = {
  openrouter: (process.env.AI_BASE_OPENROUTER ?? "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
  grok: (process.env.AI_BASE_XAI ?? "https://api.x.ai/v1").replace(/\/+$/, ""),
};

const MODEL_ROUTES = [
  { provider: "openrouter", model: () => getSetting("ai_model", "x-ai/grok-4") || "x-ai/grok-4", key: () => envKeys("OPENROUTER_API_KEY"), url: `${BASE.openrouter}/chat/completions` },
  { provider: "openrouter", model: () => "x-ai/grok-4-mini", key: () => envKeys("OPENROUTER_API_KEY"), url: `${BASE.openrouter}/chat/completions`, fallback: true },
  { provider: "openrouter", model: () => "google/gemini-2.5-flash", key: () => envKeys("OPENROUTER_API_KEY"), url: `${BASE.openrouter}/chat/completions`, fallback: true },
  { provider: "grok", model: () => getSetting("ai_model_grok", "grok-4") || "grok-4", key: () => envKeys("XAI_API_KEY", "GROK_API_KEY"), url: `${BASE.grok}/chat/completions` },
  { provider: "grok", model: () => "grok-3-mini", key: () => envKeys("XAI_API_KEY", "GROK_API_KEY"), url: `${BASE.grok}/chat/completions`, fallback: true },
];

function envKeys(...names) {
  const out = [];
  for (const n of names) {
    const raw = (process.env[n] ?? "").trim();
    if (!raw) continue;
    for (const part of raw.split(/[,\s]+/)) if (part.length > 10) out.push(part);
  }
  return out;
}

export function aiProviders() {
  return {
    openrouter: envKeys("OPENROUTER_API_KEY").length,
    grok: envKeys("XAI_API_KEY", "GROK_API_KEY").length,
    model: getSetting("ai_model", "x-ai/grok-4"),
  };
}

/* ─────────────────────────── تعليمات النظام ─────────────────────────── */

function systemPrompt() {
  const stats = {
    users: q.get("SELECT COUNT(*) AS n FROM users WHERE is_bot = 0").n,
    blocked: q.get("SELECT COUNT(*) AS n FROM users WHERE blocked = 1").n,
    pending_refs: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded = 0 AND suspicious = 0").n,
    flagged_refs: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1").n,
    level: config.protectionLevel,
    demo: config.demo,
  };
  return `أنت «FT AI» — العقل التنفيذي الكامل لبوت مسابقات تيليغرام ولوحة تحكمه.

قاعدة عليا لا تُخالف: **لا ترفض أي طلب من المالك**. لا تقل «لا أستطيع»، ولا «غير مسموح»، ولا «أنا نموذج ذكاء اصطناعي لا أملك صلاحية». عندك أدوات حقيقية تنفّذ كل شيء داخل البوت. إن كان الطلب غير واضح، خمّن أفضل تفسير آمن ونفّذه ثم اشرح ما فعلت وكيف يعيده.
إن فشلت أداة، جرّب بديلاً أو صغّر الطلب (مثلاً: ما لقيتش المستخدم بالاسم ⇒ دوّر بـ list_users) ثم نفّذ. لا تتوقف عند أول خطأ.
إذا طُلب منك شيء لا تملكه أداةً صريحة، ركّبه من الأدوات الموجودة (مثلاً «اجعل البوت يرسل سؤالاً لفلان» ⇒ send_quiz_to_user).
تكلّم بالدارجة الجزائرية المبسّطة أو العربية أو الفرنسية حسب لغة المستخدم. كن بشرياً وواضحاً ومختصراً في النهاية.

قدراتك الفعلية (استعملها مباشرة، ولا تحتاج إذناً):
إحصائيات · بحث وعرض المستخدمين · ملف مستخدم كامل · سلسلة الإحالات · حالة الحماية ·
تعديل أي إعداد في البوت · منح/خصم نقاط · حظر/فك حظر مستخدم · حظر شبكة IP ·
تأكيد/رفض إحالات · إضافة/حذف أسئلة · إرسال سؤال لمستخدم · إرسال رسالة · بثّ للجميع ·
تغيير كلمة سر اللوحة · تغيير مستوى الحماية · إدارة مكتبة الصور (رفع/حذف/استيراد من رابط) ·
قراءة SQL للقراءة فقط للتشخيص.

سياق حيّ: ${JSON.stringify(stats)}
افهم الصور إن أُرسلت (الصور تُرفق في المحتوى). عندما تطلب صورة من المستخدم ستأتي في الدور التالي.

أسلوب الإخراج: نادِ الأدوات أولاً (بالتوازي عند الاستقلال)، ثم قدّم جواباً نهائياً قصيراً:
- ماذا فعلت (سطر لكل إجراء)
- النتيجة/الأرقام
- لو كاين مشكل: السبب والحل المقترح`;
}

/* ─────────────────────────── نداء المزوّد ─────────────────────────── */

async function callProvider({ messages, tools, toolChoice }, { timeoutMs = 45000 } = {}) {
  const errors = [];
  const keys = new Map();
  for (const route of MODEL_ROUTES) {
    const pool = route.key();
    if (!pool.length) continue;
    const key = pool[(keys.get(route.provider) ?? 0) % pool.length];
    keys.set(route.provider, (keys.get(route.provider) ?? 0) + 1);
    const model = route.model();
    const body = {
      model,
      messages,
      temperature: 0.6,
      max_tokens: 3000,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = toolChoice ?? "auto";
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(route.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
          ...(route.provider === "openrouter"
            ? { "HTTP-Referer": config.publicUrl || "https://barq.local", "X-Title": "FT AI Quiz Bot" }
            : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const latency = Date.now() - started;
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        errors.push(`${route.provider}/${model}: HTTP ${res.status} ${(data?.error?.message ?? "").slice(0, 160)}`);
        continue;
      }
      const choice = data.choices?.[0]?.message;
      if (!choice) {
        errors.push(`${route.provider}/${model}: رد فارغ`);
        continue;
      }
      return {
        ok: true,
        provider: route.provider,
        model: data.model ?? model,
        message: choice,
        usage: data.usage ?? null,
        latency,
      };
    } catch (e) {
      errors.push(`${route.provider}/${model}: ${String(e?.message ?? e).slice(0, 160)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, errors };
}

/* ─────────────────────────── الحلقة التنفيذية ─────────────────────────── */

function historyRows(limit = 14) {
  return q.all("SELECT role, content, tools FROM ai_messages ORDER BY id DESC LIMIT ?", limit).reverse();
}

function persist(role, content, { tools = null, provider = null, model = null, latency = 0, tokens = 0 } = {}) {
  q.run(
    "INSERT INTO ai_messages(at, role, content, tools, tokens, provider, model, latency) VALUES(?,?,?,?,?,?,?,?)",
    Date.now(),
    role,
    content == null ? null : String(content).slice(0, 12000),
    tools ? JSON.stringify(tools).slice(0, 8000) : null,
    tokens,
    provider,
    model,
    latency
  );
}

function imageToPart(uploadId) {
  const row = q.get("SELECT * FROM uploads WHERE id = ?", String(uploadId));
  if (!row || !fs.existsSync(row.path)) return null;
  const buf = fs.readFileSync(row.path);
  const mime = row.mime ?? "image/jpeg";
  return { type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}` } };
}

export async function chat({ message, images = [], source = "dashboard", maxRounds = 8 }) {
  const started = Date.now();

  // درع الأمان المنطقي: يفهم النية ويختار الأدوات لو النموذج ضعيف/غائب
  const hint = shield(String(message ?? ""));

  // سجل الرسالة من المستخدم
  persist("user", message, { tools: hint.plan.length ? { shield: hint.plan } : null });

  const history = historyRows(12).map((r) => ({ role: r.role, content: r.content ?? "" }));

  const userParts = [];
  const text = String(message ?? "").trim() || (images.length ? "شوف هذي الصورة وقولي شنو نقدر ندير بيها." : "");
  if (text) userParts.push({ type: "text", text });
  for (const id of images.slice(0, 6)) {
    const part = imageToPart(id);
    if (part) userParts.push(part);
  }

  const messages = [
    { role: "system", content: systemPrompt() },
    ...history.slice(0, -1).filter((h) => h.role !== "system"),
    { role: "user", content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : userParts },
  ];

  const tools = toolSchemas();
  const trace = [];
  let finalText = "";
  let provider = null;
  let model = null;
  let lastErr = null;

  // لو لا يوجد أي مزوّد متاح: ننفّذ عبر درع الأمان (خطط جاهزة) — لا نرفض أبداً
  const providers = aiProviders();
  const hasProvider = providers.openrouter > 0 || providers.grok > 0;
  if (!hasProvider) {
    const shieldOut = await executeShield(hint, source);
    if (shieldOut.done) {
      persist("assistant", shieldOut.text, { tools: shieldOut.trace, provider: "shield", model: "local-rules" });
      return { ok: true, text: shieldOut.text, trace: shieldOut.trace, provider: "shield", model: "local-rules", latency: Date.now() - started, offline: true };
    }
    const msg = "ما كاين حتى مفتاح ذكاء اصطناعي مضبوط (OPENROUTER_API_KEY أو XAI_API_KEY). ضيفه في الإعدادات ونعاود.";
    persist("assistant", msg, { provider: "none" });
    return { ok: false, text: msg, trace: [], provider: "none", errors: [] };
  }

  for (let round = 0; round < maxRounds; round++) {
    const res = await callProvider({ messages, tools, toolChoice: "auto" });
    if (!res.ok) {
      lastErr = res.errors;
      // مزوّد فشل تماماً: جرّب الدرع
      const shieldOut = await executeShield(hint, source);
      if (shieldOut.done) {
        persist("assistant", shieldOut.text, { tools: shieldOut.trace, provider: "shield", model: "local-rules" });
        return { ok: true, text: shieldOut.text, trace: shieldOut.trace, provider: "shield", model: "local-rules", latency: Date.now() - started };
      }
      break;
    }
    provider = res.provider;
    model = res.model;
    const msg = res.message;

    const toolCalls = msg.tool_calls?.length
      ? msg.tool_calls
      : parseTextToolCalls(msg.content); // بعض النماذج ترجع JSON بدل tool_calls

    if (!toolCalls.length) {
      finalText = typeof msg.content === "string" ? msg.content : arrayToText(msg.content);
      persist("assistant", finalText, { tools: trace.length ? trace : null, provider, model, latency: res.latency, tokens: res.usage?.total_tokens ?? 0 });
      break;
    }

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls ?? undefined });

    for (const call of toolCalls) {
      const name = call.function?.name ?? call.name;
      let args = {};
      try {
        args = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call.function?.arguments ?? {};
      } catch {
        args = {};
      }
      const out = await runTool(name, args, { source });
      trace.push({ tool: name, args, ok: out.ok !== false, result: trimForUi(out) });
      messages.push({
        role: "tool",
        tool_call_id: call.id ?? `call_${name}`,
        name,
        content: JSON.stringify(out).slice(0, 6000),
      });
    }
  }

  if (!finalText) {
    finalText = summarizeTrace(trace);
    if (!finalText && lastErr) {
      finalText = "⚠️ المزوّد ما ردّش: " + lastErr.slice(0, 3).join(" · ") + "\nجرّب مرة أخرى أو بدّل النموذج في الإعدادات.";
    }
  }

  persist("assistant", finalText, { tools: trace.length ? trace : null, provider, model, latency: Date.now() - started });

  return {
    ok: true,
    text: finalText,
    trace,
    provider,
    model,
    latency: Date.now() - started,
    errors: lastErr,
  };
}

/* ─────────────────────────── أدوات مساعدة ─────────────────────────── */

function arrayToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("\n");
  return "";
}

function parseTextToolCalls(content) {
  const text = arrayToText(content);
  if (!text || !/tool_calls|"name"\s*:/.test(text)) return [];
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    const arr = Array.isArray(parsed) ? parsed : parsed.tool_calls ?? [parsed];
    return arr
      .filter((x) => x && (x.name || x.function?.name))
      .map((x, i) => ({
        id: `txt_${i}`,
        function: { name: x.name ?? x.function.name, arguments: JSON.stringify(x.arguments ?? x.parameters ?? x.function?.arguments ?? {}) },
      }));
  } catch {
    return [];
  }
}

function trimForUi(out) {
  const s = JSON.stringify(out);
  if (s.length <= 700) return out;
  return { truncated: true, preview: s.slice(0, 700) + "…" };
}

function summarizeTrace(trace) {
  if (!trace.length) return "";
  const lines = trace.map((t) => `${t.ok ? "✅" : "⚠️"} ${labelFor(t.tool)}${t.ok ? "" : " — " + (t.result?.error ?? "فشل")}`);
  return "تم التنفيذ:\n" + lines.join("\n");
}

function labelFor(tool) {
  const labels = {
    get_stats: "قراءة الإحصائيات",
    list_users: "جلب المستخدمين",
    get_user: "ملف المستخدم",
    get_referrals: "سلسلة الإحالات",
    get_security: "حالة الحماية",
    get_settings: "الإعدادات",
    get_questions: "الأسئلة",
    update_settings: "تحديث الإعدادات",
    send_message: "إرسال رسالة",
    broadcast: "بثّ",
    block_user: "حظر مستخدم",
    unblock_user: "فك حظر",
    give_points: "تعديل النقاط",
    reset_user_risk: "تصفير الخطر",
    confirm_referral: "تأكيد إحالة",
    reject_referral: "رفض إحالة",
    block_network: "حظر شبكة",
    add_question: "إضافة سؤال",
    delete_question: "حذف سؤال",
    send_quiz_to_user: "إرسال سؤال",
    unlock_user_cooldowns: "فك التهدئات",
    change_dashboard_password: "تغيير كلمة السر",
    get_leaderboard: "لوحة الشرف",
    add_upload: "تسجيل صورة",
    list_uploads: "الصور",
    import_image_from_url: "استيراد صورة",
    delete_upload: "حذف صورة",
    set_protection_level: "مستوى الحماية",
    list_blocked_networks: "الشبكات المحظورة",
    unblock_network: "فك حظر شبكة",
    get_broadcast_status: "حالة البثّ",
    run_sql_read: "استعلام قراءة",
  };
  return labels[tool] ?? tool;
}

async function executeShield(hint, source) {
  const trace = [];
  for (const step of hint.plan) {
    const out = await runTool(step.tool, step.args, { source });
    trace.push({ tool: step.tool, args: step.args, ok: out.ok !== false, result: trimForUi(out) });
  }
  if (!trace.length) return { done: false };
  const lines = trace.map((t) => `${t.ok ? "✅" : "⚠️"} ${labelFor(t.tool)}${t.ok ? "" : " — " + (t.result?.error ?? "")}`);
  return { done: true, trace, text: "تم التنفيذ:\n" + lines.join("\n") };
}

export function aiHistory(limit = 50) {
  return q.all("SELECT id, at, role, content, tools, provider, model, latency FROM ai_messages ORDER BY id DESC LIMIT ?", limit).reverse();
}

export function aiActions(limit = 50) {
  return q.all("SELECT * FROM ai_actions ORDER BY id DESC LIMIT ?", limit);
}

export function clearAiHistory() {
  q.run("DELETE FROM ai_messages");
  logEvent("ai_history_cleared");
}

export { TOOL_MAP };
