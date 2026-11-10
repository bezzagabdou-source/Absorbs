/* FT AI — موجّه واحد لكل نقاط الـ API (Vercel Hobby يسمح بـ 12 دالة فقط) */
import { methods, authed, body, baseUrl, sniff } from "../lib/http-kit.js";
import {
  json, readState, readStateFresh, writeState, updateState, ensurePassword, checkPassword, hashPassword, passwordProblem,
  makeSession, sessionCookie, clearCookie, loginAllowed, clientIp, parseCookies, verifySession, COOKIE,
  hasRedis, putImage, getImage, delImage, recordAction, uid, now,
} from "../lib/core.js";
import { providers, aiModel, USER_TOOLS, chat } from "../lib/ai.js";
import { sendMessage, sendPhoto, getMe, getWebhookInfo, botToken, demoMode, setRuntimeToken, tokenSource } from "../lib/tg.js";
import { handleUpdate, ensureWebhook, webhookSecret } from "../lib/bot.js";

const LEVELS = ["off", "light", "normal", "high", "max"];
const secureCookie = (req) => String(req.headers["x-forwarded-proto"] ?? "").includes("https");

/* ═══════════ مسارات المصادقة ═══════════ */
const login = methods({
  POST: async (req, res) => {
    const ip = clientIp(req);
    if (!(await loginAllowed(ip))) return json(res, 429, { ok: false, error: "محاولات كثيرة — عاود بعد 5 دقايق" });
    const b = await body(req);
    const state = await readStateFresh();
    await ensurePassword(state);
    if (!state.password?.hash) {
      return json(res, 400, {
        ok: false,
        error: "كلمة السر ماشي مضبوطة — زيد DASHBOARD_PASSWORD في إعدادات Vercel ولا عاود النشر",
      });
    }
    const pw = String(b?.password ?? "");
    if (!pw || !checkPassword(pw, state.password.hash)) return json(res, 401, { ok: false, error: "كلمة السر غالطة" });
    const token = makeSession(state, req);
    state.meta.lastLoginAt = now();
    await writeState(state);
    res.setHeader("set-cookie", sessionCookie(token, secureCookie(req)));
    return json(res, 200, { ok: true, at: now() });
  },
});

const session = methods({
  GET: async (req, res) => {
    const state = await readStateFresh();
    await ensurePassword(state);
    const token = parseCookies(req)[COOKIE];
    const sess = verifySession(token, state);
    return json(res, 200, {
      ok: true,
      authed: Boolean(sess),
      passwordSet: Boolean(state.password?.hash),
      storage: hasRedis() ? "redis" : "memory",
      botName: state.settings.botName,
    });
  },
});

const logout = methods({
  POST: async (req, res) => {
    res.setHeader("set-cookie", clearCookie());
    return json(res, 200, { ok: true });
  },
});

const password = methods({
  POST: authed(async (req, res, state) => {
    const b = await body(req);
    const current = String(b?.current ?? "");
    const next = String(b?.next ?? "");

    // الحالية اختيارية: الجلسة الصالحة وحدها تكفي. إن كتبها المستخدم نتحقّق منها.
    if (current && state.password?.hash && !checkPassword(current, state.password.hash)) {
      return json(res, 401, { ok: false, error: "كلمة السر الحالية غالطة" });
    }
    const problem = passwordProblem(next);
    if (problem) return json(res, 400, { ok: false, error: problem });
    if (state.password?.hash && checkPassword(next, state.password.hash)) {
      return json(res, 400, { ok: false, error: "كلمة السر الجديدة كيما القديمة — بدّلها" });
    }

    const out = await updateState((s) => {
      s.password = { hash: hashPassword(next), version: (s.password?.version ?? 0) + 1, changedAt: now() };
      s.meta.passwordChangedAt = now();
      recordAction(s, { kind: "password", detail: "تغيير كلمة سر اللوحة" });
      return s;
    });
    res.setHeader("set-cookie", sessionCookie(makeSession(out, req), secureCookie(req)));
    return json(res, 200, { ok: true, changed_at: out.meta.passwordChangedAt, note: "تم التغيير — كل الأجهزة الأخرى خرجت" });
  }),
});

