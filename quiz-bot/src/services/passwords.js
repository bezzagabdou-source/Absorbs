import crypto from "node:crypto";
import { config } from "../config.js";
import { q } from "../db.js";

/**
 * كلمة سر لوحة التحكم:
 *  - الافتراضية من DASHBOARD_PASSWORD، ويمكن تغييرها من اللوحة نفسها
 *  - تُخزَّن كبصمة scrypt مع salt عشوائي (لا نص صريح أبداً)
 *  - تغييرها يُبطل كل الجلسات وإبطال البصمة القديمة
 */

const SETTING = "dashboard_password_hash";

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export function verifyPasswordHash(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(keyB64, "base64url");
    const got = crypto.scryptSync(String(password), salt, expected.length, { N: 16384, r: 8, p: 1 });
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

/** بصمة ثابتة لتفادي مقارنة نص صريح عند الحاجة */
function seedFingerprint() {
  return crypto
    .createHash("sha256")
    .update(`v1:${config.dashboardPassword ?? ""}:${config.sessionSecret ?? ""}`)
    .digest("hex");
}

export function storedHash() {
  const row = q.get("SELECT value FROM settings WHERE key = ?", SETTING);
  return row?.value ?? null;
}

export function ensurePasswordInitialized() {
  if (storedHash()) return;
  if (config.dashboardPassword) {
    q.run(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      SETTING,
      hashPassword(config.dashboardPassword)
    );
  }
}

export function checkPassword(password) {
  const stored = storedHash();
  if (stored) return verifyPasswordHash(password, stored);
  // احتياطي: لو لم يُهيّأ بعد، نقارن مع متغيّر البيئة
  if (!config.dashboardPassword) return false;
  const a = crypto.createHash("sha256").update(`v1:${password}:${config.sessionSecret}`).digest();
  const b = Buffer.from(seedFingerprint(), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setPassword(password) {
  if (!password || String(password).length < 8) throw new Error("كلمة السر لازم 8 أحرف على الأقل");
  q.run(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    SETTING,
    hashPassword(password)
  );
  q.run("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", "password_changed_at", String(Date.now()));
}

export function passwordChangedAt() {
  const row = q.get("SELECT value FROM settings WHERE key = 'password_changed_at'");
  return row ? Number(row.value) : null;
}

export const PASSWORD_SETTING = SETTING;
