import { NextRequest, NextResponse } from "next/server";
import { freeProviders, probeFreeProviders, testProviders } from "@/lib/ai";
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
  const [keyed, free] = await Promise.all([testProviders().catch(() => ({})), probeFreeProviders()]);
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
