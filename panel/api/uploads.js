/* FT AI — رفع أي صورة (بلا قيود نوع ولا حجم معقول) + عرضها من Redis */
import { methods, authed, body, sniff } from "./_lib.js";
import { json, updateState, getImage, putImage, delImage, uid, now } from "../lib/core.js";

const MAX = 8 * 1024 * 1024;

export default methods({
  GET: authed(async (req, res, state) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");
    if (id) {
      const img = await getImage(id);
      if (!img) return json(res, 404, { ok: false, error: "الصورة ماكانتش" });
      const buf = Buffer.from(img.data, "base64");
      res.statusCode = 200;
      res.setHeader("content-type", img.mime || "image/jpeg");
      res.setHeader("cache-control", "public, max-age=86400, immutable");
      res.setHeader("content-length", String(buf.length));
      return res.end(buf);
    }
    return json(res, 200, { ok: true, count: state.uploads.length, uploads: state.uploads.slice().reverse() });
  }),

  POST: authed(async (req, res) => {
    const b = await body(req);
    const m = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(String(b?.data ?? "").trim());
    if (!m) return json(res, 400, { ok: false, error: "صيغة الصورة غير مفهومة" });
    const buf = Buffer.from(m[2], "base64");
    if (!buf.length) return json(res, 400, { ok: false, error: "الملف خاوي" });
    if (buf.length > MAX) return json(res, 413, { ok: false, error: "الصورة كبيرة بزاف (حد 8 ميغا)" });
    const mime = sniff(buf) ?? m[1];
    const id = uid(8);
    await putImage(id, { data: buf.toString("base64"), mime, at: now(), name: String(b?.name ?? "صورة").slice(0, 80) });
    const meta = { id, name: String(b?.name ?? "صورة").slice(0, 80), mime, bytes: buf.length, at: now(), url: `/api/uploads?id=${id}` };
    await updateState((s) => { s.uploads.push(meta); if (s.uploads.length > 60) s.uploads.shift(); return s; });
    return json(res, 200, { ok: true, upload: meta });
  }),

  DELETE: authed(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id") ?? "";
    await delImage(id);
    await updateState((s) => { s.uploads = s.uploads.filter((u) => u.id !== id); return s; });
    return json(res, 200, { ok: true, deleted: id });
  }),
});
