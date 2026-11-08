/** أدوات مشتركة للبوت: المستخدمون، النقاط، الصلاحيات، الكيبوردات، لغة البوت. */
import type { DB, Lang, User } from "./types";
import { env } from "./env";
import { getChatMember, profilePhoto, safeTg } from "./tg";

/* ────────────────────────────── نصوص متعددة اللغات ────────────────────────────── */

type Dict = Record<Lang, string>;
const dict = (ar: string, fr: string, en: string): Dict => ({ ar, fr, en });
export const langOf = (db: DB): Lang => (["ar", "fr", "en"].includes(db.settings.lang) ? db.settings.lang : "ar");
export const t = (db: DB, d: Dict) => d[langOf(db)] ?? d.ar;

/* ────────────────────────────── المستخدمون ────────────────────────────── */

export function genRefCode(id: number): string {
  const base = Math.abs(id).toString(36);
  const salt = Math.random().toString(36).slice(2, 5);
  return `${base}${salt}`.slice(0, 12);
}

export function displayName(u: Pick<User, "firstName" | "lastName" | "username" | "id">): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.username || `#${u.id}`;
}

export function ensureUser(db: DB, from: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }): User {
  const key = String(from.id);
  const now = new Date().toISOString();
  const existing = db.users[key];
  if (existing) {
    existing.lastSeenAt = now;
    existing.status = "member";
    if (from.username !== undefined) existing.username = from.username;
    if (from.first_name) existing.firstName = from.first_name;
    if (from.last_name) existing.lastName = from.last_name;
    return existing;
  }
  const lang: Lang = (() => {
    const lc = (from.language_code ?? "").slice(0, 2);
    if (lc === "fr") return "fr";
    if (lc === "en") return "en";
    return langOf(db);
  })();
  const user: User = {
    id: from.id,
    username: from.username,
    firstName: from.first_name || "عضو",
    lastName: from.last_name,
    lang,
    points: 0,
    totalEarned: 0,
    totalSpent: 0,
    joinedAt: now,
    lastSeenAt: now,
    refCode: genRefCode(from.id),
    refCount: 0,
    refActive: 0,
    refBonusGiven: false,
    daily: { streak: 0, count: 0 },
    wheel: { spins: 0, extra: 0 },
    tasks: {},
    history: [],
    banned: false,
    vip: false,
    status: "member",
    messages: 0,
  };
  db.users[key] = user;
  db.counters.botStarts += 1;
  return user;
}

export function countUsers(db: DB) {
  const list = Object.values(db.users);
  const now = Date.now();
  const day = 86400_000;
  return {
    total: list.length,
    active24h: list.filter((u) => now - +new Date(u.lastSeenAt) < day).length,
    active7d: list.filter((u) => now - +new Date(u.lastSeenAt) < 7 * day).length,
    active30d: list.filter((u) => now - +new Date(u.lastSeenAt) < 30 * day).length,
    banned: list.filter((u) => u.banned).length,
    vip: list.filter((u) => u.vip).length,
    withPoints: list.filter((u) => u.points > 0).length,
    referrers: list.filter((u) => u.refCount > 0).length,
    points: list.reduce((s, u) => s + u.points, 0),
    earned: list.reduce((s, u) => s + u.totalEarned, 0),
  };
}

export function topUsers(db: DB, limit = 10, by: "points" | "refs" = "points") {
  return Object.values(db.users)
    .filter((u) => !u.banned)
    .sort((a, b) => (by === "refs" ? b.refActive - a.refActive || b.refCount - a.refCount : b.points - a.points))
    .slice(0, limit);
}

/* ────────────────────────────── النقاط ────────────────────────────── */

export function addPoints(db: DB, userId: number, delta: number, kind: User["history"][number]["kind"], note: string): number {
  const u = db.users[String(userId)];
  if (!u) return 0;
  const before = u.points;
  u.points = Math.max(0, u.points + delta);
  if (delta > 0) {
    u.totalEarned += delta;
    db.counters.pointsGiven += delta;
  } else {
    u.totalSpent += -delta;
    db.counters.pointsSpent += -delta;
  }
  u.history.unshift({ at: new Date().toISOString(), delta, kind, note });
  if (u.history.length > 80) u.history.length = 80;
  return u.points - before;
}

/* ────────────────────────────── الإحالة ────────────────────────────── */

export function refLink(db: DB, user: User): string {
  const bot = db.meta.botUsername;
  return bot ? `https://t.me/${bot}?start=${user.refCode}` : `https://t.me/?start=${user.refCode}`;
}

export function findByRefCode(db: DB, code: string): User | undefined {
  return Object.values(db.users).find((u) => u.refCode === code);
}

/* ────────────────────────────── الاشتراك الإجباري ────────────────────────────── */

const MEMBER_OK = new Set(["creator", "administrator", "member"]);

export async function isJoined(chat: string, userId: number): Promise<boolean | null> {
  const res = await getChatMember(chat.startsWith("@") ? chat : `@${chat}`, userId);
  if (!res) return null; // بوت ليس أدمن أو القناة غير صحيحة
  return MEMBER_OK.has(res.status);
}

export async function missingJoins(db: DB, userId: number): Promise<{ title: string; url: string }[]> {
  const list = [db.settings.forceJoin, ...(db.settings.extraJoins ?? [])].filter(
    (j) => j.enabled && j.username && j.verify
  );
  const missing: { title: string; url: string }[] = [];
  await Promise.all(
    list.map(async (j) => {
      const handle = j.username.replace(/^@/, "");
      const ok = await isJoined(handle, userId);
      if (ok === false) missing.push({ title: j.title || `@${handle}`, url: j.url || `https://t.me/${handle}` });
    })
  );
  return missing;
}

/* ────────────────────────────── الصور ────────────────────────────── */

export async function refreshAvatar(db: DB, userId: number): Promise<string | null> {
  const u = db.users[String(userId)];
  if (!u) return null;
  if (u.photo) return u.photo;
  const p = await profilePhoto(userId);
  if (p) u.photo = p;
  return p;
}

/* ────────────────────────────── إشعار الأدمن ────────────────────────────── */

export async function notifyAdmin(db: DB, text: string, extra?: { photo?: string }) {
  const id = db.settings.admin.adminChatId || env.adminChatId;
  if (!id) return;
  if (extra?.photo) {
    await safeTg("sendPhoto", {
      chat_id: id,
      photo: extra.photo,
      caption: text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return;
  }
  await safeTg("sendMessage", {
    chat_id: id,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

/* ────────────────────────────── أزرار ────────────────────────────── */

export function inline(rows: { text: string; data?: string; url?: string }[][]) {
  return {
    inline_keyboard: rows.map((r) =>
      r.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "noop" }))
    ),
  };
}

export function joinKeyboard(missing: { title: string; url: string }[], retryData = "check_join") {
  return inline([
    ...missing.map((m) => [{ text: `➕ ${m.title}`, url: m.url }]),
    [{ text: "✅ تحقّقت من الاشتراك", data: retryData }],
  ]);
}

/* ────────────────────────────── التواريخ ────────────────────────────── */

export const DAY = 86400_000;
export function daysBetween(aIso: string, bIso = new Date().toISOString()) {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}
export function fmtDate(iso: string, lang: Lang = "ar") {
  const d = new Date(iso);
  const locale = lang === "fr" ? "fr-FR" : lang === "en" ? "en-GB" : "ar-DZ";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Algiers" });
}
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "انتهت";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)} يوم ${h % 24} ساعة`;
  if (h > 0) return `${h} ساعة ${m} دقيقة`;
  return `${m} دقيقة`;
}
