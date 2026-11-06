import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  check,
  customType,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["buyer", "seller", "admin", "support"]);
export const trustTierEnum = pgEnum("trust_tier", ["unverified", "tier_1", "tier_2", "tier_3"]);
export const productConditionEnum = pgEnum("product_condition", ["new", "like_new", "good", "fair", "for_parts"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "active", "reserved", "sold", "archived"]);
export const escrowStatusEnum = pgEnum("escrow_status", ["payment_pending", "funds_held", "in_transit", "buyer_confirmed", "released", "disputed", "refunded", "cancelled"]);
export const offerStatusEnum = pgEnum("offer_status", ["pending", "accepted", "rejected", "countered", "expired", "withdrawn"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "under_review", "resolved_buyer", "resolved_seller", "closed"]);

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 24 }),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("buyer"),
  trustTier: trustTierEnum("trust_tier").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  locale: varchar("locale", { length: 2 }).notNull().default("fr"),
  preferences: jsonb("preferences").$type<{ offers: boolean; listings: boolean; push: boolean }>().notNull().default(sql`'{"offers":true,"listings":true,"push":false}'::jsonb`),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email),
  uniqueIndex("users_phone_unique").on(table.phone),
]);

export const wilayas = pgTable("wilayas", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 2 }).notNull(),
  nameEn: varchar("name_en", { length: 80 }).notNull(),
  nameFr: varchar("name_fr", { length: 80 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }).notNull(),
  centerLat: numeric("center_lat", { precision: 9, scale: 6 }),
  centerLng: numeric("center_lng", { precision: 9, scale: 6 }),
  active: boolean("active").notNull().default(true),
}, (table) => [uniqueIndex("wilayas_code_unique").on(table.code)]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: uuid("parent_id"),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  nameFr: varchar("name_fr", { length: 100 }).notNull(),
  nameAr: varchar("name_ar", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  icon: varchar("icon", { length: 80 }),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("categories_slug_unique").on(table.slug), index("categories_parent_idx").on(table.parentId)]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  wilayaId: uuid("wilaya_id").references(() => wilayas.id, { onDelete: "set null" }),
  commune: varchar("commune", { length: 120 }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull().default(""),
  priceDzd: numeric("price_dzd", { precision: 14, scale: 2 }).notNull(),
  condition: productConditionEnum("condition").notNull().default("good"),
  status: productStatusEnum("status").notNull().default("active"),
  images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  attributes: jsonb("attributes").$type<Record<string, string | number | boolean>>().notNull().default(sql`'{}'::jsonb`),
  escrowEligible: boolean("escrow_eligible").notNull().default(false),
  deliveryAvailable: boolean("delivery_available").notNull().default(true),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  costDzd: numeric("cost_dzd", { precision: 14, scale: 2 }),
  searchVector: customType<{ data: string }>({ dataType: () => "tsvector" })("search_vector").generatedAlwaysAs(sql`to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(commune,''))`),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("products_status_created_idx").on(table.status, table.createdAt),
  index("products_seller_idx").on(table.sellerId),
  index("products_category_idx").on(table.categoryId),
  index("products_wilaya_idx").on(table.wilayaId),
  index("products_price_idx").on(table.priceDzd),
  index("products_search_gin").using("gin", table.searchVector),
  index("products_title_trgm").using("gin", sql`title gin_trgm_ops`),
  check("products_price_positive", sql`${table.priceDzd} > 0`),
  check("products_cost_nonnegative", sql`${table.costDzd} IS NULL OR ${table.costDzd} >= 0`),
  check("products_images_array", sql`jsonb_typeof(${table.images}) = 'array' AND jsonb_array_length(${table.images}) <= 8`),
]);

export const offers = pgTable("offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestKey: uuid("request_key").notNull().defaultRandom(),
  counterAmountDzd: numeric("counter_amount_dzd", { precision: 14, scale: 2 }),
  amountDzd: numeric("amount_dzd", { precision: 14, scale: 2 }).notNull(),
  message: varchar("message", { length: 500 }),
  status: offerStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("offers_product_status_idx").on(table.productId, table.status), index("offers_buyer_created_idx").on(table.buyerId, table.createdAt),
  index("offers_seller_created_idx").on(table.sellerId, table.createdAt),
  uniqueIndex("offers_idempotency_unique").on(table.buyerId, table.requestKey),
  check("offers_amount_positive", sql`${table.amountDzd} > 0`),
  check("offers_distinct_participants", sql`${table.buyerId} <> ${table.sellerId}`)]);

export const escrowTransactions = pgTable("escrow_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amountDzd: numeric("amount_dzd", { precision: 14, scale: 2 }).notNull(),
  status: escrowStatusEnum("status").notNull().default("payment_pending"),
  paymentProvider: varchar("payment_provider", { length: 60 }),
  providerReference: varchar("provider_reference", { length: 180 }),
  deliveryOtpHash: text("delivery_otp_hash"),
  heldAt: timestamp("held_at", { withTimezone: true, mode: "date" }),
  releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("escrow_buyer_status_idx").on(table.buyerId, table.status), index("escrow_seller_status_idx").on(table.sellerId, table.status)]);

export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  escrowId: uuid("escrow_id").notNull().references(() => escrowTransactions.id, { onDelete: "cascade" }),
  openedBy: uuid("opened_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 100 }).notNull(),
  description: text("description").notNull(),
  evidenceUrls: jsonb("evidence_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  status: disputeStatusEnum("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("disputes_escrow_idx").on(table.escrowId), index("disputes_status_created_idx").on(table.status, table.createdAt)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  updatedAt: updatedAt(),
  createdAt: createdAt(),
}, (table) => [index("conversations_buyer_updated_idx").on(table.buyerId, table.updatedAt), index("conversations_seller_updated_idx").on(table.sellerId, table.updatedAt)]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  messageType: varchar("message_type", { length: 24 }).notNull().default("text"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
}, (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)]);

export const priceHistory = pgTable("price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  priceDzd: numeric("price_dzd", { precision: 14, scale: 2 }).notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => [index("price_history_product_time_idx").on(table.productId, table.capturedAt)]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  userAgent: text("user_agent"),
  locale: varchar("locale", { length: 2 }).notNull().default("fr"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint), index("push_subscriptions_user_idx").on(table.userId)]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Offer = typeof offers.$inferSelect;
export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;

export const sessions = pgTable("sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expiry_idx").on(t.expiresAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 160 }).primaryKey(),
  hits: integer("hits").notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
});

export const productViews = pgTable("product_views", {
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  day: timestamp("day", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [index("product_views_product_day_idx").on(t.productId, t.day)]);

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: varchar("query", { length: 100 }).notNull().default(""),
  wilayaCode: varchar("wilaya_code", { length: 2 }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
  maxPrice: numeric("max_price", { precision: 14, scale: 2 }),
  createdAt: createdAt(),
}, (t) => [index("saved_searches_user_idx").on(t.userId), uniqueIndex("saved_searches_unique").on(t.userId, t.query, t.wilayaCode, t.categoryId, t.maxPrice)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  data: jsonb("data").$type<Record<string, string | number>>().notNull().default(sql`'{}'::jsonb`),
  url: text("url").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt), uniqueIndex("notifications_dedupe_unique").on(t.userId, t.kind, t.subjectId)]);

export const notificationJobs = pgTable("notification_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  notificationId: uuid("notification_id").notNull().unique().references(() => notifications.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: varchar("last_error", { length: 80 }),
}, (t) => [index("notification_jobs_ready_idx").on(t.availableAt, t.lockedAt)]);
