import {
  pgSchema,
  text,
  timestamp,
  integer,
  uuid,
  boolean,
  bigint,
  index,
} from "drizzle-orm/pg-core";

/** Dedicated Postgres schema: Nexus AI v8.4 never touches tables of other apps sharing this database. */
export const barq = pgSchema("barq");

/** Firebase-authenticated users (id = Firebase uid) */
export const users = barq.table("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  photoUrl: text("photo_url"),
  locale: text("locale").notNull().default("ar"),
  plan: text("plan").notNull().default("free"), // free | pro
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  creditsUsed: integer("credits_used").notNull().default(0),
  usageDay: text("usage_day"), // YYYY-MM-DD (Africa/Algiers)
  meterUsedMs: bigint("meter_used_ms", { mode: "number" }).notNull().default(0),
  meterResetAt: timestamp("meter_reset_at", { withTimezone: true }),
  meterLastAt: timestamp("meter_last_at", { withTimezone: true }),
  totalRuns: integer("total_runs").notNull().default(0),
  provider: text("provider").notNull().default("password"), // password | google
  emailVerified: boolean("email_verified").notNull().default(false),
  loginCount: integer("login_count").notNull().default(0),
  prefTier: text("pref_tier").notNull().default("v6"), // v4 | v5 | v6
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const conversations = barq.table(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("conv_user_idx").on(t.userId, t.updatedAt)]
);

export const messages = barq.table(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt)]
);

export const toolRuns = barq.table(
  "tool_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    title: text("title").notNull().default(""),
    input: text("input").notNull(),
    output: text("output").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("runs_user_idx").on(t.userId, t.createdAt)]
);

export const orders = barq.table(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("pro"),
    period: text("period").notNull().default("monthly"), // monthly | yearly
    amountDzd: integer("amount_dzd").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | failed
    provider: text("provider").notNull().default("chargily"),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("orders_user_idx").on(t.userId)]
);

export const promoCodes = barq.table("promo_codes", {
  code: text("code").primaryKey(),
  plan: text("plan").notNull().default("pro"),
  days: integer("days").notNull().default(30),
  maxUses: integer("max_uses").notNull().default(100),
  used: integer("used").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Long-term memory: facts the AI keeps about the user across every conversation. */
export const aiMemories = barq.table(
  "ai_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source").notNull().default("user"), // user | auto
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("mem_user_idx").on(t.userId, t.createdAt)]
);

/** Saved creations (games / sites / designs) — replaces the old localStorage gallery. */
export const projects = barq.table(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    html: text("html").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("proj_user_idx").on(t.userId, t.updatedAt)]
);

/** Security trail: every real sign-in / sign-up. */
export const loginEvents = barq.table(
  "login_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("login"), // signup | login
    provider: text("provider").notNull().default("password"),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("login_user_idx").on(t.userId, t.createdAt)]
);

export type DbUser = typeof users.$inferSelect;
