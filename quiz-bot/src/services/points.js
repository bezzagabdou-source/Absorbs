import { q, tx, getSettingInt } from "../db.js";

export const MAX_POINTS = 100_000_000;

/**
 * الوحيدة المسموح لها بتغيير النقاط.
 * - تُسجّل كل حركة في points_ledger (تدقيق كامل)
 * - تمنع النقاط السالبة
 * - تمنع التجاوز فوق سقف
 * - ذرّية داخل معاملة (لا سباق بين عمليتين)
 */
export function awardPoints(userId, delta, reason, meta = null, { cap = MAX_POINTS } = {}) {
  const amount = Math.trunc(Number(delta));
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, applied: 0 };
  return tx(() => {
    const u = q.get("SELECT points, total_earned FROM users WHERE tg_id = ?", userId);
    if (!u) return { ok: false, applied: 0 };
    let applied = amount;
    if (amount < 0) applied = -Math.min(u.points, Math.abs(amount));
    if (amount > 0) applied = Math.min(amount, Math.max(0, cap - u.points));
    if (applied === 0) {
      q.run(
        "INSERT INTO points_ledger(user_id, delta, reason, meta, at) VALUES(?,?,?,?,?)",
        userId,
        0,
        reason + ":capped",
        JSON.stringify({ requested: amount, cap }),
        Date.now()
      );
      return { ok: false, applied: 0 };
    }
    q.run(
      "UPDATE users SET points = points + ?, total_earned = total_earned + ? WHERE tg_id = ?",
      applied,
      applied > 0 ? applied : 0,
      userId
    );
    q.run(
      "INSERT INTO points_ledger(user_id, delta, reason, meta, at) VALUES(?,?,?,?,?)",
      userId,
      applied,
      reason,
      meta ? JSON.stringify(meta) : null,
      Date.now()
    );
    return { ok: true, applied };
  });
}

export function spendPoints(userId, cost, reason, meta = null) {
  return awardPoints(userId, -Math.abs(cost), reason, meta);
}

export function pointsBalance(userId) {
  return q.get("SELECT points FROM users WHERE tg_id = ?", userId)?.points ?? 0;
}

export function ledger(userId, limit = 50) {
  return q.all(
    "SELECT delta, reason, meta, at FROM points_ledger WHERE user_id = ? ORDER BY at DESC LIMIT ?",
    userId,
    limit
  );
}

export function todayEarned(userId, reasonPrefix = null) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const row = reasonPrefix
    ? q.get(
        "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ? AND reason LIKE ?",
        userId,
        from.getTime(),
        reasonPrefix + "%"
      )
    : q.get(
        "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ?",
        userId,
        from.getTime()
      );
  return row?.s ?? 0;
}

export function earnedSince(userId, sinceTs, reasonPrefix = null) {
  const row = reasonPrefix
    ? q.get(
        "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ? AND reason LIKE ?",
        userId,
        sinceTs,
        reasonPrefix + "%"
      )
    : q.get(
        "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ?",
        userId,
        sinceTs
      );
  return row?.s ?? 0;
}

export function dailyDailyCap(userId) {
  const cap = getSettingInt("daily_points_cap", 0);
  if (!cap) return null;
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const earned = q.get(
    "SELECT COALESCE(SUM(delta),0) AS s FROM points_ledger WHERE user_id = ? AND at >= ? AND delta > 0",
    userId,
    from.getTime()
  ).s;
  return { cap, earned, remaining: Math.max(0, cap - earned) };
}
