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
