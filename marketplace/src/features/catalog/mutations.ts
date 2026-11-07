import { and, eq, inArray } from "drizzle-orm";
import { products, categories, wilayas, priceHistory, media } from "@/db/schema";
import { withActor, type Transaction } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import type { z } from "zod";
import { listingInputSchema, listingUpdateSchema } from "@/lib/validation/schemas";
import { AppError, assertFound } from "@/lib/server/errors";
import { isUploadedMediaUrl } from "@/lib/server/media";

async function assertOwnUploads(tx: Transaction, actor: SessionUser, images: string[] | undefined) {
  if (!images?.length) return;
  const ids = [...new Set(images.filter(isUploadedMediaUrl).map((value) => value.slice("/api/media/".length)))];
  if (!ids.length) return;
  const owned = await tx.select({ id: media.id }).from(media).where(and(inArray(media.id, ids), eq(media.ownerId, actor.id)));
  if (owned.length !== ids.length) throw new AppError("invalid_input", 400, { images: ["media_owner"] });
}

export async function createListing(actor: SessionUser, input: z.infer<typeof listingInputSchema>) {
  return withActor(actor, async (tx) => {
    await assertOwnUploads(tx, actor, input.images);
    const [category] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.active, true)));
    const [wilaya] = await tx.select({ id: wilayas.id }).from(wilayas).where(and(eq(wilayas.code, input.wilayaCode), eq(wilayas.active, true)));
    if (!category || !wilaya) throw new AppError("invalid_input", 400);
    const { wilayaCode: _code, costDzd, ...rest } = input; void _code;
    const [product] = await tx.insert(products).values({ ...rest, costDzd: costDzd?.toFixed(2), sellerId: actor.id, priceDzd: input.priceDzd.toFixed(2), wilayaId: wilaya.id, status: "active", escrowEligible: false }).returning({ id: products.id });
    await tx.insert(priceHistory).values({ productId: product.id, priceDzd: input.priceDzd.toFixed(2) });
    return product;
  });
}
export async function updateListing(actor: SessionUser, id: string, input: z.infer<typeof listingUpdateSchema>) {
  return withActor(actor, async (tx) => {
    const [owned] = await tx.select().from(products).where(and(eq(products.id, id), eq(products.sellerId, actor.id))).for("update");
    assertFound(owned, "listing_owner");
    await assertOwnUploads(tx, actor, input.images);
    const { wilayaCode, priceDzd, costDzd, ...rest } = input;
    let wilayaId: string | undefined;
    if (wilayaCode) { const [w] = await tx.select().from(wilayas).where(eq(wilayas.code, wilayaCode)); assertFound(w); wilayaId = w.id; }
    if (input.categoryId) { const [c] = await tx.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.active, true))); assertFound(c); }
    const [updated] = await tx.update(products).set({ ...rest, ...(wilayaId ? { wilayaId } : {}), ...(priceDzd !== undefined ? { priceDzd: priceDzd.toFixed(2) } : {}), ...(costDzd !== undefined ? { costDzd: costDzd.toFixed(2) } : {}), updatedAt: new Date() }).where(eq(products.id, id)).returning({ id: products.id });
    if (priceDzd !== undefined && Number(owned.priceDzd) !== priceDzd) await tx.insert(priceHistory).values({ productId: id, priceDzd: priceDzd.toFixed(2) });
    return updated;
  });
}
export async function vendorListings(actor: SessionUser) {
  return withActor(actor, (tx) => tx.select({ id: products.id, title: products.title, price: products.priceDzd, status: products.status, images: products.images, views: products.viewCount, categoryId: products.categoryId, wilayaCode: wilayas.code, commune: products.commune, description: products.description, condition: products.condition, costDzd: products.costDzd, deliveryAvailable: products.deliveryAvailable }).from(products).leftJoin(wilayas, eq(products.wilayaId, wilayas.id)).where(eq(products.sellerId, actor.id)).orderBy(products.createdAt));
}
