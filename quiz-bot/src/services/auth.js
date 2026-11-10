import crypto from "node:crypto";
import { config } from "../config.js";
import { safeEqual, randToken, sha256 } from "../util.js";
import { rateLimit } from "../web/http.js";
import { checkPassword, setPassword, ensurePasswordInitialized, passwordChangedAt } from "./passwords.js";

/**
 * جلسات لوحة التحكم:
 *  - كلمة السر تُقارَن بـ timingSafeEqual (وتُخزَّن كبصمة في الذاكرة فقط)
 *  - كوكي HttpOnly + SameSite=Strict + Secure في الإنتاج
 *  - توقيع HMAC على الجلسة، عمر 8 ساعات، وتُلغى كلها عند تغيير كلمة السر
 *  - محاولات الدخول محدودة لكل IP (5/5 دقائق) مع تأخير تصاعدي
 */

const COOKIE = "barq_sess";
const TTL_MS = 8 * 3600 * 1000;
const sessions = new Map(); // id -> {at, exp, ip, ua}
const failed = new Map(); // ip -> {n, until}

export function passwordFingerprint() {
  return sha256(`${config.dashboardPassword}:${config.sessionSecret}`);
}

/** تغيير كلمة السر: يتطلب الحالية، ويُبطل كل الجلسات */
export function changePassword(current, next) {
  if (!checkPassword(String(current ?? ""))) return { ok: false, error: "كلمة السر الحالية غالطة" };
  const pw = String(next ?? "");
  if (pw.length < 8) return { ok: false, error: "كلمة السر الجديدة لازم 8 أحرف على الأقل" };
  if (pw === String(current ?? "")) return { ok: false, error: "كلمة السر الجديدة نفس القديمة" };
  if (!/[A-Za-z؀-ۿ]/.test(pw) || !/[0-9]/.test(pw)) {
    return { ok: false, error: "خلي فيها حرف ورقم باش تكون قوية" };
  }
  setPassword(pw);
  revokeAll();
  return { ok: true };
}

function sign(data) {
  return crypto.createHmac("sha256", config.sessionSecret || "dev").update(data).digest("base64url");
}

export function login(ip, password, ua = "") {
  const key = `login:${ip}`;
  const rl = rateLimit(key, { max: 8, windowMs: 5 * 60000 });
  const f = failed.get(ip);
  if (f && f.until > Date.now()) {
    return { ok: false, error: "محاولات كثيرة. جرب بعد شوية.", waitMs: f.until - Date.now() };
  }
  if (!rl.ok) return { ok: false, error: "محاولات كثيرة. جرب بعد شوية.", waitMs: rl.retryMs };

  ensurePasswordInitialized();
  if (!checkPassword(String(password ?? ""))) {
    const n = (f?.n ?? 0) + 1;
    const until = n >= 5 ? Date.now() + Math.min(15 * 60000, n * 60000) : 0;
    failed.set(ip, { n, until });
    return { ok: false, error: "كلمة السر غالطة", left: Math.max(0, 5 - n) };
  }
  failed.delete(ip);

  const id = randToken(18).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  sessions.set(id, { at: Date.now(), exp: Date.now() + TTL_MS, ip, ua: String(ua).slice(0, 120), pwAt: passwordChangedAt() ?? 0 });
  const payload = `${id}.${Date.now() + TTL_MS}`;
  const cookieValue = `${payload}.${sign(payload)}`;
  return { ok: true, cookie: cookieValue, id };
}

export function verify(cookieValue, ip = null) {
  if (!cookieValue) return null;
  const parts = String(cookieValue).split(".");
  if (parts.length !== 3) return null;
  const [id, expRaw, mac] = parts;
  const payload = `${id}.${expRaw}`;
  if (!safeEqual(mac, sign(payload))) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const s = sessions.get(id);
  if (!s || s.exp < Date.now()) {
    sessions.delete(id);
    return null;
  }
  // لو تغيّرت كلمة السر بعد إنشاء الجلسة ⇒ تُلغى
  const pca = passwordChangedAt() ?? 0;
  if ((s.pwAt ?? 0) < pca) {
    sessions.delete(id);
    return null;
  }
  s.lastSeen = Date.now();
  return { id, ...s, ip: s.ip };
}

export function logout(cookieValue) {
  const parts = String(cookieValue ?? "").split(".");
  if (parts[0]) sessions.delete(parts[0]);
}

export function cookieName() {
  return COOKIE;
}

export function setSessionCookie(res, value) {
  const secure = config.env === "production" || /^https:/.test(config.publicUrl);
  res.setHeader(
    "set-cookie",
    `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(
      TTL_MS / 1000
    )}${secure ? "; Secure" : ""}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function sessionCount() {
  let n = 0;
  for (const [k, v] of sessions) {
    if (v.exp > Date.now()) n++;
    else sessions.delete(k);
  }
  return n;
}

export function revokeAll() {
  sessions.clear();
}