/* ═══════════ البيانات ═══════════ */
const overview = methods({
  GET: authed(async (req, res, state) => {
    const users = Object.values(state.users);
    const refs = state.referrals;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return json(res, 200, {
      ok: true,
      at: now(),
      bot: {
        name: state.settings.botName,
        username: process.env.BOT_USERNAME || null,
        tokenSet: Boolean(botToken()),
        tokenSource: tokenSource(),
        demo: demoMode(),
        webhook: `${baseUrl(req)}/api/webhook`,
      },
      stats: {
        users: users.length,
        new_today: users.filter((u) => u.joined_at >= start.getTime()).length,
        active_24h: users.filter((u) => (u.last_seen ?? 0) >= now() - 86400000).length,
        blocked: users.filter((u) => u.blocked).length,
        points_total: users.reduce((n, u) => n + (u.points || 0), 0),
        refs_confirmed: refs.filter((r) => r.status === "confirmed").length,
        refs_pending: refs.filter((r) => (r.status ?? "pending") === "pending").length,
        refs_flagged: refs.filter((r) => r.status === "flagged").length,
        questions: state.questions.length,
        uploads: state.uploads.length,
        visits: state.metrics.visits,
        answers: state.metrics.answers,
        correct: state.metrics.correct,
        broadcasts: state.metrics.broadcasts,
      },
      protection: {
        level: state.settings.protectionLevel,
        min_answer_ms: state.settings.minAnswerMs,
        cooldown_ms: state.settings.cooldownMs,
        max_answers_10m: state.settings.maxAnswersPer10m,
        max_referrals_day: state.settings.maxReferralsPerDay,
        broadcast_rate: state.settings.broadcastRate,
      },
      settings: state.settings,
      security: {
        password_changed_at: state.meta.passwordChangedAt ?? 0,
        last_login: state.meta.lastLoginAt ?? 0,
        session_hours: 12,
        storage: hasRedis() ? "redis" : "memory",
      },
      ai: { providers: providers(), model: aiModel(), messages: state.ai.length, tools: USER_TOOLS.length },
      actions: state.actions.slice(0, 12),
      top: users.sort((a, b) => b.points - a.points).slice(0, 5).map((u) => ({ name: u.name, points: u.points, username: u.username })),
    });
  }),
});

const users = methods({
  GET: authed(async (req, res, state) => {
    const url = new URL(req.url, "http://x");
    const qs = String(url.searchParams.get("q") ?? "").trim().toLowerCase();
    const filter = url.searchParams.get("filter") ?? "all";
    const sort = url.searchParams.get("sort") ?? "newest";
    let rows = Object.values(state.users);
    if (qs) rows = rows.filter((u) => [u.id, u.username, u.name, u.ref_code].some((v) => String(v ?? "").toLowerCase().includes(qs)));
    if (filter === "blocked") rows = rows.filter((u) => u.blocked);
    if (filter === "active") rows = rows.filter((u) => (u.last_seen ?? 0) >= Date.now() - 86400000);
    if (filter === "risk") rows = rows.filter((u) => (u.risk ?? 0) >= 40);
    if (filter === "flagged") rows = rows.filter((u) => u.flagged);
    const sorters = {
      points: (a, b) => b.points - a.points,
      referrals: (a, b) => b.referrals - a.referrals,
      risk: (a, b) => (b.risk ?? 0) - (a.risk ?? 0),
      newest: (a, b) => b.joined_at - a.joined_at,
    };
    rows = rows.sort(sorters[sort] ?? sorters.newest);
    return json(res, 200, {
      ok: true,
      total: Object.keys(state.users).length,
      count: rows.length,
      users: rows.slice(0, 300),
    });
  }),
  PATCH: authed(async (req, res) => {
    const b = await body(req);
    const id = String(b?.id ?? "");
    const out = await updateState((s) => {
      const u = s.users[id];
      if (!u) return null;
      if (typeof b.blocked === "boolean") { u.blocked = b.blocked; if (!b.blocked) u.risk = 0; }
      if (Number.isFinite(+b.points)) u.points = Math.max(0, Math.trunc(+b.points));
      if (Number.isFinite(+b.risk)) u.risk = Math.max(0, Math.min(100, Math.trunc(+b.risk)));
      return u;
    });
    if (!out) return json(res, 404, { ok: false, error: "ما لقيتش العضو" });
    return json(res, 200, { ok: true, user: out });
  }),
});

