import { q, logEvent, getSettingInt } from "../db.js";
import { config } from "../config.js";
import { SlidingCounter, sha256, similar, sleep, esc } from "../util.js";

/* ────────────────────────── مستويات الحماية ────────────────────────── */

const PROFILES = {
  off: { burstMs: 1500, burstN: 100, dupWindowMs: 1500, dupN: 50, lockMs: 0, riskBanAt: 101, slowMs: 0 },
  normal: { burstMs: 8000, burstN: 18, dupWindowMs: 10000, dupN: 4, lockMs: 8000, riskBanAt: 85, slowMs: 120 },
  high: { burstMs: 10000, burstN: 10, dupWindowMs: 15000, dupN: 3, lockMs: 15000, riskBanAt: 70, slowMs: 250 },
  max: { burstMs: 10000, burstN: 7, dupWindowMs: 20000, dupN: 2, lockMs: 30000, riskBanAt: 60, slowMs: 400 },
};

export function profile() {
  return PROFILES[config.protectionLevel] ?? PROFILES.max;
}

/* ────────────────────────── حالة في الذاكرة ────────────────────────── */

const counters = new SlidingCounter();
const locks = new Map(); // key -> {until, reason}
const buckets = new Map(); // userId -> {tokens, last}
const lastAction = new Map(); // userId -> {at, fingerprint, count}

export const KIND_MULTIPLIER = {
  quiz: 1,
  referral: 2.5,
  daily: 1.5,
  message: 0.5,
  reward: 2,
};

/** حماية من رشقات النقاط: سقف للكسب داخل نافذة زمنية لكل مستخدم ولكل نوع */
const WINDOW_CAPS = {
  quiz: { max: 3000, ms: 15 * 60000 },
  referral: { max: 2000, ms: 60 * 60000 },
  daily: { max: 300, ms: 24 * 3600000 },
  reward: { max: 1500, ms: 60 * 60000 },
};

export function isLocked(key) {
  const rec = locks.get(key);
  if (!rec) return null;
  if (rec.until <= Date.now()) {
    locks.delete(key);
    return null;
  }
  return rec;
}

export function lock(key, ms, reason = "نشاط مريب") {
  const until = Math.max(locks.get(key)?.until ?? 0, Date.now() + ms);
  locks.set(key, { until, reason });
  return { until, reason };
}

export function unlock(key) {
  locks.delete(key);
}

export function resetUserState(userId) {
  locks.delete(`u:${userId}`);
  lastAction.delete(userId);
  buckets.delete(userId);
  countsFor(userId).clear?.();
}

const userCounters = new Map();
function countsFor(userId) {
  let c = userCounters.get(userId);
  if (!c) {
    c = {
      clear: () => userCounters.delete(userId),
      hit: (type, ms) => counters.hitCount(`u:${userId}:${type}`, ms),
      hitKey: (type, key, ms) => counters.hitCount(`u:${userId}:${type}:${key}`, ms),
    };
    userCounters.set(userId, c);
    if (userCounters.size > 5000) {
      // تنظيف خفيف
      for (const k of [...userCounters.keys()].slice(0, 1000)) userCounters.delete(k);
    }
  }
  return c;
}

/* ────────────────────────── نتيجة قرار ────────────────────────── */

export class Deny extends Error {
  constructor(message, { code = "denied", retryAfterMs = 0, severity = "warn" } = {}) {
    super(message);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.severity = severity;
  }
}

function deny(message, opts) {
  throw new Deny(message, opts);
}

/* ────────────────────────── إشارات الخطر ────────────────────────── */

export function addSignal(userId, weight, kind, detail = null, ip = null) {
  const user = q.get("SELECT signals, risk_score FROM users WHERE tg_id = ?", userId);
  if (!user) return;
  const p = profile();
  q.run("UPDATE users SET signals = MIN(100, signals + ?) WHERE tg_id = ?", Math.round(weight * 10) / 10, userId);
  const prev = user.risk_score;
  const next = Math.min(100, Math.round(prev + weight * (KIND_MULTIPLIER[kind] ?? 1)));
  q.run("UPDATE users SET risk_score = ? WHERE tg_id = ?", next, userId);
  // اضمحلال تلقائي
  q.run(
    "UPDATE users SET risk_score = MAX(0, risk_score - 1) WHERE tg_id = ? AND last_seen IS NOT NULL AND last_seen < ?",
    userId,
    Date.now() - 6 * 3600000
  );
  if (next >= p.riskBanAt && prev < p.riskBanAt) {
    lock(`u:${userId}`, 10 * 60000, "درجة خطر مرتفعة");
    logEvent("risk_threshold", {
      userId,
      severity: "warn",
      detail: `risk ${prev} → ${next} (${kind}) ${detail ? String(detail).slice(0, 200) : ""}`,
      ip,
    });
  }
  return next;
}

/* ────────────────────────── بوابة الحركة ────────────────────────── */

/**
 * تُستدعى قبل أي إجراء يمنح نقاطاً أو يستهلك موارد.
 * ترجع true أو ترمي Deny.
 */
