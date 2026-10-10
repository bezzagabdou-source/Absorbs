import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { db } from "@/db";
import { orders } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 30;

const PRICES = { monthly: 990, yearly: 9900 } as const;

/**
 * Creates a Chargily Pay checkout (EDAHABIA / CIB) for the Pro plan.
 * Configure in Vercel:
 *   CHARGILY_SECRET_KEY  — from pay.chargily.com dashboard
 *   CHARGILY_MODE        — "live" (default) or "test"
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const secret = process.env.CHARGILY_SECRET_KEY;
  if (!secret) return json(503, { code: "PAY_UNAVAILABLE" });

  let period: keyof typeof PRICES = "monthly";
  try {
    const body = (await req.json()) as { period?: string };
    if (body.period === "yearly") period = "yearly";
  } catch {
    /* default monthly */
  }

  const amount = PRICES[period];
  const base =
    process.env.CHARGILY_MODE === "test"
      ? "https://pay.chargily.net/test/api/v2"
      : "https://pay.chargily.net/api/v2";
  const origin = new URL(req.url).origin;

  try {
    const orderId = crypto.randomUUID();
    const res = await fetch(`${base}/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "dzd",
        success_url: `${origin}/app/upgrade?status=success`,
        failure_url: `${origin}/app/upgrade?status=failed`,
        description: `Nexus AI v8.4 Pro — ${period}`,
        metadata: [orderId],
        locale: "ar",
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[chargily] upstream:", detail.slice(0, 300));
      return json(502, { code: "PAY_ERROR" });
    }
    const data = (await res.json()) as { id?: string; checkout_url?: string };
    if (!data.checkout_url || !data.id) {
      return json(502, { code: "PAY_ERROR" });
    }

    await db
      .insert(orders)
      .values({
        id: orderId,
        userId: user.uid,
        plan: "pro",
        period,
        amountDzd: amount,
        status: "pending",
        provider: "chargily",
        providerRef: data.id,
      })
      .execute();

    return json(200, { checkout_url: data.checkout_url });
  } catch (e) {
    return serverError("chargily", e, "PAY_ERROR");
  }
}
