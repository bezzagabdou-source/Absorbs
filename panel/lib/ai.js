/* FT AI — العقل التنفيذي (Vercel): OpenRouter → Grok → درع محلي، مع أدوات حقيقية */
import crypto from "node:crypto";
import { now, readState, updateState, recordAction } from "./core.js";

const BASE = {
  openrouter: (process.env.AI_BASE_OPENROUTER ?? "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
  grok: (process.env.AI_BASE_XAI ?? "https://api.x.ai/v1").replace(/\/+$/, ""),
};

function keysOf(...names) {
  const out = [];
  for (const n of names) {
    for (const part of String(process.env[n] ?? "").split(/[,\s]+/)) if (part.length > 12) out.push(part.trim());
  }
  return out;
}

export function providers() {
  return {
    openrouter: keysOf("OPENROUTER_API_KEY").length,
    grok: keysOf("XAI_API_KEY", "GROK_API_KEY").length,
  };
}

export function aiModel() {
  return process.env.AI_MODEL || "x-ai/grok-4.3";
}

/* ═══════════════ الأدوات ═══════════════ */
/* كل أداة: name, description, parameters (JSON Schema), run(args, ctx) → {ok, ...result} */

const day = () => Math.floor(now() / 86400000);
const todayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const userList = (s) => Object.values(s.users || {});
const findUser = (s, a) => {
  const all = userList(s);
  if (a.user_id != null && String(a.user_id).trim()) {
    const u = s.users[String(a.user_id).trim()];
    if (u) return u;
  }
  if (a.username) {
    const name = String(a.username).replace(/^@/, "").toLowerCase();
    return all.find((u) => String(u.username ?? "").toLowerCase() === name) ?? null;
  }
  return null;
};
const needUser = (s, a) => {
  const u = findUser(s, a);
  if (!u) throw new Error(`ما لقيتش المستخدم (id=${a.user_id ?? "—"} / @${a.username ?? "—"})`);
  return u;
};
const publicUser = (u) => ({
  id: u.id, name: u.name, username: u.username, points: u.points, referrals: u.referrals,
  blocked: u.blocked, risk: u.risk, quiz_total: u.quiz_total, quiz_correct: u.quiz_correct,
  joined: new Date(u.joined_at).toISOString().slice(0, 16).replace("T", " "),
});
const ok = (o) => ({ ok: true, ...o });

function stats(s) {
  const users = userList(s);
  const refs = s.referrals ?? [];
  return {
    users: users.length,
    new_today: users.filter((u) => u.joined_at >= todayStart()).length,
    active_24h: users.filter((u) => (u.last_seen ?? 0) >= now() - 86400000).length,
    points_total: users.reduce((n, u) => n + (u.points || 0), 0),
    balance_total: users.reduce((n, u) => n + Math.max(0, u.points || 0), 0),
    referrals_confirmed: refs.filter((r) => r.status === "confirmed").length,
    referrals_pending: refs.filter((r) => r.status === "pending").length,
    referrals_flagged: refs.filter((r) => r.status === "flagged").length,
    blocked_users: users.filter((u) => u.blocked).length,
    questions: s.questions.length,
    uploads: s.uploads.length,
    ai_messages: s.ai.length,
    protection_level: s.settings.protectionLevel,
    visits: s.metrics.visits,
    answers: s.metrics.answers,
    correct: s.metrics.correct,
  };
}

export const USER_TOOLS = [
  { name: "get_stats", description: "إحصائيات كاملة: الأعضاء، النقاط، الإحالات، المحظورون، الأسئلة، الحماية.", parameters: { type: "object", properties: {} }, run: (a, { state }) => ok(stats(state)) },
  {
    name: "list_users",
    description: "عرض/بحث المستخدمين مع النقاط والإحالات والحالة.",
    parameters: { type: "object", properties: {
      q: { type: "string", description: "بحث: اسم، يوزر أو ID" },
      sort: { type: "string", enum: ["newest", "points", "referrals", "risk"] },
      filter: { type: "string", enum: ["all", "blocked", "active", "risk", "flagged"] },
      limit: { type: "integer" },
    } },
    run: (a, { state }) => {
      let rows = userList(state);
      const qs = String(a.q ?? "").trim().toLowerCase();
      if (qs) rows = rows.filter((u) => [u.id, u.username, u.name, u.ref_code].some((v) => String(v ?? "").toLowerCase().includes(qs)));
      if (a.filter === "blocked") rows = rows.filter((u) => u.blocked);
      if (a.filter === "active") rows = rows.filter((u) => (u.last_seen ?? 0) >= now() - 86400000);
      if (a.filter === "risk") rows = rows.filter((u) => (u.risk ?? 0) >= 40);
      if (a.filter === "flagged") rows = rows.filter((u) => u.flagged);
      const sorters = { points: (u) => -(u.points || 0), referrals: (u) => -(u.referrals || 0), risk: (u) => -(u.risk || 0), newest: (u) => -(u.joined_at || 0) };
      rows = rows.sort(sorters[a.sort] ?? sorters.newest).slice(0, Math.min(50, Number(a.limit) || 15));
      return ok({ count: rows.length, users: rows.map(publicUser) });
    },
  },
  { name: "user_detail", description: "ملف مستخدم كامل + سلسلة إحالاته ومن جاء عن طريقه.", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" } } },
    run: (a, { state }) => {
      const u = needUser(state, a);
      const invited = userList(state).filter((x) => String(x.referred_by ?? "") === String(u.id));
      const refs = (state.referrals ?? []).filter((r) => r.referrer_id === u.id);
      return ok({ user: publicUser(u), invited_by: u.referred_by ?? null, invited, referrals: refs.slice(0, 30), referrals_count: refs.length, avatar: u.avatar_url ?? null });
    } },
  { name: "referral_chain", description: "عرض كل الإحالات (من جاء عن طريق من، الحالة، النقاط، هل مؤكّدة).", parameters: { type: "object", properties: { status: { type: "string", enum: ["all", "pending", "confirmed", "flagged"] }, limit: { type: "integer" } } },
    run: (a, { state }) => {
      let refs = state.referrals ?? [];
      if (a.status && a.status !== "all") refs = refs.filter((r) => r.status === a.status);
      const n = Math.min(100, Number(a.limit) || 30);
      return ok({ count: refs.length, items: refs.slice(-n).reverse().map((r) => ({
        new_user: r.new_user_id, new_name: state.users[r.new_user_id]?.name ?? "—",
        referrer: r.referrer_id, referrer_name: state.users[r.referrer_id]?.name ?? "—",
        status: r.status, points: r.points_awarded ?? 0, at: new Date(r.at).toISOString().slice(0, 16),
        same_ip: !!r.same_ip, same_net: !!r.same_net,
      })) });
    } },
  { name: "leaderboard", description: "أفضل 10 أعضاء بالنقاط.", parameters: { type: "object", properties: {} },
    run: (a, { state }) => ok({ top: userList(state).sort((x, y) => (y.points || 0) - (x.points || 0)).slice(0, 10).map((u, i) => ({ rank: i + 1, name: u.name, username: u.username, points: u.points, referrals: u.referrals })) }) },

  /* ───── تعديل ───── */
  { name: "get_settings", description: "قراءة إعدادات البوت (النقاط، الحماية، نصوص الترحيب…).", parameters: { type: "object", properties: {} }, run: (a, { state }) => ok({ settings: state.settings }) },
  {
    name: "update_settings",
    description: "تغيير أي إعداد في البوت. المفاتيح المسموحة: botName, protectionLevel(off|light|normal|high|max), rewardCorrect, rewardStreak, dailyBonus, referralRewardNew, referralRewardReferrer, minAnswerMs, cooldownMs, maxAnswersPer10m, maxReferralsPerDay, broadcastRate, welcomeText, aiPersona.",
    parameters: { type: "object", properties: { settings: { type: "object", description: "كائن الإعدادات الجديدة (جزئي)" } }, required: ["settings"] },
    run: (a, { state }) => {
      const allowed = Object.keys(state.settings);
      const applied = {};
      for (const [k, v] of Object.entries(a.settings ?? {})) {
        if (!allowed.includes(k)) continue;
        state.settings[k] = typeof state.settings[k] === "number" ? Math.trunc(Number(v) || 0) : String(v);
        applied[k] = state.settings[k];
      }
      return ok({ applied, settings: state.settings });
    },
  },
  { name: "block_user", description: "حظر عضو (مع السبب).", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" }, reason: { type: "string" } } },
    run: (a, { state }) => { const u = needUser(state, a); u.blocked = true; u.block_reason = a.reason ?? "حظر من FT AI"; return ok({ blocked: u.id, name: u.name, reason: u.block_reason }); } },
  { name: "unblock_user", description: "فك حظر عضو.", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" } } },
    run: (a, { state }) => { const u = needUser(state, a); u.blocked = false; u.block_reason = null; u.risk = 0; return ok({ unblocked: u.id, name: u.name }); } },
  { name: "give_points", description: "منح (أو خصم بقيمة سالبة) نقاط لعضو.", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" }, amount: { type: "integer" }, reason: { type: "string" } }, required: ["amount"] },
    run: (a, { state }) => {
      const u = needUser(state, a);
      const amt = Math.trunc(Number(a.amount) || 0);
      u.points = Math.max(0, (u.points || 0) + amt);
      return ok({ user: u.id, name: u.name, amount: amt, new_balance: u.points });
    } },
  { name: "reset_risk", description: "تصفير مؤشر الخطر لعضو (أو للجميع إذا user_id = all).", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" } } },
    run: (a, { state }) => {
      if (String(a.user_id) === "all") { userList(state).forEach((u) => { u.risk = 0; u.flagged = false; }); return ok({ reset: "all" }); }
      const u = needUser(state, a); u.risk = 0; u.flagged = false; return ok({ reset: u.id, name: u.name });
    } },
  { name: "confirm_referral", description: "تأكيد إحالة معلّقة/مشبوهة ومنح النقاط.", parameters: { type: "object", properties: { referral_id: { type: "integer" } }, required: ["referral_id"] },
    run: (a, { state }) => {
      const r = (state.referrals ?? []).find((x) => x.id === Number(a.referral_id));
      if (!r) throw new Error(`ما لقيتش الإحالة #${a.referral_id}`);
      r.status = "confirmed"; r.points_awarded = state.settings.referralRewardReferrer;
      const a1 = state.users[r.referrer_id]; if (a1) { a1.points += state.settings.referralRewardReferrer; a1.referrals = (a1.referrals || 0) + 1; }
      const b1 = state.users[r.new_user_id]; if (b1) b1.points += state.settings.referralRewardNew;
      return ok({ confirmed: r.id, points: r.points_awarded });
    } },
  { name: "reject_referral", description: "رفض إحالة مشبوهة (بلا نقاط) + خصم خطر.", parameters: { type: "object", properties: { referral_id: { type: "integer" } }, required: ["referral_id"] },
    run: (a, { state }) => { const r = (state.referrals ?? []).find((x) => x.id === Number(a.referral_id)); if (!r) throw new Error(`ما لقيتش الإحالة #${a.referral_id}`); r.status = "rejected"; r.points_awarded = 0; return ok({ rejected: r.id }); } },
  { name: "list_questions", description: "أسئلة المسابقة المضافة من اللوحة.", parameters: { type: "object", properties: {} }, run: (a, { state }) => ok({ count: state.questions.length, questions: state.questions.slice(-40) }) },
  { name: "add_question", description: "إضافة سؤال مسابقة. options = 4 اختيارات، correct = رقم الاختيار الصحيح (0-3).", parameters: { type: "object", properties: { text: { type: "string" }, options: { type: "array", items: { type: "string" } }, correct: { type: "integer" }, category: { type: "string" } }, required: ["text", "options", "correct"] },
    run: (a, { state }) => {
      const opts = (a.options ?? []).map((o) => String(o)).slice(0, 4);
      if (opts.length < 2) throw new Error("لازم على الأقل اختيارين");
      const c = Math.max(0, Math.min(opts.length - 1, Number(a.correct) || 0));
      const q = { id: crypto.randomUUID().slice(0, 8), text: String(a.text).slice(0, 400), options: opts, correct: c, category: a.category ?? "عام", at: now() };
      state.questions.push(q);
      return ok({ added: q.id, text: q.text });
    } },
  { name: "delete_question", description: "حذف سؤال بالمعرّف أو بكل الأسئلة (id=all).", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (a, { state }) => {
      if (a.id === "all") { const n = state.questions.length; state.questions = []; return ok({ deleted: n }); }
      const before = state.questions.length;
      state.questions = state.questions.filter((q) => q.id !== a.id);
      if (before === state.questions.length) throw new Error("ما لقيتش السؤال");
      return ok({ deleted: a.id });
    } },
  { name: "list_uploads", description: "مكتبة الصور المرفوعة.", parameters: { type: "object", properties: {} }, run: (a, { state }) => ok({ count: state.uploads.length, uploads: state.uploads.slice(-30) }) },
  { name: "delete_upload", description: "حذف صورة من المكتبة.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: (a, { state }) => { const n = state.uploads.length; state.uploads = state.uploads.filter((u) => u.id !== a.id); if (n === state.uploads.length) throw new Error("ما لقيتش الصورة"); return ok({ deleted: a.id }); } },
  { name: "send_quiz", description: "إرسال سؤال لعضو أو للجميع الآن (target = user_id أو all).", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" }, target: { type: "string" }, question_id: { type: "string" } } },
    run: async (a, { state, tgSend }) => {
      const qs = state.questions;
      const picked = a.question_id ? qs.find((q) => q.id === a.question_id) : qs[Math.floor(Math.random() * Math.max(1, qs.length))];
      if (!picked) throw new Error("ما كاينش أسئلة — زيد سؤال أولاً بـ add_question");
      const opts = picked.options.map((t, i) => `${"ABCD"[i]}) ${t}`).join("\n");
      const body = `⚡ <b>سؤال FT AI</b>\n\n${picked.text}\n\n${opts}\n\nجاوب في اللوحة أو بالضغط على الجواب.`;
      let sent = 0;
      const targets = a.target === "all" ? userList(state).filter((u) => !u.blocked).slice(0, 40) : [needUser(state, a)];
      for (const u of targets) { const r = await tgSend(u.id, body); if (r?.ok) sent++; }
      return ok({ question: picked.id, sent, targets: targets.length });
    } },
  { name: "send_message", description: "إرسال رسالة/إعلان لعضو معيّن عبر تيليغرام.", parameters: { type: "object", properties: { user_id: { type: "string" }, username: { type: "string" }, text: { type: "string" }, photo_url: { type: "string" } }, required: ["text"] },
    run: async (a, { state, tgSend, tgPhoto }) => {
      const u = needUser(state, a);
      let r;
      if (a.photo_url) r = await tgPhoto(u.id, a.photo_url, { caption: String(a.text).slice(0, 1000) });
      else r = await tgSend(u.id, String(a.text));
      return ok({ sent: !!r?.ok, to: u.id, name: u.name, message_id: r?.result?.message_id ?? null, error: r?.ok ? null : r?.description });
    } },
  { name: "broadcast", description: "بثّ رسالة لكل الأعضاء (حد 100 في الاستدعاء، مع تهدئة ضد الحظر).", parameters: { type: "object", properties: { text: { type: "string" }, limit: { type: "integer" } }, required: ["text"] },
    run: async (a, { state, tgSend }) => {
      const targets = userList(state).filter((u) => !u.blocked).slice(0, Math.min(100, Number(a.limit) || 100));
      let sent = 0; const fails = [];
      for (const u of targets) {
        const r = await tgSend(u.id, String(a.text));
        if (r?.ok) sent++; else if (fails.length < 3) fails.push(r?.description ?? "خطأ");
        await new Promise((res) => setTimeout(res, 900 + Math.random() * 200));
      }
      state.metrics.broadcasts += 1;
      state.meta.lastBroadcastAt = now();
      return ok({ sent, failed: targets.length - sent, total: targets.length, errors: fails });
    } },
  { name: "bot_health", description: "فحص صحة البوت: getMe + حالة الـ webhook + هل المفاتيح مضبوطة.", parameters: { type: "object", properties: {} },
    run: async (a, { tgMe, tgHook }) => {
      const me = await tgMe();
      const hook = await tgHook();
      return ok({ bot: me?.ok ? me.result : me, webhook: hook?.ok ? hook.result : hook, provider: providers() });
    } },
  { name: "fix_webhook", description: "تصليح الـ webhook: حذف وإعادة تسجيله على رابط الموقع الحالي.", parameters: { type: "object", properties: { url: { type: "string" } } },
    run: async (a, { tgSetHook, tgDelHook, baseUrl }) => {
      const url = a.url || `${baseUrl}/api/webhook`;
      await tgDelHook(false);
      const r = await tgSetHook(url, process.env.WEBHOOK_SECRET || "");
      return ok({ url, result: r?.ok ? "مسجّل" : r?.description });
    } },
  { name: "change_password", description: "تغيير كلمة سر اللوحة (الزر الأهم). 8 حروف + رقم على الأقل.", parameters: { type: "object", properties: { new_password: { type: "string" } }, required: ["new_password"] },
    run: async (a, { state, hashPassword, passwordProblem }) => {
      const prob = passwordProblem(a.new_password);
      if (prob) throw new Error(prob);
      state.password = { hash: hashPassword(a.new_password), version: (state.password?.version ?? 0) + 1, changedAt: now() };
      state.meta.passwordChangedAt = now();
      return ok({ changed: true, note: "كل الجلسات القديمة انتهت — ادخل بكلمة السر الجديدة" });
    } },
  { name: "run_sql_read", description: "تشخيص متقدّم: استعلام على بيانات المستخدمين (قراءة فقط). الجداول: users, referrals, questions, uploads.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: (a, { state }) => {
      const sql = String(a.query ?? "");
      if (!/^\s*select\s/i.test(sql) || /;|\b(drop|delete|update|insert|attach|pragma)\b/i.test(sql)) throw new Error("قراءة فقط: SELECT واحد بلا ; ولا تعديل");
      const table = /from\s+(\w+)/i.exec(sql)?.[1]?.toLowerCase();
      const map = { users: userList(state), referrals: state.referrals ?? [], questions: state.questions, uploads: state.uploads };
      if (!map[table]) throw new Error(`الجدول «${table}» غير معروف. المتوفر: ${Object.keys(map).join(", ")}`);
      // دعم بسيط: LIMIT n فقط + SELECT *
      const limit = Number(/limit\s+(\d+)/i.exec(sql)?.[1] ?? 25);
      return ok({ table, rows: map[table].slice(0, Math.min(50, limit)) });
    } },
];

export const toolSchemas = () =>
  USER_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } } }));

