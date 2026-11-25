import { one } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * نبضة حياة خفيفة — تُوقظ Neon وترجع بدون أي بيانات.
 * يستعملها GitHub Action (كل 5 دقائق) باش يبقى الحوسبة Neon مستيقظة
 * وما تتهداش طول حتى وقت الخمول (free tier autosuspend).
 */
export async function GET(): Promise<Response> {
  const started = Date.now();
  try {
    const row = await one<{ now: string }>("SELECT now()::text AS now");
    return Response.json({ ok: true, db: true, now: row?.now ?? null, ms: Date.now() - started });
  } catch (err) {
    console.error("[keepalive] db ping failed", err);
    return Response.json({ ok: false, db: false, ms: Date.now() - started }, { status: 503 });
  }
}
