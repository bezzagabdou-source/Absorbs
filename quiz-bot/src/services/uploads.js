import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { q } from "../db.js";

/**
 * رفع الصور:
 *  - نقبل png/jpeg/webp/gif (ونتحقق من التوقيع الحقيقي لا من الامتداد فقط)
 *  - حد 12 ميغا، ونرفض أي نوع آخر
 *  - تُحفظ بأسماء عشوائية تحت data/uploads ولا تُخدَّم إلا عبر /uploads/<id>
 *  - تُستعمل في: أسئلة مصوّرة، صور البوت/اللوحة، وأي طلب من الذكاء الاصطناعي
 */

export const UPLOAD_DIR = path.join(config.root, "data", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 12 * 1024 * 1024;

const SIGNATURES = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], ext: "png" },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], ext: "jpg" },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38], ext: "gif" },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], ext: "webp", extra: [0x57, 0x45, 0x42, 0x50] },
];

export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => buf[i] === b)) {
      if (sig.extra) {
        const at = buf.indexOf(Buffer.from("WEBP"));
        if (at < 0) continue;
      }
      return sig;
    }
  }
  return null;
}

export function saveUpload(buf, { name = null, mime = null, note = null, kind = "image" } = {}) {
  if (!buf?.length) throw new Error("ملف فارغ");
  if (buf.length > MAX_BYTES) throw new Error("الصورة كبيرة بزّاف (الحد 12 ميغا)");
  const sig = sniffImage(buf);
  if (!sig) throw new Error("الملف ماشي صورة مدعومة (PNG/JPEG/WEBP/GIF)");
  const id = crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "");
  const file = path.join(UPLOAD_DIR, `${id}.${sig.ext}`);
  fs.writeFileSync(file, buf);
  q.run(
    "INSERT INTO uploads(id, name, mime, bytes, path, kind, at, note) VALUES(?,?,?,?,?,?,?,?)",
    id,
    name ? String(name).slice(0, 120) : `image.${sig.ext}`,
    mime ?? sig.mime,
    buf.length,
    file,
    kind,
    Date.now(),
    note ? String(note).slice(0, 300) : null
  );
  return { id, path: `/uploads/${id}`, mime: sig.mime, bytes: buf.length, name };
}

export function getUpload(id) {
  const row = q.get("SELECT * FROM uploads WHERE id = ?", String(id));
  if (!row) return null;
  if (!fs.existsSync(row.path)) return null;
  return row;
}

export function listUploads(limit = 60) {
  return q.all("SELECT id, name, mime, bytes, kind, at, note FROM uploads ORDER BY at DESC LIMIT ?", limit);
}

export function deleteUpload(id) {
  const row = getUpload(id);
  if (!row) return false;
  try {
    fs.unlinkSync(row.path);
  } catch {
    /* ignore */
  }
  q.run("DELETE FROM uploads WHERE id = ?", id);
  return true;
}

export function downloadToFile(url, { name = "image.jpg", kind = "image" } = {}) {
  return fetch(url, { signal: AbortSignal.timeout(20000) })
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab ? saveUpload(Buffer.from(ab), { name, kind }) : null));
}

export function fileToDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const sig = sniffImage(buf) ?? { mime: "image/jpeg" };
  return `data:${sig.mime};base64,${buf.toString("base64")}`;
}

export { MAX_BYTES };
