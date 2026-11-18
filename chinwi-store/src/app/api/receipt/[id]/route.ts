import { cookies } from "next/headers";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { ensureDb, one } from "@/lib/db";
import { downloadFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** صورة إيصال الدفع — محمية بجلسة الإدارة */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const store = await cookies();
  if (!verifyToken(store.get(COOKIE_NAME)?.value)) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) return new Response("bad id", { status: 400 });

  await ensureDb();
  const row = await one<{ receipt_file_id: string | null }>("SELECT receipt_file_id FROM orders WHERE id = $1", [orderId]);
  if (!row?.receipt_file_id) return new Response("no receipt", { status: 404 });
  const file = await downloadFile(row.receipt_file_id);
  if (!file) return new Response("unavailable", { status: 404 });
  const body = new Uint8Array(file.data);
  return new Response(body, {
    headers: {
      "content-type": file.mime,
      "cache-control": "private, max-age=300",
      "content-length": String(body.byteLength),
    },
  });
}
