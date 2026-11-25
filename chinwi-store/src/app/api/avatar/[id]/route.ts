import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { ensureDb, one } from "@/lib/db";
import { downloadFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** صورة حساب المستخدم (من تيليجرام) — محمية بجلسة الإدارة */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const store = await cookies();
  if (!verifyToken(store.get(COOKIE_NAME)?.value)) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const tgId = Number(id);
  if (!Number.isFinite(tgId)) return new Response("bad id", { status: 400 });

  await ensureDb();
  const row = await one<{ avatar_file_id: string | null }>("SELECT avatar_file_id FROM users WHERE tg_id = $1", [tgId]);
  if (!row?.avatar_file_id) return new Response("no avatar", { status: 404 });
  const file = await downloadFile(row.avatar_file_id);
  if (!file) return new Response("unavailable", { status: 404 });
  const body = new Uint8Array(file.data);
  return new Response(body, {
    headers: {
      "content-type": file.mime,
      "cache-control": "private, max-age=1800",
      "content-length": String(body.byteLength),
    },
  });
}
