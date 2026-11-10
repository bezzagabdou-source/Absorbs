import { currentOrigin } from "./botSetup";
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
import { aiGenerate, aiStatus, toTelegramHtml } from "./ai";
import { creditPoints, getPointsState, pointsLeaderboard, type PointsState } from "./points";
import {
  balanceOf,
  claimDaily,
  createRequest,
  ensureRewards,
  getJoinGroup,
  getPointsConfig,
  groupEntryLink,
  invitesOf as rewardInvitesOf,
  isBanned,
  rewardLine,
  shopText,
  topBalances,
  type Reward,
} from "./rewards";
import { getSettings, ownerHandle } from "./settings";
import { dayKey } from "./stats";
import { getStore } from "./store";
import {
  answerCallback,
  approveJoinRequest,
  editMessage,
  escapeHtml,
  getBotIdentity,
  clearTrace,
  getTrace,
  sendChatAction,
  sendMessage,
  tgCall,
  type InlineKeyboard,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
  type TgUser,
} from "./telegram";
import { POINTS_MAX, POINTS_STEP } from "./types";
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

/** حالات تيليغرام اللي معناها «مشترك» */
const MEMBER_STATUS = ["creator", "administrator", "member"];
/** أخطاء معناها «البوت ما يقدرش يتحقق» — ما نبلوكيوش المستخدم بسببها */
const SOFT_ERROR = /chat not found|not enough rights|member list is inaccessible|bot is not a member|chat_admin_required|user not found|user_id_invalid|participant_id_invalid/i;

export type ChannelCheck = { chat: string; url: string; status: string };

