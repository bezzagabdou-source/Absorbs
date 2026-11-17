import { NextRequest, NextResponse } from "next/server";
import { aiChat, freeProviders, probeFreeProviders, testProviders } from "@/lib/ai";
import { env } from "@/lib/env";

/**
 * GET /api/ai/probe?k=<ADMIN_PASSWORD>
 * فحص حقيقي لكل مزوّدي الذكاء الاصطناعي: المفاتيح + المزوّدون المجانيون بلا مفاتيح.
 * لا يعيد أي مفتاح — فقط الحالة والزمن والخطأ.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const k = req.nextUrl.searchParams.get("k") || "";
  if (!k || k !== env.adminPassword) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const chatText = (req.nextUrl.searchParams.get("chat") || "").trim();
  if (chatText) {
    // فحص كامل لسلسلة المحادثة الحقيقية: أي مزوّد ردّ فعلاً؟
    const started = Date.now();
    try {
      const res = await aiChat([{ role: "user", content: chatText.slice(0, 600) }], {
        system: "أنت مساعد متجر رقمي. أجب بجملة واحدة قصيرة بالعربية.",
      });
      return NextResponse.json({
        ok: true,
        provider: res.provider,
        ms: Date.now() - started,
        reply: res.text.slice(0, 400),
      });
    } catch (err) {
      return NextResponse.json({ ok: false, error: String(err).slice(0, 400), ms: Date.now() - started });
    }
  }
  const only = (req.nextUrl.searchParams.get("only") || "").trim();
  const compact = req.nextUrl.searchParams.get("compact") === "1";
  const [keyed, free] = await Promise.all([
    only ? Promise.resolve({}) : testProviders().catch(() => ({})),
    probeFreeProviders(only ? [only] : undefined),
  ]);
  if (compact) {
    const flat: Record<string, string> = {};
    for (const [id, row] of Object.entries(free)) flat[id] = row.ok ? `OK ${row.ms}ms` : `FAIL ${row.error ?? ""}`.slice(0, 120);
    for (const [id, row] of Object.entries(keyed)) flat[id] = (row as { ok?: boolean }).ok ? "OK" : "FAIL";
    return NextResponse.json({ ok: true, compact: flat, checkedAt: new Date().toISOString() });
  }
  const okCount =
    Object.values(keyed).filter((r) => (r as { ok?: boolean }).ok).length +
    Object.values(free).filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount > 0,
    keyed,
    free,
    freeList: freeProviders(),
    okCount,
    checkedAt: new Date().toISOString(),
  });
}
