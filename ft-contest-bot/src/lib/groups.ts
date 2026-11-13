import crypto from "node:crypto";
import { createContest, getContest, listContests } from "./contests";
import { getSettings, saveSettings } from "./settings";
import { getStore } from "./store";
import { createChatInviteLink, getChatInfo } from "./telegram";
import type { BotUser, Contest, Settings } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   نظام «أسرع ضيف»: ربط البوت بمجموعة + رابط دعوة خاص لكل مشارك
   كل عضو يدخل المجموعة من رابطك = ضيف واحدة في رصيدك تلقائياً.
   ══════════════════════════════════════════════════════════════════════════ */

export type LinkedGroup = {
  chatId: string;
  title: string;
  url: string;
  isGroup: boolean;
};

export type GroupInvite = {
  link: string;
  chatId: string;
  userId: string;
  contestId: string;
  createdAt: number;
  joins: number;
};

export type GroupJoinEvent = {
  at: number;
  chatId: string;
  userId: string;
  userName: string;
  ownerId: string;
  ownerName: string;
  contestId: string;
  via: "link" | "add";
};

const JOIN_CAP = 500;
const LOG_KEY = (chatId: string) => `group:${chatId}:log`;
const JOINED_KEY = (chatId: string) => `group:${chatId}:joined`;
const inviteKey = (chatId: string, userId: string, contestId: string) =>
  `ginv:${chatId}:${userId}:${contestId}`;
const linkIndexKey = (link: string) =>
  `glink:${crypto.createHash("sha1").update(String(link).trim()).digest("hex").slice(0, 24)}`;

/** 🧹 ينحي ?query / شرطات باش نلقاو الرابط ولو تبدّل شوية */
export function normalizeInviteLink(link: string): string {
  return String(link || "")
    .trim()
    .split("?")[0]
    .replace(/\/+$/, "");
}

export function groupType(chat: { type?: string }): boolean {
  return chat.type === "group" || chat.type === "supergroup";
}

/** المجموعة المربوطة حالياً (من الإعدادات) */
export function linkedGroup(settings: Settings): LinkedGroup | null {
  if (!settings.groupChat) return null;
  return {
    chatId: settings.groupChat,
    title: settings.groupTitle || "المجموعة",
    url: settings.groupUrl,
    isGroup: true,
  };
}

export function ownerUrl(settings: Settings): string {
  return `https://t.me/${(settings.ownerUsername || "F_Y_Y_T").replace(/^@/, "")}`;
}

/** ربط المجموعة بالبوت (يحدث تلقائياً عند إضافة البوت للمجموعة) */
export async function linkGroup(
  chat: { id: number | string; title?: string; username?: string },
  settingsFromGroupTarget?: number,
): Promise<Settings> {
  const url = chat.username ? `https://t.me/${chat.username}` : "";
  const current = await getSettings();
  const wasSame = current.groupChat === String(chat.id);
  const next = await saveSettings({
    groupChat: String(chat.id),
    groupTitle: chat.title || current.groupTitle || "المجموعة",
    groupUrl: url || (wasSame ? current.groupUrl : ""),
  });
  if (typeof settingsFromGroupTarget === "number" && settingsFromGroupTarget > 0) {
    await saveSettings({ groupTarget: settingsFromGroupTarget });
  }
  return next;
}

export async function unlinkGroup(chatId?: string | number): Promise<void> {
  const settings = await getSettings();
  if (chatId !== undefined && settings.groupChat !== String(chatId)) return;
  await saveSettings({ groupChat: "", groupTitle: "", groupUrl: "" });
}

/** يحدّث اسم/رابط المجموعة من تيليغرام */
export async function syncGroupInfo(): Promise<{ ok: boolean; title: string; error: string }> {
  const settings = await getSettings();
  if (!settings.groupChat) return { ok: false, title: "", error: "لا توجد مجموعة مربوطة" };
  const res = await getChatInfo(settings.groupChat);
  if (!res.ok || !res.result) {
    return { ok: false, title: settings.groupTitle, error: res.description || "تعذّر قراءة المجموعة" };
  }
  const url = res.result.username ? `https://t.me/${res.result.username}` : settings.groupUrl;
  await saveSettings({ groupTitle: res.result.title || settings.groupTitle, groupUrl: url });
  return { ok: true, title: res.result.title || settings.groupTitle, error: "" };
}

/** مسابقة أسرع ضيف المفتوحة حالياً */
export async function activeGroupContest(): Promise<Contest | null> {
  const contests = await listContests();
  return contests.find((c) => c.mode === "group" && c.status === "active") || null;
}

