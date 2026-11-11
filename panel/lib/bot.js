/* FT AI — محرّك تيليغرام: webhook + أوامر + مسابقة + حماية من السبام */
import crypto from "node:crypto";
import { now, readState, updateState, getImage, uid } from "./core.js";
import { tg, sendMessage, getMe, botToken, demoMode } from "./tg.js";

export const webhookSecret = () =>
  process.env.WEBHOOK_SECRET || crypto.createHash("sha256").update(botToken() || "ftai").digest("hex").slice(0, 32);

export function webhookPath() {
  return `/api/webhook`;
}

const escape = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const nameOf = (from) => [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || `عضو ${from?.id}`;
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/* ───── حماية: نافذة معدّل لكل عضو ───── */
const lastAt = new Map();
function tooFast(id, ms) {
  const t = now();
  if ((lastAt.get(id) ?? 0) + ms > t) return true;
  lastAt.set(id, t);
  return false;
}

export const COMMANDS = [
  { command: "start", description: "بدء + رابط الإحالة" },
  { command: "quiz", description: "سؤال مسابقة جديد" },
  { command: "me", description: "نقاطي وإحالاتي" },
  { command: "top", description: "أفضل 10" },
  { command: "invite", description: "رابط الإحالة تاعي" },
  { command: "help", description: "المساعدة" },
];

/* ───── إنشاء/تحديث عضو ───── */
async function upsertUser(state, from, chatId, payload = {}) {
  const id = String(from.id);
  let u = state.users[id];
  const isNew = !u;
  if (!u) {
    u = {
      id,
      name: nameOf(from),
      username: from.username ?? null,
      lang: from.language_code ?? "ar",
      points: 0,
      referrals: 0,
      referred_by: null,
      ref_code: crypto.randomBytes(4).toString("hex"),
      joined_at: now(),
      last_seen: now(),
      blocked: false,
      risk: 0,
      flagged: false,
      quiz_total: 0,
      quiz_correct: 0,
      streak: 0,
      last_ip: payload.ip ?? null,
      avatar_url: null,
    };
    state.users[id] = u;
  } else {
    u.name = nameOf(from) || u.name;
    u.username = from.username ?? u.username;
    u.last_seen = now();
  }

  // إحالة: /start <code>
  const param = String(payload.text ?? "").split(/\s+/)[1] ?? "";
  if (isNew && param) {
    const referrer = Object.values(state.users).find((x) => x.ref_code === param && x.id !== id);
    if (referrer && !referrer.blocked) {
      const suspicious = norm(referrer.name) === norm(u.name) || (payload.ip && payload.ip === referrer.last_ip);
      u.referred_by = referrer.id;
      state.referrals.push({
        id: state.referrals.length + 1,
        new_user_id: u.id,
        referrer_id: referrer.id,
        at: now(),
        status: suspicious ? "flagged" : "confirmed",
        suspicious,
        same_ip: Boolean(payload.ip && payload.ip === referrer.last_ip),
        points_awarded: suspicious ? 0 : 0,
      });
      if (suspicious) u.flagged = true;
      referrer.referrals = (referrer.referrals ?? 0) + 1;
    }
  }
  return { u, isNew };
}

function refLink(u, botUsername) {
  return botUsername ? `https://t.me/${botUsername}?start=${u.ref_code}` : `https://t.me/?start=${u.ref_code}`;
}

async function sendQuestion(state, chatId, user) {
  if (!state.questions.length) {
    return sendMessage(chatId, "ما كاينش أسئلة مخزّنة توّا — المالك يزيدها من لوحة FT AI.");
  }
  const q = state.questions[Math.floor(Math.random() * state.questions.length)];
  const letters = "ABCD";
  const keyboard = q.options.map((opt, i) => [{ text: `${letters[i]}) ${opt}`, callback_data: `ans:${q.id}:${i}` }]);
  const sent = await sendMessage(chatId, `⚡ <b>سؤال FT AI</b>\n\n${escape(q.text)}`, { reply_markup: { inline_keyboard: keyboard } });
  return sent;
}

/* ───── الردّ على التحديثات ───── */
export async function handleUpdate(update, { ip } = {}) {
  const me = await getMe().catch(() => null);
  const botUsername = me?.result?.username ?? "";
  let answerText = null;

  // ضغط زر جواب
  if (update.callback_query) {
    const cq = update.callback_query;
    const [, qid, idx] = String(cq.data ?? "").split(":");
    const from = cq.from;
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "تسجّل جوابك ✅" }).catch(() => {});
    if (tooFast(from.id, 700)) return { ok: true, note: "too fast" };
    const res = await updateState(async (s) => {
      const { u } = await upsertUser(s, from, from.id, { ip });
      const q = s.questions.find((x) => x.id === qid);
      const correct = q && Number(idx) === q.correct;
      s.metrics.answers += 1;
      if (correct) {
        s.metrics.correct += 1;
        u.quiz_total += 1; u.quiz_correct += 1; u.streak += 1;
        const gain = s.settings.rewardCorrect + (u.streak >= 3 ? s.settings.rewardStreak : 0);
        u.points += gain;
        return { text: `✅ صحيح! ربحت <b>${gain}</b> نقطة — المجموع ${u.points}`, gain };
      }
      u.quiz_total += 1; u.streak = 0;
      return { text: `❌ خطأ. الجواب الصحيح: <b>${escape(q?.options?.[q?.correct] ?? "—")}</b>`, gain: 0 };
    });
    await sendMessage(from.id, res.text);
    return { ok: true };
  }

  const msg = update.message;
  if (!msg) return { ok: true, note: "ignored" };
  const from = msg.from;
  if (!from || from.is_bot) return { ok: true, note: "bot" };
  const text = String(msg.text ?? "").trim();
  const chatId = msg.chat.id;

  if (tooFast(from.id, 600)) return { ok: true, note: "too fast" };

  const out = await updateState(async (s) => {
    const { u, isNew } = await upsertUser(s, from, chatId, { text, ip });
    if (u.blocked) return { blocked: true, text: "⛔ حسابك محظور. كلّم المالك." };
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, "");
    const settings = s.settings;

    if (cmd === "/start") {
      const link = refLink(u, botUsername);
      const welcome = isNew ? settings.welcomeText : `مرحبا بيك مرة أخرى ${escape(nameOf(from))} 👋`;
      return {
        text: `${escape(welcome)}\n\n🔗 رابط الإحالة تاعك:\n${link}\n\n⚡ نقاطك: <b>${u.points}</b> · إحالاتك: <b>${u.referrals}</b>`,
        keyboard: { inline_keyboard: [[{ text: "🎯 سؤال جديد", callback_data: "quiz" }], [{ text: "🏆 أفضل 10", callback_data: "top" }]] },
      };
    }
    if (cmd === "/quiz") return { quiz: true };
    if (cmd === "/me") return { text: `👤 <b>${escape(u.name)}</b>\n⚡ النقاط: <b>${u.points}</b>\n🔗 الإحالات: <b>${u.referrals}</b>\n🎯 أسئلة: ${u.quiz_total} · صحيحة: ${u.quiz_correct}\n🔥 سلسلة: ${u.streak}` };
    if (cmd === "/top") {
      const top = Object.values(s.users).sort((a, b) => b.points - a.points).slice(0, 10);
      return { text: "🏆 <b>أفضل 10 في FT AI</b>\n\n" + top.map((x, i) => `${i + 1}. ${escape(x.name)} — ${x.points} نقطة`).join("\n") };
    }
    if (cmd === "/invite") return { text: `🔗 رابط الإحالة تاعك:\n${refLink(u, botUsername)}\n\nكل صاحب يجي بيه تربح <b>${settings.referralRewardReferrer}</b> نقطة.` };
    if (cmd === "/help") return { text: "⚡ <b>FT AI</b> — مسابقة الأسئلة\n\n/quiz سؤال جديد\n/me نقاطي\n/top أفضل 10\n/invite رابط الإحالة\n\nجاوب على الأسئلة، اجمع النقاط، وعيّط لأصحابك!" };
    return { text: "ما فهمتش 🤔 — اكتب /help ولا /quiz" };
  });

  if (out.blocked) return { ok: true };
  if (out.quiz) { await sendQuestion(await readState(), chatId, null); return { ok: true }; }
  const sent = await sendMessage(chatId, out.text, out.keyboard ? { reply_markup: out.keyboard } : {});
  return { ok: true, message_id: sent?.result?.message_id ?? null, demo: sent?.demo ?? false };
}

