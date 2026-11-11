/** وكيل صور الأعضاء: يحوّل ملف تيليجرام إلى صورة قابلة للعرض بدون كشف التوكن. */
import { env } from "@/lib/env";
import { isAdmin } from "@/lib/auth";
import { loadDB, mutate } from "@/lib/store";
import { profilePhoto, safeTg, type TgFile } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map<string, { url: string; at: number }>();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!userId) return new Response("bad id", { status: 400 });
  const db = await loadDB();
  const u = db.users[String(userId)];
  let fileId = u?.photo;
  if (!fileId) {
    fileId = (await profilePhoto(userId)) ?? undefined;
    if (fileId) await mutate((d) => {
      const x = d.users[String(userId)];
      if (x) x.photo = fileId;
      return true;
    });
  }
  if (!fileId) return new Response("no photo", { status: 404 });

  const hit = cache.get(fileId);
  let url = hit && Date.now() - hit.at < 3_600_000 ? hit.url : "";
  if (!url) {
    const f = await safeTg<TgFile>("getFile", { file_id: fileId });
    if (!f?.file_path) return new Response("no file", { status: 404 });
    url = `https://api.telegram.org/file/bot${env.botToken}/${f.file_path}`;
    cache.set(fileId, { url, at: Date.now() });
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return new Response("fetch failed", { status: 502 });
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