/** ينشئ مسابقة أسرع ضيف تلقائياً عند ربط مجموعة (إن لم تكن موجودة) */
export async function ensureGroupContest(target?: number): Promise<Contest> {
  const existing = await activeGroupContest();
  if (existing) return existing;
  const settings = await getSettings();
  return createContest({
    title: "🏃 مسابقة أسرع ضيف",
    description: "أضف أعضاء للمجموعة من رابطك الخاص — أول من يوصل الهدف يربح الحساب.",
    target: Math.max(1, Math.floor(target || settings.groupTarget || 20)),
    prize: "حساب FT كامل — إيميل + كلمة سر",
    winners: 1,
    status: "active",
    mode: "group",
  });
}

/** رابط دعوة خاص بالمشارك (كل عضو يدخل منه يُحسب له) */
export async function personalGroupInvite(
  user: BotUser,
  contest: Contest,
  force = false,
): Promise<GroupInvite | null> {
  const settings = await getSettings();
  if (!settings.groupChat) return null;
  const store = getStore();
  const key = inviteKey(settings.groupChat, user.id, contest.id);
  if (!force) {
    const saved = await store.get<GroupInvite>(key);
    if (saved?.link) return saved;
  }

  // الاسم يحمل صاحب الرابط + المسابقة حتى نعرف صاحبه حتى لو ضاع التخزين
  const created = await createChatInviteLink(settings.groupChat, `FT-${user.id}-${contest.id}`);
  if (!created) return null;

  const invite: GroupInvite = {
    link: created.invite_link,
    chatId: settings.groupChat,
    userId: user.id,
    contestId: contest.id,
    createdAt: Date.now(),
    joins: 0,
  };
  await store.set(key, invite);
  await store.set(linkIndexKey(invite.link), {
    chatId: invite.chatId,
    userId: invite.userId,
    contestId: invite.contestId,
  });
  return invite;
}

/** يستخرج صاحب الرابط من اسم الدعوة (خطة احتياطية إذا ضاع التخزين) */
export function resolveInviteName(
  name?: string,
): { userId: string; contestId: string } | null {
  if (!name) return null;
  const match = /^FT-(\d+)-(\S+)$/.exec(name.trim());
  if (!match) return null;
  return { userId: match[1], contestId: match[2] };
}

/**
 * 🛟 آخر حل: نستنبطو الاسم من الرابط نفسه.
 * تيليجرام كيرجّع hash عشوائي (ما فيهش الاسم)، ولكن إلا كان اسم مخصّص كيبان؛
 * لهذا كنسجّلو الفهرس من الأول (وقت الإنشاء) وهذا غير احتياط.
 */
export function inferInviteNameFromLink(link?: string): string {
  if (!link) return "";
  const match = /FT-(\d+)-([A-Za-z0-9]+)/.exec(link);
  return match ? match[0] : "";
}

/** يعرف صاحب الرابط من نص رابط الدعوة */
export async function resolveInviteLink(
  link: string,
): Promise<{ chatId: string; userId: string; contestId: string } | null> {
  if (!link) return null;
  const store = getStore();
  const exact = await store.get<{ chatId: string; userId: string; contestId: string }>(linkIndexKey(link));
  if (exact) return exact;
  const norm = await store.get<{ chatId: string; userId: string; contestId: string }>(
    linkIndexKey(normalizeInviteLink(link)),
  );
  return norm || null;
}

async function findInviteRecord(chatId: string, userId: string, contestId: string) {
  return getStore().get<GroupInvite>(inviteKey(chatId, userId, contestId));
}

export type CreditResult = {
  counted: boolean;
  reason: string;
  count: number;
  contest: Contest | null;
  ownerId: string;
};

/**
 * يحتسب عضو جديد في مجموعة لصاحب رابط الدعوة.
 * - via=link: العضو دخل من رابط دعوة خاص (نعرف صاحبه من الويب هوك)
 * - via=add:  أحد أضاف العضو يدوياً للمجموعة (نأخذ المضيف من الرسالة)
 */
