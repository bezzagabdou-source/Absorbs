/**
 * Nexus data layer — one API over two backends.
 *
 *   • "pg"     — real Postgres via Drizzle (when DATABASE_URL is set & reachable)
 *   • "memory" — in-process store (fallback: the app still works end-to-end
 *                with zero infrastructure; data lives while the process runs)
 *
 * Every route goes through this module — nothing else touches Drizzle.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, findDatabaseUrl, pool } from "@/db";
import {
  conversations,
  messages,
  orders,
  promoCodes,
  sessions,
  users,
  type Conversation,
  type Message,
} from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";

/* ------------------------------------------------------------------ types */

export type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  locale: string;
  plan: string;
  planExpiresAt: Date | null;
  creditsUsed: number;
  usageDay: string | null;
  meterUsedMs: number;
  totalRuns: number;
  provider: string;
  passwordHash: string | null;
  emailVerified: boolean;
  loginCount: number;
  lastLoginAt: Date | null;
  phone: string | null;
  country: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  termsAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
};

export type ConversationRow = {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageRow = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  createdAt: Date;
};

export type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
};

export type PromoRow = {
  code: string;
  plan: string;
  days: number;
  maxUses: number;
  used: number;
  active: boolean;
  createdAt: Date;
};

export type BackendName = "pg" | "memory";

/* ------------------------------------------------------------------ backend */

const g = globalThis as typeof globalThis & {
  __nxBackend?: BackendName;
  __nxBackendProbe?: Promise<BackendName>;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("db probe timeout")), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/** Resolves (once) which backend this instance can use. Never throws. */
export function resolveBackend(): Promise<BackendName> {
  if (g.__nxBackend) return Promise.resolve(g.__nxBackend);
  if (!g.__nxBackendProbe) {
    g.__nxBackendProbe = (async () => {
      const url = findDatabaseUrl();
      if (!url) {
        console.warn("[db] DATABASE_URL not set — using in-memory store (no persistence).");
        return "memory";
      }
      try {
        await withTimeout(pool.query("select 1"), 4000);
        await ensureSchema();
        console.info("[db] Postgres backend active.");
        return "pg";
      } catch (e) {
        console.warn(`[db] Postgres unavailable (${(e as Error).message?.slice(0, 120)}) — falling back to in-memory store.`);
        return "memory";
      }
    })().then((b) => {
      g.__nxBackend = b;
      return b;
    });
  }
  return g.__nxBackendProbe;
}

export function backendName(): string {
  return g.__nxBackend ?? "pending";
}

/* ------------------------------------------------------------------ pg impl */

const mapUser = (u: typeof users.$inferSelect): UserRow => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  photoUrl: u.photoUrl,
  locale: u.locale,
  plan: u.plan,
  planExpiresAt: u.planExpiresAt,
  creditsUsed: u.creditsUsed,
  usageDay: u.usageDay,
  meterUsedMs: u.meterUsedMs,
  totalRuns: u.totalRuns,
  provider: u.provider,
  passwordHash: u.passwordHash,
  emailVerified: u.emailVerified,
  loginCount: u.loginCount,
  lastLoginAt: u.lastLoginAt,
  phone: u.phone,
  country: u.country,
  failedAttempts: u.failedAttempts,
  lockedUntil: u.lockedUntil,
  termsAt: u.termsAt,
  trialEndsAt: u.trialEndsAt,
  createdAt: u.createdAt,
  lastSeenAt: u.lastSeenAt,
});

