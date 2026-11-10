/* أدوات مشتركة لكل نقاط النهاية */
import { json, readBody, requireAuth } from "../lib/core.js";

export const methods = (map) => async (req, res) => {
  const m = (req.method || "GET").toUpperCase();
  const fn = map[m];
  if (!fn) {
    res.setHeader("allow", Object.keys(map).join(", "));
    return json(res, 405, { ok: false, error: "طريقة غير مسموحة" });
  }
  try {
    return await fn(req, res);
  } catch (e) {
    console.error("[ftai]", e);
    return json(res, 500, { ok: false, error: String(e?.message ?? e).slice(0, 300) });
  }
};

export const authed = (fn) => async (req, res) => {
  const state = await requireAuth(req, res);
  if (!state) return;
  return fn(req, res, state);
};

export const body = (req) => readBody(req);

export const baseUrl = (req) => {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  return `${proto}://${host}`;
};

/* تحقّق من نوع الصورة من البايتات (بلا تبعيات) */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(4, 12).toString("ascii").startsWith("ftypavi")) return "image/avif";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "image/avif";
  if (buf.subarray(0, 2).toString("ascii") === "BM") return "image/bmp";
  if (/^\s*<svg[\s>]/i.test(buf.subarray(0, 200).toString("utf8"))) return "image/svg+xml";
  return null;
}

export function decodeDataUrl(dataUrl) {
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(String(dataUrl ?? "").trim());
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  const mime = sniff(buf) ?? m[1];
  return { buf, mime };
}
