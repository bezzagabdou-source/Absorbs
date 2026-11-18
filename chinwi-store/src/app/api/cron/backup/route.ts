import { backupJson, getSetting, q, setSetting } from "@/lib/db";
import { env } from "@/lib/env";
import { sendDocument, sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * نسخ احتياطي يومي للمالك عبر تيليجرام (بديل Neon حار):
 * كل يوم 05:00 UTC يصدّر dump كامل (JSON مثل زر «النسخ الاحتياطي» في اللوحة)
 * ويبعثه للمالك كملف. بعدها يمسح جداول السجلات القديمة (logs/visits/ai_messages
 * > 75 يوم) باش تبقى مساحة Neon مريحة — كي ما يتبعتش الملف، ما يتمسح والو.
 * مرة وحدة في اليوم كحد أقصى (settings backup:last) ما لم ?force=1.
 */
async function run(force: boolean): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && (await getSetting<string>("backup:last")) === today) {
    return Response.json({ ok: true, skipped: "backup already sent today", date: today });
  }

  const ownerSetting = await getSetting<number | string>("owner_chat_id");
  const owner = Number(ownerSetting) || env.ownerChatId || 0;

  let dump: Awaited<ReturnType<typeof backupJson>>;
  try {
    dump = await backupJson();
  } catch (err) {
    console.error("[backup] dump failed", err);
    return Response.json({ ok: false, error: "تعذر إنشاء النسخة الاحتياطية" }, { status: 500 });
  }

  const filename = `chinwi-backup-${today}.json`;
  const payload = Buffer.from(JSON.stringify(dump), "utf8");
  const totalRows = Object.values(dump.counts).reduce((a, b) => a + b, 0);
  const kb = Math.round(payload.length / 1024);
  const caption =
    `🗄 نسخة احتياطية يومية — CHINWI Store\n` +
    `📅 ${today}\n` +
    `📦 ${Object.keys(dump.counts).length} جدول — ${totalRows} صف — ${kb} KB\n` +
    `✅ هذا هو الملف الكامل تاع البيانات — احتفظ بيه`;

  let delivered = false;
  if (owner > 0) {
    const msg = await sendDocument(owner, payload, filename, caption);
    delivered = Boolean(msg);
    if (!delivered) await sendMessage(owner, `${caption}\n\n⚠️ فشل إرفاق الملف (كبير بزاف أو خطأ شبكة) — عاود حاول من اللوحة ← النسخ الاحتياطي`);
  }

  // لا نمسح والو إلا إذا وصل الملف للمالك
  let pruned: Record<string, number> = {};
  if (delivered) {
    try {
      const logs = await q<{ count: string }>("DELETE FROM logs WHERE created_at < now() - interval '75 days' RETURNING 1");
      const visits = await q<{ count: string }>("DELETE FROM visits WHERE created_at < now() - interval '75 days' RETURNING 1");
      const ai = await q<{ count: string }>("DELETE FROM ai_messages WHERE created_at < now() - interval '75 days' RETURNING 1");
      pruned = { logs: logs.length, visits: visits.length, ai_messages: ai.length };
    } catch (err) {
      console.error("[backup] retention prune failed (non-fatal)", err);
      pruned = { error: 1 };
    }
    await setSetting("backup:last", today);
  }

  return Response.json({
    ok: delivered,
    date: today,
    bytes: payload.length,
    rows: totalRows,
    counts: dump.counts,
    pruned,
    owner: owner > 0 ? "sent" : "missing owner_chat_id",
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return run(url.searchParams.get("force") === "1");
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  return run(url.searchParams.get("force") === "1");
}
