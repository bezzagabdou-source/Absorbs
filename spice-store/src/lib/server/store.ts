import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, settings, visitorStats } from "@/db/schema";
import { initialCategories, initialProduct } from "@/lib/catalog";
import { initialAdminPassword, hashPassword } from "@/lib/server/auth";
import type { AdminData, StoreData } from "@/lib/types";

let initialization: Promise<void> | undefined;

export function todayInAlgeria() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function ensureStore() {
  if (!initialization) {
    initialization = db.transaction(async (tx) => {
      // Prevent duplicate first-run seeds even when multiple server workers start together.
      await tx.execute(sql`select pg_advisory_xact_lock(76203155)`);
      await tx.execute(sql`
CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text DEFAULT '/images/herbs.png' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL REFERENCES "categories"("id"),
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"image" text DEFAULT '/images/herbs.png' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);

CREATE TABLE IF NOT EXISTS "store_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"store_name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"delivery_message" text NOT NULL,
	"currency" text NOT NULL,
	"password_hash" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "visitor_stats" (
	"id" integer PRIMARY KEY NOT NULL,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"today_visits" integer DEFAULT 0 NOT NULL,
	"last_visit_date" text DEFAULT '' NOT NULL
);
      `);
      const [existing] = await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).limit(1);
      if (!existing) {
        await tx.insert(settings).values({
          id: 1, storeName: "توابل الأصيل", whatsapp: "0799902001",
          deliveryMessage: "التوصيل غير متوفر حالياً", currency: "دج",
          passwordHash: hashPassword(initialAdminPassword()),
        });
        for (let index = 0; index < initialCategories.length; index++) {
          const category = initialCategories[index];
          const [inserted] = await tx.insert(categories).values({
            name: category.name, image: category.image, sortOrder: index,
          }).returning({ id: categories.id });
          await tx.insert(products).values(category.items.map((name) => ({
            ...initialProduct(name, index, category.image), categoryId: inserted.id,
          })));
        }
      }
      await tx.insert(visitorStats).values({ id: 1, totalVisits: 0, todayVisits: 0, lastVisitDate: todayInAlgeria() }).onConflictDoNothing();
    }).catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export async function getStoreData(): Promise<StoreData> {
  await ensureStore();
  const [allCategories, allProducts, [store]] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)),
    db.select().from(products).orderBy(asc(products.sortOrder), asc(products.id)),
    db.select({ storeName: settings.storeName, whatsapp: settings.whatsapp, deliveryMessage: settings.deliveryMessage, currency: settings.currency })
      .from(settings).where(eq(settings.id, 1)).limit(1),
  ]);
  return { categories: allCategories, products: allProducts, settings: store };
}

export async function getAdminData(): Promise<AdminData> {
  await ensureStore();
  const [store, [stats]] = await Promise.all([
    getStoreData(), db.select().from(visitorStats).where(eq(visitorStats.id, 1)).limit(1),
  ]);
  return {
    ...store,
    stats: { totalVisits: stats?.totalVisits ?? 0, todayVisits: stats?.lastVisitDate === todayInAlgeria() ? stats.todayVisits : 0 },
  };
}

export async function recordVisit() {
  await ensureStore();
  const today = todayInAlgeria();
  await db.update(visitorStats).set({
    totalVisits: sql`${visitorStats.totalVisits} + 1`,
    todayVisits: sql`case when ${visitorStats.lastVisitDate} = ${today} then ${visitorStats.todayVisits} + 1 else 1 end`,
    lastVisitDate: today,
  }).where(eq(visitorStats.id, 1));
}
