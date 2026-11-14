import { NextResponse, type NextRequest } from "next/server";
import { addAccounts, createContest } from "@/lib/contests";
import { isMock } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** يُستخدم فقط في وضع المحاكاة المحلي (TELEGRAM_MOCK=1) لتجهيز بيانات تجريبية */
export async function POST(request: NextRequest) {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { target?: number; title?: string };
  const target = Number(body.target) > 0 ? Number(body.target) : 200;
  const contest = await createContest({
    title: body.title || "مسابقة FT — حساب بريميوم",
    description: "أول من يجمع العدد المطلوب من الضيوف يربح الحساب فوراً.",
    target,
    prize: "حساب FT بريميوم — إيميل + كلمة سر",
    status: "active",
  });
  const added = await addAccounts(
    contest.id,
    "winner1@ft.com:Passw0rd1\nwinner2@ft.com:Passw0rd2\nwinner3@ft.com:Passw0rd3",
  );
  return NextResponse.json({ ok: true, contestId: contest.id, accounts: added, target });
}
