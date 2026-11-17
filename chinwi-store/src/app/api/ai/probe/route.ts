import { NextRequest, NextResponse } from "next/server";
import { aiChat, assistantPlan, freeProviders, probeFreeProviders, testProviders } from "@/lib/ai";
import { env } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/db";
import { setMyCommands } from "@/lib/telegram";
import { webhookStatus } from "@/lib/bootstrap";

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
  if (req.nextUrl.searchParams.get("clearkeys") === "1") {
    // حذف مفاتيح لوحة التحكم القديمة حتى تعمل مفاتيح متغيّرات البيئة الجديدة
    await setSetting("groq_key", "").catch(() => {});
    await setSetting("gemini_key", "").catch(() => {});
    await setSetting("openrouter_key", "").catch(() => {});
    return NextResponse.json({ ok: true, cleared: ["groq_key", "gemini_key", "openrouter_key"] });
  }
  if (req.nextUrl.searchParams.get("keys") === "1") {
    const mask = (v: string) => (v ? `••••${v.slice(-4)} (${v.slice(0, 4)})` : "");
    return NextResponse.json({
      ok: true,
      dbKeys: {
        groq: mask(String((await getSetting<string>("groq_key")) ?? "")),
        gemini: mask(String((await getSetting<string>("gemini_key")) ?? "")),
      },
      envKeys: { groq: Boolean(env.groqKey), gemini: Boolean(env.geminiKey) },
    });
  }
  if (req.nextUrl.searchParams.get("bot") === "1") {
    // إصلاح أزرار البوت: إلغاء التطبيق المصغّر وإرجاع قائمة الأوامر
    await setMyCommands().catch(() => {});
    const status = await webhookStatus().catch(() => null);
    return NextResponse.json({ ok: true, menuButton: "commands", webhook: status });
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
  const planText = (req.nextUrl.searchParams.get("plan") || "").trim();
  if (planText) {
    const started = Date.now();
    const plan = await assistantPlan(
      [{ role: "user", content: planText.slice(0, 600) }],
      "منتجات: باقات فري فاير، شحن تليجرام بريموم. العملة: دج.",
    ).catch((err) => ({ reply: String(err), actions: [], provider: "error" }));
    return NextResponse.json({
      ok: true,
      provider: plan.provider,
      ms: Date.now() - started,
      reply: plan.reply.slice(0, 400),
      actions: plan.actions,
    });
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
