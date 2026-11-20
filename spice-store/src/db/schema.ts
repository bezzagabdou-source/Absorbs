import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Availability } from "@/lib/types";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  image: text("image").notNull().default("/images/herbs.png"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").$type<Availability>().notNull().default("available"),
  image: text("image").notNull().default("/images/herbs.png"),
  sortOrder: integer("sort_order").notNull().default(100),
});

export const settings = pgTable("store_settings", {
  id: integer("id").primaryKey(),
  storeName: text("store_name").notNull(),
  whatsapp: text("whatsapp").notNull(),
  deliveryMessage: text("delivery_message").notNull(),
  currency: text("currency").notNull(),
  passwordHash: text("password_hash").notNull(),
});

export const visitorStats = pgTable("visitor_stats", {
  id: integer("id").primaryKey(),
  totalVisits: integer("total_visits").notNull().default(0),
  todayVisits: integer("today_visits").notNull().default(0),
  lastVisitDate: text("last_visit_date").notNull().default(""),
});

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
