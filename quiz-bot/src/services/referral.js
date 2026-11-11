import { q, tx, logEvent, getSettingInt, getSetting } from "../db.js";
import { config } from "../config.js";
import { randToken, sha256, netLike, similar, dayKey } from "../util.js";
import { awardPoints } from "./points.js";
import { addSignal, lock, isNetBlocked } from "./guards.js";
import { getUser } from "./users.js";

/* ───────────── رموز الإحالة ───────────── */

export function subToken(referrerId) {
  const existing = q.get(
    "SELECT token FROM referral_subs WHERE referrer_id = ? ORDER BY at DESC LIMIT 1",
    referrerId
  );
  if (existing) return existing.token;
  const token = randToken(9).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).padEnd(10, "x");
  q.run(
    "INSERT INTO referral_subs(token, referrer_id, at) VALUES(?,?,?)",
    token,
    referrerId,
    Date.now()
  );
  return token;
}

export function referralLink(user) {
  const token = subToken(user.tg_id);
  const bot = config.botUsername || "YourBot";
  return `https://t.me/${bot}?start=ref_${token}`;
}

export function webReferralLink(user, base = config.publicUrl) {
  const token = subToken(user.tg_id);
  const bot = config.botUsername || "YourBot";
  return `${base}/r/${token}?to=${encodeURIComponent(`https://t.me/${bot}?start=ref_${token}`)}`;
}

/* ───────────── قراءة معامل البداية ───────────── */

export function parseStartParam(param) {
  if (!param) return null;
  const m = /^ref_([A-Za-z0-9]{6,20})$/.exec(String(param).trim());
  return m ? m[1] : null;
}

export function resolveRefToken(token) {
  if (!token) return null;
  const sub = q.get("SELECT * FROM referral_subs WHERE token = ?", token);
  if (!sub) return null;
  const user = getUser(sub.referrer_id);
  return user && !user.blocked ? user : null;
}

/* ───────────── تقييم الاحتيال قبل منح النقاط ───────────── */

function ipBucket(ip) {
  return netLike(ip);
}

/**
 * يسجّل إحالة جديدة (بحالة pending) ويعيد قراراً.
 * لا يُمنح أي نقطة هنا إلا إذا لم تكن هناك شبهة و التحقق مطلوب غير مفعّل.
 */
