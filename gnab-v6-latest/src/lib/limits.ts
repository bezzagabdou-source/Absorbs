import { db } from '../db';
import { subscriptions, usageCounters } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { HttpError } from './auth';

export type PlanName = 'free' | 'pro';
export type UsageKind = 'messages' | 'files' | 'images' | 'projects' | 'voice' | 'code' | 'codeLines';

export interface PlanLimits {
  messages: number;
  files: number;
  images: number;
  projects: number;
  voice: number;
  code: number;
  codeLines: number;
  contextChars: number;
}

// GNAB PRO is open to everyone: every plan is effectively unlimited.
// (numbers are huge on purpose — see getPlan below)
const UNLIMITED: PlanLimits = {
  messages: 100000,
  files: 100000,
  images: 100000,
  projects: 100000,
  voice: 100000,
  code: 100000,
  codeLines: 100000,
  contextChars: 2000000,
};

export const LIMITS: Record<PlanName, PlanLimits> = {
  free: { ...UNLIMITED },
  pro: { ...UNLIMITED },
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPlan(userId: string): Promise<{ plan: PlanName; expiresAt: Date | null }> {
  try {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (sub && sub.plan === 'pro' && sub.expiresAt) {
      const exp = sub.expiresAt instanceof Date ? sub.expiresAt : new Date(sub.expiresAt as unknown as string);
      if (exp > new Date()) return { plan: 'pro', expiresAt: exp };
    }
  } catch (e) {}
  // Free PRO week for everyone.
  return { plan: 'pro', expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) };
}

export async function consume(userId: string, kind: UsageKind, plan: PlanName, amount = 1): Promise<void> {
  const day = today();
  const limit = LIMITS[plan][kind === 'code' ? 'codeLines' : kind];
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.kind, kind)));
  const current = row ? Number((row as any).count) || 0 : 0;
  if (current + amount > limit) throw new HttpError(403, 'Daily limit reached');
  if (row) {
    await db
      .update(usageCounters)
      .set({ count: current + amount } as any)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.kind, kind)));
  } else {
    await db.insert(usageCounters).values({ userId, day, kind, count: amount } as any);
  }
}

export async function getUsage(userId: string): Promise<Record<string, number>> {
  const day = today();
  const rows = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day)));
  const out: Record<string, number> = {};
  for (const r of rows as any[]) out[r.kind] = Number(r.count) || 0;
  return out;
}

export async function refund(userId: string, kind: UsageKind, amount = 1): Promise<void> {
  const day = today();
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.kind, kind)));
  if (!row) return;
  const current = Number((row as any).count) || 0;
  await db
    .update(usageCounters)
    .set({ count: Math.max(0, current - amount) } as any)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.day, day), eq(usageCounters.kind, kind)));
}