export function channelUrl(chat: string): string {
  if (!chat) return "";
  if (chat.startsWith("@")) return `https://t.me/${chat.slice(1)}`;
  if (/^https?:\/\//.test(chat)) return chat;
  return "";
}

/** القنوات المطلوبة فعلياً (لا شيء إذا كان الاشتراك غير إجباري) */
export function requiredChannelsOf(settings: Settings): string[] {
  if (!settings.requireJoin) return [];
  const list = (settings.requiredChannels || []).filter(Boolean);
  if (list.length) return list;
  return settings.channelChat ? [settings.channelChat] : [];
}

/**
 * نتحقق من اشتراك المستخدم في كل القنوات.
 * - missing: قنوات ثبت أنو ما مشتركش فيها → نبلوكيو
 * - soft:    قنوات تعذّر التحقق منها (البوت ماشي أدمن...) → ما نبلوكيوش
 */
export async function checkChannels(
  settings: Settings,
  userId: number | string,
): Promise<{ required: string[]; missing: ChannelCheck[]; soft: string[]; ok: boolean }> {
  const required = requiredChannelsOf(settings);
  const missing: ChannelCheck[] = [];
  const soft: string[] = [];
  for (const chat of required) {
    const res = await tgCall<{ status: string }>("getChatMember", { chat_id: chat, user_id: userId });
    // 🛟 أي فشل من تيليغرام = تجاوز القناة (ما نوقفوش البوت على خطأ تحقّق)
    if (!res.ok || !res.result) {
      soft.push(`${chat}: ${res.description || "تعذّر التحقّق"}`);
      continue;
    }
    if (!MEMBER_STATUS.includes(res.result.status)) {
      missing.push({ chat, url: channelUrl(chat), status: res.result.status });
    }
  }
  return { required, missing, soft, ok: missing.length === 0 };
}

function gateText(settings: Settings, missing: ChannelCheck[]): string {
  const lines = [
    "🔒 <b>آخر خطوة قبل ما تستعمل البوت</b>",
    "",
    "خاصك تكون مشترك في هاد القنوات:",
  ];
  missing.forEach((c, i) => {
    const label = c.chat.replace(/^@/, "");
    lines.push(`${i + 1}️⃣ ${c.url ? `<a href="${c.url}">${escapeHtml(label)}</a>` : escapeHtml(c.chat)}`);
  });
  lines.push("", "من بعد ما تشترك في الكل، اضغط <b>✅ تحقّقت — دخلني</b> 👇");
  if (missing.some((c) => !c.url)) {
    lines.push("", "ℹ️ بعض القنوات ما عندهاش رابط عام — المالك خاصو يضيف @username.");
  }
  lines.push("", `👑 المالك: ${ownerHandle(settings)}`);
  return lines.join("\n");
}

function gateKeyboard(missing: ChannelCheck[]): InlineKeyboard {
  const rows: Button[][] = missing
    .filter((c) => c.url)
    .map((c) => [{ text: `📢 اشترك: ${c.chat.replace(/^@/, "")}`, url: c.url }]);
  rows.push([{ text: "✅ تحقّقت — دخلني", callback_data: "joinchk" }]);
  return keyboard(rows);
}

async function sendGate(
  chatId: number | string,
  settings: Settings,
  missing: ChannelCheck[],
  messageId?: number,
) {
  const text = gateText(settings, missing);
  const kb = gateKeyboard(missing);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

/** بوابة قديمة (متوافقة مع الاستدعاءات القديمة) */
async function gateJoin(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  next: Button,
): Promise<boolean> {
  const gate = await checkChannels(settings, user.id);
  if (gate.ok) return true;
  const rows: Button[][] = [
    ...gateKeyboard(gate.missing).inline_keyboard,
    [next],
  ];
  await sendMessage(chatId, gateText(settings, gate.missing), { inline_keyboard: rows });
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
  rows.push([{ text: `⭐️ نقاطي`, callback_data: "points" }]);
  rows.push([{ text: "🎁 متجر الجوائز", callback_data: "shop" }]);
  rows.push([{ text: "🚪 دخول المجموعة", callback_data: "join" }]);
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

/* ───────────────────────────── المساعد الذكي ───────────────────────────── */

const AI_DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 30);

async function aiQuota(userId: string): Promise<{ allowed: boolean; used: number }> {
  try {
    const store = await getStore();
    const used = await store.incr(`ai:used:${dayKey()}:${userId}`);
    return { allowed: used <= AI_DAILY_LIMIT, used };
  } catch {
    return { allowed: true, used: 0 };
  }
}

export async function aiContext(user: BotUser, settings: Settings): Promise<string> {
  const contests = await listContests();
  const rows: string[] = [];
  for (const contest of contests.slice(0, 5)) {
    const mine = await getReferralCount(contest.id, user.id);
    const joined = await participantsCount(contest.id);
    rows.push(
      `- «${contest.title}» (${statusLabel(contest.status)}، ${
        contest.mode === "group" ? "مسابقة مجموعة" : "مسابقة دعوات"
      }) الهدف ${contest.target} دعوة، الجائزة: ${contest.prize || "غير محددة"}، المشاركين ${joined}، دعوات المستخدم ${mine}.`,
    );
  }
  const group = linkedGroup(settings);
  const points = await getPointsState(user.id);
  const channels = requiredChannelsOf(settings);
  return [
    `المستخدم: ${user.firstName || "صديق"} (${user.username ? "@" + user.username : "بلا معرف"}).`,
    `الاشتراك الإجباري: ${channels.length ? `مطلوب الاشتراك في هذه القنوات قبل استعمال البوت: ${channels.join(" ، ")}` : "غير مفروض"}.`,
    `النقاط: ${points.points}/${POINTS_MAX} (${points.invites} جهة محسوبة) — كل ${POINTS_STEP} جهة = نقطة، و${POINTS_MAX} نقاط = جائزة عشوائية من المالك.`,
    `المسابقات: ${rows.length ? rows.join("\n") : "ما فيه مسابقة منشورة."}`,
    `المجموعة: ${group ? "مربوطة ومسابقة أسرع ضيف خدامة" : "ما زالت ما مربوطة"} (الهدف ${settings.groupTarget} ضيف).`,
    `المالك: ${ownerHandle(settings)}.`,
    `القواعد: ${settings.rulesText.replace(/\s+/g, " ").slice(0, 400)}`,
  ].join("\n");
}

export function aiSystemPrompt(): string {
  return [
    "أنت مساعد بوت تيليغرام ديال مسابقات «FT» (جمع دعوات + مسابقة أسرع ضيف في المجموعة).",
    "جاوب بالعربية أو الدارجة، بلهجة ودودة وقصيرة: من 2 حتى 5 أسطر، وبلا ماركداون معقد.",
    "استعمل غير المعلومات اللي في السياق؛ إلا ما عرفتيش، قول للمستخدم يراسل المالك.",
    "عمرك ما تعطي كلمات سر ولا حسابات ولا معطيات مستخدمين آخرين؛ بيانات الفائزين كتوصل غير للمالك.",
    "ما تديرش وعود بالجائزة، وما تطلبش معلومات شخصية ولا فلوس.",
  ].join(" ");
}

/** جواب ذكي على سؤال المستخدم */
export async function aiAnswer(
  user: BotUser,
  question: string,
  settings: Settings,
  model?: string,
): Promise<{ ok: boolean; text: string; error: string }> {
  if (!settings.aiEnabled || process.env.AI_ENABLED === "0") {
    return { ok: false, text: "", error: "المساعد الذكي مطفي" };
  }
  const context = await aiContext(user, settings);
  const res = await aiGenerate({
    system: aiSystemPrompt(),
    prompt: `سياق البوت:\n${context}\n\nسؤال المستخدم: ${question}`,
    maxTokens: 500,
    temperature: 0.5,
    model: model || settings.aiModel || undefined,
  });
  return { ok: res.ok, text: res.text, error: res.error };
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
  if (messageId) {
    await editMessage(chatId, messageId, text, kb);
    return;
  }
  // صورة المسابقة تظهر في رسالة جديدة (تيليغرام يحتاج رابطاً عاماً)
  if (contest.imageUrl) {
    const origin = await currentOrigin().catch(() => "");
    const photo = origin
      ? `${origin}/api/contests/${contest.id}/image`
      : contest.imageUrl.startsWith("http")
        ? contest.imageUrl
        : "";
    if (photo) {
      const sent = await tgCall("sendPhoto", {
        chat_id: chatId,
        photo,
        caption: text.slice(0, 1000),
        parse_mode: "HTML",
        reply_markup: kb,
      });
      if (sent.ok) return;
    }
  }
  await sendMessage(chatId, text, kb);
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

/* ───────────────────────────── النقاط ───────────────────────────── */

function pointsLine(state: PointsState): string {
  if (state.reachedMax) {
    return `⭐️ النقاط: <b>${state.points}/${POINTS_MAX}</b> — كاملة 🎉`;
  }
  return `⭐️ النقاط: <b>${state.points}/${POINTS_MAX}</b> — باقي <b>${state.toNext}</b> جهة للنقطة ${state.nextPoint}`;
}

function pointsProgress(state: PointsState): string {
  if (state.reachedMax) return "🟩🟩🟩";
  const filled = state.points;
  return `${"🟩".repeat(filled)}${"⬜️".repeat(Math.max(0, POINTS_MAX - filled))}`;
}

export async function notifyPointsMilestone(user: BotUser, settings: Settings, state: PointsState, milestone: number) {
  const owner = ownerHandle(settings);
  const maxed = milestone >= POINTS_MAX;
  const text = maxed
    ? [
        `🎉 <b>مبروك ${nameOf(user)}!</b>`,
        "",
        `وصلت <b>${state.points}/${POINTS_MAX}</b> نقاط (كل ${POINTS_STEP} جهة = نقطة).`,
        `🎁 تواصل مع المالك ${owner} باش تستلم <b>جائزة عشوائية</b>.`,
      ].join("\n")
    : [
        `⭐️ <b>نقطة جديدة!</b> ${nameOf(user)}`,
        "",
        `وصلت <b>${milestone}/${POINTS_MAX}</b> نقطة — كل ${POINTS_STEP} جهة = نقطة.`,
        `باقي <b>${state.toNext}</b> جهة وتكمل ${POINTS_MAX} نقاط وتاخد جائزة عشوائية من المالك.`,
      ].join("\n");
  await sendMessage(
    user.id,
    text,
    keyboard([
      [{ text: `💬 تواصل مع المالك ${owner}`, url: ownerUrl(settings) }],
      [{ text: "🏁 المسابقات", callback_data: "home" }],
    ]),
  );
  await notifyAdmins(
    `⭐️ <b>${nameOf(user)}</b> (@${escapeHtml(user.username || "—")}) وصل ${milestone} نقطة — ${state.invites} جهة.${
      maxed ? "\n🎁 جاهز لاستلام جائزة عشوائية." : ""
    }`,
  );
}

/** نزيد نقطة لصاحب الجهة بعد انضمام عضو للمجموعة (واحد فقط لكل انضمام) */
async function creditPointsForOwner(ownerId: string) {
  try {
    const user = await getUser(ownerId);
    if (!user) return;
    const settings = await getSettings();
    // 💰 نقاط المتجر: كل عضو جديد يدخل من رابطك = نقاط في الرصيد
    try {
      const { creditInvite } = await import("./rewards");
      await creditInvite(ownerId);
    } catch (error) {
      console.error("[rewards] credit failed", error);
    }
    const result = await creditPoints(ownerId);
    if (result.milestone) await notifyPointsMilestone(user, settings, result.state, result.milestone);
  } catch (error) {
    console.error("[points] credit failed", error);
  }
}

async function showPoints(
  chatId: number | string,
  user: BotUser,
  settings: Settings,
  messageId?: number,
) {
  const state = await getPointsState(user.id);
  const top = await pointsLeaderboard(5);
  const names = await Promise.all(top.map((row) => getUser(row.userId)));
  const medals = ["🥇", "🥈", "🥉", "▫️", "▫️"];
  const lines = [
    `⭐️ <b>نقاط ${nameOf(user)}</b>`,
    "",
    pointsLine(state),
    pointsProgress(state),
    `📥 مجموع جهاتك: <b>${state.invites}</b>`,
    "",
    `<b>رصيد المتجر:</b> <b>${await balanceOf(String(user.id))}</b> نقطة 🎁`,
    "",
    `<b>كيفاش تخدم:</b> كل عضو يجي من رابطك للمجموعة = نقاط في رصيدك.`,
    `من توصل <b>${POINTS_MAX}</b> نقاط → تواصل مع المالك ${ownerHandle(settings)} لاستلام <b>جائزة عشوائية</b> 🎁`,
  ];
  if (state.reachedMax) {
    lines.push("", "✅ وصلت الحد الأقصى — المالك عندو علم ونستناك.");
  } else {
    lines.push("", `📈 باقي <b>${state.toNext}</b> جهة للنقطة ${state.nextPoint}.`);
  }
  if (top.length) {
    lines.push("", "<b>🥇 أحسن المشاركين في النقاط</b>");
    top.forEach((row, i) => {
      const name = names[i] ? escapeHtml(names[i]!.firstName) : row.userId;
      lines.push(`${medals[i] || "▫️"} ${name} — <b>${row.points}</b> نقطة (${row.invites} جهة)`);
    });
  }
  const kb = keyboard([
    [{ text: "🎁 متجر الجوائز", callback_data: "shop" }],
    [{ text: "🚪 رابط الدخول للمجموعة", callback_data: "join" }],
    [{ text: `💬 مراسلة المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
    [{ text: "🏃 اجمع جهات", callback_data: "fastest" }],
    backRow(),
  ]);
  if (messageId) await editMessage(chatId, messageId, lines.join("\n"), kb);
  else await sendMessage(chatId, lines.join("\n"), kb);
}

function isAdminUser(settings: Settings, userId: string | number): boolean {
  const id = String(userId);
  return (
    settings.adminIds.map(String).includes(id) ||
    (Boolean(settings.ownerUsername) && /^\d+$/.test(settings.ownerUsername) && settings.ownerUsername === id)
  );
}

/* ───────────────────────────── متجر الجوائز ───────────────────────────── */

async function shopKeyboard(rewards: Reward[]): Promise<InlineKeyboard> {
  // 🎁 الأزرار كيما في النسخة لي كانت: كل جائزة زر، واللي ما تتوفرش تتكتب «غير متوفر الآن»
  const rows: Button[][] = [];
  const active = rewards.filter((r) => r.active).sort((a, b) => a.order - b.order);
  for (const r of active) {
    const soldOut = r.stock !== null && r.stock <= 0;
    const label = soldOut
      ? `${r.emoji} ${r.title} ( غير متوفر الآن ) — ${r.cost} نقطة`
      : `${r.emoji} ${r.title} ( متوفر ) — ${r.cost} نقطة`;
    rows.push([{ text: label, callback_data: `buy:${r.id}` }]);
  }
  rows.push([{ text: "⬅️ القائمة الرئيسية BACK", callback_data: "home" }]);
  return keyboard(rows);
}

async function showShop(chatId: number | string, user: BotUser, messageId?: number) {
  const cfg = await getPointsConfig();
  const rewards = await ensureRewards();
  const balance = await balanceOf(String(user.id));
  const text = shopText(balance, cfg, rewards);
  const kb = await shopKeyboard(rewards);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function showReward(chatId: number | string, user: BotUser, rewardId: string, messageId?: number) {
  const rewards = await ensureRewards();
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) {
    await showShop(chatId, user, messageId);
    return;
  }
  const balance = await balanceOf(String(user.id));
  const enough = balance >= reward.cost;
  const soldOut = reward.stock !== null && reward.stock <= 0;
  const kb = keyboard([
    enough && !soldOut
      ? [{ text: `✅ استبدل بـ ${reward.cost} نقطة`, callback_data: `confirm:${reward.id}` }]
      : [{ text: soldOut ? "❌ نفدت الكمية" : `🔒 باقي ${reward.cost - balance} نقطة`, callback_data: "shop" }],
    [{ text: "⬅️ رجوع للمتجر", callback_data: "shop" }],
  ]);
  const text = [rewardLine(reward, balance), "", `💰 رصيدك: <b>${balance}</b> نقطة`].join("\n");
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function buyReward(chatId: number | string, user: BotUser, rewardId: string, messageId?: number, settings?: Settings) {
  const rewards = await ensureRewards();
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) return showShop(chatId, user, messageId);
  const res = await createRequest({
    userId: String(user.id),
    userName: user.firstName || "",
    username: user.username || "",
    reward,
  });
  if (!res.ok || !res.request) {
    const text = `❌ ${res.error || "ما قدرناش نكملو الطلب"}\n💰 رصيدك: <b>${res.balance}</b> نقطة`;
    const kb = keyboard([[{ text: "🎁 المتجر", callback_data: "shop" }], backRow()]);
    if (messageId) await editMessage(chatId, messageId, text, kb);
    else await sendMessage(chatId, text, kb);
    return;
  }
  const cfg = await getPointsConfig();
  const text = [
    "✅ <b>تم تسجيل طلبك!</b>",
    "",
    `${reward.emoji} <b>${reward.title}</b> — ${reward.cost} نقطة`,
    `💰 رصيدك الجديد: <b>${res.balance}</b> نقطة`,
    "",
    "⏳ المالك راح يراجع الطلب ويسلّمك الجائزة. عادةً في أقرب وقت.",
  ].join("\n");
  const kb = keyboard([
    [{ text: "🎁 المتجر", callback_data: "shop" }],
    [{ text: `💬 مراسلة المالك`, url: ownerUrl(settings || (await getSettings())) }],
    backRow(),
  ]);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);

  // إشعار المالك + الأدمنية
  const owner = settings || (await getSettings());
  const note = [
    "🔔 <b>طلب جائزة جديد</b>",
    "",
    `👤 ${escapeHtml(user.firstName || "")}${user.username ? ` (@${escapeHtml(user.username)})` : ""}`,
    `🆔 <code>${user.id}</code>`,
    `${reward.emoji} ${escapeHtml(reward.title)} — ${reward.cost} نقطة`,
    `#${res.request.id}`,
  ].join("\n");
  const notifyKb = keyboard([
    [
      { text: "✅ تسليم", callback_data: `rqok:${res.request.id}` },
      { text: "↩️ رفض وإرجاع النقاط", callback_data: `rqno:${res.request.id}` },
    ],
  ]);
  const ids = [
    ...new Set(
      [...(owner.adminIds || []), owner.ownerUsername]
        .map((x) => String(x || "").trim().replace(/^@/, ""))
        .filter((x) => /^\d+$/.test(x)),
    ),
  ];
  for (const id of ids) await sendMessage(id, note, notifyKb);
}

async function showJoin(chatId: number | string, user: BotUser, messageId?: number) {
  const target = await getJoinGroup();
  if (!target) {
    const text = "🚪 ما زال ما تربطتش مجموعة بالبوت. المالك يقدر يربطها من اللوحة.";
    if (messageId) await editMessage(chatId, messageId, text, keyboard([backRow()]));
    else await sendMessage(chatId, text, keyboard([backRow()]));
    return;
  }
  const entry = await groupEntryLink(String(user.id), { title: target.title });
  const text = [
    `🚪 <b>${escapeHtml(target.title)}</b>`,
    "",
    "ادخل للمجموعة باش تشارك في المسابقات وتجمع النقاط:",
    "• كل عضو يجي من رابطك = <b>نقاط</b> في رصيدك",
    "• النقاط تتبدل بجوائز من المتجر 🎁",
  ].join("\n");
  const rows: Button[][] = [];
  if (entry.url) rows.push([{ text: "🚪 دخل للمجموعة", url: entry.url }]);
  else rows.push([{ text: "⚠️ الرابط ماشي متوفر", callback_data: "join" }]);
  rows.push([{ text: "🎁 متجر الجوائز", callback_data: "shop" }]);
  rows.push(backRow());
  if (messageId) await editMessage(chatId, messageId, text, keyboard(rows));
  else await sendMessage(chatId, text, keyboard(rows));
}

async function doDaily(chatId: number | string, user: BotUser, messageId?: number) {
  const res = await claimDaily(String(user.id));
  const text = res.ok
    ? `🎁 <b>هدية اليوم!</b>\n\n+${res.gained} نقطة\n💰 رصيدك: <b>${res.balance}</b> نقطة`
    : `🎁 هدية اليوم خديتها من قبل ✅\n💰 رصيدك: <b>${res.balance}</b> نقطة\n\nارجع غدوة 🕛`;
  const kb = keyboard([
    [{ text: "🎁 المتجر", callback_data: "shop" }],
    [ { text: "⭐️ نقاطي", callback_data: "points" }],
    backRow(),
  ]);
  if (messageId) await editMessage(chatId, messageId, text, kb);
  else await sendMessage(chatId, text, kb);
}

async function decideRewardRequest(
  chatId: number | string,
  adminId: string,
  requestId: string,
  approve: boolean,
  messageId?: number,
) {
  const settings = await getSettings();
  if (!isAdminUser(settings, adminId)) {
    await sendMessage(chatId, "⛔️ هذا الأمر للمالك فقط.");
    return;
  }
  const { decideRequest } = await import("./rewards");
  const req = await decideRequest(requestId, approve ? "approved" : "rejected");
  if (!req) {
    await sendMessage(chatId, "⚠️ الطلب ماشي موجود.");
    return;
  }
  const text = approve
    ? `✅ تم تسليم: ${req.emoji} <b>${escapeHtml(req.rewardTitle)}</b>\n👤 <code>${req.userId}</code>`
    : `↩️ تم رفض الطلب وإرجاع <b>${req.cost}</b> نقطة لـ <code>${req.userId}</code>`;
  if (messageId) await editMessage(chatId, messageId, text);
  else await sendMessage(chatId, text);

  const userMsg = approve
    ? `🎉 <b>مبروك!</b>\n\n${req.emoji} <b>${escapeHtml(req.rewardTitle)}</b> تمت الموافقة عليها.\nالمالك راح يتواصل معك للتسليم.`
    : `😕 الطلب تاعك على ${req.emoji} <b>${escapeHtml(req.rewardTitle)}</b> ما تمّش.\nتم إرجاع <b>${req.cost}</b> نقطة لرصيدك.`;
  await sendMessage(req.userId, userMsg);
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

  const points = await getPointsState(user.id);
  const parts: string[] = [`👤 <b>${nameOf(user)}</b>`, "", pointsLine(points), pointsProgress(points)];
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
  buttons.unshift([{ text: "⭐️ نقاطي", callback_data: "points" }]);
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

  // 🧾 سجل الإحالات: شكون دخل + شكون صيفط الرابط (يظهر في اللوحة /admin/referrals)
  try {
    await store.listPush(
      "referrals:log",
      [
        JSON.stringify({
          at: Date.now(),
          contestId: contest.id,
          contestTitle: contest.title,
          inviterId,
          inviterName: inviterExists.firstName,
          inviterUsername: inviterExists.username || "",
          joinerId: newUser.id,
          joinerName: newUser.firstName,
          joinerUsername: newUser.username || "",
          counted: true,
        }),
      ],
    );
  } catch {
    /* السجل ما يعطّلش */
  }

  const added = await store.sAdd(`contest:${contest.id}:credited`, newUser.id);
  if (!added) return { counted: false, count: await getReferralCount(contest.id, inviterId) };

  const count = await store.zIncr(`contest:${contest.id}:score`, inviterId, 1);
  await notifyOwnerOfReferral(contest, inviterExists, count, newUser.firstName);
  const settings = await getSettings();
  const points = await creditPoints(inviterId);
  if (points.milestone) {
    try {
      await notifyPointsMilestone(inviterExists, settings, points.state, points.milestone);
    } catch (error) {
      console.error("[points] milestone failed", error);
    }
  }
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

/** يربط المجموعة تلقائياً عند أي نشاط داخلها (حتى لو ضاع التخزين) */
async function ensureLinkedFromActivity(chat: TgMessage["chat"]): Promise<void> {
  if (!groupType(chat)) return;
  const settings = await getSettings();
  if (settings.groupChat) return;
  await linkGroup({ id: chat.id, title: chat.title, username: chat.username });
  await ensureGroupContest((await getSettings()).groupTarget);
}

async function handleJoinRequest(
  request: NonNullable<TgUpdate["chat_join_request"]>,
): Promise<void> {
  const { chat, from } = request;
  if (!groupType(chat) || !from || from.is_bot) return;
  await ensureLinkedFromActivity(chat);
  const settings = await getSettings();
  const link = request.invite_link?.invite_link || "";

  const result = await creditGroupJoin({
    chatId: String(chat.id),
    joiner: { id: from.id, firstName: from.first_name, username: from.username, isBot: from.is_bot },
    inviteLink: link,
    inviteName: request.invite_link?.name,
  });

  if (settings.autoApproveJoins) {
    const approved = await approveJoinRequest(chat.id, from.id);
    if (!approved.ok) console.error("[group] approve failed", approved.description);
  }

  if (!result.counted || !result.contest) return;

  const owner = await getUser(result.ownerId);
  if (owner) {
    await notifyOwnerOfReferral(result.contest, owner, result.count, from.first_name || "عضو");
    await creditPointsForOwner(result.ownerId);
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
  const adder = message.from;
  await ensureLinkedFromActivity(chat);

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
      await creditPointsForOwner(credit.ownerId);
    }
    await sendMessage(
      chat.id,
      `➕ جهة جديدة لـ ${escapeHtml(owner?.firstName || "مشارك")} — ${credit.count}/${credit.contest.target}`,
    );
  }

}

/* ───────────────────────────── entry points ───────────────────────────── */

/**
 * 🩺 تشخيص: ينفّذ نفس مسار handleUpdate بلا إرسال حقيقي، ويرجّع كل شي كان راح يتبعث
 * + أي خطأ داخلي. المدار من /api/panel/rewards?op=simulate (لوحة FT AI).
 */
export async function simulateUpdate(update: TgUpdate): Promise<{
  ok: boolean;
  wouldSend: { method: string; text?: string; chatId?: unknown; buttons?: string[] }[];
  error: string | null;
}> {
  const prevTrace = process.env.TG_TRACE;
  const prevDry = process.env.TG_DRY_RUN;
  process.env.TG_TRACE = "1";
  // قراءة حقيقية من تيليغرام (بوابة الاشتراك تُقيَّم بواقعية) + كتابة متسجّلة بلا إرسال
  process.env.TG_DRY_RUN = "1";
  clearTrace();
  let error: string | null = null;
  try {
    await handleUpdate(update);
  } catch (e) {
    error = String((e as Error)?.stack || (e as Error)?.message || e);
  } finally {
    if (prevTrace === undefined) delete process.env.TG_TRACE;
    else process.env.TG_TRACE = prevTrace;
    if (prevDry === undefined) delete process.env.TG_DRY_RUN;
    else process.env.TG_DRY_RUN = prevDry;
  }
  const trace = getTrace().reverse();
  const wouldSend = trace
    .filter((t) => ["sendMessage", "sendPhoto", "sendSticker", "editMessageText"].includes(t.method))
    .map((t) => {
      const kb = (t.payload.reply_markup as { inline_keyboard?: { text: string }[][] } | undefined)?.inline_keyboard;
      return {
        method: t.method,
        chatId: t.payload.chat_id,
        text: String(t.payload.text || "").slice(0, 600),
        buttons: kb ? kb.map((row) => row.map((b) => b.text).join(" | ")) : [],
      };
    });
  clearTrace();
  return { ok: !error && wouldSend.length > 0, wouldSend, error };
}

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
  try {
    await handleMessageInner(message);
  } catch (error) {
    console.error("[bot] handleMessage failed", error);
    // ما نخليوهش يسكت: نقولو للمستخدم وقع خطأ ويمرّ للمالك
    try {
      const settings = await getSettings();
      await sendMessage(
        message.chat.id,
        "⚠️ وقع خطأ غير متوقّع. عاود المحاولة، وإلا كلّم المالك " + ownerHandle(settings),
        keyboard([[{ text: "🏠 الرئيسية", callback_data: "home" }]]),
      );
    } catch {
      /* حتى الإرسال فشل — نسجّلو فقط */
    }
  }
}

/** 🛡️ حماية من الرشق: حد أقصى للرسائل ف الدقيقة لكل مستخدم */
const FLOOD_LIMIT = 20;
const FLOOD_WINDOW = 60_000;
const floodGlobal = globalThis as unknown as { __ftFlood?: Map<string, number[]> };

function floodBlocked(userId: string): boolean {
  floodGlobal.__ftFlood ||= new Map();
  const now = Date.now();
  const hits = (floodGlobal.__ftFlood.get(userId) || []).filter((t) => now - t < FLOOD_WINDOW);
  hits.push(now);
  floodGlobal.__ftFlood.set(userId, hits);
  if (floodGlobal.__ftFlood.size > 5000) floodGlobal.__ftFlood.clear();
  return hits.length > FLOOD_LIMIT;
}

async function handleMessageInner(message: TgMessage) {
  const from = message.from;
  if (!from || from.is_bot) return;
  const chat = message.chat;
  const chatId = chat.id;

  // 🚫 محظور: ما نجاوبوهش نهائياً ف الخاص
  if (!groupType(chat) && (await isBanned(String(from.id)))) {
    console.warn("[ban] blocked user", from.id);
    return;
  }

  // 🛡️ الرشق: إلا تجاوز الحد، نسكتو عليه (بلا إرسال) ونكملو
  if (!groupType(chat) && floodBlocked(String(from.id))) {
    console.warn("[flood] rate limited", from.id);
    return;
  }
  const inGroup = groupType(chat);
  const user = await touchUser(from);
  if (inGroup) await ensureLinkedFromActivity(chat);
  const settings = await getSettings();
  const text = message.text!.trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const payload = (args[0] || "").trim();

  const known = [
    "/start",
    "/points",
    "/shop",
    "/rewards",
    "/store",
    "/daily",
    "/gift",
    "/join",
    "/score",
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
    "/ai",
    "/ask",
  ];
  if (inGroup && !known.includes(command)) return;

  // 🔒 بوابة الاشتراك الإجباري (الخاص فقط — المجموعة ما كنبوكيوهاش)
  if (!inGroup) {
    const gate = await checkChannels(settings, user.id);
    if (!gate.ok) {
      // نحسبو الإحالة قبل البلوك باش ما يضيعش حق صاحب الرابط
      if (command === "/start" && payload.startsWith("r_")) {
        const [, contestId, inviterId] = payload.split("_");
        const contest = await getContest(contestId);
        if (contest && inviterId) await creditReferral(contest, inviterId, user);
      }
      await sendGate(chatId, settings, gate.missing);
      return;
    }
  }

  if (command === "/points" || command === "/score") {
    await showPoints(chatId, user, settings);
    return;
  }

  if (command === "/shop" || command === "/rewards" || command === "/store") {
    await showShop(chatId, user);
    return;
  }
  if (command === "/daily" || command === "/gift") {
    await doDaily(chatId, user);
    return;
  }
  if (command === "/join") {
    await showJoin(chatId, user);
    return;
  }

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

  if (command === "/ai" || command === "/ask") {
    const question = text.slice(rawCommand.length).trim();
    if (inGroup) {
      await sendMessage(chatId, "🤖 المساعد الذكي كيخدم غير في الخاص. صيفطلي رسالة هنا 👉 " + ownerUrl(settings));
      return;
    }
    if (!question) {
      await sendMessage(
        chatId,
        "🤖 المساعد الذكي\n\nكتب لي سؤالك مباشرة (بلا أوامر) وأنا نجاوبك: على المسابقات، الجوائز، كيفاش تجمع الدعوات، وشنو تدير إلا ما وصلكش الحساب.",
        keyboard([[{ text: "🏁 المسابقات", callback_data: "home" }], backRow()]),
      );
      return;
    }
    await answerWithAi(chatId, user, question, settings);
    return;
  }

  if (!inGroup && !command.startsWith("/") && aiStatus().available) {
    await answerWithAi(chatId, user, text, settings);
    return;
  }

  await showHome(chatId, user, settings);
}

async function answerWithAi(chatId: number | string, user: BotUser, question: string, settings: Settings) {
  const quota = await aiQuota(user.id);
  if (!quota.allowed) {
    await sendMessage(
      chatId,
      `⏳ وصلتي للحد اليومي ديال المساعد الذكي (${AI_DAILY_LIMIT} رسالة).\nتقدر تراسل المالك: ${ownerHandle(settings)}`,
      keyboard([[{ text: "💬 مراسلة المالك", url: ownerUrl(settings) }], backRow()]),
    );
    return;
  }
  await sendChatAction(chatId, "typing");
  const res = await aiAnswer(user, question, settings);
  if (!res.ok) {
    await showHome(chatId, user, settings);
    return;
  }
  await sendMessage(
    chatId,
    `🤖 ${toTelegramHtml(res.text.slice(0, 3500))}`,
    keyboard([
      [{ text: "🏁 المسابقات", callback_data: "home" }],
      [{ text: `💬 مراسلة المالك ${ownerHandle(settings)}`, url: ownerUrl(settings) }],
    ]),
  );
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

  if (action === "joinchk") {
    const gate = await checkChannels(settings, user.id);
    if (!gate.ok) {
      await sendGate(chatId, settings, gate.missing, messageId);
      return;
    }
    await sendMessage(chatId, "✅ <b>تم التحقّق!</b> مرحبا بيك، تقدر تبدا دابا 👇");
    await showHome(chatId, user, settings);
    return;
  }

  // 🔒 نفس بوابة الاشتراك على الأزرار
  if (!inGroup) {
    const gate = await checkChannels(settings, user.id);
    if (!gate.ok) {
      await sendGate(chatId, settings, gate.missing, messageId);
      return;
    }
  }

  switch (action) {
    case "shop":
      await showShop(chatId, user, messageId);
      return;
    case "buy":
      await showReward(chatId, user, arg || "", messageId);
      return;
    case "confirm":
      await buyReward(chatId, user, arg || "", messageId, settings);
      return;
    case "join":
      await showJoin(chatId, user, messageId);
      return;
    case "daily":
      await doDaily(chatId, user, messageId);
      return;
    case "rqok":
      await decideRewardRequest(chatId, String(user.id), arg || "", true, messageId);
      return;
    case "rqno":
      await decideRewardRequest(chatId, String(user.id), arg || "", false, messageId);
      return;
    case "points":
      await showPoints(chatId, user, settings, messageId);
      return;
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
