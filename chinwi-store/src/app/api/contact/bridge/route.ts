import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * جسر «بوت تواصل» — يستقبل نسخة من كل رسالة من/إلى @chinwicontactbot
 * ويحفظها في contact_messages حتى تُعرض في لوحة المالك (/admin/contact).
 * محمي بسر مشترك (CONTACT_BRIDGE_SECRET) — لا علاقة له بجلسة لوحة التحكم.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-bridge-secret") ?? "";
  const expected = process.env.CONTACT_BRIDGE_SECRET ?? "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "log");
  if (action !== "log") return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });

  const tgId = Number(body?.tg_id ?? 0);
  if (!Number.isFinite(tgId) || tgId <= 0) {
    return NextResponse.json({ ok: false, error: "tg_id غير صالح" }, { status: 400 });
  }
  const dir = body?.dir === "out" ? "out" : "in";
  const name = String(body?.name ?? "").slice(0, 120);
  const username = body?.username ? String(body.username).slice(0, 64) : null;
  const text = String(body?.text ?? "").slice(0, 4096);
  const media = String(body?.media ?? "").slice(0, 64);

  try {
    await q(
      "INSERT INTO contact_messages (tg_id, dir, name, username, text, media) VALUES ($1,$2,$3,$4,$5,$6)",
      [tgId, dir, name, username, text, media],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[contact-bridge] insert failed", err);
    return NextResponse.json({ ok: false, error: "db error" }, { status: 500 });
  }
}
