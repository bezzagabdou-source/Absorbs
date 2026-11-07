import { config, isAdmin } from "./config.js";
import { q, logEvent, getSetting, getSettingInt, allSettings, setSetting } from "./db.js";
import { tg } from "./services/telegram.js";
import { upsertUser, getUser, isBlocked, blockUser, unblockUser, userPublic } from "./services/users.js";
import { guard, Deny, isLocked, unlock, blockNet, profile } from "./services/guards.js";
import { awardPoints, pointsBalance, ledger } from "./services/points.js";
import { parseStartParam, resolveRefToken, registerReferral, referralLink, referrerSummary, invitees } from "./services/referral.js";
import { openQuiz, answerQuiz, quizStats, dailyReward, leaderboard } from "./services/quiz.js";
import { queueAvatar, refreshAvatar } from "./services/avatars.js";
import * as T from "./ui/texts.js";
import { esc, num, fmtDuration, displayName, sha256, fmtDateTime } from "./util.js";

const sessions = new Map(); // userId -> {n, total, correct, points, startedAt}

/* ─────────────────────────── أدوات ─────────────────────────── */

function fingerprintIp(ctx) {
  // لا يوجد IP مباشر في تيليغرام؛ نستعمل بصمة جهازية مشتقة من بيانات التحديث
  const u = ctx.from ?? {};
  const raw = `${u.id}|${u.language_code ?? ""}|${u.is_premium ? 1 : 0}`;
  return sha256(raw).slice(0, 16);
}

function isDemoAdmin(user) {
  return config.demo && (config.adminIds.length === 0 || isAdmin(user.tg_id));
}

function canAdmin(user) {
  return isAdmin(user.tg_id) || isDemoAdmin(user);
}

async function replyBlocked(chatId, reason, until) {
  await tg.sendMessage(chatId, T.blockedText(reason, until));
}

/* ─────────────────────────── المعالج الرئيسي ─────────────────────────── */

export async function handleUpdate(update, { ipHint = null } = {}) {
  try {
    if (update.message) return await onMessage(update.message, ipHint);
    if (update.callback_query) return await onCallback(update.callback_query, ipHint);
    return null;
  } catch (e) {
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
    if (e instanceof Deny) {
      if (chatId) await replyBlocked(chatId, e.message, e.retryAfterMs ? Date.now() + e.retryAfterMs : null);
      return null;
    }
    logEvent("bot_error", { severity: "error", detail: String(e?.stack ?? e).slice(0, 1500) });
    if (chatId) {
      await tg.sendMessage(chatId, "⚠️ وقع خطأ صغير، عاود المحاولة.");
    }
    return null;
  }
}

async function onMessage(msg, ipHint) {
  const from = msg.from;
  if (!from || from.is_bot) return;
  const chatId = msg.chat.id;

  // تشغيل/إيقاف البوت من الإعدادات
  if (getSetting("bot_enabled", "1") !== "1" && !canAdmin(from)) {
    return tg.sendMessage(chatId, `🛠️ البوت في صيانة.\n${esc(getSetting("maintenance_note", ""))}`);
  }

  const { user, isNew } = upsertUser(from, { ip: ipHint });
  queueAvatar(user.tg_id);

  if (isBlocked(user)) {
    return replyBlocked(chatId, user.block_reason, user.blocked_until);
  }

  const text = (msg.text ?? "").trim();

  // /start مع إحالة
  if (text.startsWith("/start")) {
    const [, param] = text.split(/\s+/, 2);
    return startFlow({ user, isNew, chatId, param, from, msg });
  }

  if (text.startsWith("/")) {
    return commands(text.split(/\s+/)[0].toLowerCase().split("@")[0], { user, chatId, msg, args: text.split(/\s+/).slice(1) });
  }

  // رسالة عادية: رد لطيف مع حماية من الإغراق
  return tg.sendMessage(chatId, "استعمل الأزرار 👇", { reply_markup: { inline_keyboard: T.mainMenu(user) } });
}