const viewRef = (s, r) => ({
  id: r.id,
  new_user: s.users[r.new_user_id]?.name ?? `#${r.new_user_id}`,
  new_user_id: r.new_user_id,
  new_username: s.users[r.new_user_id]?.username ?? null,
  referrer: s.users[r.referrer_id]?.name ?? `#${r.referrer_id}`,
  referrer_id: r.referrer_id,
  referrer_username: s.users[r.referrer_id]?.username ?? null,
  status: r.status ?? "pending",
  suspicious: !!r.suspicious,
  same_ip: !!r.same_ip,
  points_awarded: r.points_awarded ?? 0,
  at: r.at,
});

const referrals = methods({
  GET: authed(async (req, res, state) => {
    const url = new URL(req.url, "http://x");
    const status = url.searchParams.get("status") ?? "all";
    let rows = state.referrals;
    if (status !== "all") rows = rows.filter((r) => (r.status ?? "pending") === status);
    return json(res, 200, {
      ok: true,
      count: rows.length,
      totals: {
        confirmed: state.referrals.filter((r) => r.status === "confirmed").length,
        pending: state.referrals.filter((r) => (r.status ?? "pending") === "pending").length,
        flagged: state.referrals.filter((r) => r.status === "flagged").length,
      },
      referrals: rows.slice(-300).reverse().map((r) => viewRef(state, r)),
    });
  }),
  POST: authed(async (req, res) => {
    const b = await body(req);
    const id = Number(b?.id);
    const action = String(b?.action ?? "");
    const out = await updateState((s) => {
      const r = s.referrals.find((x) => x.id === id);
      if (!r) return { error: "ما لقيتش الإحالة" };
      if (action === "confirm") {
        r.status = "confirmed";
        r.points_awarded = s.settings.referralRewardReferrer;
        const a = s.users[r.referrer_id];
        if (a) { a.points += s.settings.referralRewardReferrer; a.referrals = (a.referrals ?? 0) + 1; }
        const n = s.users[r.new_user_id];
        if (n) n.points += s.settings.referralRewardNew;
      } else if (action === "reject") {
        r.status = "rejected";
        r.points_awarded = 0;
      } else if (action === "flag") {
        r.status = "flagged";
        r.suspicious = true;
      }
      recordAction(s, { kind: "referral", detail: `${action} #${id}` });
      return { ok: true };
    });
    if (out.error) return json(res, 404, { ok: false, error: out.error });
    return json(res, 200, out);
  }),
});

const questions = methods({
  GET: authed(async (req, res, state) => json(res, 200, { ok: true, count: state.questions.length, questions: state.questions.slice().reverse() })),
  POST: authed(async (req, res) => {
    const b = await body(req);
    const opts = (b?.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    if (String(b?.text ?? "").trim().length < 3) return json(res, 400, { ok: false, error: "نص السؤال قصير" });
    if (opts.length < 2) return json(res, 400, { ok: false, error: "لازم اختيارين على الأقل" });
    const q = {
      id: uid(4),
      text: String(b.text).slice(0, 400),
      options: opts,
      correct: Math.max(0, Math.min(opts.length - 1, Number(b.correct) || 0)),
      category: String(b.category ?? "عام").slice(0, 40),
      at: now(),
    };
    await updateState((s) => { s.questions.push(q); return s; });
    return json(res, 200, { ok: true, question: q });
  }),
  DELETE: authed(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id") ?? "";
    const out = await updateState((s) => {
      const before = s.questions.length;
      s.questions = id === "all" ? [] : s.questions.filter((q) => q.id !== id);
      return { removed: before - s.questions.length };
    });
    return json(res, 200, { ok: true, ...out });
  }),
});

const MAX_UPLOAD = 8 * 1024 * 1024;

