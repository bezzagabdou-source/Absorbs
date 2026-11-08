import { NextResponse } from "next/server";
import { COOKIE, checkPassword, newSession, passwordReady } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!passwordReady()) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_PASSWORD غير مضبوط في متغيرات البيئة على Vercel." },
      { status: 500 }
    );
  }
  let body: { password?: string } = {};
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400 });
  }
  const password = String(body.password ?? "");
  if (!checkPassword(password)) {
    return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }
  const { token, maxAge } = newSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}