export function registerReferral(newUser, referrerInput, { ip = null, ua = null, device = null } = {}) {
  // نقرأ المُحيل من القاعدة من جديد: الحظر/الخطر ممكن يتبدّل بين القراءة والتنفيذ
  const referrer = getUser(referrerInput.tg_id) ?? referrerInput;
  const now = Date.now();
  const reasons = [];
  let suspicious = false;

  const ipHash = ip ? sha256(ip) : null;
  const uaHash = ua ? sha256(ua) : null;

  if (newUser.tg_id === referrer.tg_id) {
    reasons.push("self_referral");
    suspicious = true;
  }
  if (newUser.referred_by) {
    reasons.push("already_referred");
    suspicious = true;
  }
  if (referrer.blocked) {
    reasons.push("referrer_blocked");
    suspicious = true;
  }
  if (ip && isNetBlocked(ip)) {
    reasons.push("ip_blocked");
    suspicious = true;
  }

  // نفس الشبكة (IP) بين المُحيل والمُحال — أقوى إشارة على حسابات متعددة
  if (ip && referrer.last_ip && ipBucket(ip) && ipBucket(ip) === ipBucket(referrer.last_ip)) {
    reasons.push("same_network");
    suspicious = true;
  }
  // نفس متصفح/جهاز
  if (uaHash) {
    const sameDevice = q.get(
      "SELECT 1 AS x FROM referral_events WHERE ua_hash = ? AND referrer_id = ? LIMIT 1",
      uaHash,
      referrer.tg_id
    );
    if (sameDevice) {
      reasons.push("same_device");
      suspicious = true;
    }
  }
  // نفس الـ IP استُعمل لحساب آخر في آخر 7 أيام
  if (ipHash) {
    const prior = q.get(
      "SELECT new_user_id FROM referral_events WHERE ip_hash = ? AND at > ? AND new_user_id != ? LIMIT 1",
      ipHash,
      now - 7 * 86400000,
      newUser.tg_id
    );
    if (prior) {
      reasons.push("ip_reused");
      suspicious = true;
    }
  }
  // عمر الحساب
  const minAgeMin = getSettingInt("min_account_age_for_referrals_min", 0);
  if (minAgeMin > 0 && now - referrer.joined_at < minAgeMin * 60000) reasons.push("referrer_too_new");

  // سقف يومي للإحالات
  const maxPerDay = getSettingInt("max_referrals_per_day", 25);
  const today = dayKey(now);
  const todayCount = q.get(
    "SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ? AND at >= ?",
    referrer.tg_id,
    new Date(`${today}T00:00:00.000Z`).getTime()
  ).n;
  if (todayCount >= maxPerDay) {
    reasons.push("daily_cap");
    suspicious = true;
  }
  // سرعة غير طبيعية: 5 إحالات في 10 دقائق
  const fast = q.get(
    "SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ? AND at > ?",
    referrer.tg_id,
    now - 10 * 60000
  ).n;
  if (fast >= 5) {
    reasons.push("velocity");
    suspicious = true;
  }
  // أسماء/حسابات متشابهة بزاف (فارم)
  const recent = q.all(
    "SELECT u.first_name, u.last_name, u.username FROM referral_events e JOIN users u ON u.tg_id = e.new_user_id WHERE e.referrer_id = ? ORDER BY e.at DESC LIMIT 20",
    referrer.tg_id
  );
  const nameNow = [newUser.first_name, newUser.last_name].filter(Boolean).join(" ");
  if (nameNow && recent.length >= 3) {
    const dupes = recent.filter((r) => {
      const n = [r.first_name, r.last_name].filter(Boolean).join(" ");
      return n && similar(n, nameNow) > 0.86;
    }).length;
    if (dupes >= 2) {
      reasons.push("name_pattern");
      suspicious = true;
    }
    if (newUser.username && recent.some((r) => r.username && similar(r.username, newUser.username) > 0.85)) {
      reasons.push("username_pattern");
      suspicious = true;
    }
  }

  const requireEngagement = getSetting("require_engagement_for_referral", "1") === "1";

  const eventId = tx(() => {
    q.run("UPDATE users SET referred_by = ? WHERE tg_id = ? AND referred_by IS NULL", referrer.tg_id, newUser.tg_id);
    const r = q.run(
      `INSERT INTO referral_events(new_user_id, referrer_id, at, ip, device, ua_hash, ip_hash, sub_token, suspicious, reasons, points_awarded)
       VALUES(?,?,?,?,?,?,?,?,?,?,0)`,
      newUser.tg_id,
      referrer.tg_id,
      now,
      ip,
      device,
      uaHash,
      ipHash,
      sha256(String(referrer.tg_id)).slice(0, 16),
      suspicious ? 1 : 0,
      reasons.join(",")
    );
    return Number(r.lastInsertRowid);
  });

  if (suspicious) {
    // حظر تلقائي للشبكة إذا تكرّر الفارم منها (3 إحالات مشبوهة/24 ساعة)
    if (ip) {
      const recentBad = q.get(
        "SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1 AND ip = ? AND at > ?",
        ip,
        Date.now() - 86400000
      ).n;
      if (recentBad >= 3) {
        lock(`ip:${sha256(ip).slice(0, 16)}`, 6 * 3600000, "فارم إحالات");
        logEvent("referral_farm_net", { severity: "high", detail: `ip=${ip} hits=${recentBad}`, ip });
      }
    }
    addSignal(referrer.tg_id, 2, "referral", reasons.join(","), ip);
    q.run("UPDATE users SET referral_flagged = referral_flagged + 1 WHERE tg_id = ?", referrer.tg_id);
    logEvent("referral_suspicious", {
      userId: referrer.tg_id,
      severity: "warn",
      detail: `new=${newUser.tg_id} reasons=${reasons.join(",")}`,
      ip,
      ua,
    });
  }

  const autoConfirm = !suspicious && !requireEngagement;
  if (autoConfirm) confirmReferral(newUser.tg_id, { by: "auto" });

  return { eventId, suspicious, reasons, pending: !autoConfirm };
}

