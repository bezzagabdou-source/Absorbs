import { ensureDb, one } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const mediaId = Number(id);
  if (!Number.isFinite(mediaId)) return new Response("bad id", { status: 400 });
  try {
    await ensureDb();
    const row = await one<{ mime: string; data: Buffer; filename: string | null }>(
      "SELECT mime, data, filename FROM media WHERE id = $1",
      [mediaId],
    );
    if (!row) return new Response("not found", { status: 404 });
    const body = new Uint8Array(row.data);
    return new Response(body, {
      headers: {
        "content-type": row.mime || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(body.byteLength),
      },
    });
  } catch (err) {
    return new Response(`error: ${String(err)}`, { status: 500 });
  }
}
