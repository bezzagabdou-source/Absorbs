import crypto from "crypto";
import { NextRequest } from "next/server";
import { json, serverError } from "@/lib/http";
import { repo } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: create / list Pro activation codes without touching SQL.
 * Requires env ADMIN_SECRET and header  x-admin-secret: <ADMIN_SECRET>
 * (compared in constant time).
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

export async function POST(req: NextRequest) {
  const auth = authorized(req);
  if (auth === "off") return json(503, { code: "ADMIN_DISABLED" });
  if (!auth) return json(401, { code: "UNAUTHORIZED" });

  let body: { code?: unknown; days?: unknown; maxUses?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const days = Math.floor(Number(body.days ?? 30));
  const maxUses = Math.floor(Number(body.maxUses ?? 100));
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return json(400, { code: "BAD_CODE" });
  if (!(days >= 1 && days <= 3650)) return json(400, { code: "BAD_DAYS" });
  if (!(maxUses >= 1 && maxUses <= 100000)) return json(400, { code: "BAD_MAX" });

  try {
    await repo.ensurePromo(code, { plan: "pro", days, maxUses });
    return json(200, { ok: true, code, days, maxUses });
  } catch (e) {
    return serverError("admin-promo", e, "DB");
  }
}

export async function GET(req: NextRequest) {
  const auth = authorized(req);
  if (auth === "off") return json(503, { code: "ADMIN_DISABLED" });
  if (!auth) return json(401, { code: "UNAUTHORIZED" });
  try {
    const rows = await repo.listPromos(50);
    return json(200, { codes: rows });
  } catch (e) {
    return serverError("admin-promo", e, "DB");
  }
}