/** تأكيد الإحالة ومنح النقاط (مرة واحدة فقط) */
export function confirmReferral(newUserId, { by = "engagement" } = {}) {
  const ev = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", newUserId);
  if (!ev) return { ok: false, reason: "no_event" };
  if (ev.points_awarded > 0) return { ok: false, reason: "already" };
  if (ev.suspicious) return { ok: false, reason: "suspicious" };
  if (ev.at < Date.now() - 7 * 86400000) return { ok: false, reason: "expired" };

  const referrer = getUser(ev.referrer_id);
  const referee = getUser(newUserId);
  if (!referrer || !referee) return { ok: false, reason: "missing" };
  if (referrer.blocked) return { ok: false, reason: "referrer_blocked" };

  const refPts = getSettingInt("referral_points", 50);
  const newPts = getSettingInt("referee_points", 15);

  const out = tx(() => {
    const a = awardPoints(referrer.tg_id, refPts, "referral", { newUser: newUserId, by });
    const b = awardPoints(newUserId, newPts, "referral_welcome", { referrer: referrer.tg_id });
    q.run(
      "UPDATE referral_events SET points_awarded = ? WHERE id = ?",
      a.applied ?? 0,
      ev.id
    );
    if ((a.applied ?? 0) > 0) {
      q.run("UPDATE users SET referrals = referrals + 1 WHERE tg_id = ?", referrer.tg_id);
    }
    return { referrer: a.applied ?? 0, referee: b.applied ?? 0 };
  });

  logEvent("referral_confirmed", {
    userId: referrer.tg_id,
    detail: `new=${newUserId} +${out.referrer}/${out.referee} by=${by}`,
  });
  return { ok: true, ...out };
}

/** رفض/إلغاء إحالة مشبوهة */
export function rejectReferral(newUserId, reason = "يدوي") {
  q.run(
    "UPDATE referral_events SET suspicious = 1, reasons = COALESCE(reasons,'') || ? WHERE new_user_id = ?",
    `,rejected:${reason}`,
    newUserId
  );
  logEvent("referral_rejected", { detail: `new=${newUserId} — ${reason}`, severity: "warn" });
}

/* ───────────── إحصاءات ───────────── */

export function referrerSummary(referrerId) {
  const total = q.get("SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ?", referrerId).n;
  const confirmed = q.get(
    "SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ? AND points_awarded > 0",
    referrerId
  ).n;
  const pending = q.get(
    "SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ? AND points_awarded = 0 AND suspicious = 0",
    referrerId
  ).n;
  const flagged = q.get(
    "SELECT COUNT(*) AS n FROM referral_events WHERE referrer_id = ? AND suspicious = 1",
    referrerId
  ).n;
  const earned = q.get(
    "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND reason = 'referral'",
    referrerId
  ).s;
  return { total, confirmed, pending, flagged, earned };
}

export function invitees(referrerId, limit = 100) {
  return q.all(
    `SELECT e.id, e.at, e.suspicious, e.reasons, e.points_awarded, e.ip, e.device,
            u.tg_id, u.username, u.first_name, u.last_name, u.avatar_version,
            u.avatar_path, u.photo_file_id, u.points
       FROM referral_events e JOIN users u ON u.tg_id = e.new_user_id
      WHERE e.referrer_id = ? ORDER BY e.at DESC LIMIT ?`,
    referrerId,
    limit
  );
}

export function referrersBoard(limit = 50) {
  return q.all(
    `SELECT r.tg_id, r.username, r.first_name, r.last_name, r.avatar_path, r.avatar_version,
            COUNT(e.id) AS invites,
            SUM(CASE WHEN e.points_awarded > 0 THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN e.suspicious = 1 THEN 1 ELSE 0 END) AS flagged
       FROM users r LEFT JOIN referral_events e ON e.referrer_id = r.tg_id
      GROUP BY r.tg_id
      HAVING invites > 0
      ORDER BY confirmed DESC, invites DESC LIMIT ?`,
    limit
  );
}

export function pendingReferrals(limit = 100) {
  return q.all(
    `SELECT e.id, e.at, e.referrer_id, e.new_user_id, e.reasons,
            u.username, u.first_name, u.last_name, u.points, u.quiz_total,
            ru.username AS ref_username, ru.first_name AS ref_first_name
       FROM referral_events e
       JOIN users u ON u.tg_id = e.new_user_id
       JOIN users ru ON ru.tg_id = e.referrer_id
      WHERE e.points_awarded = 0 AND e.suspicious = 0
      ORDER BY e.at DESC LIMIT ?`,
    limit
  );
}

export function confirmOnEngagement(userId) {
  const ev = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", userId);
  if (!ev || ev.points_awarded > 0 || ev.suspicious) return null;
  return confirmReferral(userId, { by: "engagement" });
}

export { lock };