export function guard(user, kind = "message", { fingerprint = null, ip = null, points = 0 } = {}) {
  const p = profile();
  if (config.protectionLevel === "off" || !user) return true;
  const uid = user.tg_id;

  const lockRec = isLocked(`u:${uid}`);
  if (lockRec) {
    deny(`تبدّى بزّاف ⏳ حاول بعد ${Math.ceil((lockRec.until - Date.now()) / 1000)} ثانية`, {
      code: "locked",
      retryAfterMs: lockRec.until - Date.now(),
    });
  }
  const ipLock = ip ? isLocked(`ip:${sha256(ip).slice(0, 16)}`) : null;
  if (ipLock) {
    deny("نشاط مريب من شبكتك، جرب لاحقاً", { code: "ip_locked", retryAfterMs: ipLock.until - Date.now(), severity: "high" });
  }

  // 1) رشقات: عدد الحركات في نافذة صغيرة
  const c = countsFor(uid);
  const burst = c.hit("burst", p.burstMs);
  if (burst > p.burstN) {
    addSignal(uid, 3, "message", `burst ${kind}`, ip);
    const lk = lock(`u:${uid}`, p.lockMs, "رشق حركات");
    logEvent("burst_block", { userId: uid, severity: "warn", detail: `${kind} ${burst}/${p.burstN}`, ip });
    deny(`بزّاف حركات في وقت قصير 🛑 مسموح ${p.burstN} حركة كل ${Math.round(p.burstMs / 1000)} ثانية`, {
      code: "burst",
      retryAfterMs: lk.until - Date.now(),
    });
  }

  // 2) تكرار نفس الإجراء بشكل متطابق
  const la = lastAction.get(uid);
  const fpNow = fingerprint ?? kind;
  if (la && la.fingerprint === fpNow) {
    const dupN = c.hitKey("dup", fingerprint ?? kind, p.dupWindowMs);
    if (dupN > p.dupN) {
      addSignal(uid, 4, kind, `duplicate ${kind}`, ip);
      const lk = lock(`u:${uid}`, p.lockMs, "تكرار مريب");
      logEvent("duplicate_block", { userId: uid, severity: "warn", detail: `${kind} x${dupN}`, ip });
      deny("كاين تكرار مريب في الحركات 🛑 تنفّس شوية", { code: "duplicate", retryAfterMs: lk.until - Date.now() });
    }
  }
  lastAction.set(uid, { at: Date.now(), fingerprint: fpNow });

  // 3) سقف الكسب داخل نافذة لكل نوع
  const cap = WINDOW_CAPS[kind];
  if (cap && points > 0) {
    const row = q.get(
      "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ? AND delta > 0 AND reason LIKE ?",
      uid,
      Date.now() - cap.ms,
      `${kind}%`
    );
    if ((row?.s ?? 0) + points > cap.max) {
      addSignal(uid, 5, kind, `window cap ${kind}`, ip);
      logEvent("window_cap", {
        userId: uid,
        severity: "warn",
        detail: `${kind} ${row?.s ?? 0}+${points} > ${cap.max}`,
        ip,
      });
      deny("وصلت للسقف المسموح في هذه المدة 🛑 ارجع بعد شوية", { code: "window_cap", retryAfterMs: cap.ms });
    }
  }

  return true;
}

/** تهدئة بسيطة ضد الإغراق (لا ترمي استثناء) */
export function jitter() {
  const p = profile();
  if (!p.slowMs) return 0;
  const ms = p.slowMs + Math.floor(Math.random() * p.slowMs * 0.7);
  return ms;
}

export function takeBucket(key, { capacity = 10, refillPerSec = 0.5 } = {}) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, last: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;
  if (b.tokens < 1) {
    const waitMs = Math.ceil(((1 - b.tokens) / refillPerSec) * 1000);
    return { ok: false, waitMs };
  }
  b.tokens -= 1;
  return { ok: true, waitMs: 0 };
}

export function unlockIp(ip) {
  if (!ip) return;
  locks.delete(`ip:${sha256(ip).slice(0, 16)}`);
}

/* ────────────────────────── شبكة IP ────────────────────────── */

export function netOf(ip) {
  if (!ip) return null;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return parts.slice(0, 3).join(".") + ".0/24";
    return null;
  }
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return null;
}

export function blockNet(ip, { reason = "حظر شبكة", minutes = null, auto = true, byAdmin = false } = {}) {
  const net = netOf(ip);
  if (!net) return null;
  q.run(
    "INSERT INTO blocked_nets(net, reason, at, expires_at, auto, by_admin) VALUES(?,?,?,?,?,?) ON CONFLICT(net) DO UPDATE SET reason=excluded.reason, expires_at=excluded.expires_at, at=excluded.at",
    net,
    reason,
    Date.now(),
    minutes ? Date.now() + minutes * 60000 : null,
    auto ? 1 : 0,
    byAdmin ? 1 : 0
  );
  logEvent("net_block", { severity: "warn", detail: `${net} — ${reason}`, ip });
  return net;
}

export function isNetBlocked(ip) {
  const net = netOf(ip);
  if (!net) return false;
  const row = q.get("SELECT * FROM blocked_nets WHERE net = ?", net);
  if (!row) return false;
  if (row.expires_at && row.expires_at < Date.now()) {
    q.run("DELETE FROM blocked_nets WHERE net = ?", net);
    return false;
  }
  return row;
}

/* ────────────────────────── كشف الفارم ────────────────────────── */

/** هل يبدو النص رسالة تكرارية/سبام؟ */
export function looksSpammy(text) {
  const t = String(text ?? "").trim();
  if (t.length < 4) return false;
  if (/(.)\1{8,}/.test(t)) return true; // حرف مكرر بلا نهاية
  const words = t.split(/\s+/);
  if (words.length >= 6) {
    const uniq = new Set(words.map((w) => w.toLowerCase())).size;
    if (uniq / words.length < 0.45) return true;
  }
  const links = (t.match(/https?:\/\//g) ?? []).length;
  if (links >= 3) return true;
  return false;
}

export { similar, sleep, esc, getSettingInt };
