import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { offers, products, users } from "@/db/schema";
import { withActor } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { AppError, assertFound } from "@/lib/server/errors";
import type { z } from "zod";
import type { offerInputSchema, offerUpdateSchema } from "@/lib/validation/schemas";
export async function createOffer(actor: SessionUser, input: z.infer<typeof offerInputSchema>) {
  return withActor(actor, async (tx) => {
    const [existing] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.buyerId, actor.id), eq(offers.requestKey, input.requestKey)));
    if (existing) return { ...existing, replayed: true };
    const [product] = await tx.select({ id: products.id, sellerId: products.sellerId, status: products.status }).from(products).where(eq(products.id, input.productId));
    assertFound(product, "offerUnavailable");
    if (product.status !== "active") throw new AppError("offerUnavailable", 409);
    if (product.sellerId === actor.id) throw new AppError("offerOwnProduct", 400);
    const [created] = await tx.insert(offers).values({ productId: product.id, buyerId: actor.id, sellerId: product.sellerId, amountDzd: input.amountDzd.toFixed(2), message: input.message || null, requestKey: input.requestKey, expiresAt: new Date(Date.now() + 7 * 86400000) }).onConflictDoNothing({ target: [offers.buyerId, offers.requestKey] }).returning({ id: offers.id });
    if (created) return { ...created, replayed: false };
    const [replay] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.buyerId, actor.id), eq(offers.requestKey, input.requestKey)));
    assertFound(replay); return { ...replay, replayed: true };
  });
}
export async function transitionOffer(actor: SessionUser, id: string, input: z.infer<typeof offerUpdateSchema>) {
  return withActor(actor, async (tx) => {
    const [offer] = await tx.select().from(offers).where(eq(offers.id, id)).for("update");
    assertFound(offer);
    const seller = offer.sellerId === actor.id; const buyer = offer.buyerId === actor.id;
    if (offer.status !== "pending" || (offer.expiresAt && offer.expiresAt.getTime() < Date.now()) || (input.status === "withdrawn" ? !buyer : !seller)) throw new AppError("offer_transition", 409);
    const [updated] = await tx.update(offers).set({ status: input.status, counterAmountDzd: input.counterAmountDzd?.toFixed(2), updatedAt: new Date() }).where(eq(offers.id, id)).returning({ id: offers.id, status: offers.status });
    return updated;
  });
}
export async function listOffers(actor: SessionUser) {
  const buyer = alias(users, "buyer");
  return withActor(actor, (tx) => tx.select({ id: offers.id, productId: offers.productId, productTitle: products.title, buyerName: buyer.displayName, amount: offers.amountDzd, counterAmount: offers.counterAmountDzd, message: offers.message, status: offers.status, createdAt: offers.createdAt, incoming: eq(offers.sellerId, actor.id) }).from(offers).innerJoin(products, eq(offers.productId, products.id)).innerJoin(buyer, eq(offers.buyerId, buyer.id)).where(eq(offers.sellerId, actor.id)).orderBy(desc(offers.createdAt)).limit(100).then(async (incoming) => {
    const outgoing = await tx.select({ id: offers.id, productId: offers.productId, productTitle: products.title, buyerName: users.displayName, amount: offers.amountDzd, counterAmount: offers.counterAmountDzd, message: offers.message, status: offers.status, createdAt: offers.createdAt }).from(offers).innerJoin(products, eq(offers.productId, products.id)).innerJoin(users, eq(offers.sellerId, users.id)).where(eq(offers.buyerId, actor.id)).orderBy(desc(offers.createdAt)).limit(100);
    return { incoming: incoming.map((row) => ({ ...row, incoming: true })), outgoing: outgoing.map((row) => ({ ...row, incoming: false })) };
  }));
}
