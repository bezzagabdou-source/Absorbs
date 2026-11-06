import { config } from "dotenv"; config({ path: ".env.local", quiet: true }); config({ quiet: true });
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getPool, withActor } from "@/db";
import { users, products, offers, notifications, notificationJobs, pushSubscriptions, conversations, messages } from "@/db/schema";
import { searchListings } from "@/features/catalog/queries";
import { listingFiltersSchema } from "@/lib/validation/schemas";
import { createOffer, transitionOffer } from "@/features/offers/service";
import { getDashboard } from "@/features/dashboard/queries";
import { getMessages, sendMessage } from "@/features/chat/service";
import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
async function main() {
  const admin = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL }); const db = getDb(); const suffix = randomUUID().slice(0, 8); const password = await hashPassword("integration-test-password");
  let ids: string[] = []; let productIds: string[] = []; let checks = 0;
  const check = (name: string) => { checks++; console.log(`✓ ${name}`); };
  try {
    const accounts = await admin.query<{ id: string }>("INSERT INTO users(email,display_name,role,password_hash) VALUES ($1,'Seller A','seller',$4),($2,'Seller B','seller',$4),($3,'Buyer C','buyer',$4) RETURNING id", [`a-${suffix}@test.invalid`, `b-${suffix}@test.invalid`, `c-${suffix}@test.invalid`, password]);
    ids = accounts.rows.map((r) => r.id); const actor = (index: number, role: "seller" | "buyer" = "seller"): SessionUser => ({ id: ids[index], role, displayName: "Test", locale: "fr", emailVerified: false, preferences: { offers: true, listings: true, push: true } });
    const refs = await admin.query("SELECT (SELECT id FROM categories WHERE slug='electronics') AS cat, (SELECT id FROM wilayas WHERE code='16') AS wilaya"); const { cat, wilaya } = refs.rows[0];
    for (const [index, title, price] of [[0, `Integration iPhone ${suffix}`, 1000], [1, `Private camera ${suffix}`, 2000]] as const) { const result = await withActor(actor(index), (tx) => tx.insert(products).values({ sellerId: ids[index], title, description: "Integration test product with a sufficiently long description", categoryId: cat, wilayaId: wilaya, priceDzd: String(price), costDzd: "600", images: ["https://images.example.com/test.jpg"], status: "active" }).returning({ id: products.id })); productIds.push(result[0].id); }
    await withActor(actor(1), (tx) => tx.update(products).set({ status: "archived" }).where(eq(products.id, productIds[1])));
    const roles = await db.execute(sql`select current_user as name, rolsuper, rolbypassrls from pg_roles where rolname=current_user`); assert.equal(roles.rows[0].name, "dz_runtime"); assert.equal(roles.rows[0].rolsuper, false); assert.equal(roles.rows[0].rolbypassrls, false); check("runtime is neither superuser nor BYPASSRLS");
    const forced = await admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('users','products','offers','push_subscriptions','escrow_transactions','notifications')"); assert.ok(forced.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)); check("sensitive tables enable and force RLS");
    await assert.rejects(db.select().from(users), /permission denied|Failed query/); check("runtime cannot read password hashes or private user columns");
    const publicProduct = await withActor(null, (tx) => tx.select().from(products).where(eq(products.id, productIds[0]))); const hidden = await withActor(null, (tx) => tx.select().from(products).where(eq(products.id, productIds[1]))); assert.equal(publicProduct.length, 1); assert.equal(hidden.length, 0); check("anonymous reads active listings only");
    const ownerDraft = await withActor(actor(1), (tx) => tx.select().from(products).where(eq(products.id, productIds[1]))); assert.equal(ownerDraft.length, 1); check("owner can read own archived listing");
    const filters = listingFiltersSchema.parse({ q: `iPhone ${suffix}`, wilaya: "16", category: "electronics", condition: "good", minPrice: "999", maxPrice: "1001", delivery: "true", sort: "price_asc", limit: "1" }); const result = await searchListings(filters); assert.equal(result.total, 1); assert.equal(result.items[0].id, productIds[0]); assert.equal(result.items[0].wilayaCode, "16"); check("all search filters combine server-side before pagination");
    const wrongPlace = await searchListings(listingFiltersSchema.parse({ q: `iPhone ${suffix}`, wilaya: "31" })); assert.equal(wrongPlace.total, 0); check("wilaya filter cannot leak matching titles from other regions");
    const first = await searchListings(listingFiltersSchema.parse({ q: "iPhone", sort: "price_asc", limit: "1" })); assert.ok(first.nextCursor); const second = await searchListings(listingFiltersSchema.parse({ q: "iPhone", sort: "price_asc", limit: "1", cursor: first.nextCursor })); assert.notEqual(first.items[0]?.id, second.items[0]?.id); check("stable cursor advances without duplicates");
    const offerInput = { productId: productIds[0], amountDzd: 900, message: "Test offer", requestKey: randomUUID() }; const offer = await createOffer(actor(2, "buyer"), offerInput); const replay = await createOffer(actor(2, "buyer"), offerInput); assert.equal(offer.id, replay.id); assert.equal(replay.replayed, true); check("offer idempotency prevents duplicate charges/notifications");
    const strangerOffers = await withActor(actor(1), (tx) => tx.select().from(offers).where(eq(offers.id, offer.id))); assert.equal(strangerOffers.length, 0); check("unrelated seller cannot read another seller's offer");
    await assert.rejects(transitionOffer(actor(2, "buyer"), offer.id, { status: "accepted" }), /offer_transition/); check("buyer cannot accept their own offer");
    await assert.rejects(createOffer(actor(0), { ...offerInput, requestKey: randomUUID() }), /offerOwnProduct/); check("seller cannot offer on own listing");
    await transitionOffer(actor(0), offer.id, { status: "countered", counterAmountDzd: 950 }); await assert.rejects(transitionOffer(actor(0), offer.id, { status: "accepted" }), /offer_transition/); check("offer state machine rejects repeated transitions");
    const inbox = await withActor(actor(0), (tx) => tx.select().from(notifications).where(eq(notifications.userId, ids[0]))); assert.ok(inbox.some((n) => n.subjectId === offer.id)); const privateInbox = await withActor(actor(1), (tx) => tx.select().from(notifications).where(eq(notifications.userId, ids[0]))); assert.equal(privateInbox.length, 0); check("offer creates transactional inbox/outbox visible only to recipient");
    const analytics = await getDashboard(actor(0), 30); const otherAnalytics = await getDashboard(actor(1), 30); assert.ok(analytics.summary.offers >= 1); assert.equal(otherAnalytics.summary.offers, 0); assert.equal(otherAnalytics.summary.revenue, 0); check("vendor analytics are scoped to authenticated seller");
    const hijacked = await withActor(actor(1), (tx) => tx.update(products).set({ title: "hijacked" }).where(eq(products.id, productIds[0])).returning()); assert.equal(hijacked.length, 0); check("cross-account listing update is blocked");
    const convo = await withActor(actor(2, "buyer"), (tx) => tx.insert(conversations).values({ productId: productIds[0], buyerId: ids[2], sellerId: ids[0] }).returning()); await sendMessage(actor(2, "buyer"), convo[0].id, "Private integration message"); const thread = await getMessages(actor(0), convo[0].id); assert.equal(thread.items.length, 1); await assert.rejects(getMessages(actor(1), convo[0].id), /not_found/); check("chat participant ACL blocks unrelated accounts");
    await withActor(actor(0), (tx) => tx.insert(pushSubscriptions).values({ userId: ids[0], endpoint: `https://fcm.googleapis.com/test/${suffix}`, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } })); const noPush = await withActor(actor(1), (tx) => tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, ids[0]))); assert.equal(noPush.length, 0); check("push endpoints and encryption keys are owner-only");
    await assert.rejects(withActor(actor(2, "buyer"), (tx) => tx.insert(products).values({ sellerId: ids[2], title: "Forbidden listing", priceDzd: "1", images: [] }).returning()), /Failed query|row-level security/); check("buyer cannot create vendor inventory");
    await db.transaction(async (tx) => { await tx.execute(sql`select set_config('app.user_id', ${ids[0]}, true), set_config('app.role', 'seller', true)`); const inside = await tx.execute(sql`select current_setting('app.user_id',true) as id`); assert.equal(inside.rows[0].id, ids[0]); }); const outside = await db.execute(sql`select current_setting('app.user_id',true) as id`); assert.equal(outside.rows[0].id, ""); check("transaction-local identity never leaks across pooled requests");
    const rate = await db.execute(sql`select * from consume_rate_limit(${`test-${suffix}`},1,60000)`); assert.equal(rate.rows[0].allowed, true); const limited = await db.execute(sql`select * from consume_rate_limit(${`test-${suffix}`},1,60000)`); assert.equal(limited.rows[0].allowed, false); check("atomic distributed rate-limit bucket rejects excess requests");
    await admin.query("UPDATE users SET preferences=$2 WHERE id=$1", [ids[0], JSON.stringify({ offers: true, listings: true, push: true })]);
    const { dispatchPushBatch } = await import("../src/features/notifications/push.server");
    const worker = new Pool({ connectionString: process.env.PUSH_DATABASE_URL, max: 2 });
    try {
      const testNotification = await withActor(actor(0), async (tx) => { const result = await tx.execute(sql`select enqueue_notification(${ids[0]}::uuid,'test',gen_random_uuid(),'{}'::jsonb,'/settings?section=notifications') as id`); return String(result.rows[0].id); });
      let calls = 0; const sent = await dispatchPushBatch(worker, 1, async () => { calls++; return { statusCode: 201 }; }); assert.equal(sent, 1); assert.equal(calls, 1); check("push worker delivers a durable database job through provider adapter");
      const completed = await worker.query("SELECT completed_at FROM notification_jobs WHERE notification_id=$1", [testNotification]); assert.ok(completed.rows[0].completed_at); check("successful push job is acknowledged");
      const retryNotification = await withActor(actor(0), async (tx) => { const result = await tx.execute(sql`select enqueue_notification(${ids[0]}::uuid,'test',gen_random_uuid(),'{}'::jsonb,'/settings?section=notifications') as id`); return String(result.rows[0].id); });
      await dispatchPushBatch(worker, 1, async () => { throw Object.assign(new Error("provider unavailable"), { statusCode: 500 }); });
      const retry = await worker.query("SELECT completed_at,attempts,last_error,available_at>now() as delayed FROM notification_jobs WHERE notification_id=$1", [retryNotification]); assert.equal(retry.rows[0].completed_at, null); assert.equal(retry.rows[0].attempts, 1); assert.equal(retry.rows[0].last_error, "provider_retry"); assert.equal(retry.rows[0].delayed, true); check("transient provider failure schedules retry without losing job");
      await admin.query("UPDATE push_subscriptions SET endpoint=$1 WHERE user_id=$2", [`https://fcm.googleapis.com/expired/${suffix}`, ids[0]]);
      await worker.query("UPDATE notification_jobs SET available_at=now() WHERE notification_id=$1", [retryNotification]);
      await dispatchPushBatch(worker, 1, async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
      const remaining = await withActor(actor(0), (tx) => tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, ids[0]))); assert.equal(remaining.length, 0); check("expired push subscription is removed after provider 410");
    } finally { await worker.end(); }
    console.log(`\n${checks} PostgreSQL integration checks passed.`);
  } finally { for (const id of ids) await admin.query("DELETE FROM users WHERE id=$1", [id]); await admin.query("DELETE FROM rate_limits WHERE key LIKE 'test-%'"); await admin.end(); await getPool().end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
