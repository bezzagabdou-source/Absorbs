import "server-only";
import sharp, { type Sharp } from "sharp";
import { and, eq, sql } from "drizzle-orm";
import { media } from "@/db/schema";
import { withActor } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { AppError, assertFound } from "@/lib/server/errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGES = 8;
const INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"]);

export async function saveUploadedImage(actor: SessionUser, file: File) {
  if (!INPUT_TYPES.has(file.type)) throw new AppError("unsupported_image_type", 415);
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new AppError("image_too_large", 413);
  const input = Buffer.from(await file.arrayBuffer());
  let pipeline: Sharp;
  try {
    pipeline = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > 40_000_000) throw new AppError("invalid_image", 400);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("invalid_image", 400);
  }
  const output = await pipeline.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  if (output.data.byteLength > MAX_IMAGE_BYTES) throw new AppError("image_too_large", 413);
  return withActor(actor, async (tx) => {
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(media).where(eq(media.ownerId, actor.id));
    if ((count?.value ?? 0) >= 200) throw new AppError("media_quota", 409);
    const [row] = await tx.insert(media).values({ ownerId: actor.id, contentType: "image/webp", byteSize: output.data.byteLength, width: output.info.width, height: output.info.height, data: output.data }).returning({ id: media.id, byteSize: media.byteSize, width: media.width, height: media.height });
    return { ...row, url: `/api/media/${row.id}` };
  });
}

export async function getUploadedMedia(id: string) {
  return withActor(null, async (tx) => {
    const [row] = await tx.select({ data: media.data, contentType: media.contentType, byteSize: media.byteSize }).from(media).where(eq(media.id, id));
    assertFound(row);
    return row;
  });
}

export async function deleteUploadedMedia(actor: SessionUser, id: string) {
  return withActor(actor, async (tx) => {
    const [row] = await tx.delete(media).where(and(eq(media.id, id), eq(media.ownerId, actor.id))).returning({ id: media.id });
    assertFound(row);
  });
}

export function isUploadedMediaUrl(value: string): boolean {
  return /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
