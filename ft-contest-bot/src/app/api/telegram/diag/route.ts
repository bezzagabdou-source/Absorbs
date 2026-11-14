import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readErrors } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { getStore, storageInfo } from "@/lib/store";
import { rawTgWith, getTrace } from "@/lib/telegram";
import { candidateTokens, tokenBotId } from "@/lib/token";
import { mandatoryGate } from "@/lib/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 🩺 تشخيص مباشر (GET) بلا أسرار — كيوري بالضبط علاش البوت ما كيردّش.
 * محمي بمفتاح `DIAG_KEY`؛ إلا ما كانش مضبوط كيرجع 404.
 *
 * كيرجّع:
 *   • getMe لكل توكن مرشّح (واش صالح؟)
 *   • getWebhookInfo: الرابط، التحديثات المعلّقة، **آخر خطأ من تيليغرام**
 *   • آخر الأخطاء المسجّلة في البوت
 *   • إعدادات البوابة (بلا توكن)
 */
function authorized(request: NextRequest) {
  const expected = String(process.env.DIAG_KEY || "");
  if (expected.length < 16) return false;
  const given = request.nextUrl.searchParams.get("k") || "";
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const out: Record<string, unknown> = { at: new Date().toISOString() };

  // 1) كل التوكنات: واش تيليغرام كيقبلها؟
  const probes = [];
  for (const candidate of candidateTokens()) {
    const me = await rawTgWith<{ id: number; username?: string }>(candidate.token, "getMe");
    probes.push({
      name: candidate.name,
      botId: tokenBotId(candidate.token),
      ok: Boolean(me.ok),
      username: me.result?.username || null,
      error: me.ok ? null : String(me.description || "").slice(0, 120),
    });
  }
  out.tokens = probes;

  // 2) أعمق إشارة: شنو كيقول تيليغرام على الويب هوك (بما فيه آخر خطأ فاشل)
  const good = probes.find((p) => p.ok);
  if (good) {
    const token = candidateTokens().find((c) => c.name === good.name)!.token;
    const info = await rawTgWith<{
      url?: string;
      pending_update_count?: number;
      last_error_date?: number;
      last_error_message?: string;
      allowed_updates?: string[];
      ip_address?: string;
    }>(token, "getWebhookInfo");
    out.webhook = info.ok
      ? {
          url: info.result?.url || "",
          pending: info.result?.pending_update_count ?? null,
          allowedUpdates: info.result?.allowed_updates ?? null,
          lastErrorAt: info.result?.last_error_date ? new Date(info.result.last_error_date * 1000).toISOString() : null,
          lastError: info.result?.last_error_message || null,
        }
      : { error: String(info.description || "").slice(0, 200) };
  }

  // 3) إعدادات البوابة + التخزين
  const settings = await getSettings().catch(() => null);
  out.gate = {
    channels: mandatoryGate().channels,
    secretProtected: Boolean(settings?.webhookSecret),
    botUsername: settings?.botUsername || null,
  };
  out.storage = storageInfo();

  // 4) آخر الأخطاء المسجّلة
  try {
    const errors = await readErrors(12);
    out.errors = errors.map((e) => ({ at: new Date(e.at).toISOString(), scope: e.scope, message: String(e.message || "").slice(0, 220) }));
  } catch (error) {
    out.errors = [{ error: String((error as Error)?.message || error).slice(0, 200) }];
  }

  // 5) آخر نداءات تيليغرام (باش نشوفو واش البوت كيصيفط أصلاً)
  try {
    out.trace = getTrace().slice(0, 12).map((t) => ({ at: new Date(t.at).toISOString(), method: t.method, botId: t.botId }));
  } catch {
    out.trace = [];
  }

  // 6) واش وصل شي تحديث؟ (آخر 10 من سجل التدقيق)
  try {
    const audit = await getStore().listAll("audit:updates", 10);
    out.audit = audit.map((line) => {
      try {
        const row = JSON.parse(line);
        return { at: new Date(row.at).toISOString(), kind: row.kind, userId: row.userId, text: String(row.text || "").slice(0, 40), error: row.error ? String(row.error).slice(0, 160) : null, sent: (row.sent || []).slice(0, 3) };
      } catch {
        return { raw: String(line).slice(0, 120) };
      }
    });
  } catch (error) {
    out.audit = [{ error: String((error as Error)?.message || error).slice(0, 160) }];
  }

  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
