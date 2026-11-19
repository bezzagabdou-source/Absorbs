import { NextResponse } from "next/server";
import { authorized } from "@/lib/admin-auth";
import { db } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "اكتب نص الرسالة أولاً" }, { status: 400 });
  const token = process.env.BOT_TOKEN || "9169731361:AAGdtx1soQWt2GIdcq23_vSyS1XfLcIH0NQ";
  try {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS telegram_users (
      user_id text PRIMARY KEY, username text NOT NULL DEFAULT '', first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
      first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), starts integer NOT NULL DEFAULT 1
    )`;
    const users = await sql`SELECT user_id FROM telegram_users`;
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < users.length; i += 20) {
      const batch = users.slice(i, i + 20);
      const results = await Promise.all(batch.map(async (user: any) => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: user.user_id, text: message }), signal: AbortSignal.timeout(8000),
          });
          const json = await res.json();
          return Boolean(json.ok);
        } catch { return false; }
      }));
      sent += results.filter(Boolean).length;
      failed += results.length - results.filter(Boolean).length;
    }
    return NextResponse.json({ ok: true, sent, failed, total: users.length });
  } catch (error) {
    console.error("broadcast failed", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإرسال" }, { status: 503 });
  }
}
