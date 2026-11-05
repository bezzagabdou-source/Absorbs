import { claimsCount, getClaim, saveClaim, takeAccount } from "./claims";
import {
  getContest,
  getLeaderboard,
  getReferralCount,
  listContests,
  participantsCount,
  updateContest,
} from "./contests";
import {
  activeGroupContest,
  creditGroupJoin,
  ensureGroupContest,
  groupType,
  linkGroup,
  linkedGroup,
  ownerUrl,
  personalGroupInvite,
  recentGroupJoins,
  unlinkGroup,
} from "./groups";
import { getSettings, ownerHandle } from "./settings";
import { getStore } from "./store";
import {
  answerCallback,
  approveJoinRequest,
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

function isGroupMode(contest: Contest | null | undefined): boolean {
  return contest?.mode === "group";
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
  rows.push([{ text: "✅ تحقّق", callback_data: next.callback_data || "home" }]);
  await sendMessage(chatId, "🔒 اشترك في القناة أولاً 👇", keyboard(rows));
  return false;
}

/* ───────────────────────────── keyboards ───────────────────────────── */

function homeKeyboard(settings: Settings, contests: Contest[]): InlineKeyboard {
  const rows: Button[][] = [];
  const hasGroup = Boolean(linkedGroup(settings));

  if (hasGroup) {
    rows.push([{ text: "🏃 أسرع ضيف — أضف أعضاء واربح", callback_data: "fastest" }]);
  }

  const list = contests.filter((c) => c.status !== "ended" && c.mode !== "group").slice(0, 5);
  list.forEach((c) => {
    rows.push([{ text: `🎯 ${c.title} • ${c.target} جهة`, callback_data: `c:${c.id}` }]);
  });

  rows.push([
    { text: "📊 جهاتي", callback_data: "mine" },
    { text: "🥇 الترتيب", callback_data: "top" },
  ]);
  rows.push([
    { text: "📜 الشروط", callback_data: "rules" },
    { text: `👑 المالك ${ownerHandle(settings)}`, callback_data: "owner" },
  ]);
  return keyboard(rows);
}

function contestKeyboard(contest: Contest): InlineKeyboard {
  const main: Button =
    isGroupMode(contest)
      ? { text: "🔗 رابط الدعوة الخاص بي", callback_data: `ginv:${contest.id}` }
      : { text: "🔗 رابط الإحالة الخاص بي", callback_data: `link:${contest.id}` };
  return keyboard([
    [main],
    [
      { text: "📊 جهاتي", callback_data: `mine:${contest.id}` },
      { text: "🥇 الترتيب", callback_data: `top:${contest.id}` },
    ],
    [{ text: "🎁 ربح الحساب", callback_data: `claim:${contest.id}` }],
    [{ text: "⬅️ رجوع", callback_data: "home" }],
  ]);
}

function backRow(target = "home"): Button[] {
  return [{ text: "⬅️ رجوع", callback_data: target }];
}

/* ───────────────────────────── screens ───────────────────────────── */

async function showHome(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  messageId?: number,
) {
  const contests = await listContests();
  const text = (settings.welcomeText || "مرحبا بكم في بوت مسابقات FT")
    .replace(/\{name\}/g, nameOf(user))
    .replace(/\{count\}/g, String(contests.filter((c) => c.status === "active").length));
  const kb = homeKeyboard(settings, contests);
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
    ? top
        .map(
          (t, i) =>
            `${medals[i] || "▫️"} ${t.member === user.id ? "أنت" : `عضو ${t.member.slice(-4)}`} — ${t.score}`,
        )
        .join("\n")
    : "لا أحد بعد — كن الأول";

  const text = [
    `🎯 <b>${escapeHtml(contest.title)}</b>`,
    `🎁 ${escapeHtml(contest.prize || "حساب FT كامل")}`,
    isGroupMode(contest) ? "👥 الحساب: كل عضو يدخل المجموعة من رابطك = جهة" : "",
    "",
    `📊 جهاتك: <b>${mine}</b> / ${contest.target} — باقي <b>${remaining}</b>`,
    progress(mine, contest.target),
    claim ? "✅ أنت فائز — اضغط «ربح الحساب» لاستلام بياناتك." : "",
    `👥 مشاركين: ${participants} • ${statusLabel(contest.status)}`,
    "",
    `🏅 <b>أفضل 3</b>\n${topLines}`,
  ]
    .filter(Boolean)
    .join("\n");

  const kb = contestKeyboard(contest);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function showFastest(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  messageId?: number,
) {
  const group = linkedGroup(settings);
  if (!group) {
    const text = "🏃 أسرع ضيف\n\nأضف البوت لمجموعتك ورح يبدأ النظام تلقائياً.";
    const kb = keyboard([
      [{ text: `👑 كلّم المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
      backRow(),
    ]);
    if (messageId) await editMessage(chatId, messageId, text, kb);
    else await sendMessage(chatId, text, kb);
    return;
  }

  const contest = (await activeGroupContest()) || (await ensureGroupContest(settings.groupTarget));
  const [mine, top, participants] = await Promise.all([
    getReferralCount(contest.id, user.id),
    getLeaderboard(contest.id, 5),
    participantsCount(contest.id),
  ]);
  const names = await Promise.all(
    top.map(async (t) => {
      const u = await getUser(t.member);
      return t.member === user.id ? "🫵 أنت" : escapeHtml(u?.firstName || `عضو ${t.member.slice(-4)}`);
    }),
  );
  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const board = top.length
    ? top.map((t, i) => `${medals[i] || "▫️"} ${names[i]} — <b>${t.score}</b>`).join("\n")
    : "لا أحد بعد — كن أول من يضيف 👇";

  const remaining = Math.max(0, contest.target - mine);
  const text = [
    "🏃 <b>أسرع ضيف</b>",
    `🎯 الهدف: <b>${contest.target}</b> عضو في المجموعة`,
    `📊 جهاتك: <b>${mine}</b> — باقي <b>${remaining}</b>`,
    progress(mine, contest.target),
    "",
    `🏅 <b>الترتيب</b>\n${board}`,
    "",
    `👥 مشاركين: ${participants}`,
  ].join("\n");

  const kb = keyboard([
    [{ text: "🔗 رابطي — أضف أعضاء", callback_data: `ginv:${contest.id}` }],
    [
      { text: "📊 جهاتي", callback_data: "mine" },
      { text: "🎁 ربح الحساب", callback_data: `claim:${contest.id}` },
    ],
    ...(group.url ? ([[{ text: "👥 المجموعة", url: group.url }]] as Button[][]) : []),
    backRow(),
  ]);

  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function showGroupInvite(chatId: number | string, user: BotUser, contest: Contest) {
  const invite = await personalGroupInvite(user, contest);
  const settings = await getSettings();
  if (!invite) {
    await sendMessage(
      chatId,
      "⚠️ ما قدرتش نصاوب رابط الدعوة. تأكد أن البوت أدمن في المجموعة بصلاحية «دعوة مستخدمين».",
      keyboard([
        [{ text: `👑 المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
        backRow(`c:${contest.id}`),
      ]),
    );
    return;
  }

  const share = `https://t.me/share/url?url=${encodeURIComponent(invite.link)}&text=${encodeURIComponent(
    `🏃 مسابقة أسرع ضيف — أدخل المجموعة من رابطي واربح معي!`,
  )}`;

  await sendMessage(
    chatId,
    [
      "🔗 <b>رابط الدعوة الخاص بك</b>",
      `<code>${escapeHtml(invite.link)}</code>`,
      "",
      "كل عضو يدخل المجموعة من هذا الرابط = <b>جهة</b> في رصيدك.",
      "الطلب يُقبل تلقائياً فوراً ✅",
    ].join("\n"),
    keyboard([
      [{ text: "📣 مشاركة الرابط", url: share }],
      [
        { text: "📊 جهاتي", callback_data: `mine:${contest.id}` },
        { text: "🏃 أسرع ضيف", callback_data: "fastest" },
      ],
      backRow(`c:${contest.id}`),
    ]),
  );
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
    const text = "📊 ما فيه مسابقة مفتوحة حالياً.";
    if (messageId) await editMessage(chatId, messageId, text, homeKeyboard(settings, []));
    else await sendMessage(chatId, text);
    return;
  }

  const parts: string[] = [`👤 <b>${nameOf(user)}</b>`];
  for (const c of contests) {
    const mine = await getReferralCount(c.id, user.id);
    const remaining = Math.max(0, c.target - mine);
    const link =
      c.mode === "group"
        ? (await personalGroupInvite(user, c))?.link || "—"
        : username
          ? referralLink(username, c.id, user.id)
          : "—";
    parts.push(
      [
        "",
        `🎯 <b>${escapeHtml(c.title)}</b>`,
        `📊 ${mine} / ${c.target} — باقي ${remaining}`,
        progress(mine, c.target),
        `🔗 <code>${escapeHtml(link)}</code>`,
      ].join("\n"),
    );
  }

  const buttons: Button[][] = [];
  const groupContest = contests.find((c) => c.mode === "group");
  if (groupContest) {
    buttons.push([{ text: "🏃 أسرع ضيف", callback_data: "fastest" }]);
  } else if (contests.length === 1) {
    buttons.push([{ text: "🎁 ربح الحساب", callback_data: `claim:${contests[0].id}` }]);
  }
  buttons.push(backRow());

  const text = parts.join("\n");
  if (messageId) await editMessage(chatId, messageId, text, keyboard(buttons));
  else await sendMessage(chatId, text, keyboard(buttons));
}

async function showLink(chatId: number | string, user: BotUser, contest: Contest) {
  if (isGroupMode(contest)) {
    await showGroupInvite(chatId, user, contest);
    return;
  }
  const { username } = await getBotIdentity();
  if (!username) {
    await sendMessage(chatId, "⚠️ البوت غير مضبوط بعد. كلّم الإدارة.");
    return;
  }
  const link = referralLink(username, contest.id, user.id);
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
    `🏆 مسابقة ${contest.title} — أول من يوصل ${contest.target} جهة يربح!`,
  )}`;
  await sendMessage(
    chatId,
    ["🔗 <b>رابطك</b>", `<code>${link}</code>`, "", "كل شخص يفتحه = جهة في رصيدك ✅"].join("\n"),
    keyboard([
      [{ text: "📣 مشاركة سريعة", url: share }],
      [{ text: "📊 جهاتي", callback_data: `mine:${contest.id}` }],
      backRow(`c:${contest.id}`),
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
    await sendMessage(chatId, "🥇 ما فيه مسابقة مفتوحة.");
    return;
  }
  const [top, mine] = await Promise.all([
    getLeaderboard(target.id, 10),
    getReferralCount(target.id, user.id),
  ]);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.length
    ? top
        .map((t, i) => {
          const u = t.member;
          const who = u === user.id ? "🫵 أنت" : `عضو ${u.slice(-4)}`;
          return `${medals[i] || `${i + 1}.`} ${who} — <b>${t.score}</b>`;
        })
        .join("\n")
    : "لا أحد بعد.";

  const text = [
    `🥇 <b>${escapeHtml(target.title)}</b>`,
    "",
    lines,
    "",
    `📊 جهاتك: <b>${mine}</b> / ${target.target}`,
  ].join("\n");

  const kb = keyboard([
    [{ text: "🎁 ربح الحساب", callback_data: `claim:${target.id}` }],
    backRow(`c:${target.id}`),
  ]);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

function ownerText(settings: Settings): string {
  return [
    `👑 <b>مالك البوت</b>`,
    `${ownerHandle(settings)}`,
    "",
    "كل شي يخص المسابقات والجوائز يرجع له.",
  ].join("\n");
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
  const targets = [
    ...new Set([...settings.adminIds.filter(Boolean), settings.logChatId].filter(Boolean)),
  ];
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
      `🏆 ${escapeHtml(contest.title)}`,
      "",
      `📧 <code>${escapeHtml(claim.email)}</code>`,
      `🔑 <code>${escapeHtml(claim.password)}</code>`,
      "",
      "⚠️ غيّر كلمة السر فوراً.",
    ].join("\n"),
  );

  await notifyAdmins(
    [
      "🎁 <b>تم تسليم جائزة</b>",
      `👤 ${escapeHtml(user.firstName)} (<code>${user.id}</code>)`,
      `🏆 ${escapeHtml(contest.title)} (${contest.id})`,
      `📧 ${escapeHtml(claim.email)}`,
    ].join("\n"),
  );

  const total = await claimsCount(contest.id);
  if (total >= contest.winners) {
    await updateContest(contest.id, { status: "ended", endedAt: Date.now() });
  }
  return { status: "granted", claim };
}

async function handleClaim(
  chatId: number | string,
  user: BotUser,
  contestId: string,
  settings: Settings,
) {
  const contest = await getContest(contestId);
  if (!contest) {
    await sendMessage(chatId, "❓ المسابقة غير موجودة.");
    return;
  }
  if (!(await gateJoin(chatId, user, settings, { text: "تحقق", callback_data: `claim:${contestId}` }))) {
    return;
  }

  const outcome = await attemptGrant(contest, user);

  if (outcome.status === "already") {
    await sendMessage(
      chatId,
      [
        "ℹ️ ربحت هذه المسابقة بالفعل — بياناتك مرة أخرى:",
        "",
        `📧 <code>${escapeHtml(outcome.claim.email)}</code>`,
        `🔑 <code>${escapeHtml(outcome.claim.password)}</code>`,
      ].join("\n"),
    );
    return;
  }
  if (outcome.status === "granted") return;

  if (outcome.status === "not-ready") {
    const mine = await getReferralCount(contest.id, user.id);
    await sendMessage(
      chatId,
      [
        "⏳ <b>ما وصلتش للهدف</b>",
        "",
        `📊 عندك: <b>${mine}</b> / ${contest.target}`,
        `🔻 باقي: <b>${outcome.remaining}</b>`,
        progress(mine, contest.target),
      ].join("\n"),
      keyboard([
        [
          {
            text: isGroupMode(contest) ? "🔗 رابط الدعوة" : "🔗 رابط الإحالة",
            callback_data: isGroupMode(contest) ? `ginv:${contest.id}` : `link:${contest.id}`,
          },
        ],
        backRow(`c:${contest.id}`),
      ]),
    );
    return;
  }

  if (outcome.status === "no-stock") {
    await sendMessage(chatId, "✅ وصلت للهدف، لكن مخزون الحسابات خالي. الإدارة تُبلغت.");
    return;
  }

  await sendMessage(chatId, "🔴 هاد المسابقة مسدودة.");
}

/* ───────────────────────── الإحالة عبر رابط البوت ───────────────────────── */

async function creditReferral(contest: Contest, inviterId: string, newUser: BotUser) {
  const store = getStore();
  if (!/^\d+$/.test(inviterId) || inviterId === newUser.id) return { counted: false, count: 0 };
  if (contest.status !== "active") return { counted: false, count: 0 };
  const inviterExists = await getUser(inviterId);
  if (!inviterExists) return { counted: false, count: 0 };

  const added = await store.sAdd(`contest:${contest.id}:credited`, newUser.id);
  if (!added) return { counted: false, count: await getReferralCount(contest.id, inviterId) };

  const count = await store.zIncr(`contest:${contest.id}:score`, inviterId, 1);
  await notifyOwnerOfReferral(contest, inviterExists, count, newUser.firstName);
  return { counted: true, count };
}

/** إشعار صاحب الرابط بجهة جديدة (رسالة قصيرة) */
async function notifyOwnerOfReferral(
  contest: Contest,
  owner: BotUser,
  count: number,
  joinerName: string,
) {
  const remaining = Math.max(0, contest.target - count);
  const settings = await getSettings();
  const text =
    remaining > 0
      ? [
          `➕ <b>جهة جديدة</b> — ${escapeHtml(joinerName || "عضو")}`,
          `📊 ${count} / ${contest.target} — باقي <b>${remaining}</b>`,
          progress(count, contest.target),
        ].join("\n")
      : [
          "🎉 <b>وصلت للهدف</b>",
          `📊 ${count} / ${contest.target}`,
          "اضغط «ربح الحساب» 👇",
        ].join("\n");

  try {
    await sendMessage(
      owner.id,
      text,
      keyboard([
        ...(remaining === 0
          ? ([[{ text: "🎁 ربح الحساب الآن", callback_data: `claim:${contest.id}` }]] as Button[][])
          : []),
        [
          {
            text: isGroupMode(contest) ? "🔗 رابطي" : "🔗 رابطي",
            callback_data: isGroupMode(contest) ? `ginv:${contest.id}` : `link:${contest.id}`,
          },
          { text: "📊 جهاتي", callback_data: `mine:${contest.id}` },
        ],
      ]),
    );
  } catch {
    /* حظر البوت */
  }

  if (remaining === 0 && settings.autoGrant) await attemptGrant(contest, owner);
}

/* ───────────────────── المجموعة: ربط + طلبات انضمام ───────────────────── */

async function announceGroupLinked(chatId: number | string, settings: Settings, title: string) {
  await sendMessage(
    chatId,
    [
      "✅ <b>تم ربط المجموعة بنظام أسرع ضيف</b>",
      `🏆 المسابقة: ${escapeHtml(title)}`,
      "",
      "كل عضو يضيفه المشارك من رابطه الخاص = جهة في رصيده.",
      "المشارك يفتح البوت ← «🏃 أسرع ضيف» ← ياخذ رابطه وينشره.",
    ].join("\n"),
    keyboard([
      [{ text: "🏃 أسرع ضيف", callback_data: "fastest" }],
      [{ text: `👑 المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
    ]),
  );
}

