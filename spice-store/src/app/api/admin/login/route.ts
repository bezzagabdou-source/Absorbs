import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { adminSessions, settings } from "@/db/schema";
import { createSession, hashToken, SESSION_COOKIE, verifyPassword } from "@/lib/server/auth";
import { ensureStore } from "@/lib/server/store";

const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const existing = attempts.get(ip);
    if (existing && existing.until > Date.now() && existing.count >= 8) {
      return NextResponse.json({ error: "محاولات كثيرة، يرجى المحاولة بعد قليل." }, { status: 429 });
    }
    const body = await request.json();
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 200) return NextResponse.json({ error: "أدخل كلمة المرور." }, { status: 400 });
    await ensureStore();
    const [store] = await db.select({ passwordHash: settings.passwordHash }).from(settings).where(eq(settings.id, 1));
    if (!store || !verifyPassword(password, store.passwordHash)) {
      const active = existing && existing.until > Date.now() ? existing : { count: 0, until: Date.now() + 15 * 60 * 1000 };
      attempts.set(ip, { ...active, count: active.count + 1 });
      return NextResponse.json({ error: "كلمة المرور غير صحيحة." }, { status: 401 });
    }
    attempts.delete(ip);
    const session = await createSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    console.error("Admin login error", error);
    return NextResponse.json({ error: "تعذر تسجيل الدخول." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
