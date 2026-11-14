import { trackBotActivity } from "./stats";
import { getStore } from "./store";
import type { BotUser } from "./types";
import type { TgUser } from "./telegram";

const IDS_KEY = "users:ids";
const JOINED_KEY = "users:joined";

export async function touchUser(from: TgUser): Promise<BotUser> {
  const store = getStore();
  const id = String(from.id);
  const existing = await store.get<BotUser>(`user:${id}`);
  const isNew = await store.sAdd(IDS_KEY, id);
  const user: BotUser = {
    id,
    firstName: from.first_name || existing?.firstName || "صديق",
    username: from.username || existing?.username || "",
    joinedAt: existing?.joinedAt || Date.now(),
  };
  await store.set(`user:${id}`, user);
  if (isNew) await store.zIncr(JOINED_KEY, id, user.joinedAt);
  await trackBotActivity(id);
  return user;
}

export async function getUser(id: string): Promise<BotUser | null> {
  return getStore().get<BotUser>(`user:${id}`);
}

export async function listRecentUsers(limit = 200): Promise<BotUser[]> {
  const store = getStore();
  const top = await store.zTop(JOINED_KEY, limit);
  const users = await Promise.all(top.map((t) => store.get<BotUser>(`user:${t.member}`)));
  return users.filter((u): u is BotUser => Boolean(u));
}

export async function usersCount(): Promise<number> {
  return getStore().zCount(JOINED_KEY);
}

/**
 * كل IDs ديال المستخدمين منذ إنشاء البوت (بلا سقف 200).
 * كتجمع بين الـset (`users:ids`) و الـzset ديال الانخراط، بلا مكرّر.
 */
export async function allUserIds(limit = 200_000): Promise<string[]> {
  const store = getStore();
  const [fromSet, fromZ] = await Promise.all([
    store.sMembers(IDS_KEY).catch(() => [] as string[]),
    store.zTop(JOINED_KEY, limit).catch(() => [] as { member: string }[]),
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    const id = String(raw ?? "").trim();
    if (/^\d{1,20}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const z of fromZ || []) push((z as { member?: string })?.member);
  for (const id of fromSet || []) push(id);
  return out.slice(0, Math.max(1, limit));
}

/** لائحة كاملة بالمستخدمين (الأحدث أولاً) — للوحدة ديال التحكم */
export async function listAllUsers(limit = 5_000): Promise<BotUser[]> {
  const store = getStore();
  const ids = await allUserIds(limit);
  const users = await Promise.all(ids.map((id) => store.get<BotUser>(`user:${id}`)));
  return users.filter((u): u is BotUser => Boolean(u));
}

/* ─────────── 👑 المالك والأدمنية: معرّفات الشات اللي توصلهم الإشعارات ─────────── */
const OWNER_ID_KEY = "owner:chatid";
let ownerMemo: { name: string; id: string; at: number } | null = null;
/** معرّف المالك المعروف في ذاكرة النسخة (للفحص السريع بلا قاعدة بيانات) */
export function knownOwnerId(): string {
  return ownerMemo?.id || "";
}

/** نحوّلو @username ديال المالك لمعرّف رقمي (من المسجّلين في البوت) ونحفظوه */
export async function resolveOwnerId(ownerUsername: string): Promise<string> {
  const name = String(ownerUsername || "").trim().replace(/^@/, "").toLowerCase();
  if (!name) return "";
  if (/^\d+$/.test(name)) return name;
  if (ownerMemo?.name === name && (ownerMemo.id || Date.now() - ownerMemo.at < 600_000)) return ownerMemo.id;
  const id = await lookupOwnerId(name);
  ownerMemo = { name, id, at: Date.now() };
  return id;
}

async function lookupOwnerId(name: string): Promise<string> {
  const store = getStore();
  const cached = await store.get<{ name: string; id: string }>(OWNER_ID_KEY).catch(() => null);
  if (cached?.name === name && /^\d+$/.test(cached.id)) return cached.id;
  const users = await listAllUsers(200_000);
  const hit = users.find((u) => String(u.username || "").toLowerCase() === name);
  if (!hit) return "";
  await store.set(OWNER_ID_KEY, { name, id: String(hit.id) }).catch(() => undefined);
  return String(hit.id);
}

/** كل من يستقبل إشعارات الإدارة: adminIds + المالك (رقمي أو @username) */
export async function adminChatIds(settings: { adminIds?: string[]; ownerUsername?: string }): Promise<string[]> {
  const ids = (settings.adminIds || []).map((x) => String(x || "").trim()).filter((x) => /^\d+$/.test(x));
  const owner = await resolveOwnerId(settings.ownerUsername || "").catch(() => "");
  if (owner) ids.push(owner);
  return [...new Set(ids)];
}