const mapConv = (c: Conversation): ConversationRow => ({
  id: c.id,
  userId: c.userId,
  title: c.title,
  model: c.model,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const mapMsg = (m: Message): MessageRow => ({
  id: m.id,
  conversationId: m.conversationId,
  role: m.role,
  content: m.content,
  model: m.model,
  createdAt: m.createdAt,
});

const pg = {
  async getUser(uid: string): Promise<UserRow | null> {
    const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    return row ? mapUser(row) : null;
  },

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const norm = email.trim().toLowerCase();
    const [row] = await db.select().from(users).where(sql`lower(${users.email}) = ${norm}`).limit(1);
    return row ? mapUser(row) : null;
  },

  async upsertUser(v: { uid: string; email?: string; name?: string; picture?: string; provider?: string }): Promise<UserRow> {
    const existing = await this.getUser(v.uid);
    if (existing) {
      await db
        .update(users)
        .set({ lastSeenAt: new Date(), email: v.email ?? existing.email, displayName: v.name ?? existing.displayName, photoUrl: v.picture ?? existing.photoUrl })
        .where(eq(users.id, existing.id))
        .execute()
        .catch(() => undefined);
      return { ...existing, email: v.email ?? existing.email };
    }
    const created = await db
      .insert(users)
      .values({
        id: v.uid,
        email: v.email ?? "",
        displayName: v.name ?? null,
        photoUrl: v.picture ?? null,
        provider: v.provider ?? "password",
        emailVerified: false,
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .onConflictDoNothing()
      .returning();
    if (created[0]) return mapUser(created[0]);
    const row = await this.getUser(v.uid);
    if (!row) throw new Error("Failed to create user");
    return row;
  },

  async createUser(values: {
    uid: string;
    email: string;
    name: string;
    phone: string | null;
    country: string | null;
    termsAt: Date;
    passwordHash: string;
  }): Promise<UserRow> {
    const [row] = await db
      .insert(users)
      .values({
        id: values.uid,
        email: values.email,
        displayName: values.name,
        phone: values.phone,
        country: values.country,
        termsAt: values.termsAt,
        provider: "password",
        passwordHash: values.passwordHash,
        emailVerified: false,
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new Error("email_exists");
    return mapUser(row);
  },

  async updateProfile(uid: string, patch: { displayName?: string | null; phone?: string | null; country?: string | null }): Promise<UserRow | null> {
    const [row] = await db.update(users).set(patch).where(eq(users.id, uid)).returning();
    return row ? mapUser(row) : null;
  },

  async recordLoginFailure(uid: string): Promise<void> {
    const u = await this.getUser(uid);
    if (!u) return;
    const attempts = u.failedAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
    await db.update(users).set({ failedAttempts: attempts, lockedUntil }).where(eq(users.id, uid));
  },

  async recordLoginSuccess(uid: string): Promise<void> {
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null, loginCount: sql`${users.loginCount} + 1`, lastLoginAt: new Date() })
      .where(eq(users.id, uid));
  },

  async setPlan(uid: string, plan: string, expiresAt: Date): Promise<void> {
    await db.update(users).set({ plan, planExpiresAt: expiresAt }).where(eq(users.id, uid));
  },

  async listConversations(uid: string): Promise<ConversationRow[]> {
    const rows = await db.select().from(conversations).where(eq(conversations.userId, uid)).orderBy(desc(conversations.updatedAt)).limit(100);
    return rows.map(mapConv);
  },

  async getConversation(uid: string, id: string): Promise<ConversationRow | null> {
    const [row] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, uid))).limit(1);
    return row ? mapConv(row) : null;
  },

  async createConversation(uid: string, title: string, model: string): Promise<ConversationRow> {
    const [row] = await db.insert(conversations).values({ userId: uid, title, model }).returning();
    return mapConv(row);
  },

  async renameConversation(uid: string, id: string, title: string): Promise<ConversationRow | null> {
    const [row] = await db.update(conversations).set({ title }).where(and(eq(conversations.id, id), eq(conversations.userId, uid))).returning();
    return row ? mapConv(row) : null;
  },

  async deleteConversation(uid: string, id: string): Promise<void> {
    await db.delete(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, uid)));
  },

  async deleteAllConversations(uid: string): Promise<number> {
    const res = await db.delete(conversations).where(eq(conversations.userId, uid)).returning({ id: conversations.id });
    return res.length;
  },

  async recentMessages(convId: string, n: number): Promise<MessageRow[]> {
    const rows = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(desc(messages.createdAt)).limit(n);
    return rows.reverse().map(mapMsg);
  },

  async listMessages(convId: string): Promise<MessageRow[]> {
    const rows = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(asc(messages.createdAt));
    return rows.map(mapMsg);
  },

  async appendMessage(convId: string, m: { role: "user" | "assistant"; content: string; model: string | null }): Promise<MessageRow> {
    const [row] = await db.insert(messages).values({ conversationId: convId, role: m.role, content: m.content, model: m.model }).returning();
    return mapMsg(row);
  },

  async touchConversation(convId: string): Promise<void> {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
  },

  async createSession(s: { userId: string; tokenHash: string; ip: string | null; userAgent: string | null; days: number }): Promise<void> {
    await db
      .insert(sessions)
      .values({
        userId: s.userId,
        tokenHash: s.tokenHash,
        ip: s.ip,
        userAgent: s.userAgent,
        expiresAt: new Date(Date.now() + s.days * 86_400_000),
      })
      .onConflictDoNothing();
  },

  async verifySession(tokenHash: string): Promise<UserRow | null> {
    const [row] = await db
      .select({ user: users, exp: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), sql`${sessions.expiresAt} > now()`))
      .limit(1);
    return row ? mapUser(row.user) : null;
  },

  async revokeSession(tokenHash: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  },

  async ensurePromo(code: string, values: { plan: string; days: number; maxUses: number }): Promise<void> {
    await db.insert(promoCodes).values({ code, plan: values.plan, days: values.days, maxUses: values.maxUses }).onConflictDoNothing();
  },

  async claimPromo(code: string): Promise<boolean> {
    const claimed = await db
      .update(promoCodes)
      .set({ used: sql`${promoCodes.used} + 1`, active: false })
      .where(and(eq(promoCodes.code, code), eq(promoCodes.active, true), sql`${promoCodes.used} < ${promoCodes.maxUses}`))
      .returning({ code: promoCodes.code });
    return claimed.length > 0;
  },

  async releasePromo(code: string): Promise<void> {
    await db
      .update(promoCodes)
      .set({ used: sql`${promoCodes.used} - 1`, active: true })
      .where(and(eq(promoCodes.code, code), sql`${promoCodes.used} > 0`))
      .catch(() => undefined);
  },

  async listPromos(limit: number): Promise<PromoRow[]> {
    const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)).limit(limit);
    return rows;
  },

  async logOrder(userId: string, ref: string): Promise<void> {
    await db
      .insert(orders)
      .values({ userId, plan: "pro", period: "monthly", amountDzd: 0, status: "paid", provider: "promo", providerRef: ref })
      .catch(() => undefined);
  },
};

