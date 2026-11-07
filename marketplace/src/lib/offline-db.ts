import Dexie, { type Table } from "dexie";
import { z } from "zod";
import type { MarketProduct } from "./marketplace-data";
type CachedListing = { id: string; updatedAt: number; data: MarketProduct };
class DzOfflineDatabase extends Dexie { listings!: Table<CachedListing, string>; constructor() { super("dz-exchange-offline"); this.version(3).stores({ listings: "id, updatedAt", outbox: null }); } }
let instance: DzOfflineDatabase | undefined;
function database() { return instance ??= new DzOfflineDatabase(); }
const localized = z.object({ ar: z.string(), en: z.string(), fr: z.string() });
const productSchema = z.object({ id: z.uuid(), sellerId: z.uuid(), title: z.string(), description: z.string(), categoryId: z.string().nullable(), category: localized.nullable(), categorySlug: z.string().nullable(), price: z.number(), condition: z.enum(["new", "like_new", "good", "fair", "for_parts"]), wilayaCode: z.string().nullable(), wilaya: localized.nullable(), commune: z.string(), image: z.string(), images: z.array(z.string()), sellerName: z.string(), sellerVerified: z.boolean(), trustTier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), delivery: z.boolean(), escrow: z.boolean(), postedAt: z.string(), viewCount: z.number() });
export async function cacheListings(items: MarketProduct[]) { const updatedAt = Date.now(); const db = database(); await db.listings.bulkPut(items.map((data) => ({ id: data.id, data, updatedAt }))); const old = await db.listings.orderBy("updatedAt").reverse().offset(96).primaryKeys(); if (old.length) await db.listings.bulkDelete(old); await db.listings.where("updatedAt").below(Date.now() - 86400000).delete(); }
export async function getCachedListings() { const rows = await database().listings.orderBy("updatedAt").reverse().limit(96).toArray(); return rows.flatMap((row) => { const parsed = productSchema.safeParse(row.data); return parsed.success ? [parsed.data] : []; }); }
export async function clearOfflineDatabase() { await database().delete(); instance = undefined; }
