import { deflateSync } from "node:zlib";
import { getStore } from "./store";
import { getSettings } from "./settings";
import { approveJoinRequest, createChatInviteLink, getChatInfo } from "./telegram";
import { activeGroupContest } from "./groups";
import { getVerification } from "./delivery";

/* ══════════════════════════════════════════════════════════════════════════
   نظام النقاط والجوائز (متجر) — إضافة على البوت بدون تغيير نظام المسابقات.

   • الرصيد الافتراضي: 0 نقطة لكل عضو.
   • كل دعوة مؤكَّدة (عضو يدخل من رابطك) = نقاط تُضاف فوراً.
   • جوائز قابلة للتعديل من لوحة التحكم (/admin/rewards) أو من الذكاء الاصطناعي.
   • العضو يستبدل رصيده بجائزة ⇒ طلب يوصل للمالك للموافقة/الرفض.
   ══════════════════════════════════════════════════════════════════════════ */

export type Reward = {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  cost: number;
  /** null = بلا حد */
  stock: number | null;
  active: boolean;
  order: number;
  /** نص التسليم (مثال: «يُرسل الحساب على الخاص») */
  delivery: string;
  /** 🗂️ القسم: accounts = حسابات بيس، points = نقاط، services = خدمات */
  section?: SectionId;
  /** 🖼️ صورة الجائزة (رابط أو base64 داخلي) */
  image?: string;
};

export type SectionId = "accounts" | "points" | "services";

/** 🖼️ صورة جائزة افتراضية حسب القسم (SVG صغير داخلي — ما يحتاجش رابط خارجي) */
export function sectionImage(section?: SectionId): string {
  // PNG 600×400 صغير (16 بايت لكل صف) بلون القسم — مضغوط ومضمون في تيليغرام
  const color = section === "points" ? [246, 196, 83] : section === "services" ? [90, 169, 255] : [46, 230, 168];
  const png = solidPng(600, 400, color[0], color[1], color[2]);
  return `data:image/png;base64,${png}`;
}

/** يولّد PNG بلون واحد (بلا مكتبات خارجية) */
function solidPng(width: number, height: number, r: number, g: number, b: number): string {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) raw.push(r, g, b);
  }
  const table = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t.push(c >>> 0);
    }
    return t;
  })();
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const deflated = deflateSync(Buffer.from(raw));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflated),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

export type Section = { id: SectionId; title: string; emoji: string; order: number; active: boolean };

export const DEFAULT_SECTIONS: Section[] = [
  { id: "accounts", title: "حسابات بيس", emoji: "🎁", order: 1, active: true },
  { id: "points", title: "نقاط", emoji: "⭐️", order: 2, active: true },
  { id: "services", title: "خدمات", emoji: "🤝", order: 3, active: true },
];

export type RewardRequest = {
  id: string;
  userId: string;
  userName: string;
  username: string;
  rewardId: string;
  rewardTitle: string;
  emoji: string;
  cost: number;
  status: "pending" | "approved" | "rejected";
  at: number;
  decidedAt?: number;
  note?: string;
};

export type PointsConfig = {
  /** نقاط كل عضو جديد يدخل من رابطك */
  perJoin: number;
  /** نقاط إضافية لمّا العضو الجديد يبدأ يستعمل البوت */
  perActivated: number;
  /** هدية يومية (أدنى/أقصى) */
  dailyMin: number;
  dailyMax: number;
  /** الترحيب النصي لمتجر الجوائز */
  shopIntro: string;
  enabled: boolean;
};

export const DEFAULT_POINTS: PointsConfig = {
  perJoin: 2,
  perActivated: 1,
  dailyMin: 1,
  dailyMax: 3,
  shopIntro: "استبدل نقاطك بجوائز حقيقية — كل ما تجمع أكثر، تربح أكثر 🎁",
  enabled: true,
};