export async function creditGroupJoin(input: {
  chatId: string;
  joiner: { id: number | string; firstName?: string; username?: string; isBot?: boolean };
  inviteLink?: string;
  inviteName?: string;
  adderId?: string;
  adderName?: string;
}): Promise<CreditResult> {
  const store = getStore();
  const joinerId = String(input.joiner.id);
  const empty: CreditResult = { counted: false, reason: "skip", count: 0, contest: null, ownerId: "" };
  if (input.joiner.isBot) return empty;

  let ownerId = "";
  let contest: Contest | null = null;

  const fromLink = input.inviteLink ? await resolveInviteLink(input.inviteLink) : null;
  // 🛟 حتى إلا ما لقيناش الرابط في الفهرس، الاسم FT-<userId>-<contestId> كافي
  const fromName = resolveInviteName(input.inviteName) || resolveInviteName(inferInviteNameFromLink(input.inviteLink));
  if (fromLink && fromLink.chatId === input.chatId) {
    ownerId = fromLink.userId;
    contest = await getContest(fromLink.contestId);
  } else if (fromName) {
    ownerId = fromName.userId;
    contest = await getContest(fromName.contestId);
  } else if (input.adderId) {
    ownerId = input.adderId;
  }

  if (!ownerId || ownerId === joinerId) {
    // 🧾 نسجّلو المحاولة باش التشخيص يشوف «شكون دخل برابط عادي»
    try {
      const { logJoinAttempt } = await import("./referralsDiag");
      await logJoinAttempt({
        at: Date.now(),
        chatId: String(input.chatId),
        joinerId,
        joinerName: input.joiner.firstName || "عضو",
        ownerId,
        reason: "self-or-unknown",
        counted: false,
        inviteName: input.inviteName || "",
        hasLink: Boolean(input.inviteLink),
      });
    } catch {
      /* السجل ما يعطّلش */
    }
    return { ...empty, reason: "self-or-unknown", ownerId };
  }

  const current = await activeGroupContest();
  if (!contest || contest.mode !== "group" || contest.status !== "active") contest = current;
  if (!contest) {
    try {
      const { logJoinAttempt } = await import("./referralsDiag");
      await logJoinAttempt({
        at: Date.now(),
        chatId: String(input.chatId),
        joinerId,
        joinerName: input.joiner.firstName || "عضو",
        ownerId,
        reason: "no-contest",
        counted: false,
        inviteName: input.inviteName || "",
        hasLink: Boolean(input.inviteLink),
      });
    } catch {
      /* السجل ما يعطّلش */
    }
    return { ...empty, reason: "no-contest", ownerId };
  }

  const first = await store.sAdd(JOINED_KEY(input.chatId), joinerId);
  if (!first) {
    try {
      const { logJoinAttempt } = await import("./referralsDiag");
      await logJoinAttempt({
        at: Date.now(),
        chatId: String(input.chatId),
        joinerId,
        joinerName: input.joiner.firstName || "عضو",
        ownerId,
        reason: "duplicate",
        counted: false,
        inviteName: input.inviteName || "",
        hasLink: Boolean(input.inviteLink),
      });
    } catch {
      /* السجل ما يعطّلش */
    }
    return {
      counted: false,
      reason: "duplicate",
      count: await store.zScore(`contest:${contest.id}:score`, ownerId),
      contest,
      ownerId,
    };
  }

  const count = await store.zIncr(`contest:${contest.id}:score`, ownerId, 1);

  const settings = await getSettings();
  const record = await findInviteRecord(input.chatId, ownerId, contest.id);
  if (record) {
    await store.set(inviteKey(input.chatId, ownerId, contest.id), { ...record, joins: record.joins + 1 });
  }

  const owner = await store.get<BotUser>(`user:${ownerId}`);
  const event: GroupJoinEvent = {
    at: Date.now(),
    chatId: input.chatId,
    userId: joinerId,
    userName: input.joiner.firstName || "عضو جديد",
    ownerId,
    ownerName: owner?.firstName || input.adderName || "عضو",
    contestId: contest.id,
    via: fromLink || fromName ? "link" : "add",
  };
  await store.listPush(LOG_KEY(input.chatId), [JSON.stringify(event)]);
  // 🧾 نسجّلو المحاولة الناجحة حتى هي (باش التشخيص يبان فيه كلشي)
  try {
    const { logJoinAttempt } = await import("./referralsDiag");
    await logJoinAttempt({
      at: event.at,
      chatId: String(input.chatId),
      joinerId,
      joinerName: event.userName,
      ownerId,
      reason: event.via,
      counted: true,
      contestId: contest.id,
      inviteName: input.inviteName || "",
      hasLink: Boolean(input.inviteLink),
    });
  } catch {
    /* السجل ما يعطّلش */
  }
  const len = await store.listLen(LOG_KEY(input.chatId));
  if (len > JOIN_CAP) {
    const all = (await store.listAll(LOG_KEY(input.chatId), JOIN_CAP + 100)).slice(-JOIN_CAP);
    await store.delList(LOG_KEY(input.chatId));
    await store.listPush(LOG_KEY(input.chatId), all);
  }

  return { counted: true, reason: "ok", count, contest, ownerId };
}

/** آخر من انضموا للمجموعة عبر النظام */
export async function recentGroupJoins(chatId: string, limit = 20): Promise<GroupJoinEvent[]> {
  if (!chatId) return [];
  const raw = await getStore().listAll(LOG_KEY(chatId), 300);
  const events: GroupJoinEvent[] = [];
  for (const line of raw) {
    try {
      events.push(JSON.parse(line) as GroupJoinEvent);
    } catch {
      /* سطر تالف */
    }
  }
  return events.sort((a, b) => b.at - a.at).slice(0, limit);
}

export async function groupJoinsCount(chatId: string): Promise<number> {
  if (!chatId) return 0;
  return getStore().sCard(JOINED_KEY(chatId));
}

/** رابط دعوة عام للمجموعة (لو كانت عامة) — للعرض فقط */
export function groupPublicUrl(settings: Settings): string {
  return settings.groupUrl || "";
}