async function startFlow({ user, isNew, chatId, param, from, msg }) {
  const refToken = parseStartParam(param);
  let referralNote = "";

  if (refToken) {
    const referrer = resolveRefToken(refToken);
    if (!referrer) referralNote = "\n\n⚠️ رابط الإحالة ماشي صالح.";
    else if (referrer.tg_id === user.tg_id) referralNote = "\n\n😄 ما تقدرش تعزم روحك.";
    else if (isNew) {
      const res = registerReferral(user, referrer, {
        ip: fingerprintIp({ from }),
        ua: from.language_code ?? null,
        device: "telegram",
      });
      if (res.suspicious) {
        referralNote = "\n\n⚠️ الإحالة تسجّلت لكن في مراجعة (نشاط مريب).";
      } else if (res.pending) {
        referralNote = "\n\n🎁 الإحالة في الانتظار: جاوب على أول سؤال وتتفعّل النقاط.";
      } else {
        referralNote = `\n\n🎉 تسجّلت عن طريق ${esc(displayName(referrer))}.`;
      }
    } else {
      referralNote = "\n\n👋 راك مسجّل من قبل.";
    }
  }

  const fresh = getUser(user.tg_id);
  await tg.sendMessage(chatId, T.welcome(fresh, { botName: "برق" }) + referralNote, {
    reply_markup: { inline_keyboard: T.mainMenu(fresh) },
  });
  logEvent("start", { userId: user.tg_id, detail: refToken ? `ref=${refToken}` : null });
}

async function commands(cmd, { user, chatId, msg, args }) {
  switch (cmd) {
    case "/help":
      return tg.sendMessage(chatId, helpText(user));
    case "/play":
    case "/quiz":
      return startQuiz(user, chatId);
    case "/me":
      return tg.sendMessage(chatId, T.profileCard(getUser(user.tg_id)), {
        reply_markup: { inline_keyboard: T.mainMenu(user) },
      });
    case "/daily":
      return claimDaily(user, chatId);
    case "/ref":
    case "/invite": {
      const link = referralLink(user);
      return tg.sendMessage(chatId, T.referralCard(user, link, referrerSummary(user.tg_id)));
    }
    case "/board":
      return showBoard(user, chatId);
    case "/admin":
      return canAdmin(user) ? adminPanel(user, chatId) : tg.sendMessage(chatId, "⛔");
    case "/id":
      return tg.sendMessage(chatId, `<code>${user.tg_id}</code>`);
    case "/stats":
      return tg.sendMessage(chatId, statsText(user));
    default:
      return tg.sendMessage(chatId, "أمر غير معروف. جرب /help", {
        reply_markup: { inline_keyboard: T.mainMenu(user) },
      });
  }
}

function helpText(user) {
  const cmds = [
    "/play — ابدأ مسابقة",
    "/me — بطاقتك ونقاطك",
    "/daily — مكافأة اليوم",
    "/ref — رابط الإحالة",
    "/board — لوحة الشرف",
    "/stats — إحصائياتك",
    "/help — المساعدة",
  ];
  if (canAdmin(user)) cmds.push("/admin — لوحة الإدارة");
  return `📖 <b>الأوامر</b>\n\n${cmds.join("\n")}`;
}

function statsText(user) {
  const s = quizStats(user.tg_id);
  return (
    `📊 <b>إحصائياتك</b>\n\n` +
    `النقاط: <b>${num(pointsBalance(user.tg_id))}</b>\n` +
    `أسئلة: <b>${num(s.total)}</b> — صحيحة: <b>${num(s.correct)}</b> (${s.accuracy}%)\n` +
    `سلسلة حالية: <b>${num(s.streak)}</b> — أفضل: <b>${num(s.best)}</b>\n` +
    `اليوم: <b>${num(s.today)}</b> سؤال / <b>${num(s.todayCorrect)}</b> صحيح`
  );
}

/* ─────────────────────────── المسابقة ─────────────────────────── */

