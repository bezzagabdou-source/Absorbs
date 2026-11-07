import "server-only";
import webpush from "web-push";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { notifications, notificationJobs, pushSubscriptions } from "@/db/schema";
import { translate } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { pushConfigured, pushEndpointAllowed } from "@/lib/env";
export type PushPayload = { title: string; body: string; url: string; tag: string; locale: Locale };
export function notificationPayload(notification: { id: string; kind: string; url: string }, locale: Locale): PushPayload {
  const key = notification.kind === "offer" ? "notificationOffer" : notification.kind === "offer_update" ? "notificationOfferUpdate" : notification.kind === "listing" ? "notificationListing" : notification.kind === "message" ? "notificationMessage" : "sendTest";
  const url = /^\/(product\/[a-f0-9-]{36}|dashboard\?tab=offers|chat|settings\?section=notifications)$/.test(notification.url) ? notification.url : "/";
  return { title: translate(locale, key), body: translate(locale, "brandTag"), url, tag: notification.id, locale };
}
export type PushSender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options: { TTL: number; timeout: number; urgency: "high" }) => Promise<unknown>;
let configured = false;
/** Claim short DB transactions; never hold row locks during provider network I/O.
 * Delivery is at-least-once: a crash after sending may repeat a notification,
 * but the stable notification tag collapses duplicates in the service worker. */
export async function dispatchPushBatch(pool: Pool, batchSize = 25, sender?: PushSender): Promise<number> {
  if (!pushConfigured()) return 0;
  if (!configured) { webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!); configured = true; }
  const send = sender ?? ((subscription, payload, options) => webpush.sendNotification(subscription, payload, options));
  const db = drizzle(pool); let sent = 0;
  const batch = Math.min(50, Math.max(1, batchSize));
  for (let index = 0; index < batch; index++) {
    const job = await db.transaction(async (tx) => {
      const result = await tx.execute(sql`update notification_jobs set locked_at=now(), attempts=attempts+1 where id=(select id from notification_jobs where completed_at is null and attempts<8 and available_at<=now() and (locked_at is null or locked_at<now()-interval '5 minutes') order by available_at for update skip locked limit 1) returning *`);
      const row = result.rows[0] as { id: string; notification_id: string; attempts: number } | undefined;
      if (!row) return null;
      const [notification] = await tx.select().from(notifications).where(eq(notifications.id, row.notification_id));
      if (!notification) { await tx.delete(notificationJobs).where(eq(notificationJobs.id, row.id)); return null; }
      const subscriptions = await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, notification.userId)).limit(10);
      return { ...row, notification, subscriptions };
    });
    if (!job) break;
    let failures = 0; let permanent = false; let delivered = 0;
    // Bounded concurrency; each request has a 10-second timeout.
    for (let offset = 0; offset < job.subscriptions.length; offset += 5) {
      await Promise.all(job.subscriptions.slice(offset, offset + 5).map(async (subscription) => {
        const locale = isLocale(subscription.locale) ? subscription.locale : "fr";
        try {
          if (!pushEndpointAllowed(subscription.endpoint)) { permanent = true; return; }
          await send({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(notificationPayload(job.notification, locale)), { TTL: 3600, timeout: 10000, urgency: "high" }); delivered++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, subscription.id), eq(pushSubscriptions.userId, job.notification.userId)));
          else { failures++; permanent ||= status === 403; }
        }
      }));
    }
    sent += delivered;
    const failed = failures > 0 || permanent;
    await db.update(notificationJobs).set({ completedAt: failed ? null : new Date(), lockedAt: null, availableAt: new Date(Date.now() + Math.min(3600000, 2000 * 2 ** job.attempts)), lastError: permanent ? "provider_rejected" : failures ? "provider_retry" : null, ...(permanent ? { attempts: 8 } : {}) }).where(eq(notificationJobs.id, job.id));
  }
  return sent;
}
