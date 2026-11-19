import { NextResponse } from "next/server";
import { authorized, sessionCookie, verifyPassword, COOKIE_NAME } from "@/lib/admin-auth";

export async function GET(request: Request) {
  return NextResponse.json({ authenticated: authorized(request), configured: Boolean(process.env.ADMIN_PASSWORD) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!verifyPassword(body.password)) return NextResponse.json({ ok: false, error: "كلمة المرور غير صحيحة" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", sessionCookie());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`);
  return response;
}