/* --------------------------------------------------------------- memory impl */

type MemUser = UserRow;
type MemSession = { userId: string; tokenHash: string; expiresAt: Date };
type MemPromo = PromoRow;

const mem = {
  users: new Map<string, MemUser>(),
  emailIndex: new Map<string, string>(),
  convs: new Map<string, ConversationRow>(),
  msgs: new Map<string, MessageRow[]>(),
  sessions: new Map<string, MemSession>(),
  promos: new Map<string, MemPromo>(),

  uid: () => crypto.randomUUID(),

  indexEmail(email: string, uid: string) {
    mem.emailIndex.set(email.toLowerCase(), uid);
  },

  async getUser(uid: string): Promise<UserRow | null> {
    return mem.users.get(uid) ?? null;
  },

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const uid = mem.emailIndex.get(email.trim().toLowerCase());
    return uid ? (mem.users.get(uid) ?? null) : null;
  },

  async upsertUser(v: { uid: string; email?: string; name?: string; picture?: string; provider?: string }): Promise<UserRow> {
    const existing = mem.users.get(v.uid);
    if (existing) {
      if (v.email) {
        if (existing.email) mem.emailIndex.delete(existing.email.toLowerCase());
        existing.email = v.email;
        mem.indexEmail(v.email, v.uid);
      }
      if (v.name) existing.displayName = v.name;
      if (v.picture) existing.photoUrl = v.picture;
      existing.lastSeenAt = new Date();
      return existing;
    }
    const now = new Date();
    const row: MemUser = {
      id: v.uid,
      email: v.email ?? "",
      displayName: v.name ?? null,
      photoUrl: v.picture ?? null,
      locale: "ar",
      plan: "free",
      planExpiresAt: null,
      creditsUsed: 0,
      usageDay: null,
      meterUsedMs: 0,
      totalRuns: 0,
      provider: v.provider ?? "password",
      passwordHash: null,
      emailVerified: false,
      loginCount: 0,
      lastLoginAt: null,
      phone: null,
      country: null,
      failedAttempts: 0,
      lockedUntil: null,
      termsAt: null,
      trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      createdAt: now,
      lastSeenAt: now,
    };
    mem.users.set(v.uid, row);
    if (row.email) mem.indexEmail(row.email, v.uid);
    return row;
  },

  async createUser(values: { uid: string; email: string; name: string; phone: string | null; country: string | null; termsAt: Date; passwordHash: string }): Promise<UserRow> {
    if (await mem.getUserByEmail(values.email)) throw new Error("email_exists");
    const now = new Date();
    const row: MemUser = {
      id: values.uid,
      email: values.email,
      displayName: values.name,
      photoUrl: null,
      locale: "ar",
      plan: "free",
      planExpiresAt: null,
      creditsUsed: 0,
      usageDay: null,
      meterUsedMs: 0,
      totalRuns: 0,
      provider: "password",
      passwordHash: values.passwordHash,
      emailVerified: false,
      loginCount: 0,
      lastLoginAt: now,
      phone: values.phone,
      country: values.country,
      failedAttempts: 0,
      lockedUntil: null,
      termsAt: values.termsAt,
      trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      createdAt: now,
      lastSeenAt: now,
    };
    mem.users.set(row.id, row);
    mem.indexEmail(row.email, row.id);
    return row;
  },

  async updateProfile(uid: string, patch: { displayName?: string | null; phone?: string | null; country?: string | null }): Promise<UserRow | null> {
    const row = mem.users.get(uid);
    if (!row) return null;
    if (patch.displayName !== undefined) row.displayName = patch.displayName;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.country !== undefined) row.country = patch.country;
    return row;
  },

  async recordLoginFailure(uid: string): Promise<void> {
    const u = mem.users.get(uid);
    if (!u) return;
    u.failedAttempts += 1;
    u.lockedUntil = u.failedAttempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
  },

  async recordLoginSuccess(uid: string): Promise<void> {
    const u = mem.users.get(uid);
    if (!u) return;
    u.failedAttempts = 0;
    u.lockedUntil = null;
    u.loginCount += 1;
    u.lastLoginAt = new Date();
  },

  async setPlan(uid: string, plan: string, expiresAt: Date): Promise<void> {
    const u = mem.users.get(uid);
    if (u) {
      u.plan = plan;
      u.planExpiresAt = expiresAt;
    }
  },

  async listConversations(uid: string): Promise<ConversationRow[]> {
    return [...mem.convs.values()]
      .filter((c) => c.userId === uid)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 100);
  },

  async getConversation(uid: string, id: string): Promise<ConversationRow | null> {
    const c = mem.convs.get(id);
    return c && c.userId === uid ? c : null;
  },

  async createConversation(uid: string, title: string, model: string): Promise<ConversationRow> {
    const now = new Date();
    const row: ConversationRow = { id: mem.uid(), userId: uid, title, model, createdAt: now, updatedAt: now };
    mem.convs.set(row.id, row);
    mem.msgs.set(row.id, []);
    return row;
  },

  async renameConversation(uid: string, id: string, title: string): Promise<ConversationRow | null> {
    const c = await mem.getConversation(uid, id);
    if (!c) return null;
    c.title = title;
    return c;
  },

  async deleteConversation(uid: string, id: string): Promise<void> {
    const c = await mem.getConversation(uid, id);
    if (!c) return;
    mem.convs.delete(id);
    mem.msgs.delete(id);
  },

  async deleteAllConversations(uid: string): Promise<number> {
    let n = 0;
    for (const [id, c] of mem.convs) {
      if (c.userId === uid) {
        mem.convs.delete(id);
        mem.msgs.delete(id);
        n++;
      }
    }
    return n;
  },

  async recentMessages(convId: string, n: number): Promise<MessageRow[]> {
    const list = mem.msgs.get(convId) ?? [];
    return list.slice(-n);
  },

  async listMessages(convId: string): Promise<MessageRow[]> {
    return [...(mem.msgs.get(convId) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async appendMessage(convId: string, m: { role: "user" | "assistant"; content: string; model: string | null }): Promise<MessageRow> {
    const row: MessageRow = { id: mem.uid(), conversationId: convId, role: m.role, content: m.content, model: m.model, createdAt: new Date() };
    const list = mem.msgs.get(convId) ?? [];
    list.push(row);
    mem.msgs.set(convId, list);
    return row;
  },

  async touchConversation(convId: string): Promise<void> {
    const c = mem.convs.get(convId);
    if (c) c.updatedAt = new Date();
  },

  async createSession(s: { userId: string; tokenHash: string; ip: string | null; userAgent: string | null; days: number }): Promise<void> {
    mem.sessions.set(s.tokenHash, { userId: s.userId, tokenHash: s.tokenHash, expiresAt: new Date(Date.now() + s.days * 86_400_000) });
  },

  async verifySession(tokenHash: string): Promise<UserRow | null> {
    const s = mem.sessions.get(tokenHash);
    if (!s) return null;
    if (s.expiresAt.getTime() < Date.now()) {
      mem.sessions.delete(tokenHash);
      return null;
    }
    return mem.users.get(s.userId) ?? null;
  },

  async revokeSession(tokenHash: string): Promise<void> {
    mem.sessions.delete(tokenHash);
  },

  async ensurePromo(code: string, values: { plan: string; days: number; maxUses: number }): Promise<void> {
    if (!mem.promos.has(code)) {
      mem.promos.set(code, { code, plan: values.plan, days: values.days, maxUses: values.maxUses, used: 0, active: true, createdAt: new Date() });
    }
  },

  async claimPromo(code: string): Promise<boolean> {
    const p = mem.promos.get(code);
    if (!p || !p.active || p.used >= p.maxUses) return false;
    p.used += 1;
    if (p.used >= p.maxUses) p.active = false;
    return true;
  },

  async releasePromo(code: string): Promise<void> {
    const p = mem.promos.get(code);
    if (!p || p.used <= 0) return;
    p.used -= 1;
    if (p.used < p.maxUses) p.active = true;
  },

  async listPromos(limit: number): Promise<PromoRow[]> {
    return [...mem.promos.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  },

  async logOrder(_userId: string, _ref: string): Promise<void> {
    /* bookkeeping only — nothing to persist in memory mode */
  },
};

/* ------------------------------------------------------------------ facade */

type Impl = typeof pg;

async function impl(): Promise<Impl> {
  const b = await resolveBackend();
  return b === "pg" ? pg : mem;
}

export const repo = {
  backend: resolveBackend,

  // users
  upsertUser: (v: { uid: string; email?: string; name?: string; picture?: string; provider?: string }) => impl().then((i) => i.upsertUser(v)),
  getUser: (uid: string) => impl().then((i) => i.getUser(uid)),
  getUserByEmail: (email: string) => impl().then((i) => i.getUserByEmail(email)),
  createUser: (values: { uid: string; email: string; name: string; phone: string | null; country: string | null; termsAt: Date; passwordHash: string }) =>
    impl().then((i) => i.createUser(values)),
  updateProfile: (uid: string, patch: { displayName?: string | null; phone?: string | null; country?: string | null }) =>
    impl().then((i) => i.updateProfile(uid, patch)),
  recordLoginFailure: (uid: string) => impl().then((i) => i.recordLoginFailure(uid)),
  recordLoginSuccess: (uid: string) => impl().then((i) => i.recordLoginSuccess(uid)),
  setPlan: (uid: string, plan: string, expiresAt: Date) => impl().then((i) => i.setPlan(uid, plan, expiresAt)),

  // conversations & messages
  listConversations: (uid: string) => impl().then((i) => i.listConversations(uid)),
  getConversation: (uid: string, id: string) => impl().then((i) => i.getConversation(uid, id)),
  createConversation: (uid: string, title: string, model: string) => impl().then((i) => i.createConversation(uid, title, model)),
  renameConversation: (uid: string, id: string, title: string) => impl().then((i) => i.renameConversation(uid, id, title)),
  deleteConversation: (uid: string, id: string) => impl().then((i) => i.deleteConversation(uid, id)),
  deleteAllConversations: (uid: string) => impl().then((i) => i.deleteAllConversations(uid)),
  recentMessages: (convId: string, n: number) => impl().then((i) => i.recentMessages(convId, n)),
  listMessages: (convId: string) => impl().then((i) => i.listMessages(convId)),
  appendMessage: (convId: string, m: { role: "user" | "assistant"; content: string; model: string | null }) =>
    impl().then((i) => i.appendMessage(convId, m)),
  touchConversation: (convId: string) => impl().then((i) => i.touchConversation(convId)),

  // sessions
  createSession: (s: { userId: string; tokenHash: string; ip: string | null; userAgent: string | null; days: number }) =>
    impl().then((i) => i.createSession(s)),
  verifySession: (tokenHash: string) => impl().then((i) => i.verifySession(tokenHash)),
  revokeSession: (tokenHash: string) => impl().then((i) => i.revokeSession(tokenHash)),

  // promos
  ensurePromo: (code: string, values: { plan: string; days: number; maxUses: number }) => impl().then((i) => i.ensurePromo(code, values)),
  claimPromo: (code: string) => impl().then((i) => i.claimPromo(code)),
  releasePromo: (code: string) => impl().then((i) => i.releasePromo(code)),
  listPromos: (limit: number) => impl().then((i) => i.listPromos(limit)),
  logOrder: (userId: string, ref: string) => impl().then((i) => i.logOrder(userId, ref)),
};
