import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { q } from "../db.js";
import { tg } from "./telegram.js";

/**
 * الصورة الشخصية:
 *  - نطلبها من تيليغرام (getChat → getFile) ثم نحفظها محلياً
 *  - تُحدَّث كل 6 ساعات على الأكثر، بالخلفية، مع طابور صغير (لا نغرق تيليغرام)
 *  - لوحة التحكم تقدّم الصورة من قرصنا (لا كشف لرمز البوت)
 */

const pending = new Map();
const MAX_BYTES = 2 * 1024 * 1024;
const REFRESH_MS = 6 * 3600 * 1000;

export function avatarFile(userId, version = 0) {
  const p = path.join(config.avatarDir, `${userId}-${version}.jpg`);
  return fs.existsSync(p) ? p : null;
}

export async function refreshAvatar(userId, { force = false } = {}) {
  const u = q.get("SELECT avatar_path, avatar_version, last_seen, photo_file_id FROM users WHERE tg_id = ?", userId);
  if (!u) return null;
  if (config.demo) return u.avatar_path ?? null;

  if (!force && u.avatar_path && fs.existsSync(u.avatar_path)) {
    const age = Date.now() - fs.statSync(u.avatar_path).mtimeMs;
    if (age < REFRESH_MS) return u.avatar_path;
  }
  if (pending.has(userId)) return pending.get(userId);

  const job = (async () => {
    try {
      const info = await tg.getUserPhoto(userId);
      if (!info?.url) return u.avatar_path ?? null;
      const res = await fetch(info.url);
      if (!res.ok) return u.avatar_path ?? null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) return u.avatar_path ?? null;
      const version = (u.avatar_version ?? 0) + 1;
      const dest = path.join(config.avatarDir, `${userId}-${version}.jpg`);
      fs.writeFileSync(dest, buf);
      q.run(
        "UPDATE users SET avatar_path = ?, photo_file_id = ?, avatar_version = ? WHERE tg_id = ?",
        dest,
        info.fileId,
        version,
        userId
      );
      // احذف القديمة
      if (u.avatar_path && u.avatar_path !== dest) {
        try {
          fs.unlinkSync(u.avatar_path);
        } catch {
          /* ignore */
        }
      }
      return dest;
    } catch {
      return u.avatar_path ?? null;
    } finally {
      pending.delete(userId);
    }
  })();

  pending.set(userId, job);
  return job;
}

export function queueAvatar(userId) {
  // خلفية، دفعة صغيرة: لا نزعج طابور الرسائل
  setTimeout(() => {
    refreshAvatar(userId).catch(() => {});
  }, 1500 + Math.floor(Math.random() * 3000));
}

export function hasAvatar(u) {
  return Boolean(u?.avatar_path && fs.existsSync(u.avatar_path));
}
