import { NextResponse } from "next/server";
import { authorized } from "@/lib/admin-auth";
import { db } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureTables() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS site_visitors (
    visitor_id text PRIMARY KEY, first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
    visits integer NOT NULL DEFAULT 1, last_path text NOT NULL DEFAULT '/', user_agent text NOT NULL DEFAULT '', referrer text NOT NULL DEFAULT ''
  )`;
  await sql`CREATE TABLE IF NOT EXISTS telegram_users (
    user_id text PRIMARY KEY, username text NOT NULL DEFAULT '', first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
    first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), starts integer NOT NULL DEFAULT 1
  )`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const visitorId = String(body.visitorId || "").slice(0, 80);
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(visitorId)) return NextResponse.json({ ok: false }, { status: 400 });
    await ensureTables();
    const sql = db();
    await sql`INSERT INTO site_visitors (visitor_id, last_seen, visits, last_path, user_agent, referrer)
      VALUES (${visitorId}, now(), 1, ${String(body.path || "/").slice(0, 300)}, ${String(body.userAgent || "").slice(0, 500)}, ${String(body.referrer || "").slice(0, 500)})
      ON CONFLICT (visitor_id) DO UPDATE SET last_seen = now(), visits = site_visitors.visits + 1,
      last_path = EXCLUDED.last_path, user_agent = EXCLUDED.user_agent, referrer = EXCLUDED.referrer`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("visitor tracking failed", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  try {
    await ensureTables();
    const sql = db();
    const [visitors, botUsers, counts] = await Promise.all([
      sql`SELECT visitor_id AS id, first_seen, last_seen, visits, last_path, user_agent, referrer FROM site_visitors ORDER BY last_seen DESC LIMIT 500`,
      sql`SELECT user_id AS id, username, first_name, last_name, first_seen, last_seen, starts FROM telegram_users ORDER BY last_seen DESC LIMIT 500`,
      sql`SELECT (SELECT count(*)::int FROM site_visitors) AS visitors, (SELECT count(*)::int FROM telegram_users) AS bot_users, (SELECT coalesce(sum(visits), 0)::int FROM site_visitors) AS page_views`,
    ]);
    return NextResponse.json({ visitors, botUsers, counts: counts[0] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("visitor dashboard read failed", error);
    return NextResponse.json({ error: "تعذر الاتصال بقاعدة البيانات" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const sql = db();
    if (body.type === "site" && typeof body.id === "string") {
      await sql`DELETE FROM site_visitors WHERE visitor_id = ${body.id}`;
    } else if (body.type === "bot" && typeof body.id === "string") {
      await sql`DELETE FROM telegram_users WHERE user_id = ${body.id}`;
    } else {
      return NextResponse.json({ error: "طلب حذف غير صالح" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("visitor delete failed", error);
    return NextResponse.json({ error: "تعذر الحذف" }, { status: 503 });
  }
}