export const DEFAULT_REWARDS: Reward[] = [
  { id: "r_wa", emoji: "🤝", title: "وساطة مجانية", desc: "وساطة مجانية في بيع/شراء حساب FT", cost: 15, stock: null, active: true, order: 1, delivery: "يتواصل معك المالك على الخاص", section: "services" },
  { id: "r_usd", emoji: "💵", title: "1$ دولار", desc: "دولار واحد (رصيد/تحويل حسب المالك)", cost: 45, stock: 0, active: true, order: 2, delivery: "يتواصل معك المالك على الخاص", section: "services" },
  { id: "r_star25", emoji: "🌟", title: "25 نجمة", desc: "25 نجمة تيليغرام", cost: 35, stock: 0, active: true, order: 3, delivery: "بعد الموافقة تُرسل النجوم", section: "points" },
  { id: "r_star50", emoji: "⭐", title: "50 نجمة", desc: "50 نجمة تيليغرام على حسابك", cost: 65, stock: 0, active: true, order: 4, delivery: "بعد الموافقة تُرسل النجوم", section: "points" },
  { id: "r_star100", emoji: "💫", title: "100 نجمة", desc: "100 نجمة تيليغرام", cost: 100, stock: 0, active: true, order: 5, delivery: "بعد الموافقة تُرسل النجوم", section: "points" },
  { id: "r_bear", emoji: "🧸", title: "دب", desc: "هدية دب تيليغرام", cost: 20, stock: 0, active: true, order: 6, delivery: "بعد الموافقة تُرسل الهدية", section: "points" },
  { id: "r_bp2", emoji: "🎁", title: "كونت بيس 2", desc: "حساب بيس (باقة ثانية)", cost: 55, stock: null, active: true, order: 7, delivery: "يُسلّم إيميل + كلمة سر", section: "accounts" },
  { id: "r_bp", emoji: "🎁", title: "كونت بيس", desc: "حساب بيس كامل", cost: 280, stock: null, active: true, order: 8, delivery: "يُسلّم إيميل + كلمة سر", section: "accounts" },
];

const KEY = {
  points: (id: string) => `pts:${id}`,
  rewardList: "rewards:list",
  pointsCfg: "points:config",
  daily: (id: string, day: string) => `daily:${id}:${day}`,
  requests: "rewards:requests",
  req: (id: string) => `rreq:${id}`,
  joined: (id: string) => `refs:joined:${id}`,
  activated: (id: string) => `refs:act:${id}`,
  top: "pts:top",
  sections: "rewards:sections",
  banned: "users:banned",
  log: "admin:log",
};

export /** 🚫 الأصناف لي ما تتوفرش: نبدّلو الكمية صفر إذا كانت بعد بقيمة قديمة */
const SOLD_OUT_IDS = ["r_usd", "r_star25", "r_star50", "r_star100", "r_bear"];
const SOLD_OUT_KEY = "rewards:soldOutV1";

export async function ensureRewards(): Promise<Reward[]> {
  const store = getStore();
  const saved = await store.get<Reward[]>(KEY.rewardList);
  if (!Array.isArray(saved) || !saved.length) {
    await store.set(KEY.rewardList, DEFAULT_REWARDS);
    return DEFAULT_REWARDS;
  }
  // ترحيل مرة واحدة: الأصناف المعلّمة «غير متوفر الآن» تولّي كميتها 0
  const migrated = await store.get<string>(SOLD_OUT_KEY);
  if (!migrated) {
    const next = saved.map((r) =>
      SOLD_OUT_IDS.includes(r.id) && (r.stock === null || r.stock === undefined) ? { ...r, stock: 0 } : r,
    );
    await store.set(KEY.rewardList, next);
    await store.set(SOLD_OUT_KEY, "1");
    return withSections(next);
  }
  return withSections(saved);
}

/** 🗂️ تخمين القسم من العنوان (للجوائز القديمة لي ماكانش عندها قسم) */
function inferSection(r: Reward): SectionId {
  const known = DEFAULT_REWARDS.find((d) => d.id === r.id);
  if (known?.section) return known.section;
  const t = `${r.title} ${r.desc}`;
  if (/نجم|نجوم|دب|star|bear|هدية تيليغرام/i.test(t)) return "points";
  if (/وساط|دولار|خدم|usd|\$|service/i.test(t)) return "services";
  return "accounts";
}

