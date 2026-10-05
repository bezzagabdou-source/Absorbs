import { json, serverError } from "@/lib/http";
import crypto from "crypto";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";

export const runtime = "nodejs";

/**
 * Chargily Pay webhook — verifies the HMAC signature and activates Pro
 * when a checkout is paid. Set this URL in your Chargily dashboard:
 *   https://YOUR_DOMAIN/api/billing/webhook
 */
export async function POST(req: Request) {
  const secret = process.env.CHARGILY_SECRET_KEY;
  if (!secret) return json(503, { code: "NOT_CONFIGURED" });

  const signature = req.headers.get("signature") ?? "";
  const raw = await req.text();
  if (!signature || !raw) return json(400, { code: "BAD_REQUEST" });

  const computed = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { code: "BAD_SIGNATURE" });
  }

  try {
    await ensureSchema();
    const event = JSON.parse(raw) as {
      type?: string;
      data?: { id?: string; status?: string; metadata?: string[] };
    };
    if (event.type !== "checkout.paid") return json(200, { ignored: true });

    const checkoutId = event.data?.id ?? "";
    const order = checkoutId
      ? (
          await db
            .select()
            .from(orders)
            .where(eq(orders.providerRef, checkoutId))
            .limit(1)
        )[0]
      : undefined;

    if (!order) return json(200, { ok: true });

    // atomic: only the first webhook delivery flips pending -> paid (no double extension)
    const flipped = await db
      .update(orders)
      .set({ status: "paid" })
      .where(and(eq(orders.id, order.id), ne(orders.status, "paid")))
      .returning({ id: orders.id });
    if (flipped.length === 0) return json(200, { ok: true });

    const days = order.period === "yearly" ? 365 : 30;
    const u = (
      await db.select().from(users).where(eq(users.id, order.userId)).limit(1)
    )[0];
    if (u) {
      const baseMs =
        u.plan === "pro" && u.planExpiresAt && u.planExpiresAt.getTime() > Date.now()
          ? u.planExpiresAt.getTime()
          : Date.now();
      await db
        .update(users)
        .set({
          plan: "pro",
          planExpiresAt: new Date(baseMs + days * 86_400_000),
        })
        .where(eq(users.id, u.id))
        .execute();
    }
    return json(200, { ok: true });
  } catch (e) {
    return serverError("webhook", e);
  }
}
