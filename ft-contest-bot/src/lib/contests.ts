import crypto from "node:crypto";
import { getStore } from "./store";
import type { Contest, ContestMode, ContestStatus } from "./types";

const IDS_KEY = "contests:ids";

export function contestKeys(id: string) {
  return {
    contest: `contest:${id}`,
    score: `contest:${id}:score`,
    credited: `contest:${id}:credited`,
    pool: `contest:${id}:pool`,
    claimIndex: `contest:${id}:claimIndex`,
  };
}

export function newContestId(): string {
  return crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6);
}

export async function listContestIds(): Promise<string[]> {
  return (await getStore().get<string[]>(IDS_KEY)) || [];
}

export async function listContests(): Promise<Contest[]> {
  const store = getStore();
  const ids = await listContestIds();
  const items = await Promise.all(ids.map((id) => store.get<Contest>(`contest:${id}`)));
  return items
    .filter((c): c is Contest => Boolean(c))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getContest(id: string): Promise<Contest | null> {
  if (!id) return null;
  return await getStore().get<Contest>(`contest:${id}`);
}

export async function createContest(input: {
  title: string;
  description?: string;
  target: number;
  prize?: string;
  status?: ContestStatus;
  winners?: number;
  mode?: ContestMode;
}): Promise<Contest> {
  const store = getStore();
  const id = newContestId();
  const contest: Contest = {
    id,
    title: input.title.trim() || "مسابقة بدون عنوان",
    description: (input.description || "").trim(),
    target: Math.max(1, Math.floor(input.target || 1)),
    prize: (input.prize || "").trim(),
    status: input.status || "draft",
    winners: Math.max(1, Math.floor(input.winners || 1)),
    mode: input.mode === "group" ? "group" : "referral",
    createdAt: Date.now(),
    ...(input.status === "active" ? { startedAt: Date.now() } : {}),
  };
  await store.set(`contest:${id}`, contest);
  const ids = await listContestIds();
  await store.set(IDS_KEY, [id, ...ids]);
  return contest;
}

export async function updateContest(id: string, patch: Partial<Contest>): Promise<Contest | null> {
  const store = getStore();
  const current = await getContest(id);
  if (!current) return null;
  const next: Contest = { ...current, ...patch, id: current.id };
  if (patch.status === "active" && !next.startedAt) next.startedAt = Date.now();
  if (patch.status === "ended" && !next.endedAt) next.endedAt = Date.now();
  await store.set(`contest:${id}`, next);
  return next;
}

export async function deleteContest(id: string): Promise<void> {
  const store = getStore();
  await store.del(`contest:${id}`);
  await store.del(contestKeys(id).score);
  await store.del(contestKeys(id).credited);
  await store.delList(contestKeys(id).pool);
  const ids = await listContestIds();
  await store.set(
    IDS_KEY,
    ids.filter((x) => x !== id),
  );
}

/* ───────────────────────── الجهات / المتصدّرون ───────────────────────── */

export async function getReferralCount(contestId: string, userId: string | number): Promise<number> {
  return getStore().zScore(contestKeys(contestId).score, String(userId));
}

export async function getLeaderboard(contestId: string, limit = 10) {
  return getStore().zTop(contestKeys(contestId).score, limit);
}

export async function participantsCount(contestId: string): Promise<number> {
  return getStore().zCount(contestKeys(contestId).score);
}

/* ────────────────────────────── الحسابات ────────────────────────────── */

export function normalizeAccountLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/\s*[:|,\t]\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const email = parts[0].trim();
  const password = parts.slice(1).join(":").trim();
  if (!email || !password) return null;
  return `${email}:${password}`;
}

export async function addAccounts(contestId: string, raw: string): Promise<number> {
  const lines = raw.split(/\r?\n/).map(normalizeAccountLine).filter((l): l is string => !!l);
  if (!lines.length) return 0;
  await getStore().listPush(contestKeys(contestId).pool, lines);
  return lines.length;
}

export async function accountsCount(contestId: string): Promise<number> {
  return getStore().listLen(contestKeys(contestId).pool);
}

export function maskAccount(entry: string): { email: string; password: string } {
  const idx = entry.indexOf(":");
  const email = idx >= 0 ? entry.slice(0, idx) : entry;
  const password = idx >= 0 ? entry.slice(idx + 1) : "";
  const maskedEmail =
    email.length <= 4 ? "••••" : `${email.slice(0, 3)}${"•".repeat(4)}${email.slice(-6)}`;
  return { email: maskedEmail, password: "•".repeat(Math.min(10, Math.max(6, password.length))) };
}

export async function listAccounts(contestId: string, limit = 200): Promise<string[]> {
  return getStore().listAll(contestKeys(contestId).pool, limit);
}

export async function removeAccountAt(contestId: string, index: number): Promise<boolean> {
  const store = getStore();
  const key = contestKeys(contestId).pool;
  const all = await store.listAll(key, 10000);
  if (index < 0 || index >= all.length) return false;
  all.splice(index, 1);
  await store.delList(key);
  if (all.length) await store.listPush(key, all);
  return true;
}

export async function removeAccount(contestId: string, entry: string): Promise<void> {
  const store = getStore();
  const key = contestKeys(contestId).pool;
  const all = await store.listAll(key, 10000);
  const idx = all.indexOf(entry);
  if (idx === -1) return;
  all.splice(idx, 1);
  await store.delList(key);
  if (all.length) await store.listPush(key, all);
}

export async function clearAccounts(contestId: string): Promise<void> {
  await getStore().delList(contestKeys(contestId).pool);
}