async function handleMyChatMember(
  update: NonNullable<TgUpdate["my_chat_member"]>,
): Promise<void> {
  const { chat, new_chat_member: member, from } = update;
  if (!groupType(chat)) return;
  const status = member?.status || "";
  const settings = await getSettings();

  if (["member", "administrator", "creator"].includes(status)) {
    await linkGroup({ id: chat.id, title: chat.title, username: chat.username });
    const contest = await ensureGroupContest((await getSettings()).groupTarget);
    await announceGroupLinked(chat.id, await getSettings(), contest.title);
    if (from?.id) {
      await sendMessage(
        from.id,
        [
          "✅ ربطت البوت بالمجموعة — نظام <b>أسرع ضيف</b> خدمة تلقائياً.",
          `🎯 الهدف الحالي: ${contest.target} عضو`,
          "من اللوحة تقدر تبدّل الهدف والجائزة.",
        ].join("\n"),
        keyboard([
          [{ text: "🏃 أسرع ضيف", callback_data: "fastest" }],
          [{ text: `👑 المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
        ]),
      );
    }
    return;
  }

  if (["left", "kicked"].includes(status)) {
    await unlinkGroup(chat.id);
  }
}

async function handleJoinRequest(
  request: NonNullable<TgUpdate["chat_join_request"]>,
): Promise<void> {
  const { chat, from } = request;
  if (!groupType(chat) || !from || from.is_bot) return;
  const settings = await getSettings();
  const link = request.invite_link?.invite_link || "";

  const result = await creditGroupJoin({
    chatId: String(chat.id),
    joiner: { id: from.id, firstName: from.first_name, username: from.username, isBot: from.is_bot },
    inviteLink: link,
  });

  if (settings.autoApproveJoins) {
    const approved = await approveJoinRequest(chat.id, from.id);
    if (!approved.ok) console.error("[group] approve failed", approved.description);
  }

  if (!result.counted || !result.contest) return;

  const owner = await getUser(result.ownerId);
  if (owner) {
    await notifyOwnerOfReferral(result.contest, owner, result.count, from.first_name || "عضو");
  }

  const settingsNow = await getSettings();
  if (result.contest.target <= result.count) {
    const text = `🎉 <b>هدف «${escapeHtml(result.contest.title)}» اكتمل</b> — صاحب الجهات: ${escapeHtml(
      owner?.firstName || result.ownerId,
    )}`;
    await notifyAdmins(text);
    if (settingsNow.logChatId) await sendMessage(settingsNow.logChatId, text).catch(() => undefined);
  }
}

async function handleNewChatMembers(message: TgMessage): Promise<void> {
  const added = message.new_chat_members || [];
  if (!added.length) return;
  const chat = message.chat;
  if (!groupType(chat)) return;
  const settings = await getSettings();
  const adder = message.from;

  for (const member of added) {
    if (member.is_bot) continue;
    const credit = await creditGroupJoin({
      chatId: String(chat.id),
      joiner: { id: member.id, firstName: member.first_name, username: member.username },
      adderId: adder && adder.id !== member.id ? String(adder.id) : undefined,
      adderName: adder?.first_name,
    });
    if (!credit.counted || !credit.contest) continue;
    const owner = await getUser(credit.ownerId);
    if (owner) {
      await notifyOwnerOfReferral(credit.contest, owner, credit.count, member.first_name || "عضو");
    }
    await sendMessage(
      chat.id,
      `➕ جهة جديدة لـ ${escapeHtml(owner?.firstName || "مشارك")} — ${credit.count}/${credit.contest.target}`,
    );
  }

  if (!settings.groupChat) {
    await linkGroup({ id: chat.id, title: chat.title, username: chat.username });
  }
}

/* ───────────────────────────── entry points ───────────────────────────── */

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  if (update.my_chat_member) {
    await handleMyChatMember(update.my_chat_member);
    return;
  }
  if (update.chat_join_request) {
    await handleJoinRequest(update.chat_join_request);
    return;
  }
  const message = update.message || update.edited_message;
  if (!message) return;
  if (message.new_chat_members?.length) {
    await handleNewChatMembers(message);
    return;
  }
  if (message.text) await handleMessage(message);
}

async function handleMessage(message: TgMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;
  const chat = message.chat;
  const chatId = chat.id;
  const inGroup = groupType(chat);
  const user = await touchUser(from);
  const settings = await getSettings();
  const text = message.text!.trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const payload = (args[0] || "").trim();

  const known = [
    "/start",
    "/help",
    "/rules",
    "/me",
    "/mystats",
    "/top",
    "/leaderboard",
    "/claim",
    "/win",
    "/link",
    "/invite",
    "/fastest",
    "/owner",
    "/support",
    "/admin",
  ];
  if (inGroup && !known.includes(command)) return;

  if (command === "/start") {
    if (payload.startsWith("r_")) {
      const [, contestId, inviterId] = payload.split("_");
      const contest = await getContest(contestId);
      if (contest) {
        await creditReferral(contest, inviterId, user);
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
    await sendMessage(chatId, settings.rulesText, keyboard([backRow()]));
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
  if (command === "/fastest") {
    await showFastest(chatId, user, settings);
    return;
  }
  if (command === "/owner" || command === "/support") {
    await sendMessage(
      chatId,
      ownerText(settings),
      keyboard([
        [{ text: `💬 مراسلة المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
        backRow(),
      ]),
    );
    return;
  }
  if (command === "/claim" || command === "/win") {
    const contest =
      (await getContest(payload)) || (await listContests()).find((c) => c.status === "active");
    if (contest) await handleClaim(chatId, user, contest.id, settings);
    else await sendMessage(chatId, "ما فيه مسابقة مفتوحة.");
    return;
  }
  if (command === "/link" || command === "/invite") {
    const contest =
      (await getContest(payload)) ||
      (await listContests()).find((c) => c.status === "active" && c.mode === "group") ||
      (await listContests()).find((c) => c.status === "active");
    if (contest) await showLink(chatId, user, contest);
    else await sendMessage(chatId, "ما فيه مسابقة مفتوحة.");
    return;
  }
  if (command === "/admin") {
    if (settings.adminIds.includes(user.id)) {
      await sendMessage(chatId, "🛠 لوحة التحكم: افتح الموقع ← /admin");
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
  const chat = query.message?.chat;
  const inGroup = chat ? groupType(chat) : false;
  // داخل المجموعة: نرد في الخاص حتى ما نزعجوش الأعضاء
  const chatId = inGroup ? from.id : (chat?.id ?? from.id);
  const messageId = inGroup ? undefined : query.message?.message_id;
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
    case "fastest":
      await showFastest(chatId, user, settings, messageId);
      return;
    case "rules":
      if (messageId)
        await editMessage(chatId, messageId, settings.rulesText, keyboard([backRow()]));
      else await sendMessage(chatId, settings.rulesText, keyboard([backRow()]));
      return;
    case "owner":
    case "support": {
      const kb = keyboard([
        [{ text: `💬 مراسلة المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
        backRow(),
      ]);
      if (messageId) await editMessage(chatId, messageId, ownerText(settings), kb);
      else await sendMessage(chatId, ownerText(settings), kb);
      return;
    }
    case "c": {
      const contest = await getContest(arg);
      if (!contest) {
        await sendMessage(chatId, "❓ المسابقة غير موجودة.");
        return;
      }
      if (isGroupMode(contest)) {
        await showFastest(chatId, user, settings, messageId);
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
    case "ginv": {
      const contest = (await getContest(arg)) || (await activeGroupContest());
      if (!contest) {
        await sendMessage(chatId, "🏃 ما فيه مسابقة أسرع ضيف مفعّلة.");
        return;
      }
      await showGroupInvite(chatId, user, contest);
      return;
    }
    case "claim": {
      const contest = await getContest(arg);
      if (contest) await handleClaim(chatId, user, contest.id, settings);
      return;
    }
    case "gstats": {
      const group = linkedGroup(settings);
      if (!group) {
        await sendMessage(chatId, "ما فيه مجموعة مربوطة.");
        return;
      }
      const joins = await recentGroupJoins(group.chatId, 5);
      const text = joins.length
        ? ["📥 <b>آخر المنضمّين</b>"]
            .concat(joins.map((j) => `• ${escapeHtml(j.userName)} ← ${escapeHtml(j.ownerName)}`))
            .join("\n")
        : "📥 لا أحد بعد.";
      if (messageId) await editMessage(chatId, messageId, text, keyboard([backRow("fastest")]));
      else await sendMessage(chatId, text, keyboard([backRow("fastest")]));
      return;
    }
    default:
      await showHome(chatId, user, settings, messageId);
  }
}
