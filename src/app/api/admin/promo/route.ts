import crypto from "crypto";
import { json, serverError } from "@/lib/http";
import { db } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { promoCodes } from "@/db/schema";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: create / list Pro activation codes without touching SQL.
 * Requires env ADMIN_SECRET and header  x-admin-secret: <ADMIN_SECRET>
 *
 *  POST { "code": "BARQ-VIP", "days": 30, "maxUses": 100 }
 *  GET  → last 50 codes
 */
function authorized(req: Request): boolean | "off" {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 12) return "off";
  const given = req.headers.get("x-admin-secret") ?? "";
  const a = crypto.createHash("sha256").update(secret).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const auth = authorized(req);
  if (auth === "off") return json(503, { code: "ADMIN_DISABLED" });
  if (!auth) return json(401, { code: "UNAUTHORIZED" });

  let body: { code?: string; days?: number; maxUses?: number };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const code = (body.code ?? "").trim().toUpperCase();
  const days = Math.floor(Number(body.days ?? 30));
  const maxUses = Math.floor(Number(body.maxUses ?? 100));
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return json(400, { code: "BAD_CODE" });
  if (!(days >= 1 && days <= 3650)) return json(400, { code: "BAD_DAYS" });
  if (!(maxUses >= 1 && maxUses <= 100000)) return json(400, { code: "BAD_MAX" });

  try {
    await ensureSchema();
    const created = await db
      .insert(promoCodes)
      .values({ code, plan: "pro", days, maxUses })
      .onConflictDoNothing()
      .returning({ code: promoCodes.code });
    if (created.length === 0) return json(409, { code: "EXISTS" });
    return json(200, { ok: true, code, days, maxUses });
  } catch (e) {
    return serverError("admin-promo", e, "DB");
  }
}

export async function GET(req: Request) {
  const auth = authorized(req);
  if (auth === "off") return json(503, { code: "ADMIN_DISABLED" });
  if (!auth) return json(401, { code: "UNAUTHORIZED" });
  try {
    await ensureSchema();
    const rows = await db
      .select()
      .from(promoCodes)
      .orderBy(desc(promoCodes.createdAt))
      .limit(50);
    return json(200, { codes: rows });
  } catch (e) {
    return serverError("admin-promo", e, "DB");
  }
}
