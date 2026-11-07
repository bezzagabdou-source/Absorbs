import { inArray, and, asc, desc, eq, gt, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { categories, products, users, wilayas } from "@/db/schema";
import { withActor, type DbContext } from "@/db";
import type { ListingFilters } from "@/lib/validation/schemas";
import { idSchema } from "@/lib/validation/schemas";
import type { MarketProduct, ReferenceData, ListingPage } from "@/lib/marketplace-data";
import { AppError } from "@/lib/server/errors";

const selection = {
  id: products.id, sellerId: products.sellerId, title: products.title, description: products.description,
  categoryId: products.categoryId, categoryNameAr: categories.nameAr, categoryNameEn: categories.nameEn, categoryNameFr: categories.nameFr, categorySlug: categories.slug,
  priceDzd: products.priceDzd, condition: products.condition, wilayaCode: wilayas.code,
  wilayaAr: wilayas.nameAr, wilayaEn: wilayas.nameEn, wilayaFr: wilayas.nameFr,
  commune: products.commune, images: products.images, delivery: products.deliveryAvailable, escrow: products.escrowEligible,
  sellerName: users.displayName, trustTier: users.trustTier, postedAt: products.createdAt, viewCount: products.viewCount,
};
type Row = { id: string; sellerId: string; title: string; description: string; categoryId: string | null; categoryNameAr: string | null; categoryNameEn: string | null; categoryNameFr: string | null; categorySlug: string | null; priceDzd: string; condition: MarketProduct["condition"]; wilayaCode: string | null; wilayaAr: string | null; wilayaEn: string | null; wilayaFr: string | null; commune: string | null; images: string[]; delivery: boolean; escrow: boolean; sellerName: string | null; trustTier: string | null; postedAt: Date; viewCount: number };
export function mapProduct(row: Row): MarketProduct {
  const tier = row.trustTier === "tier_3" ? 3 : row.trustTier === "tier_2" ? 2 : row.trustTier === "tier_1" ? 1 : 0;
  return { id: row.id, sellerId: row.sellerId, title: row.title, description: row.description, categoryId: row.categoryId,
    category: row.categoryNameAr ? { ar: row.categoryNameAr, en: row.categoryNameEn!, fr: row.categoryNameFr! } : null, categorySlug: row.categorySlug,
    price: Number(row.priceDzd), condition: row.condition, wilayaCode: row.wilayaCode,
    wilaya: row.wilayaAr ? { ar: row.wilayaAr, en: row.wilayaEn!, fr: row.wilayaFr! } : null,
    commune: row.commune ?? "", images: row.images, image: row.images[0] ?? "", sellerName: row.sellerName ?? "", sellerVerified: tier >= 2, trustTier: tier,
    delivery: row.delivery, escrow: row.escrow, postedAt: row.postedAt.toISOString(), viewCount: row.viewCount };
}
function baseQuery(db: DbContext) { return db.select(selection).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).leftJoin(wilayas, eq(products.wilayaId, wilayas.id)).leftJoin(users, eq(products.sellerId, users.id)); }
export function normalizeSearch(value: string) { return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLocaleLowerCase().trim(); }
function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
function predicates(filters: ListingFilters): SQL[] {
  const conditions: SQL[] = [eq(products.status, "active")];
  if (filters.q) {
    const query = normalizeSearch(filters.q);
    const terms = query.split(/\s+/).slice(0, 12).flatMap((term) => [sql`${products.searchVector} @@ plainto_tsquery('simple', ${term})`, ilike(products.title, `%${escapeLike(term)}%`), ilike(products.commune, `%${escapeLike(term)}%`), ilike(categories.nameAr, `%${escapeLike(term)}%`), ilike(categories.nameEn, `%${escapeLike(term)}%`), ilike(categories.nameFr, `%${escapeLike(term)}%`), ilike(wilayas.nameAr, `%${escapeLike(term)}%`), ilike(wilayas.nameEn, `%${escapeLike(term)}%`)]);
    conditions.push(or(...terms)!);
  }
  if (filters.ids) conditions.push(inArray(products.id, filters.ids));
  if (filters.wilaya) conditions.push(eq(wilayas.code, filters.wilaya));
  if (filters.category) conditions.push(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filters.category) ? eq(categories.id, filters.category) : eq(categories.slug, filters.category));
  if (filters.condition) conditions.push(eq(products.condition, filters.condition));
  if (filters.minPrice !== undefined) conditions.push(gte(products.priceDzd, String(filters.minPrice)));
  if (filters.maxPrice !== undefined) conditions.push(lte(products.priceDzd, String(filters.maxPrice)));
  if (filters.delivery !== undefined) conditions.push(eq(products.deliveryAvailable, filters.delivery));
  if (filters.escrow !== undefined) conditions.push(eq(products.escrowEligible, filters.escrow));
  return conditions;
}
function decodeCursor(cursor: string, sort: string): { value: string; id: string } {
  try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); const parsed = idSchema.parse({ id: value.id }); if (typeof value.value !== "string" || value.sort !== sort || (sort.startsWith("price") && !Number.isFinite(Number(value.value))) || (sort === "newest" && !Number.isFinite(Date.parse(value.value)))) throw new Error(); return { id: parsed.id, value: value.value }; } catch { throw new AppError("invalid_input", 400, { cursor: ["invalid_cursor"] }); }
}
export async function searchListings(filters: ListingFilters): Promise<ListingPage> {
  return withActor(null, async (db) => {
    const conditions = predicates(filters);
    const sort = filters.sort === "relevance" ? "newest" : filters.sort;
    const column = sort.startsWith("price") ? products.priceDzd : products.createdAt;
    const ascending = sort === "price_asc";
    if (filters.cursor) { const cursor = decodeCursor(filters.cursor, sort); conditions.push(ascending ? or(gt(column, cursor.value), and(eq(column, cursor.value), gt(products.id, cursor.id)))! : sql`(${column}, ${products.id}) < (${cursor.value}, ${cursor.id}::uuid)`); }
    const order = [ascending ? asc(column) : desc(column), asc(products.id)];
    const [rows, countRows] = await Promise.all([
      baseQuery(db).where(and(...conditions)).orderBy(...order).limit(filters.limit + 1),
      db.select({ total: sql<number>`count(*)::int` }).from(products).leftJoin(categories, eq(products.categoryId, categories.id)).leftJoin(wilayas, eq(products.wilayaId, wilayas.id)).where(and(...conditions)),
    ]);
    const page = rows.slice(0, filters.limit); const last = page.at(-1);
    const nextCursor = rows.length > filters.limit && last ? Buffer.from(JSON.stringify({ value: sort.startsWith("price") ? last.priceDzd : last.postedAt.toISOString(), id: last.id, sort })).toString("base64url") : null;
    return { items: page.map((row) => mapProduct(row as Row)), total: countRows[0]?.total ?? 0, nextCursor, source: "database" };
  });
}
export async function getProduct(id: string): Promise<MarketProduct | null> {
  if (!idSchema.safeParse({ id }).success) return null;
  return withActor(null, async (db) => { const [row] = await baseQuery(db).where(and(eq(products.id, id), eq(products.status, "active"))).limit(1); return row ? mapProduct(row as Row) : null; });
}
export async function getReferenceData(): Promise<ReferenceData> {
  return withActor(null, async (db) => {
    const [categoryRows, wilayaRows] = await Promise.all([
      db.select({ id: categories.id, slug: categories.slug, ar: categories.nameAr, en: categories.nameEn, fr: categories.nameFr, icon: categories.icon, count: sql<number>`count(${products.id}) filter (where ${products.status} = 'active')::int` }).from(categories).leftJoin(products, eq(products.categoryId, categories.id)).where(eq(categories.active, true)).groupBy(categories.id).orderBy(asc(categories.sortOrder)),
      db.select({ id: wilayas.id, code: wilayas.code, ar: wilayas.nameAr, en: wilayas.nameEn, fr: wilayas.nameFr }).from(wilayas).where(eq(wilayas.active, true)).orderBy(asc(wilayas.code)),
    ]);
    return { categories: categoryRows.map((row) => ({ id: row.id, slug: row.slug, name: { ar: row.ar, en: row.en, fr: row.fr }, icon: row.icon ?? "grid", count: row.count })), wilayas: wilayaRows.map((row) => ({ id: row.id, code: row.code, name: { ar: row.ar, en: row.en, fr: row.fr } })) };
  });
}
export async function recordProductView(id: string): Promise<void> { const { getDb } = await import("@/db"); const { sql } = await import("drizzle-orm"); await getDb().execute(sql`select record_product_view(${id}::uuid)`); }
