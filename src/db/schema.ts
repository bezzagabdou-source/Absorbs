import {
  pgSchema,
  text,
  timestamp,
  integer,
  uuid,
  boolean,
  bigint,
  index,
  uniqueIndex,
  jsonb,
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
  /** 7-day free trial: every model and feature is unlocked until this moment */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
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

/** Game saves (one row per user + game + slot). The generated game's src/save.js talks to /api/saves. */
export const gameSaves = barq.table(
  "game_saves",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    slot: text("slot").notNull().default("auto"),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("game_saves_uq").on(t.userId, t.game, t.slot)]
);

/* ═══════════════════════════════════════════════════════════════════════════
 * v17 — SMITH (instant game factory) + MASTERY (XP / badges)
 * Three new subsystems, three new tables (+ one analytics table):
 *   smith_games    the game vault: every game a user builds (instant SMITH kit
 *                  or AI-generated), with a shareable slug and publish state
 *   smith_scores   one row per finished run → real leaderboards per game
 *   mastery_profiles XP / level / streak / unlocked badges (the rewards layer)
 *   mind_events    what the understanding engine read, for the Titan dashboard
 * Keep src/db/ensure-schema.ts in sync — that DDL is what creates them live.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const smithGames = barq.table(
  "smith_games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** public short id used in /app/smith/play/[slug] */
    slug: text("slug").notNull(),
    title: text("title").notNull().default(""),
    /** which factory blueprint built it: runner · breaker · snake · shooter · climber · maze · merge · memory · quiz */
    blueprint: text("blueprint").notNull(),
    theme: text("theme").notNull().default("neon"),
    /** "smith" = instant parametric kit · "ai" = model-generated single file */
    engine: text("engine").notNull().default("smith"),
    /** the exact knobs the player chose, so a game can be re-built or remixed */
    config: jsonb("config").notNull().default({}),
    html: text("html").notNull(),
    /** private (owner only) · unlisted (anyone with the link) · public (in the arena) */
    visibility: text("visibility").notNull().default("private"),
    plays: integer("plays").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    bestScore: integer("best_score").notNull().default(0),
    bytes: integer("bytes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("smith_games_slug_uq").on(t.slug),
    index("smith_games_user_idx").on(t.userId, t.updatedAt),
    index("smith_games_public_idx").on(t.visibility, t.plays),
  ]
);

export const smithScores = barq.table(
  "smith_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => smithGames.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    level: integer("level").notNull().default(1),
    durationMs: integer("duration_ms").notNull().default(0),
    /** player name shown on the board (never the email) */
    handle: text("handle").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("smith_scores_board_idx").on(t.gameId, t.score),
    index("smith_scores_user_idx").on(t.userId, t.createdAt),
  ]
);

/** Rewards layer: XP, level, streak and unlocked badges — one row per user. */
export const masteryProfiles = barq.table(
  "mastery_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    gamesBuilt: integer("games_built").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    runsSubmitted: integer("runs_submitted").notNull().default(0),
    mindReads: integer("mind_reads").notNull().default(0),
    bestScore: integer("best_score").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    /** YYYY-MM-DD (Africa/Algiers) of the last XP award — drives the streak */
    lastActiveDay: text("last_active_day"),
    /** [{ id, at }] — every badge the user unlocked, in order */
    badges: jsonb("badges").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("mastery_xp_idx").on(t.xp)]
);

/** Understanding-engine telemetry: what NEXUS MIND saw, and how sure it was. */
export const mindEvents = barq.table(
  "mind_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** mind · smith · mastery · tool */
    kind: text("kind").notNull().default("mind"),
    intent: text("intent").notNull().default(""),
    lang: text("lang").notNull().default(""),
    /** 0-100 */
    confidence: integer("confidence").notNull().default(0),
    ms: integer("ms").notNull().default(0),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("mind_user_idx").on(t.userId, t.createdAt),
    index("mind_kind_idx").on(t.kind, t.createdAt),
  ]
);

export type SmithGame = typeof smithGames.$inferSelect;
export type SmithScore = typeof smithScores.$inferSelect;
export type TitanProfile = typeof masteryProfiles.$inferSelect;