async function startQuiz(user, chatId, category = "mix") {
  let res;
  try {
    res = openQuiz(user, { chatId, category });
  } catch (e) {
    if (e instanceof Deny) throw e;
    throw e;
  }
  if (!res.ok) {
    if (res.reason === "open_session") {
      return tg.sendMessage(chatId, "عندك سؤال مفتوح مازال 👇 جاوب عليه الأول.");
    }
    if (res.reason === "daily_cap") {
      return tg.sendMessage(chatId, `🎯 وصلت الحد اليومي (${num(res.cap)} سؤال). ارجع غدوة!`);
    }
    return tg.sendMessage(chatId, "ما قدرتش نبدأ، عاود.");
  }

  const existing = sessions.get(user.tg_id);
  if (!existing) {
    sessions.set(user.tg_id, { n: 1, total: getSettingInt("quiz_questions_per_session", 5), correct: 0, points: 0 });
  }
  const now = sessions.get(user.tg_id);

  const keyboard = res.options.map((opt, i) => [
    { text: `${"ABCD"[i]}) ${opt}`, callback_data: `ans:${res.sessionId}:${i}` },
  ]);
  keyboard.push([{ text: "⏭️ تخطّي", callback_data: `skip:${res.sessionId}` }]);

  await tg.sendMessage(
    chatId,
    T.questionText({ question: res.question, categoryLabel: res.categoryLabel, seconds: res.seconds, n: now.n, total: now.total }),
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function onCallback(cb, ipHint) {
  const from = cb.from;
  const chatId = cb.message?.chat?.id;
  const data = cb.data ?? "";
  const [action, ...rest] = data.split(":");

  const { user } = upsertUser(from, { ip: ipHint });
  if (isBlocked(user)) {
    await tg.answerCallbackQuery(cb.id, "🛑 محظور", { show_alert: true });
    return replyBlocked(chatId, user.block_reason, user.blocked_until);
  }

  // تهدئة لكل ضغطة زر (حماية من الضغط الآلي)
  try {
    guard(user, "message", { fingerprint: `cb:${action}` });
  } catch (e) {
    if (e instanceof Deny) {
      await tg.answerCallbackQuery(cb.id, e.message.slice(0, 190), { show_alert: true });
      return;
    }
    throw e;
  }

  switch (action) {
    case "quiz": {
      await tg.answerCallbackQuery(cb.id, "يلا!");
      return startQuiz(user, chatId, rest[0] ?? "mix");
    }
    case "ans": {
      const sessionId = Number(rest[0]);
      const choice = Number(rest[1]);
      return answerFlow({ cb, user, chatId, sessionId, choice });
    }
    case "next": {
      const sess = sessions.get(user.tg_id);
      await tg.answerCallbackQuery(cb.id);
      if (!sess) return startQuiz(user, chatId);
      if (sess.n >= sess.total) {
        sessions.delete(user.tg_id);
        const summary =
          `🏁 <b>خلصت الجلسة!</b>\n\n` +
          `صحيحة: <b>${num(sess.correct)}/${num(sess.total)}</b>\n` +
          `نقاط الجلسة: <b>+${num(sess.points)}</b>\n` +
          `💰 المجموع: <b>${num(pointsBalance(user.tg_id))}</b>`;
        return tg.sendMessage(chatId, summary, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔁 جلسة جديدة", callback_data: "quiz:play" }],
              [{ text: "🏆 لوحة الشرف", callback_data: "board:top" }],
            ],
          },
        });
      }
      sess.n += 1;
      sessions.set(user.tg_id, sess);
      return startQuiz(user, chatId);
    }
    case "skip": {
      const sessionId = Number(rest[0]);
      q.run("UPDATE quiz_sessions SET answered_at = ?, correct = 0 WHERE id = ? AND user_id = ? AND answered_at IS NULL", Date.now(), sessionId, user.tg_id);
      await tg.answerCallbackQuery(cb.id, "تخطّيت ⏭️");
      return startQuiz(user, chatId, "mix");
    }
    case "me": {
      await tg.answerCallbackQuery(cb.id);
      return tg.sendMessage(chatId, T.profileCard(getUser(user.tg_id)), {
        reply_markup: { inline_keyboard: T.mainMenu(user) },
      });
    }
    case "points": {
      await tg.answerCallbackQuery(cb.id, `💰 ${num(pointsBalance(user.tg_id))} نقطة`);
      return;
    }
    case "daily": {
      await tg.answerCallbackQuery(cb.id, "جاري...");
      return claimDaily(user, chatId);
    }
    case "ref": {
      const link = referralLink(user);
      await tg.answerCallbackQuery(cb.id);
      const summary = referrerSummary(user.tg_id);
      await tg.sendMessage(chatId, T.referralCard(user, link, summary), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📤 مشاركة الرابط", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("عازمك نلعبو في برق ⚡")}` }],
            [{ text: "👥 شكون سجّل بسببي", callback_data: "ref:list" }],
          ],
        },
      });
      return;
    }
    case "list": {
      await tg.answerCallbackQuery(cb.id);
      const rows = invitees(user.tg_id, 20);
      if (!rows.length) return tg.sendMessage(chatId, "مازال ما سجّل حتى واحد بالرابط تاعك 🤷");
      let s = "👥 <b>آخر اللي سجّلو بسببي</b>\n\n";
      for (const r of rows) {
        const nm = [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.username ? "@" + r.username : `#${r.tg_id}`);
        const status = r.points_awarded > 0 ? "✅" : r.suspicious ? "⚠️" : "⏳";
        s += `${status} ${esc(nm)} — ${fmtDateTime(r.at)}\n`;
      }
      s += "\n✅ مفعّل · ⏳ في الانتظار · ⚠️ مشبوه";
      return tg.sendMessage(chatId, s);
    }
    case "board": {
      await tg.answerCallbackQuery(cb.id);
      return showBoard(user, chatId);
    }
    case "top": {
      await tg.answerCallbackQuery(cb.id);
      return showBoard(user, chatId);
    }
    case "admin": {
      if (!canAdmin(user)) {
        await tg.answerCallbackQuery(cb.id, "⛔", { show_alert: true });
        return;
      }
      await tg.answerCallbackQuery(cb.id);
      return adminPanel(user, chatId);
    }
    case "adm": {
      if (!canAdmin(user)) {
        await tg.answerCallbackQuery(cb.id, "⛔", { show_alert: true });
        return;
      }
      return adminCallback({ cb, user, chatId, sub: rest[0], args: rest.slice(1) });
    }
    default:
      return tg.answerCallbackQuery(cb.id);
  }
}