/** 🗂️ كل جائزة لازم يكون عندها قسم */
export function withSections(list: Reward[]): Reward[] {
  return list.map((r) => {
    const section = r.section ? r.section : inferSection(r);
    return { ...r, section };
  });
}

/** 🖼️ صورة الجائزة أو صورة القسم الافتراضية */
export function rewardImage(r: { image?: string; section?: SectionId }): string {
  if (r.image && r.image.trim()) return r.image.trim();
  return sectionImage(r.section || "accounts");
}

export async function saveRewards(list: Reward[]): Promise<void> {
  await getStore().set(KEY.rewardList, withSections(list));
}

export async function getPointsConfig(): Promise<PointsConfig> {
  const store = getStore();
  const saved = (await store.get<Partial<PointsConfig>>(KEY.pointsCfg)) || {};
  return { ...DEFAULT_POINTS, ...saved };
}

export async function savePointsConfig(patch: Partial<PointsConfig>): Promise<PointsConfig> {
  const next = { ...(await getPointsConfig()), ...patch };
  await getStore().set(KEY.pointsCfg, next);
  return next;
}

export async function balanceOf(userId: string): Promise<number> {
  const raw = await getStore().get<number>(KEY.points(userId));
  return Math.max(0, Number(raw) || 0);
}

export async function addPoints(userId: string, amount: number): Promise<number> {
  const store = getStore();
  const next = Math.max(0, (await balanceOf(userId)) + Math.trunc(amount));
  await store.set(KEY.points(userId), next);
  await store.zIncr(KEY.top, userId, Math.trunc(amount));
  return next;
}

/** تعديل الرصيد المطلق (للوحة التحكم) */
export async function setBalance(userId: string, value: number): Promise<number> {
  const store = getStore();
  const before = await balanceOf(userId);
  const next = Math.max(0, Math.trunc(value));
  await store.set(KEY.points(userId), next);
  await store.zIncr(KEY.top, userId, next - before);
  return next;
}

export async function topBalances(limit = 10): Promise<{ userId: string; points: number }[]> {
  const rows = await getStore().zTop(KEY.top, Math.max(limit * 3, 30));
  const out: { userId: string; points: number }[] = [];
  for (const row of rows) {
    const real = await balanceOf(row.member);
    if (real > 0) out.push({ userId: row.member, points: real });
  }
  return out.sort((a, b) => b.points - a.points).slice(0, limit);
}

/* ─────────────── تسجيل الدعوات المؤكدة (تُستدعى من webhook المجموعة) ─────────────── */

export async function creditInvite(inviterId: string): Promise<number> {
  const cfg = await getPointsConfig();
  if (!cfg.enabled) return 0;
  const store = getStore();
  await store.incr(KEY.joined(inviterId), 1);
  return addPoints(inviterId, cfg.perJoin);
}

export async function creditActivation(inviterId: string): Promise<number> {
  const cfg = await getPointsConfig();
  if (!cfg.enabled) return 0;
  const store = getStore();
  await store.incr(KEY.activated(inviterId), 1);
  return addPoints(inviterId, cfg.perActivated);
}

export async function invitesOf(userId: string): Promise<{ joined: number; activated: number }> {
  const store = getStore();
  const [joined, activated] = await Promise.all([
    store.get<number>(KEY.joined(userId)),
    store.get<number>(KEY.activated(userId)),
  ]);
  return { joined: Number(joined) || 0, activated: Number(activated) || 0 };
}

/* ─────────────── الهدية اليومية ─────────────── */

