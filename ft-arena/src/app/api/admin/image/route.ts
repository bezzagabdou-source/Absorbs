/**
 * توليد صور احترافية للجوائز/البطاقات — بدون أي مفتاح (Pollinations).
 * تُرفع تلقائيًا إلى Blob إن توفّر، وإلا تُعاد كرابط مباشر.
 */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { env } from "@/lib/env";
import { mutate, logActivity } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { prompt?: string; style?: string; width?: number; height?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  const raw = (body.prompt ?? "").trim();
  if (raw.length < 3) return bad("اكتب وصف الصورة");
  const style = body.style ?? "ultra premium 3d render, gold and deep blue, luxury gaming brand, cinematic lighting";
  const w = Math.min(1536, Math.max(512, Number(body.width ?? 1024)));
  const h = Math.min(1536, Math.max(512, Number(body.height ?? 1024)));
  const prompt = `${raw}. ${style}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&enhance=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
      return json({ ok: true, url, warning: "تم إرجاع رابط التوليد، لكن الخدمة تأخرت — افتح الرابط مباشرة." });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    let finalUrl = url;
    if (env.blobToken) {
      try {
        const { put } = await import("@vercel/blob");
        const blob = await put(`ftarena/generated/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`, buf, {
          access: "public",
          contentType: "image/jpeg",
          token: env.blobToken,
        });
        finalUrl = blob.url;
      } catch {
        /* نُبقي رابط pollinations */
      }
    }
    await mutate((db) => {
      db.files.unshift({ name: raw.slice(0, 60), url: finalUrl, size: buf.length, at: new Date().toISOString(), type: "image/jpeg" });
      if (db.files.length > 200) db.files.length = 200;
      logActivity(db, { actor: "ai", icon: "🎨", title: "توليد صورة", detail: raw.slice(0, 80) });
      return true;
    });
    return json({ ok: true, url: finalUrl });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}