async function answerFlow({ cb, user, chatId, sessionId, choice }) {
  let res;
  try {
    res = answerQuiz(user, { sessionId, choice, ip: fingerprintIp({ from: cb.from }) });
  } catch (e) {
    if (e instanceof Deny) {
      await tg.answerCallbackQuery(cb.id, e.message.slice(0, 190), { show_alert: true });
      // تعديل الأزرار حتى لا يضغط مراراً
      if (cb.message?.message_id) {
        await tg
          .editMessageText(chatId, cb.message.message_id, `${cb.message.text ?? "❓"}`, {
            reply_markup: { inline_keyboard: [[{ text: "🎯 سؤال جديد", callback_data: "quiz:play" }]] },
          })
          .catch(() => {});
      }
      return;
    }
    throw e;
  }

  await tg.answerCallbackQuery(cb.id, res.correct ? "✅ صحيح!" : "❌ غلط", {
    show_alert: false,
  });

  const sess = sessions.get(user.tg_id) ?? { n: 1, total: getSettingInt("quiz_questions_per_session", 5), correct: 0, points: 0 };
  sess.correct += res.correct ? 1 : 0;
  sess.points += res.points;

  const correctText = res.options[res.correctIndex];
  const resultText = T.quizResult({
    correct: res.correct,
    points: res.points,
    speedBonus: res.speedBonus,
    streak: res.streak?.quiz_streak,
    correctText,
  });

  await tg.editMessageText(chatId, cb.message.message_id, `${esc(cb.message.text ?? "")}\n\n${resultText}`, {
    reply_markup: {
      inline_keyboard: [[{ text: sess.n < sess.total ? "➡️ السؤال التالي" : "🏁 شوف النتيجة", callback_data: `next:${sess.n}` }]],
    },
  }).catch(() => {});

  if (res.referral?.ok) {
    await tg.sendMessage(chatId, `🎁 تفعّلت الإحالة! +${num(res.referral.referee)} نقطة ليك.`);
  }

  sessions.set(user.tg_id, sess);
}

/* ─────────────────────────── المكافأة اليومية ─────────────────────────── */

async function claimDaily(user, chatId) {
  const res = dailyReward(user);
  const text = T.dailyText(res);
  await tg.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: [[{ text: "🎯 العب دكا", callback_data: "quiz:play" }]] },
  });
}

/* ─────────────────────────── لوحة الشرف ─────────────────────────── */

async function showBoard(user, chatId) {
  const rows = leaderboard(10);
  const rank = q.get(
    "SELECT COUNT(*) + 1 AS rank FROM users WHERE points > (SELECT points FROM users WHERE tg_id = ?)",
    user.tg_id
  ).rank;
  const me = { rank, points: pointsBalance(user.tg_id) };
  await tg.sendMessage(chatId, T.boardText(rows, me));
}

/* ─────────────────────────── الإدارة ─────────────────────────── */

