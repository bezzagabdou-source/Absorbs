/** رفع الصور والملفات إلى Vercel Blob وإرجاع روابط جاهزة للاستخدام في البوت. */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { env } from "@/lib/env";
import { logActivity, mutate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 8 * 1024 * 1024; // 8MB

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return bad("لم يتم إرسال ملف");
    if (file.size > MAX) return bad("الحجم الأقصى 8 ميغابايت");
    const type = file.type || "application/octet-stream";
    const okTypes = /^(image\/|video\/|audio\/|application\/pdf|application\/zip|application\/json|text\/plain)/;
    if (!okTypes.test(type)) return bad("نوع الملف غير مدعوم");

    if (!env.blobToken) return bad("BLOB_READ_WRITE_TOKEN غير مضبوط — أضِفه في متغيرات Vercel لتفعيل الرفع.");

    const { put } = await import("@vercel/blob");
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().slice(0, 8);
    const safeName = `mx/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(safeName, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: type,
      token: env.blobToken,
    });

    await mutate((db) => {
      db.files.unshift({ name: file.name, url: blob.url, size: file.size, at: new Date().toISOString(), type });
      if (db.files.length > 200) db.files.length = 200;
      logActivity(db, { actor: "admin", icon: "📎", title: `رفع ملف: ${file.name}`, detail: `${Math.round(file.size / 1024)} KB` });
      return true;
    });

    return json({ ok: true, url: blob.url, name: file.name, size: file.size, type });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}

export async function GET() {
  const g = await guard();
  if (g) return g;
  const { loadDB } = await import("@/lib/store");
  const db = await loadDB();
  return json({ ok: true, files: db.files, blobReady: Boolean(env.blobToken) });
}