/* ───── تسجيل الـ webhook ───── */
/* حرس: اللوحة ما تقبضش webhook البوت إلا إذا المالك فعّلها صراحةً (PANEL_OWNS_WEBHOOK=1).
   البوت الأصلي يخدم على otp-bot-wine.vercel.app — ممنوع نلمسوه. */
export const mayOwnWebhook = () => process.env.PANEL_OWNS_WEBHOOK === "1";

export async function ensureWebhook(baseUrl, opts = {}) {
  if (!mayOwnWebhook()) {
    return { ok: true, skipped: true, url: `${String(baseUrl ?? "").replace(/\/$/, "")}${webhookPath()}`, description: "اللوحة ما تقبضش webhook البوت (البوت عندو سيرفر خاص)" };
  }
  const url = `${baseUrl.replace(/\/$/, "")}${webhookPath()}`;
  const secret = webhookSecret();
  const r = await tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    // إلا التحديثات العالقة قديمة/تبع بوت سابق، نمسحها مرة واحدة باش ما يتلوّحش 401
    drop_pending_updates: opts.dropPending === true,
    max_connections: 40,
  }).catch((e) => ({ ok: false, description: String(e) }));
  return { ok: !!r.ok, url, description: r.description ?? null, demo: demoMode() };
}

export { uid };
