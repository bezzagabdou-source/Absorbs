import { claimsCount, getClaim, saveClaim, takeAccount } from "./claims";
import {
  getContest,
  getLeaderboard,
  getReferralCount,
  listContests,
  participantsCount,
  updateContest,
} from "./contests";
import { getSettings } from "./settings";
import { getStore } from "./store";
import {
  answerCallback,
  editMessage,
  escapeHtml,
  getBotIdentity,
  sendMessage,
  tgCall,
  type InlineKeyboard,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
  type TgUser,
} from "./telegram";
import type { BotUser, Claim, Contest, Settings } from "./types";
import { getUser, touchUser } from "./users";

/* ───────────────────────────── helpers ───────────────────────────── */

type Button = { text: string; callback_data?: string; url?: string };

function keyboard(rows: Button[][]): InlineKeyboard {
  return { inline_keyboard: rows };
}

function progress(done: number, total: number): string {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const filled = Math.round(ratio * 10);
  return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)} ${Math.round(ratio * 100)}%`;
}

function statusLabel(status: Contest["status"]): string {
  if (status === "active") return "🟢 مفتوحة";
  if (status === "ended") return "🔴 انتهت";
  return "⚪️ لم تبدأ";
}

function nameOf(user: BotUser): string {
  return escapeHtml(user.firstName || "صديق");
}

function referralLink(botUsername: string, contestId: string, userId: string): string {
  return `https://t.me/${botUsername}?start=r_${contestId}_${userId}`;
}

async function isMember(settings: Settings, userId: number | string): Promise<boolean> {
  if (!settings.requireJoin || !settings.channelChat) return true;
  const res = await tgCall<{ status: string }>("getChatMember", {
    chat_id: settings.channelChat,
    user_id: userId,
  });
  if (!res.ok || !res.result) return false;
  return ["creator", "administrator", "member"].includes(res.result.status);
}

function joinUrl(settings: Settings): string {
  if (settings.channelUrl) return settings.channelUrl;
  const chat = settings.channelChat;
  if (chat.startsWith("@")) return `https://t.me/${chat.slice(1)}`;
  return "";
}

async function gateJoin(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  next: Button,
): Promise<boolean> {
  if (await isMember(settings, user.id)) return true;
  const url = joinUrl(settings);
  const rows: Button[][] = [];
  if (url) rows.push([{ text: "📢 اشترك في القناة", url }]);
  rows.push([{ text: "✅ تحقّق من الاشتراك", callback_data: next.callback_data || "home" }]);
  await sendMessage(
    chatId,
    "🔒 <b>لازم تشترك في قناتنا أولاً</b>\n\nاشترك ثم اضغط «تحقّق» 👇",
    keyboard(rows),
  );
  return false;
}

/* ───────────────────────────── keyboards ───────────────────────────── */

function homeKeyboard(contests: Contest[], activeId?: string): InlineKeyboard {
  const rows: Button[][] = [];
  const list = contests.filter((c) => c.status !== "ended").slice(0, 6);
  list.forEach((c) => {
    rows.push([
      {
        text: `${c.id === activeId ? "📍" : "🎯"} ${c.title} • ${c.target} جهة`,
        callback_data: `c:${c.id}`,
      },
    ]);
  });
  rows.push([
    { text: "📊 جهاتي", callback_data: "mine" },
    { text: "🥇 المتصدّرون", callback_data: "top" },
  ]);
  rows.push([
    { text: "📜 الشروط", callback_data: "rules" },
    { text: "📩 الدعم", callback_data: "support" },
  ]);
  return keyboard(rows);
}

function contestKeyboard(id: string): InlineKeyboard {
  return keyboard([
    [{ text: "🔗 رابط الإحالة — انسخه وشاركه", callback_data: `link:${id}` }],
    [
      { text: "📊 جهاتي", callback_data: `mine:${id}` },
      { text: "🥇 الترتيب", callback_data: `top:${id}` },
    ],
    [{ text: "🎁 ربح الحساب", callback_data: `claim:${id}` }],
    [{ text: "⬅️ رجوع للقائمة", callback_data: "home" }],
  ]);
}

