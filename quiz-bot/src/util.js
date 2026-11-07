import crypto from "node:crypto";

export const now = () => Date.now();
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

export function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function lastNDays(n, from = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(from - i * 86400000));
  return out;
}

export function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function hmac(secret, s) {
  return crypto.createHmac("sha256", String(secret)).update(String(s)).digest("base64url");
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

export function randToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function refCode(tgId, salt = "") {
  // قصير، قابل للقراءة، وغير قابل للتخمين بسهولة
  const h = crypto.createHash("sha256").update(`${salt}:${tgId}`).digest("base64url");
  return h.slice(0, 8).replace(/[^A-Za-z0-9]/g, "").padEnd(8, "0");
}

export function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function levenshtein(a, b) {
  a = String(a ?? "");
  b = String(b ?? "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** نسبة تشابه 0..1 */
export function similar(a, b) {
  const A = String(a ?? "").trim().toLowerCase();
  const B = String(b ?? "").trim().toLowerCase();
  if (!A || !B) return 0;
  if (A === B) return 1;
  const d = levenshtein(A, B);
  return 1 - d / Math.max(A.length, B.length);
}

export function fmtDuration(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s} ثانية`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ساعة`;
  return `${Math.round(h / 24)} يوم`;
}

export function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** عرض اسم المستخدم بشكل آمن في تيليغرام (HTML) */
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function displayName(u) {
  if (!u) return "مجهول";
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : `#${u.tg_id}`);
}

export function num(n) {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

/** حاوية أرقام لكل نافذة زمنية في الذاكرة (سريعة جداً) */
export class SlidingCounter {
  constructor() {
    this.map = new Map();
  }
  hit(key, ts = Date.now()) {
    const arr = this.map.get(key) ?? [];
    arr.push(ts);
    this.map.set(key, arr);
    return arr;
  }
  count(key, windowMs, ts = Date.now()) {
    const arr = this.map.get(key);
    if (!arr) return 0;
    const from = ts - windowMs;
    let i = 0;
    while (i < arr.length && arr[i] < from) i++;
    if (i) arr.splice(0, i);
    if (!arr.length) this.map.delete(key);
    return arr.length;
  }
  /** عدد الأحداث في النافذة + تسجيل حدث الآن */
  hitCount(key, windowMs, ts = Date.now()) {
    const arr = this.hit(key, ts);
    const from = ts - windowMs;
    let i = 0;
    while (i < arr.length && arr[i] < from) i++;
    if (i) arr.splice(0, i);
    return arr.length;
  }
  sweep(maxAgeMs = 10 * 60 * 1000, ts = Date.now()) {
    for (const [k, arr] of this.map) {
      const from = ts - maxAgeMs;
      const kept = arr.filter((t) => t >= from);
      if (!kept.length) this.map.delete(k);
      else this.map.set(k, kept);
    }
  }
}

/** شبكة تقريبية من عنوان IP لمقارنة الأجهزة/الشبكات */
export function netLike(ip) {
  if (!ip) return null;
  const s = String(ip).split(",")[0].trim();
  if (s.includes(".")) {
    const p = s.split(".");
    if (p.length === 4) return p.slice(0, 3).join(".") + ".0/24";
    return null;
  }
  if (s.includes(":")) return s.split(":").slice(0, 4).join(":") + "::/64";
  return null;
}