const uploads = methods({
  GET: async (req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");
    if (id) {
      const img = await getImage(id);
      if (!img) return json(res, 404, { ok: false, error: "الصورة ماكانتش" });
      const buf = Buffer.from(img.data, "base64");
      res.statusCode = 200;
      res.setHeader("content-type", img.mime || "image/jpeg");
      res.setHeader("cache-control", "public, max-age=86400, immutable");
      res.setHeader("content-length", String(buf.length));
      return res.end(buf);
    }
    const state = await requireAuth(req, res);
    if (!state) return;
    return json(res, 200, { ok: true, count: state.uploads.length, uploads: state.uploads.slice().reverse() });
  },
  POST: authed(async (req, res) => {
    const b = await body(req);
    const m = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(String(b?.data ?? "").trim());
    if (!m) return json(res, 400, { ok: false, error: "صيغة الصورة غير مفهومة" });
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return json(res, 400, { ok: false, error: "الملف خاوي" });
    if (buf.length > MAX_UPLOAD) return json(res, 413, { ok: false, error: "الصورة كبيرة بزاف (حد 8 ميغا)" });
    const mime = sniff(buf) ?? m[1];
    const id = uid(8);
    await putImage(id, { data: buf.toString("base64"), mime, at: now(), name: String(b?.name ?? "صورة").slice(0, 80) });
    const meta = { id, name: String(b?.name ?? "صورة").slice(0, 80), mime, bytes: buf.length, at: now(), url: `/api/uploads?id=${id}` };
    await updateState((s) => { s.uploads.push(meta); if (s.uploads.length > 60) s.uploads.shift(); return s; });
    return json(res, 200, { ok: true, upload: meta });
  }),
  DELETE: authed(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id") ?? "";
    await delImage(id);
    await updateState((s) => { s.uploads = s.uploads.filter((u) => u.id !== id); return s; });
    return json(res, 200, { ok: true, deleted: id });
  }),
});

/* ═══════════ الذكاء الاصطناعي ═══════════ */
const ai = methods({
  GET: authed(async (req, res, state) =>
    json(res, 200, { ok: true, providers: providers(), model: aiModel(), messages: state.ai.length, tools: USER_TOOLS.length, history: state.ai.slice(0, 40) })
  ),
  POST: authed(async (req, res) => {
    const b = await body(req);
    const message = String(b?.message ?? "").slice(0, 4000);
    const images = Array.isArray(b?.images) ? b.images.filter((i) => i && i.dataUrl).slice(0, 4) : [];
    if (!message.trim() && !images.length) return json(res, 400, { ok: false, error: "اكتب رسالة ولا حط صورة" });
    const out = await chat({ message, images, source: "panel", baseUrl: baseUrl(req) });
    return json(res, 200, out);
  }),
  DELETE: authed(async (req, res) => {
    await updateState((s) => { s.ai = []; return s; });
    return json(res, 200, { ok: true });
  }),
});

/* ═══════════ الإعدادات + الأعمال ═══════════ */
const settings = methods({
  GET: authed(async (req, res, state) => json(res, 200, { ok: true, settings: state.settings, levels: LEVELS })),
  POST: authed(async (req, res) => {
    const b = await body(req);
    const patch = b?.settings && typeof b.settings === "object" ? b.settings : {};
    const out = await updateState((s) => {
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in s.settings)) continue;
        if (k === "protectionLevel" && !LEVELS.includes(String(v))) continue;
        s.settings[k] = typeof s.settings[k] === "number" ? Math.trunc(Number(v) || 0) : String(v).slice(0, 600);
      }
      recordAction(s, { kind: "settings", detail: Object.keys(patch).join(", ") });
      return s.settings;
    });
    return json(res, 200, { ok: true, settings: out });
  }),
});

