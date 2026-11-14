import { NextResponse } from "next/server";
import { dbHealth, getStore, migrationsInfo, storageInfo } from "@/lib/store";
import { getSettings } from "@/lib/settings";
import { mandatoryGate } from "@/lib/gate";
import { isMock, tgCall } from "@/lib/telegram";
import { readErrors } from "@/lib/errors";
import { usersCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🩺 Health-check عام (بلا أسرار) — يراقب منو Vercel/اللوحة/أي uptime monitor.
 * كيرجع 200 إلا كان البوت قادر يخدم (توكن + قاعدة + ويب هوك)، و503 إلا كان عطل
 * حقيقي. كل التفاصيل حساسة كتطلع غير في /api/panel/health (بمفتاح اللوحة).
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  try {
    const settings = await getSettings().catch(() => null);
    checks.token = {
      ok: isMock() || Boolean(settings?.botToken),
      detail: settings?.botToken ? "configured" : isMock() ? "mock mode" : "missing TELEGRAM_BOT_TOKEN",
    };
    checks.storage = { ok: true, detail: storageInfo().backend };
    const db = await dbHealth();
    checks.database = { ok: db.ok, detail: db.ok ? `${db.backend} ${db.latencyMs}ms` : db.error };
    const pg = storageInfo().backend === "postgres";
    // الترحيلات كتعني غير Postgres: في وضع Redis/الذاكرة ما كاينش schema أصلاً.
    const migrations = pg ? await migrationsInfo() : { applied: [], pending: [] };
    checks.migrations = {
      ok: !pg || migrations.pending.length === 0,
      detail: !pg ? `n/a (${storageInfo().backend})` : migrations.pending.length ? `pending: ${migrations.pending.join(",")}` : "up-to-date",
    };
    const gate = mandatoryGate();
    checks.gate = { ok: gate.required && gate.channels.length > 0, detail: `${gate.required ? "enforced" : "off"} · ${gate.channels.join(",")}` };

    if (!isMock() && settings?.botToken) {
      // نداء واحد فقط حتى ما نضغطوش على تيليغرام بلا فايدة
      const [me, hook] = await Promise.all([
        tgCall<{ username?: string }>("getMe").catch(() => ({ ok: false }) as { ok: boolean }),
        tgCall<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo").catch(() => ({ ok: false }) as { ok: boolean }),
      ]);
      const info = hook as { ok?: boolean; result?: { url?: string; pending_update_count?: number; last_error_message?: string } };
      checks.telegram = { ok: Boolean((me as { ok?: boolean }).ok), detail: String((me as { result?: { username?: string } }).result?.username || "") };
      checks.webhook = {
        ok: Boolean(info.ok && info.result?.url),
        detail: info.result?.url ? `pending=${info.result.pending_update_count ?? 0}` : "not set",
      };
    } else {
      checks.telegram = { ok: isMock(), detail: isMock() ? "mock mode" : "no token" };
      checks.webhook = { ok: true, detail: "skipped" };
    }

    // الأخطاء إعلامية: خطأ في تحديث واحد ما كيخلّيش البوت «غير صحي»، لكنه كيبان هنا
    // وفي قسم الأخطاء باللوحة. غير أخطاء العملية (process) كتعتبر حرجة.
    const errors = await readErrors(20).catch(() => []);
    const recent = errors.filter((e) => Date.now() - e.at < 15 * 60_000);
    const criticalErrors = recent.filter((e) => e.scope === "process");
    checks.errors = {
      ok: criticalErrors.length === 0,
      detail: `${recent.length} in last 15m${criticalErrors.length ? ` (${criticalErrors.length} process)` : ""}`,
    };
    checks.users = { ok: true, detail: String(await usersCount().catch(() => 0)) };

    // البوت كيبقى «صحيح» إلا كان التوكن + التخزين + البوابة + الترحيلات سليمة
    const critical = ["token", "storage", "migrations", "gate", "database", "errors"] as const;
    const ok = critical.every((key) => checks[key].ok) && (checks.database.ok || getStore().backend !== "postgres");
    return NextResponse.json(
      { ok, service: "ft-contest-bot", checks, ms: Date.now() - started, at: new Date().toISOString() },
      { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, service: "ft-contest-bot", error: String((error as Error)?.message || error).slice(0, 200), ms: Date.now() - started },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
