import { contestKeys } from "./contests";
import { getStore } from "./store";
import type { Claim } from "./types";

export async function getClaim(contestId: string, userId: string): Promise<Claim | null> {
  return getStore().get<Claim>(`claim:${contestId}:${userId}`);
}

export async function claimsCount(contestId: string): Promise<number> {
  return getStore().zCount(contestKeys(contestId).claimIndex);
}

export async function listClaims(limit = 100): Promise<Claim[]> {
  const store = getStore();
  const top = await store.zTop("claims:index", limit);
  const items = await Promise.all(
    top.map(({ member }) => {
      const [cid, uid] = member.split("__");
      return store.get<Claim>(`claim:${cid}:${uid}`);
    }),
  );
  return items.filter((c): c is Claim => Boolean(c));
}

export async function listContestClaims(contestId: string, limit = 100): Promise<Claim[]> {
  const store = getStore();
  const top = await store.zTop(contestKeys(contestId).claimIndex, limit);
  const items = await Promise.all(
    top.map(({ member }) => store.get<Claim>(`claim:${contestId}:${member}`)),
  );
  return items.filter((c): c is Claim => Boolean(c));
}

export async function saveClaim(claim: Claim): Promise<void> {
  const store = getStore();
  await store.set(`claim:${claim.contestId}:${claim.userId}`, claim);
  await store.zIncr(contestKeys(claim.contestId).claimIndex, claim.userId, claim.at);
  await store.zIncr("claims:index", `${claim.contestId}__${claim.userId}`, claim.at);
}

/** يسحب حساباً من مخزون المسابقة بشكل ذرّي (آمن ضد التسليم المزدوج) */
export async function takeAccount(contestId: string): Promise<{ email: string; password: string } | null> {
  const entry = await getStore().listPop(contestKeys(contestId).pool);
  if (!entry) return null;
  const idx = entry.indexOf(":");
  return { email: entry.slice(0, idx), password: entry.slice(idx + 1) };
}