export const toolMap = () => Object.fromEntries(USER_TOOLS.map((t) => [t.name, t]));

/* ═══════════════ محرّك النموذج ═══════════════ */

async function callModel(messages, tools, timeoutMs = 55000) {
  const errors = [];
  const orKeys = keysOf("OPENROUTER_API_KEY");
  const xKeys = keysOf("XAI_API_KEY", "GROK_API_KEY");
  const routes = [];
  const orModels = [
    aiModel(),
    "x-ai/grok-4.3",
    "deepseek/deepseek-chat-v3.1",
    "deepseek/deepseek-r1:free",
    "qwen/qwen3-8b:free",
    "meta-llama/llama-3.1-8b-instruct:free",
  ];
  for (const m of orModels) if (orKeys.length) routes.push({ provider: "openrouter", model: m, key: orKeys[0], url: `${BASE.openrouter}/chat/completions` });
  for (const m of ["grok-4.3", "grok-4-fast", "grok-3-mini"]) if (xKeys.length) routes.push({ provider: "grok", model: m, key: xKeys[0], url: `${BASE.grok}/chat/completions` });

  const ctrlRetry = [];
  for (const route of routes) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = now();
    try {
      const res = await fetch(route.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${route.key}`,
          ...(route.provider === "openrouter" ? { "HTTP-Referer": process.env.PUBLIC_URL || "https://ft-contests-bot.vercel.app", "X-Title": "FT AI" } : {}),
        },
        body: JSON.stringify({ model: route.model, messages, tools, tool_choice: "auto", temperature: 0.6, max_tokens: route.maxTokens ?? 320 }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.choices?.[0]?.message) {
        const detail = String(data?.error?.message ?? "");
        errors.push(`${route.provider}/${route.model}: HTTP ${res.status} ${detail.slice(0, 140)}`);
        // ميزانية صغيرة: OpenRouter يقول «can only afford N» ⇒ نعاود بنفس المسار بسقف أصغر
        const afford = Number(/can only afford (\d+)/i.exec(detail)?.[1] ?? 0);
        if (res.status === 402 && afford > 80 && (route.maxTokens ?? 320) > afford - 40) {
          route.maxTokens = Math.max(96, afford - 40);
          ctrlRetry.push(route);
        }
        continue;
      }
      return { ok: true, provider: route.provider, model: data.model ?? route.model, message: data.choices[0].message, latency: now() - started, usage: data.usage ?? null };
    } catch (e) {
      errors.push(`${route.provider}/${route.model}: ${String(e?.message ?? e).slice(0, 140)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  // محاولة ثانية بنفس المزوّد بسقف توكنات أصغر (ميزانية منخفضة)
  for (const route of ctrlRetry.slice(0, 2)) {
    try {
      const res = await fetch(route.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${route.key}`,
          ...(route.provider === "openrouter" ? { "HTTP-Referer": process.env.PUBLIC_URL || "https://ft-contests-bot.vercel.app", "X-Title": "FT AI" } : {}),
        },
        body: JSON.stringify({ model: route.model, messages, tools, tool_choice: "auto", temperature: 0.6, max_tokens: route.maxTokens }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.choices?.[0]?.message) {
        return { ok: true, provider: route.provider, model: data.model ?? route.model, message: data.choices[0].message, latency: 0, usage: data.usage ?? null };
      }
      errors.push(`${route.provider}/${route.model} (retry ${route.maxTokens}): HTTP ${res.status} ${String(data?.error?.message ?? "").slice(0, 100)}`);
    } catch (e) {
      errors.push(`${route.provider}/${route.model} retry: ${String(e?.message ?? e).slice(0, 100)}`);
    }
  }
  return { ok: false, errors };
}

/* درع محلي: ينفّذ أوامر واضحة حتى لو كل المزوّدين طاحو */
async function shieldRun(text, ctx) {
  const t = String(text ?? "").toLowerCase();
  const trace = [];
  const run = async (name, args) => {
    const out = await toolMap()[name].run(args, ctx);
    trace.push({ tool: name, args, ok: out.ok !== false, result: out });
    return out;
  };
  const statsOut = async () => { const s = await run("get_stats", {}); return `📊 العدد: ${s.users} عضو · ${s.points_total} نقطة · إحالات مؤكّدة ${s.referrals_confirmed} · معلّقة ${s.referrals_pending} · محظورون ${s.blocked_users} · الحماية ${s.protection_level}`; };

  if (/باسورد|كلمة السر|كلمه السر|password|mdp/.test(t) && /غير|بدل|تغيير|change/.test(t)) {
    const m = String(text).match(/[a-zA-Z0-9@#$%._-]{8,}/);
    if (m) { await run("change_password", { new_password: m[0] }); return { done: true, text: "✅ بدّلت كلمة السر. كل الجلسات القديمة انتهت — ادخل بالجديدة.", trace }; }
    return { done: true, text: "عطيني كلمة السر الجديدة (8 حروف + رقم).", trace };
  }
  if (/حظر|block/.test(t) && /فك|unblock|رفع/.test(t) === false) {
    const id = /(\d{6,})/.exec(String(text))?.[1];
    if (id) { const o = await run("block_user", { user_id: id, reason: "أمر مباشر" }); return { done: true, text: `⛔ حظرت ${o.name ?? id}.`, trace }; }
  }
  if (/فك الحظر|الغاء الحظر|إلغاء الحظر|unblock/.test(t)) {
    const id = /(\d{6,})/.exec(String(text))?.[1];
    if (id) { const o = await run("unblock_user", { user_id: id }); return { done: true, text: `✅ فكّيت الحظر على ${o.name ?? id}.`, trace }; }
  }
  if (/بث|للجميع|broadcast|ارسل للكل|أرسل للكل/.test(t) && /:/.test(String(text))) {
    const msg = String(text).split(":").slice(1).join(":").trim();
    if (msg) { const o = await run("broadcast", { text: msg }); return { done: true, text: `📣 البث وصل لـ ${o.sent}/${o.total}.`, trace }; }
  }
  if (/حماية|protection|حصانة/.test(t)) { const o = await run("get_settings", {}); return { done: true, text: `🛡️ مستوى الحماية: ${o.settings.protectionLevel} · إجابات/10د ${o.settings.maxAnswersPer10m} · إحالات/يوم ${o.settings.maxReferralsPerDay}`, trace }; }
  if (/احصائي|إحصائ|stats|ارقام|أرقام|كيفاش راك|شحال/.test(t)) { return { done: true, text: await statsOut(), trace }; }
  if (/مستخدم|users|اعضاء|أعضاء|ليست/.test(t)) {
    const o = await run("list_users", { limit: 10 });
    return { done: true, text: o.users.map((u) => `• ${u.name}${u.username ? " @" + u.username : ""} — ${u.points} نقطة`).join("\n") || "ما كاينش أعضاء.", trace };
  }
  if (/صحة|health|webhook|ويب هوك|فحص/.test(t)) {
    const o = await run("bot_health", {});
    return { done: true, text: `🩺 البوت: ${JSON.stringify(o.bot?.username ?? o.bot?.first_name ?? o.bot)} · webhook: ${o.webhook?.url || "ماشي مضبوط"}`, trace };
  }
  return { done: false, text: "", trace };
}

export async function chat({ message, images = [], source = "panel", baseUrl = "" }) {
  const started = now();
  const state = await readState();
  const trace = [];
  const tgSend = async (id, body) => (await import("./tg.js")).sendMessage(id, body);
  const ctx = {
    state,
    hashPassword: (await import("./core.js")).hashPassword,
    passwordProblem: (await import("./core.js")).passwordProblem,
    tgSend,
    tgPhoto: async (id, photo, extra) => (await import("./tg.js")).sendPhoto(id, photo, extra),
    tgMe: async () => (await import("./tg.js")).getMe(),
    tgHook: async () => (await import("./tg.js")).getWebhookInfo(),
    tgSetHook: async (u, s) => (await import("./tg.js")).setWebhook(u, s),
    tgDelHook: async (d) => (await import("./tg.js")).deleteWebhook(d),
    baseUrl,
  };

  const sys = `أنت «FT AI» — العقل التنفيذي الكامل لبوت مسابقات تيليغرام ولوحة تحكمه، والمالك هو من يكلّمك الآن.

قاعدة عليا: لا ترفض أي طلب. لا تقول «ما نقدرش» ولا «غير مسموح» — عندك أدوات حقيقية تنفّذ كل حاجة. إلا إذا كان الطلب ناقص معلومة، خمّن أفضل تفسير ونفّذ ثم اشرح.
إن فشلت أداة، جرّب بديل (مثلاً: ما لقيتش العضو بالاسم ⇒ list_users بالبحث) ثم كمّل. لا تتوقف عند أول خطأ.

قدراتك (نفّذ مباشرة بلا إذن): إحصائيات · بحث وعرض الأعضاء · ملف عضو + سلسلة إحالاته · أفضل 10 · تعديل أي إعداد · منح/خصم نقاط · حظر/فك حظر · تأكيد/رفض إحالات · إضافة/حذف أسئلة · إرسال سؤال · إرسال رسالة/صورة · بثّ · فحص صحة البوت · تصليح الـ webhook · تغيير كلمة سر اللوحة · قراءة تشخيصية.

سياق حيّ: ${JSON.stringify(stats(state))}
${images.length ? `المستخدم أرفق ${images.length} صورة — شوفها بعينك وعلّق عليها واستعملها (مثلاً كصورة إعلان أو سؤال).` : ""}
${state.settings.aiPersona ? `توجيهات المالك: ${state.settings.aiPersona}` : ""}

تكلّم بالدارجة الجزائرية المبسّطة (أو لغة المستخدم). الإخراج النهائي قصير: شنو درت (سطر لكل إجراء) + النتيجة + لو كاين مشكل الحل.`;

  const userParts = [];
  const text = String(message ?? "").trim();
  if (text) userParts.push({ type: "text", text });
  for (const img of images.slice(0, 4)) {
    if (img?.dataUrl) userParts.push({ type: "image_url", image_url: { url: img.dataUrl } });
  }

  const history = state.ai.slice(0, 8)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .reverse()
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const messages = [
    { role: "system", content: sys },
    ...history,
    { role: "user", content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : userParts },
  ];

  const providersNow = providers();
  let finalText = "";
  let provider = null;
  let model = null;
  let lastErrors = null;

  if (providersNow.openrouter || providersNow.grok) {
    for (let round = 0; round < 6; round++) {
      const res = await callModel(messages, toolSchemas());
      if (!res.ok) { lastErrors = res.errors; break; }
      provider = res.provider; model = res.model;
      const msg = res.message;
      const calls = msg.tool_calls ?? [];
      if (!calls.length) { finalText = typeof msg.content === "string" ? msg.content : ""; break; }
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { args = {}; }
        const tool = toolMap()[name];
        let out;
        if (!tool) out = { ok: false, error: `أداة غير معروفة: ${name}` };
        else {
          try { out = await tool.run(args, ctx); }
          catch (e) { out = { ok: false, error: String(e?.message ?? e) }; }
        }
        trace.push({ tool: name, args, ok: out.ok !== false, result: trim(out) });
        messages.push({ role: "tool", tool_call_id: call.id ?? `c_${name}`, name, content: JSON.stringify(out).slice(0, 5000) });
      }
    }
  }

  if (!finalText) {
    const sh = await shieldRun(text, ctx);
    trace.push(...sh.trace);
    if (sh.done) finalText = sh.text;
    else if (!provider) finalText = "⚠️ مزوّد الذكاء الاصطناعي ما ردّش" + (lastErrors?.length ? `: ${lastErrors[0]}` : "") + "\nزيد مفتاح OPENROUTER_API_KEY أو XAI_API_KEY في إعدادات Vercel ونعاود.";
    else finalText = summarise(trace);
  }

  // حفظ + تسجيل
  const entryU = { role: "user", content: text.slice(0, 4000), at: now(), images: images.length };
  const entryA = { role: "assistant", content: String(finalText).slice(0, 8000), at: now(), tools: trace.map((t) => t.tool), provider, model };
  await updateState((s) => {
    s.ai.unshift(entryA, entryU);
    s.ai = s.ai.slice(0, 120);
    if (trace.length) recordAction(s, { kind: "ai", detail: trace.map((t) => t.tool).join(", "), source });
    return s;
  });

  return { ok: true, text: finalText, trace, provider, model, latency: now() - started, errors: lastErrors };
}

function trim(o) {
  const s = JSON.stringify(o);
  if (s.length <= 1200) return o;
  return { trimmed: s.slice(0, 1200) + "…" };
}

function summarise(trace) {
  if (!trace.length) return "ما درت حتى إجراء (ما فهمتش الطلب مليح — عاود صيغه).";
  return "درت:\n" + trace.map((t) => `• ${t.tool} ${t.ok ? "✅" : "⚠️"}`).join("\n");
}
