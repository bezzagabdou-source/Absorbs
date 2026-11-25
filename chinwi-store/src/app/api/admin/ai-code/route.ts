import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import {
  applyToGithub,
  codebaseManifest,
  engineerEnabled,
  mergePullRequest,
  planChange,
  readCodebaseFile,
  type EngineerFileChange,
} from "@/lib/engineer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

const no = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

/** GET ?action=list | ?action=file&path= | ?action=status */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await authed())) return no("غير مصرّح", 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "list";

  if (action === "status") return NextResponse.json({ ok: true, ...engineerEnabled() });

  if (action === "list") {
    const manifest = codebaseManifest();
    const totalBytes = manifest.reduce((sum, f) => sum + f.bytes, 0);
    return NextResponse.json({ ok: true, total: manifest.length, total_kb: Math.round(totalBytes / 1024), manifest });
  }

  if (action === "file") {
    const path = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
    const file = readCodebaseFile(path);
    if (!file) return no("الملف غير موجود في خريطة الكود", 404);
    return NextResponse.json({ ok: true, ...file });
  }

  return no("action غير معروفة");
}

/** POST { action, ... } */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await authed())) return no("غير مصرّح", 401);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return no("JSON غير صالح");
  }
  const action = String(body.action ?? "");

  if (action === "plan") {
    const requestText = String(body.request ?? "");
    const plan = await planChange(requestText);
    return NextResponse.json(plan, { status: plan.ok ? 200 : 200 });
  }

  if (action === "apply") {
    const rawFiles = Array.isArray(body.files) ? body.files : [];
    const files: EngineerFileChange[] = rawFiles
      .slice(0, 10)
      .map((f) => {
        const item = f as Record<string, unknown>;
        return {
          path: String(item?.path ?? ""),
          action: item?.action === "create" ? ("create" as const) : ("modify" as const),
          content: typeof item?.content === "string" ? item.content : "",
        };
      })
      .filter((f) => f.path && f.content);
    if (!files.length) return no("لا توجد ملفات صالحة للتطبيق");
    const result = await applyToGithub(files, {
      title: typeof body.title === "string" ? body.title : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
    });
    return NextResponse.json(result, { status: 200 });
  }

  if (action === "merge") {
    const number = Number(body.number ?? 0);
    const result = await mergePullRequest(number);
    return NextResponse.json(result, { status: 200 });
  }

  return no("action غير معروفة");
}