const actions = methods({
  POST: authed(async (req, res) => {
    const b = await body(req);
    const job = String(b?.job ?? "");
    const state = await readState();

    if (job === "message") {
      const to = String(b?.user_id ?? "").trim();
      const text = String(b?.text ?? "").slice(0, 4000);
      if (!to || !text) return json(res, 400, { ok: false, error: "لازم العضو والنص" });
      const r = b?.photo_url ? await sendPhoto(to, String(b.photo_url), { caption: text }) : await sendMessage(to, text);
      await updateState((s) => { recordAction(s, { kind: "message", detail: `${to}: ${text.slice(0, 60)}` }); return s; });
      return json(res, 200, { ok: !!r?.ok, sent: !!r?.ok, message_id: r?.result?.message_id ?? null, error: r?.ok ? null : r?.description });
    }

    if (job === "broadcast") {
      const text = String(b?.text ?? "").slice(0, 4000);
      if (!text) return json(res, 400, { ok: false, error: "اكتب نص البثّ" });
      const targets = Object.values(state.users).filter((u) => !u.blocked).slice(0, Number(b?.limit) || 100);
      let sent = 0;
      const errors = [];
      for (const u of targets) {
        const r = await sendMessage(u.id, text);
        if (r?.ok) sent++;
        else if (errors.length < 3) errors.push({ id: u.id, error: r?.description ?? "خطأ" });
        await new Promise((r2) => setTimeout(r2, 900 + Math.random() * 200));
      }
      await updateState((s) => {
        s.metrics.broadcasts += 1;
        s.meta.lastBroadcastAt = Date.now();
        recordAction(s, { kind: "broadcast", detail: `${sent}/${targets.length}` });
        return s;
      });
      return json(res, 200, { ok: true, sent, failed: targets.length - sent, total: targets.length, errors });
    }

    if (job === "diagnose") {
      const me = await getMe();
      const hook = await getWebhookInfo();
      return json(res, 200, {
        ok: true,
        bot: me?.ok ? me.result : null,
        bot_error: me?.ok ? null : me?.description ?? "ما قدرتش نوصل لتيليغرام",
        demo: !botToken(),
        webhook: hook?.ok ? hook.result : null,
        expected_webhook: `${baseUrl(req)}/api/webhook`,
        secrets: {
          BOT_TOKEN: Boolean(botToken()),
          bot_source: tokenSource(),
          OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
          XAI_API_KEY: Boolean(process.env.XAI_API_KEY || process.env.GROK_API_KEY),
          REDIS_URL: Boolean(process.env.REDIS_URL),
          DASHBOARD_PASSWORD: Boolean(process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD),
        },
      });
    }

    if (job === "set_token") {
      const token = String(b?.token ?? "").trim();
      if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) return json(res, 400, { ok: false, error: "شكل التوكن ماشي صحيح (123456:ABC…)" });
      setRuntimeToken(token);
      const me = await getMe();
      if (!me?.ok) return json(res, 400, { ok: false, error: `تيليغرام رفض التوكن: ${me?.description ?? "غير معروف"}` });
      const hook = await ensureWebhook(baseUrl(req));
      await updateState((s) => {
        s.settings.botToken = token;
        s.settings.botUsername = me.result.username ?? null;
        s.meta.webhookAt = Date.now();
        recordAction(s, { kind: "token", detail: `ربط البوت @${me.result.username ?? me.result.id}` });
        return s;
      });
      return json(res, 200, { ok: true, bot: { id: me.result.id, username: me.result.username, name: me.result.first_name }, webhook: hook });
    }

    if (job === "fix_webhook") {
      const out = await ensureWebhook(baseUrl(req));
      await updateState((s) => { s.meta.webhookAt = Date.now(); recordAction(s, { kind: "webhook", detail: out.url }); return s; });
      return json(res, 200, out);
    }

    return json(res, 400, { ok: false, error: `job غير معروف: ${job}` });
  }),
});

/* ═══════════ ويب هوك تيليغرام ═══════════ */
const webhook = methods({
  GET: async (req, res) => {
    const state = await readState();
    return json(res, 200, { ok: true, service: "FT AI webhook", users: Object.keys(state.users).length });
  },
  POST: async (req, res) => {
    const expected = webhookSecret();
    const got = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
    if (process.env.WEBHOOK_SECRET && got !== expected) return json(res, 401, { ok: false, error: "secret غالط" });
    let update = {};
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      update = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch { update = {}; }
    const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    // نردّ بسرعة (تيليغرام يعيد المحاولة إذا تأخّرنا)
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    await handleUpdate(update, { ip }).catch((e) => console.error("[webhook]", e?.message ?? e));
  },
});

/* ═══════════ الموجّه ═══════════ */
const ROUTES = {
  "auth/login": login,
  login,
  "auth/session": session,
  session,
  "auth/logout": logout,
  logout,
  "auth/password": password,
  password,
  overview,
  users,
  referrals,
  questions,
  uploads,
  "ai/chat": ai,
  "ai/history": ai,
  ai,
  settings,
  actions,
  webhook,
};

export default async function handler(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  // التوكن قد يكون محفوظاً من اللوحة (Vercel Functions بلا حالة)
  try {
    const st = await readState();
    if (st.settings?.botToken) setRuntimeToken(st.settings.botToken);
  } catch { /* ignore */ }
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const route = ROUTES[path];
  if (!route) {
    return json(res, 404, { ok: false, error: `مسار غير معروف: /api/${path}`, routes: Object.keys(ROUTES) });
  }
  return route(req, res);
}
