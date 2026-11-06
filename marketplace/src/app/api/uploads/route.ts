import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { MAX_UPLOAD_BYTES, saveUploadedImage } from "@/lib/server/media";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: NextRequest) {
  return api(request, { auth: true, mutation: true, roles: ["seller", "admin"], limit: 20, windowMs: 60_000 }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new AppError("invalid_input", 400);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_UPLOAD_BYTES + 65_536) throw new AppError("image_too_large", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("invalid_input", 400, { file: ["required"] });
    return ok(await saveUploadedImage(actor, file), 201);
  });
}