/* ───────────────────────────── screens ───────────────────────────── */

async function showHome(chatId: number | string, user: BotUser, settings: Settings, messageId?: number) {
  const contests = await listContests();
  const active = contests.filter((c) => c.status === "active");
  const intro = settings.welcomeText
    .replace(/\{name\}/g, nameOf(user))
    .replace(/\{count\}/g, String(active.length));

  const lines = [intro, ""];
  if (!active.length) {
    lines.push("⏳ مفيش مسابقة مفتوحة حالياً — تابعنا، الجديد قريب!");
  } else {
    lines.push(`🔥 <b>المسابقات المفتوحة (${active.length})</b>`);
    for (const c of active) {
      const mine = await getReferralCount(c.id, user.id);
      lines.push(`\n🎯 <b>${escapeHtml(c.title)}</b>\n   📊 ${mine}/${c.target} جهة • ${statusLabel(c.status)}`);
    }
  }
  lines.push("\n👇 اختر مسابقة:");

  const text = lines.join("\n");
  const kb = homeKeyboard(contests);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function showContest(
  chatId: number | string,
  user: BotUser,
  contest: Contest,
  messageId?: number,
) {
  const [mine, participants, top] = await Promise.all([
    getReferralCount(contest.id, user.id),
    participantsCount(contest.id),
    getLeaderboard(contest.id, 3),
  ]);
  const remaining = Math.max(0, contest.target - mine);
  const claim = await getClaim(contest.id, user.id);

  const medals = ["🥇", "🥈", "🥉"];
  const topLines = top.length
    ? top.map((t, i) => `${medals[i] || "▫️"} ${t.member === user.id ? "أنت" : `مستخدم ${t.member.slice(-4)}`} — ${t.score}`).join("\n")
    : "لا يوجد مشاركون بعد — كن الأول!";

  const text = [
    `🎯 <b>${escapeHtml(contest.title)}</b>`,
    contest.description ? `\n${escapeHtml(contest.description)}` : "",
    `\n🎁 <b>الجائزة:</b> ${escapeHtml(contest.prize || "حساب FT كامل")}`,
    `🎯 <b>المطلوب:</b> ${contest.target} جهة`,
    `📊 <b>جهاتك:</b> ${mine}`,
    `⏳ <b>باقي لك:</b> ${remaining}`,
    `${progress(mine, contest.target)}`,
    claim ? "\n✅ <b>أنت من الفائزين — اضغط «ربح الحساب» لاستلام بياناتك مرة أخرى</b>" : "",
    `\n👥 مشاركين: ${participants} • ${statusLabel(contest.status)}`,
    `\n🏅 <b>أفضل 3:</b>\n${topLines}`,
  ]
    .filter(Boolean)
    .join("\n");

  const kb = contestKeyboard(contest.id);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function showMine(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  contestId?: string,
  messageId?: number,
) {
  const { username } = await getBotIdentity();
  const contests = contestId
    ? [await getContest(contestId)].filter((c): c is Contest => !!c)
    : (await listContests()).filter((c) => c.status === "active");

  if (!contests.length) {
    const text = "📊 مفيش مسابقة مفتوحة حالياً.";
    if (messageId) await editMessage(chatId, messageId, text, homeKeyboard([], undefined));
    else await sendMessage(chatId, text);
    return;
  }

  const parts: string[] = [`👤 <b>${nameOf(user)}</b> — إحصائياتك\n`];
  for (const c of contests) {
    const mine = await getReferralCount(c.id, user.id);
    const remaining = Math.max(0, c.target - mine);
    const link = username ? referralLink(username, c.id, user.id) : "—";
    parts.push(
      [
        `🎯 <b>${escapeHtml(c.title)}</b>`,
        `📊 جهاتك: <b>${mine}</b> / ${c.target}`,
        `⏳ باقي لك: ${remaining}`,
        `${progress(mine, c.target)}`,
        username ? `🔗 رابطك:\n<code>${link}</code>` : "",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  parts.push("📌 كل شخص يفتح رابطك ويسجّل = جهة واحدة تلقائياً.");

  const buttons: Button[][] = [];
  if (contests.length === 1) {
    buttons.push([{ text: "🔗 إرسال رابط الإحالة", callback_data: `link:${contests[0].id}` }]);
    buttons.push([{ text: "🎁 ربح الحساب", callback_data: `claim:${contests[0].id}` }]);
  }
  buttons.push([{ text: "⬅️ رجوع", callback_data: "home" }]);

  const text = parts.join("\n");
  if (messageId) await editMessage(chatId, messageId, text, keyboard(buttons));
  else await sendMessage(chatId, text, keyboard(buttons));
}

async function showLink(chatId: number | string, user: BotUser, contest: Contest) {
  const { username } = await getBotIdentity();
  if (!username) {
    await sendMessage(chatId, "⚠️ لم يتم ضبط يوزر البوت بعد. كلّم الإدارة.");
    return;
  }
  const link = referralLink(username, contest.id, user.id);
  const text = [
    `🔗 <b>رابط الإحالة الخاص بك</b>`,
    `<code>${link}</code>`,
    "",
    `انسخ الرابط وانشره في المجموعات/القنوات.`,
    `كل شخص جديد يدخل منه = جهة تُضاف تلقائياً لرصيدك. ✅`,
    "",
    `🎯 هدف «${escapeHtml(contest.title)}»: ${contest.target} جهة`,
  ].join("\n");
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    `🏆 شارك في مسابقة ${contest.title} — أول من يوصل ${contest.target} جهة يربح الحساب!`,
  )}`;
  await sendMessage(
    chatId,
    text,
    keyboard([
      [{ text: "📊 جهاتي", callback_data: `mine:${contest.id}` }],
      [{ text: "📣 مشاركة سريعة", url: share }],
      [{ text: "⬅️ رجوع", callback_data: `c:${contest.id}` }],
    ]),
  );
}

async function showTop(
  chatId: number | string,
  user: BotUser,
  contestId?: string,
  messageId?: number,
) {
  const contests = (await listContests()).filter((c) => c.status !== "draft");
  const target = contestId ? contests.find((c) => c.id === contestId) : contests[0];
  if (!target) {
    await sendMessage(chatId, "🥇 مفيش مسابقة مفتوحة حالياً.");
    return;
  }
  const top = await getLeaderboard(target.id, 10);
  const mine = await getReferralCount(target.id, user.id);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.length
    ? top
        .map((t, i) => {
          const who = t.member === user.id ? "🫵 أنت" : `مستخدم ${t.member.slice(-4)}`;
          return `${medals[i] || `${i + 1}.`} ${who} — <b>${t.score}</b> جهة`;
        })
        .join("\n")
    : "لا يوجد مشاركون بعد.";

  const text = [
    `🥇 <b>ترتيب «${escapeHtml(target.title)}»</b>`,
    "",
    lines,
    "",
    `📊 جهاتك: <b>${mine}</b> / ${target.target}`,
  ].join("\n");

  const kb = keyboard([
    [{ text: "🎁 ربح الحساب", callback_data: `claim:${target.id}` }],
    [{ text: "⬅️ رجوع", callback_data: `c:${target.id}` }],
  ]);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

/* ───────────────────────────── الفوز ───────────────────────────── */

type GrantOutcome =
  | { status: "granted"; claim: Claim }
  | { status: "already"; claim: Claim }
  | { status: "not-ready"; remaining: number }
  | { status: "closed" }
  | { status: "no-stock" };

async function notifyAdmins(text: string) {
  const settings = await getSettings();
  const targets = [...new Set([...settings.adminIds.filter(Boolean), settings.logChatId].filter(Boolean))];
  await Promise.all(targets.map((id) => sendMessage(id, text).catch(() => undefined)));
}

async function attemptGrant(contest: Contest, user: BotUser): Promise<GrantOutcome> {
  const existing = await getClaim(contest.id, user.id);
  if (existing) return { status: "already", claim: existing };

  if (contest.status !== "active") return { status: "closed" };

  const mine = await getReferralCount(contest.id, user.id);
  if (mine < contest.target) return { status: "not-ready", remaining: contest.target - mine };

  const won = await claimsCount(contest.id);
  if (won >= contest.winners) return { status: "closed" };

  const account = await takeAccount(contest.id);
  if (!account) {
    await notifyAdmins(
      `⚠️ <b>نفد مخزون الحسابات!</b>\nالمسابقة: ${escapeHtml(contest.title)}\nالمستخدم: ${user.id}`,
    );
    return { status: "no-stock" };
  }

  const claim: Claim = {
    contestId: contest.id,
    contestTitle: contest.title,
    userId: user.id,
    userName: user.firstName,
    email: account.email,
    password: account.password,
    at: Date.now(),
  };
  await saveClaim(claim);

  await sendMessage(
    user.id,
    [
      "🎉 <b>مبروك! ربحت الحساب</b>",
      `🏆 المسابقة: ${escapeHtml(contest.title)}`,
      "",
      "📧 <b>الإيميل:</b>",
      `<code>${escapeHtml(claim.email)}</code>`,
      "🔑 <b>كلمة السر:</b>",
      `<code>${escapeHtml(claim.password)}</code>`,
      "",
      "⚠️ غيّر كلمة السر فوراً بعد الدخول، واحتفظ بالبيانات عندك.",
    ].join("\n"),
  );

  await notifyAdmins(
    [
      "🎁 <b>تم تسليم جائزة</b>",
      `👤 ${escapeHtml(user.firstName)} (<code>${user.id}</code>)`,
      `🏆 ${escapeHtml(contest.title)} (${contest.id})`,
      `📧 ${escapeHtml(claim.email)}`,
      `⏱ ${new Date(claim.at).toISOString()}`,
    ].join("\n"),
  );

  const total = await claimsCount(contest.id);
  if (total >= contest.winners) {
    await updateContest(contest.id, { status: "ended", endedAt: Date.now() });
  }
  return { status: "granted", claim };
}

async function handleClaim(chatId: number | string, user: BotUser, contestId: string, settings: Settings) {
  const contest = await getContest(contestId);
  if (!contest) {
    await sendMessage(chatId, "❓ المسابقة غير موجودة.");
    return;
  }
  if (!(await gateJoin(chatId, user, settings, { text: "تحقق", callback_data: `claim:${contestId}` }))) {
    return;
  }

  const outcome = await attemptGrant(contest, user);

  if (outcome.status === "granted" || outcome.status === "already") {
    if (outcome.status === "already") {
      await sendMessage(
        chatId,
        [
          "ℹ️ أنت ربحت هذه المسابقة بالفعل — دي بياناتك مرة أخرى:",
          "",
          `📧 <b>الإيميل:</b> <code>${escapeHtml(outcome.claim.email)}</code>`,
          `🔑 <b>كلمة السر:</b> <code>${escapeHtml(outcome.claim.password)}</code>`,
        ].join("\n"),
      );
    }
    return;
  }

  if (outcome.status === "not-ready") {
    const mine = await getReferralCount(contest.id, user.id);
    await sendMessage(
      chatId,
      [
        "⏳ <b>لسه ما وصلتش للهدف</b>",
        "",
        `🎯 المطلوب: ${contest.target} جهة`,
        `📊 عندك: <b>${mine}</b>`,
        `🔻 باقي لك: <b>${outcome.remaining}</b>`,
        "",
        "شارك رابطك مع أصحابك وارجع اضغط «ربح الحساب» لما تكمّل 👇",
      ].join("\n"),
      keyboard([
        [{ text: "🔗 رابط الإحالة", callback_data: `link:${contest.id}` }],
        [{ text: "📊 جهاتي", callback_data: `mine:${contest.id}` }],
      ]),
    );
    return;
  }

  if (outcome.status === "no-stock") {
    await sendMessage(
      chatId,
      "✅ وصلت للهدف، لكن مخزون الحسابات خلص حالياً.\n📩 الإدارة تم إبلاغها وسترسل لك الجائزة قريباً.",
    );
    return;
  }

  await sendMessage(chatId, "🔴 هذه المسابقة مغلقة (تم الفوز فيها بالفعل).");
}

/* ───────────────────────── الإحالة (نقطة واحدة) ───────────────────────── */

async function creditReferral(contest: Contest, inviterId: string, newUser: BotUser) {
  const store = getStore();
  if (!/^\d+$/.test(inviterId) || inviterId === newUser.id) return { counted: false, count: 0 };
  // لا تُحسب إحالات بعد نهاية المسابقة أو من صاحب رابط غير مسجّل
  if (contest.status !== "active") return { counted: false, count: 0 };
  const inviterExists = await getUser(inviterId);
  if (!inviterExists) return { counted: false, count: 0 };

  const added = await store.sAdd(`contest:${contest.id}:credited`, newUser.id);
  if (!added) return { counted: false, count: await getReferralCount(contest.id, inviterId) };

  const count = await store.zIncr(`contest:${contest.id}:score`, inviterId, 1);
  const inviter = await getUser(inviterId);
  if (!inviter) return { counted: true, count };

  const remaining = Math.max(0, contest.target - count);
  const progressText = `${progress(count, contest.target)}\n📊 جهاتك: <b>${count}</b> / ${contest.target}`;

  const text =
    remaining > 0
      ? [
          "➕ <b>جهة جديدة!</b>",
          `👤 ${escapeHtml(newUser.firstName)} انضم من رابطك في «${escapeHtml(contest.title)}»`,
          progressText,
          `⏳ باقي لك: <b>${remaining}</b>`,
        ].join("\n")
      : [
          "🎉 <b>مبروك! وصلت للهدف</b> — «" + escapeHtml(contest.title) + "»",
          progressText,
          "",
          "اضغط «ربح الحساب» لاستلام بيانات الحساب 👇",
        ].join("\n");

  try {
    await sendMessage(
      inviterId,
      text,
      keyboard([
        ...(remaining === 0
          ? ([[{ text: "🎁 ربح الحساب الآن", callback_data: `claim:${contest.id}` }]] as Button[][])
          : []),
        [{ text: "📊 جهاتي", callback_data: `mine:${contest.id}` }],
        [{ text: "🔗 رابطي", callback_data: `link:${contest.id}` }],
      ]),
    );
  } catch {
    /* المستخدم قد يكون حظر البوت */
  }

  if (remaining === 0) {
    const settings = await getSettings();
    if (settings.autoGrant) await attemptGrant(contest, inviter);
  }
  return { counted: true, count };
}

/* ───────────────────────────── entry points ───────────────────────────── */

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const message = update.message || update.edited_message;
  if (message?.text) await handleMessage(message);
}

async function handleMessage(message: TgMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;
  const chatId = message.chat.id;
  const user = await touchUser(from);
  const settings = await getSettings();
  const text = message.text!.trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const payload = (args[0] || "").trim();

  if (command === "/start") {
    if (payload.startsWith("r_")) {
      const [, contestId, inviterId] = payload.split("_");
      const contest = await getContest(contestId);
      if (contest) {
        const result = await creditReferral(contest, inviterId, user);
        // إشعار الشخص الجديد بأنه ساهم
        if (result.counted) {
          await sendMessage(
            chatId,
            "✅ تم تسجيل دخولك، ورقم جهة صاحب الرابط زاد 1.\nتقدر تشارك أنت كمان وتجمع جهاتك 👇",
          );
        }
        await showContest(chatId, user, contest);
        return;
      }
    }
    if (payload.startsWith("c_")) {
      const contest = await getContest(payload.slice(2));
      if (contest) {
        await showContest(chatId, user, contest);
        return;
      }
    }
    await showHome(chatId, user, settings);
    return;
  }

  if (command === "/help" || command === "/rules") {
    await sendMessage(chatId, settings.rulesText, keyboard([[{ text: "⬅️ رجوع", callback_data: "home" }]]));
    return;
  }
  if (command === "/me" || command === "/mystats") {
    await showMine(chatId, user, settings);
    return;
  }
  if (command === "/top" || command === "/leaderboard") {
    await showTop(chatId, user);
    return;
  }
  if (command === "/claim" || command === "/win") {
    const contest = await getContest(payload) || (await listContests()).find((c) => c.status === "active");
    if (contest) await handleClaim(chatId, user, contest.id, settings);
    else await sendMessage(chatId, "مفيش مسابقة مفتوحة حالياً.");
    return;
  }
  if (command === "/link" || command === "/invite") {
    const contest = await getContest(payload) || (await listContests()).find((c) => c.status === "active");
    if (contest) await showLink(chatId, user, contest);
    else await sendMessage(chatId, "مفيش مسابقة مفتوحة حالياً.");
    return;
  }
  if (command === "/admin") {
    if (settings.adminIds.includes(user.id)) {
      await sendMessage(chatId, "🛠 لوحة التحكم: افتح موقع البوت ← /admin");
    } else {
      await sendMessage(chatId, "⛔️ هذا الأمر للإدارة فقط.");
    }
    return;
  }

  await showHome(chatId, user, settings);
}

async function handleCallback(query: TgCallbackQuery) {
  await answerCallback(query.id);
  const from = query.from;
  if (!from || from.is_bot) return;
  const user = await touchUser(from);
  const chatId = query.message?.chat.id ?? from.id;
  const messageId = query.message?.message_id;
  const settings = await getSettings();
  const data = query.data || "home";
  const [action, arg] = data.split(":");

  switch (action) {
    case "home":
      await showHome(chatId, user, settings, messageId);
      return;
    case "mine":
      await showMine(chatId, user, settings, arg, messageId);
      return;
    case "top":
      await showTop(chatId, user, arg, messageId);
      return;
    case "rules":
      await editMessage(chatId, messageId!, settings.rulesText, keyboard([[{ text: "⬅️ رجوع", callback_data: "home" }]]));
      return;
    case "support": {
      const support = settings.supportUsername.replace(/^@/, "");
      const text = support
        ? `📩 <b>الدعم</b>\n\nتواصل معنا: @${escapeHtml(support)}`
        : "📩 <b>الدعم</b>\n\nكلّم الإدارة من حسابها الرسمي.";
      await editMessage(
        chatId,
        messageId!,
        text,
        keyboard([
          ...(support ? ([[{ text: "📩 مراسلة الدعم", url: `https://t.me/${support}` }]] as Button[][]) : []),
          [{ text: "⬅️ رجوع", callback_data: "home" }],
        ]),
      );
      return;
    }
    case "c": {
      const contest = await getContest(arg);
      if (!contest) {
        await sendMessage(chatId, "❓ المسابقة غير موجودة.");
        return;
      }
      await showContest(chatId, user, contest, messageId);
      return;
    }
    case "link": {
      const contest = await getContest(arg);
      if (contest) await showLink(chatId, user, contest);
      return;
    }
    case "claim": {
      const contest = await getContest(arg);
      if (contest) await handleClaim(chatId, user, contest.id, settings);
      return;
    }
    default:
      await showHome(chatId, user, settings, messageId);
  }
}
