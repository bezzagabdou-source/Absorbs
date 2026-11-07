import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { api, ok } from "@/lib/server/http";
import { idSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/server/errors";
import { deleteUploadedMedia, getUploadedMedia } from "@/lib/server/media";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  const { id } = idSchema.parse(await context.params);
  const row = await getUploadedMedia(id);
  return new NextResponse(new Uint8Array(row.data), { headers: { "Content-Type": row.contentType, "Content-Length": String(row.byteSize), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
export async function DELETE(request: NextRequest, context: Context) {
  return api(request, { auth: true, mutation: true, roles: ["seller", "admin"] }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    const { id } = idSchema.parse(await context.params);
    await deleteUploadedMedia(actor, id);
    return ok({ deleted: true });
  });
}
