import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSession, sessionSeconds, verifyPassword } from "@/lib/server/auth";
const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const existing = attempts.get(ip);
    if (existing && existing.until > Date.now() && existing.count >= 8) {
      return NextResponse.json({ error: "محاولات كثيرة، يرجى المحاولة بعد قليل." }, { status: 429 });
    }
    const body = await request.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 200) return NextResponse.json({ error: "أدخل كلمة المرور." }, { status: 400 });
    if (!process.env.ADMIN_PASSWORD) return NextResponse.json({error:"كلمة مرور الإدارة غير مضبوطة."}, {status:503});
    if (!verifyPassword(password)) {
      const active = existing && existing.until > Date.now() ? existing : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      attempts.set(ip, { ...active, count: active.count + 1 });
      return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
    }
    attempts.delete(ip);
    const token = createSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: sessionSeconds,
    });
    return response;
  } catch {
    console.error("Admin login: store authentication service unavailable");
    return NextResponse.json({ error: "خدمة الدخول غير متاحة حالياً. تعذّر الوصول إلى بيانات الإدارة؛ لا تغيّر كلمة المرور بسبب هذه الرسالة." }, { status: 503 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
