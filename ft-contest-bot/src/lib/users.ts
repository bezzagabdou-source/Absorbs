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
