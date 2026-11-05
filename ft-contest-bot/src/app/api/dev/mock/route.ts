import { NextResponse, type NextRequest } from "next/server";
import { clearMockLog, getMockLog, isMock } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  return NextResponse.json({ ok: true, calls: getMockLog() });
}

export async function DELETE(request: NextRequest) {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  if (new URL(request.url).searchParams.get("clear") !== "1") {
    return NextResponse.json({ ok: false, error: "pass ?clear=1" }, { status: 400 });
  }
  clearMockLog();
  return NextResponse.json({ ok: true, cleared: true });
}
