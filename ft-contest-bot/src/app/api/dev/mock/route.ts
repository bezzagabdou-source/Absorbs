import { NextResponse, type NextRequest } from "next/server";
import { clearMockLog, getMockLog, isMock, setMockChannelState } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  return NextResponse.json({ ok: true, calls: getMockLog() });
}

/** محاكاة: تحديد القنوات اللي المستخدم ماشي مشترك فيها (للاختبارات فقط) */
export async function POST(request: NextRequest) {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { left?: unknown; broken?: unknown };
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
  setMockChannelState({ left: list(body.left), broken: list(body.broken) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  if (new URL(request.url).searchParams.get("clear") !== "1") {
    return NextResponse.json({ ok: false, error: "pass ?clear=1" }, { status: 400 });
  }
  clearMockLog();
  return NextResponse.json({ ok: true, cleared: true });
}