export function algeriaDay(now = Date.now()): string {
  return new Date(now + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function claimDaily(userId: string): Promise<{ ok: boolean; gained: number; balance: number }> {
  const cfg = await getPointsConfig();
  if (!cfg.enabled) return { ok: false, gained: 0, balance: await balanceOf(userId) };
  const store = getStore();
  const key = KEY.daily(userId, algeriaDay());
  if (await store.get<number>(key)) {
    return { ok: false, gained: 0, balance: await balanceOf(userId) };
  }
  const lo = Math.max(0, Math.min(cfg.dailyMin, cfg.dailyMax));
  const hi = Math.max(lo, cfg.dailyMax);
  const gained = lo + Math.floor(Math.random() * (hi - lo + 1));
  await store.set(key, Date.now());
  const balance = await addPoints(userId, gained);
  return { ok: true, gained, balance };
}

/* ─────────────── الطلبات ─────────────── */

export async function createRequest(input: {
  userId: string;
  userName: string;
  username: string;
  reward: Reward;
}): Promise<{ ok: boolean; error?: string; request?: RewardRequest; balance: number }> {
  const store = getStore();
  const balance = await balanceOf(input.userId);
  // 🔎 ما نخلّيوش طلب جديد قبل ما يأكّد الحساب اللي تسلّمو (Working / Not Working)
  const pending = await getVerification(input.userId);
  if (pending) {
    return {
      ok: false,
      error: "أكّد الحساب اللي تسلّم قبل: اضغط ✅ Working ولا ❌ Not Working في رسالة الحساب.",
      balance,
    };
  }
  // 🚫 طلب واحد في الانتظار لكل مستخدم (ما نخلّيوهش يطلب نفس الجائزة مرتين)
  const pendingIds = (await store.listAll(KEY.requests, 400)).slice(-200);
  for (const id of pendingIds) {
    const existing = await store.get<RewardRequest>(KEY.req(id));
    if (existing && existing.userId === input.userId && existing.status === "pending") {
      return {
        ok: false,
        error: "عندك طلب في الانتظار — استنى المالك يسلّمك الجائزة قبل ما تطلب جديدة.",
        balance,
      };
    }
  }
  if (!input.reward.active) return { ok: false, error: "هذه الجائزة غير متوفرة حالياً", balance };
  if (input.reward.stock !== null && input.reward.stock <= 0) return { ok: false, error: "نفدت الكمية", balance };
  if (balance < input.reward.cost) return { ok: false, error: `تحتاج ${input.reward.cost - balance} نقطة زيادة`, balance };

  await addPoints(input.userId, -input.reward.cost);
  const request: RewardRequest = {
    id: `rq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    userId: input.userId,
    userName: input.userName,
    username: input.username,
    rewardId: input.reward.id,
    rewardTitle: input.reward.title,
    emoji: input.reward.emoji,
    cost: input.reward.cost,
    status: "pending",
    at: Date.now(),
  };
  await store.set(KEY.req(request.id), request);
  await store.listPush(KEY.requests, [request.id]);
  if (input.reward.stock !== null) {
    const list = await ensureRewards();
    const next = list.map((r) => (r.id === input.reward.id ? { ...r, stock: Math.max(0, (r.stock ?? 1) - 1) } : r));
    await saveRewards(next);
  }
  return { ok: true, request, balance: await balanceOf(input.userId) };
}

export async function listRequests(limit = 100): Promise<RewardRequest[]> {
  const store = getStore();
  const ids = await store.listAll(KEY.requests, limit * 2);
  const items = await Promise.all(ids.slice(-limit).reverse().map((id) => store.get<RewardRequest>(KEY.req(id))));
  return items.filter((x): x is RewardRequest => Boolean(x));
}

/** طلب واحد بالمعرّف (للتحقّق بعد التسليم) */
export async function getRequest(id: string): Promise<RewardRequest | null> {
  return getStore().get<RewardRequest>(KEY.req(String(id)));
}

export async function decideRequest(
  id: string,
  status: "approved" | "rejected",
  note = "",
): Promise<RewardRequest | null> {
  const store = getStore();
  const request = await store.get<RewardRequest>(KEY.req(id));
  if (!request || request.status !== "pending") return request;
  const next: RewardRequest = { ...request, status, decidedAt: Date.now(), note };
  if (status === "rejected") await addPoints(request.userId, request.cost);
  await store.set(KEY.req(id), next);
  return next;
}

/* ─────────────── إضافة البوت للمجموعة تلقائياً عند /start ─────────────── */

type GroupTarget = { chatId: string; title: string };
const TARGET_KEY = "group:target";

export async function getJoinGroup(): Promise<GroupTarget | null> {
  const envChat = process.env.JOIN_GROUP_CHAT || "";
  if (envChat) return { chatId: envChat, title: process.env.JOIN_GROUP_TITLE || "المجموعة" };
  const saved = await getStore().get<GroupTarget>(TARGET_KEY);
  if (saved?.chatId) return saved;
  return null;
}

export async function setJoinGroup(chatId: string, title = ""): Promise<GroupTarget> {
  const clean = String(chatId).trim();
  let name = title;
  if (!name && clean) {
    const info = await getChatInfo(clean);
    name = info.ok ? info.result?.title || "" : "";
  }
  const target = { chatId: clean, title: name || "المجموعة" };
  await getStore().set(TARGET_KEY, target);
  return target;
}

/**
 * يجيب رابط دخول للمجموعة من البوت.
 * 1) يحاول createChatInviteLink (رابط دائم/خاص بالعضو مع طلب انضمام ⇒ نعرف صاحب الجهة).
 * 2) إلا فشل (البوت ماشي أدمن) ⇒ يرجّع رابط المجموعة العام إذا موجود.
 */
export async function groupEntryLink(
  userId: string,
  opts: { title?: string } = {},
): Promise<{ url: string; kind: "invite" | "public" | "none"; chatId: string }> {
  const target = await getJoinGroup();
  if (!target?.chatId) return { url: "", kind: "none", chatId: "" };

  const settings = await getSettings();
  // اسم الرابط يحمل صاحب الدعوة + المسابقة (حتى لو ضاع التخزين البوت يعرف صاحب الجهة)
  const contest = await activeGroupContest();
  const linkName = `FT-${userId}-${contest?.id || "x"}`.slice(0, 32);

  const created = await createChatInviteLink(target.chatId, linkName);
  if (created?.invite_link) {
    await getStore().set(`invite:link:${created.invite_link}`, {
      chatId: String(target.chatId),
      userId: String(userId),
      contestId: contest?.id || "",
    });
    return { url: created.invite_link, kind: "invite", chatId: target.chatId };
  }

  if (settings.groupUrl) return { url: settings.groupUrl, kind: "public", chatId: target.chatId };
  return { url: "", kind: "none", chatId: target.chatId };
}

export async function approveJoin(chatId: string, userId: string): Promise<boolean> {
  const res = await approveJoinRequest(chatId, userId);
  return Boolean(res.ok);
}

/* ─────────────── نصوص جاهزة للبوت ─────────────── */

export function shopText(balance: number, cfg: PointsConfig, rewards: Reward[]): string {
  // كيما في النسخة القديمة: العنوان + الرصيد + سطر الاختيار (بلا لائحة داخل النص)
  const active = rewards.filter((r) => r.active);
  const lines = [
    "🎁 <b>المتجر</b>",
    "",
    `💵 رصيدك: <b>${balance}</b> نقطة`,
    "",
  ];
  const sections: SectionId[] = ["accounts", "points", "services"];
  const icons: Record<SectionId, string> = { accounts: "🎁", points: "⭐️", services: "🤝" };
  let total = 0;
  for (const id of sections) {
    const items = active.filter((r) => (r.section || "accounts") === id).sort((a, b) => a.order - b.order);
    if (!items.length) continue;
    total += items.length;
    lines.push(`${icons[id]} <b>قسم ${id === "accounts" ? "حسابات بيس" : id === "points" ? "النقاط" : "الخدمات"}</b>`);
    for (const r of items) {
      lines.push(`• ${r.emoji} ${escapeText(r.title)} — <b>${r.cost}</b> نقطة`);
    }
    lines.push("");
  }
  if (!total) lines.push("ما زال ماكانش جوائز — المالك يزيدها من اللوحة.");
  lines.push("👇 اختر القسم من الأزرار تحت:");
  void cfg;
  return lines.join("\n");
}

export function escapeText(value: string): string {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function rewardLine(reward: Reward, balance: number): string {
  const missing = Math.max(0, reward.cost - balance);
  const stock =
    reward.stock === null
      ? "متوفر ✅"
      : reward.stock > 0
        ? `متوفر ✅ (باقي ${reward.stock})`
        : "غير متوفر الآن 🚫";
  return [
    `${reward.emoji} <b>${escapeText(reward.title)}</b>`,
    "",
    reward.desc ? escapeText(reward.desc) : "",
    "",
    `⭐️ <b>السعر:</b> ${reward.cost} نقطة`,
    `📦 <b>الكمية:</b> ${stock}`,
    reward.delivery ? `🚚 <b>التسليم:</b> ${escapeText(reward.delivery)}` : "",
    "",
    missing > 0 ? `🔒 باقي لك <b>${missing}</b> نقطة` : "✅ عندك نقاط كافية — اضغط الزر الأخضر للاستبدال",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");
}

/* ───────────────────────── 🗂️ الأقسام (حسابات / نقاط / خدمات) ───────────────────────── */

export async function ensureSections(): Promise<Section[]> {
  const store = getStore();
  const saved = await store.get<Section[]>(KEY.sections);
  if (!Array.isArray(saved) || !saved.length) {
    await store.set(KEY.sections, DEFAULT_SECTIONS);
    return DEFAULT_SECTIONS;
  }
  // أي قسم جديد نزيدوه تلقائياً
  const missing = DEFAULT_SECTIONS.filter((d) => !saved.some((s) => s.id === d.id));
  if (missing.length) {
    const next = [...saved, ...missing];
    await store.set(KEY.sections, next);
    return next;
  }
  return saved;
}

export async function saveSections(list: Section[]): Promise<Section[]> {
  const clean = list
    .filter((s) => s && s.id)
    .map((s, i) => ({
      id: s.id,
      title: String(s.title || "قسم").slice(0, 40),
      emoji: String(s.emoji || "🎁").slice(0, 8),
      order: Math.floor(Number(s.order) || i + 1),
      active: s.active === undefined ? true : Boolean(s.active),
    }))
    .sort((a, b) => a.order - b.order);
  await getStore().set(KEY.sections, clean);
  return clean;
}

/** جوائز قسم معيّن */
export function rewardsInSection(list: Reward[], section: SectionId): Reward[] {
  return list.filter((r) => (r.section || "accounts") === section).sort((a, b) => a.order - b.order);
}

/* ───────────────────────── 🚫 الحظر ───────────────────────── */

export async function isBanned(userId: string): Promise<boolean> {
  return getStore().sHas(KEY.banned, String(userId));
}

export async function setBanned(userId: string, banned: boolean): Promise<boolean> {
  const store = getStore();
  if (banned) await store.sAdd(KEY.banned, String(userId));
  else await store.sDel(KEY.banned, String(userId));
  return banned;
}

export async function bannedIds(): Promise<string[]> {
  return getStore().sMembers(KEY.banned);
}

/* ───────────────────────── 📝 سجل عمليات المالك ───────────────────────── */

export type AdminLogEntry = { at: number; op: string; detail: string; via: "panel" | "ai" };

export async function pushAdminLog(entry: AdminLogEntry): Promise<void> {
  const store = getStore();
  await store.listPush(KEY.log, [JSON.stringify(entry)]);
  const len = await store.listLen(KEY.log);
  if (len > 400) {
    const keep = (await store.listAll(KEY.log, 500)).slice(-350);
    await store.delList(KEY.log);
    await store.listPush(KEY.log, keep);
  }
}

export async function readAdminLog(limit = 120): Promise<AdminLogEntry[]> {
  const raw = await getStore().listAll(KEY.log, 500);
  return raw
    .map((l) => {
      try {
        return JSON.parse(l) as AdminLogEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is AdminLogEntry => Boolean(x))
    .slice(-limit)
    .reverse();
}