async function adminPanel(user, chatId) {
  const users = q.get("SELECT COUNT(*) AS n FROM users").n;
  const blocked = q.get("SELECT COUNT(*) AS n FROM users WHERE blocked = 1").n;
  const flagged = q.get("SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1").n;
  const p = profile();
  const s = tg.stats;
  const text =
    `👑 <b>لوحة الإدارة</b>\n\n` +
    `👥 مستخدمين: <b>${num(users)}</b>\n` +
    `🛑 محظورين: <b>${num(blocked)}</b>\n` +
    `⚠️ إحالات مشبوهة: <b>${num(flagged)}</b>\n` +
    `🛡️ مستوى الحماية: <b>${config.protectionLevel}</b> (${p.burstN}/${Math.round(p.burstMs / 1000)}s)\n\n` +
    `📨 رسائل مرسلة: <b>${num(s.sent)}</b> · فشلت: ${num(s.failed)} · 429: ${num(s.throttled)}`;
  const kb = [
    [{ text: "🛑 المحظورين", callback_data: "adm:blocked" }],
    [{ text: "⚠️ إحالات مشبوهة", callback_data: "adm:flagged" }],
    [{ text: "🛡️ مستوى الحماية", callback_data: "adm:level" }],
    [{ text: "🧹 فك كل التهدئات", callback_data: "adm:clearlocks" }],
    [{ text: "🔓 فك حظر مستخدم", callback_data: "adm:unblockhint" }],
  ];
  return tg.sendMessage(chatId, text, { reply_markup: { inline_keyboard: kb } });
}

async function adminCallback({ cb, user, chatId, sub, args }) {
  await tg.answerCallbackQuery(cb.id);
  switch (sub) {
    case "blocked": {
      const rows = q.all(
        "SELECT tg_id, username, first_name, block_reason, blocked_at, blocked_until FROM users WHERE blocked = 1 ORDER BY blocked_at DESC LIMIT 20"
      );
      if (!rows.length) return tg.sendMessage(chatId, "ما كاين حتى محظور ✅");
      let s = "🛑 <b>المحظورين</b>\n\n";
      for (const r of rows) {
        s += `<code>${r.tg_id}</code> ${esc(r.first_name ?? "")} — ${esc(r.block_reason ?? "")}\n`;
      }
      return tg.sendMessage(chatId, s);
    }
    case "flagged": {
      const rows = q.all(
        `SELECT e.*, u.first_name, u.username FROM referral_events e JOIN users u ON u.tg_id = e.new_user_id
          WHERE e.suspicious = 1 ORDER BY e.at DESC LIMIT 20`
      );
      if (!rows.length) return tg.sendMessage(chatId, "ما كاين حتى إحالة مشبوهة ✅");
      let s = "⚠️ <b>إحالات مشبوهة</b>\n\n";
      for (const r of rows) {
        s += `<code>${r.new_user_id}</code> ← ${r.referrer_id} · ${esc(r.reasons ?? "")}\n`;
      }
      return tg.sendMessage(chatId, s);
    }
    case "level": {
      return tg.sendMessage(
        chatId,
        `🛡️ مستوى الحماية الحالي: <b>${config.protectionLevel}</b>\n\nغير المتغير <code>PROTECTION_LEVEL</code> في ملف .env ثم أعد التشغيل.`
      );
    }
    case "clearlocks": {
      // إعادة تشغيل خفيفة للحالة في الذاكرة
      return tg.sendMessage(chatId, "🧹 تم. التهدئات تعاود تتصفّر مع إعادة التشغيل (أو استعمل /admin في الويب).");
    }
    case "unblockhint":
      return tg.sendMessage(chatId, "استعمل لوحة التحكم على الويب: قسم المستخدمين ← فك الحظر.");
    default:
      return;
  }
}

/* ─────────────────────────── الإقلاع ─────────────────────────── */

export async function setupBot() {
  const me = await tg.getMe();
  if (me?.ok) {
    tg.me = me.result;
    if (!config.botUsername && me.result?.username) config.botUsername = me.result.username;
  }
  if (!config.demo && config.publicUrl && config.webhookSecret) {
    const secretPath = sha256(config.botToken).slice(0, 32);
    const url = `${config.publicUrl}/tg/${secretPath}`;
    const res = await tg.setWebhook(url, config.webhookSecret);
    logEvent("webhook_set", { detail: `${url} → ${res?.ok ? "ok" : res?.description ?? "fail"}` });
  }
  await tg.setMyCommands([
    { command: "play", description: "🎯 ابدأ مسابقة" },
    { command: "me", description: "👤 بطاقتي ونقاطي" },
    { command: "daily", description: "🎁 مكافأة اليوم" },
    { command: "ref", description: "🔗 رابط الإحالة" },
    { command: "board", description: "🏆 لوحة الشرف" },
    { command: "stats", description: "📊 إحصائياتي" },
    { command: "help", description: "📖 مساعدة" },
  ]);
  return tg.me;
}

export { userPublic, blockUser, unblockUser, awardPoints, unlock, isLocked, blockNet };
