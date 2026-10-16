import { pgSchema, text, timestamp, uuid, index, integer, boolean, bigint } from "drizzle-orm/pg-core";

/**
 * Same Postgres schema name as Absorbs ("barq"), so if you point DATABASE_URL at the Absorbs
 * database, existing users, Pro plans and already-used activation codes carry over untouched.
 * (ensure-schema.ts only adds the two columns this app needs: conversations.model, messages.model.)
 */
export const barq = pgSchema("barq");

export const users = barq.table("users", {
  id: text("id").primaryKey(), // Firebase uid
  email: text("email").notNull(),
  displayName: text("display_name"),
  photoUrl: text("photo_url"),
  locale: text("locale").notNull().default("ar"),
  plan: text("plan").notNull().default("free"), // free | pro
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  creditsUsed: integer("credits_used").notNull().default(0),
  usageDay: text("usage_day"),
  meterUsedMs: bigint("meter_used_ms", { mode: "number" }).notNull().default(0),
  totalRuns: integer("total_runs").notNull().default(0),
  provider: text("provider").notNull().default("password"),
  /** scrypt hash (`hash:salt`) — local password accounts only, null for OAuth users */
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  loginCount: integer("login_count").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  /** 7-day free trial: every model unlocked until this moment */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** local account profile (sufficient info: full name + phone + country) */
  phone: text("phone"),
  country: text("country"),
  /** brute-force protection: 5 failures ⇒ 15-minute lock */
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  termsAt: timestamp("terms_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = barq.table(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque cookie token — the raw token is never stored */
    tokenHash: text("token_hash").notNull().unique(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const conversations = barq.table(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    model: text("model").notNull().default("nexus-core"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conv_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = barq.table(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt)],
);

export const orders = barq.table(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("pro"),
    period: text("period").notNull().default("monthly"),
    amountDzd: integer("amount_dzd").notNull(),
    status: text("status").notNull().default("pending"),
    provider: text("provider").notNull().default("chargily"),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_user_idx").on(t.userId)],
);

export const promoCodes = barq.table("promo_codes", {
  code: text("code").primaryKey(),
  plan: text("plan").notNull().default("pro"),
  days: integer("days").notNull().default(30),
  maxUses: integer("max_uses").notNull().default(100),
  used: integer("used").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbUser = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
