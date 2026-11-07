import { q, tx } from "../db.js";
import { refCode, displayName, sha256 } from "../util.js";
import { config } from "../config.js";

const SALT = config.sessionSecret || "barq";

export function makeRefCode(tgId) {
  let code = refCode(tgId, SALT);
  let guard = 0;
  while (q.get("SELECT 1 AS x FROM users WHERE ref_code = ?", code)) {
    guard++;
    code = refCode(`${tgId}:${guard}`, SALT + guard);
    if (guard > 50) code = sha256(`${tgId}:${Math.random()}`).slice(0, 10);
  }
  return code;
}

export function upsertUser(from, { ip = null } = {}) {
  const now = Date.now();
  const tgId = from.id;
  const existing = q.get("SELECT * FROM users WHERE tg_id = ?", tgId);
  if (existing) {
    q.run(
      `UPDATE users SET username=?, first_name=?, last_name=?, lang_code=?, is_premium=?, is_bot=?, last_seen=?, last_ip=COALESCE(?, last_ip), avatar_version =
         CASE WHEN photo_file_id IS NULL AND ? IS NOT NULL THEN avatar_version ELSE avatar_version END
       WHERE tg_id=?`,
      from.username ?? null,
      from.first_name ?? null,
      from.last_name ?? null,
      from.language_code ?? null,
      from.is_premium ? 1 : 0,
      from.is_bot ? 1 : 0,
      now,
      ip,
      null,
      tgId
    );
    if (from.username && existing.username !== from.username) {
      q.run("UPDATE users SET username=? WHERE tg_id=?", from.username, tgId);
    }
    return { user: q.get("SELECT * FROM users WHERE tg_id = ?", tgId), isNew: false };
  }

  const code = makeRefCode(tgId);
  q.run(
    `INSERT INTO users(tg_id, username, first_name, last_name, lang_code, is_premium, is_bot,
      ref_code, points, total_earned, joined_at, last_seen, last_ip, created_at)
     VALUES(?,?,?,?,?,?,?,?,0,0,?,?,?,?)`,
    tgId,
    from.username ?? null,
    from.first_name ?? null,
    from.last_name ?? null,
    from.language_code ?? null,
    from.is_premium ? 1 : 0,
    from.is_bot ? 1 : 0,
    code,
    now,
    now,
    ip,
    now
  );
  return { user: q.get("SELECT * FROM users WHERE tg_id = ?", tgId), isNew: true };
}

export function getUser(tgId) {
  return q.get("SELECT * FROM users WHERE tg_id = ?", tgId);
}

export function getUserByRef(ref) {
  if (!ref) return null;
  return q.get("SELECT * FROM users WHERE ref_code = ?", String(ref).trim());
}

export function setAvatar(tgId, { path, fileId, version }) {
  q.run(
    "UPDATE users SET avatar_path = ?, photo_file_id = ?, avatar_version = ? WHERE tg_id = ?",
    path,
    fileId ?? null,
    version,
    tgId
  );
}

export function touch(tgId, ip = null) {
  q.run(
    "UPDATE users SET last_seen = ?, last_ip = COALESCE(?, last_ip) WHERE tg_id = ?",
    Date.now(),
    ip,
    tgId
  );
}

export function isBlocked(user) {
  if (!user) return false;
  if (!user.blocked) return false;
  if (user.blocked_until && user.blocked_until < Date.now()) return false;
  return true;
}

export function blockUser(tgId, { reason = "حظر إداري", by = null, minutes = null } = {}) {
  const until = minutes ? Date.now() + minutes * 60000 : null;
  q.run(
    "UPDATE users SET blocked=1, block_reason=?, blocked_at=?, blocked_until=?, blocked_by=? WHERE tg_id=?",
    reason,
    Date.now(),
    until,
    by,
    tgId
  );
}

export function unblockUser(tgId) {
  q.run(
    "UPDATE users SET blocked=0, block_reason=NULL, blocked_at=NULL, blocked_until=NULL WHERE tg_id=?",
    tgId
  );
}

export function bumpSignal(tgId, amount = 1, cap = 100) {
  return tx(() => {
    q.run(
      "UPDATE users SET signals = MIN(?, signals + ?) WHERE tg_id = ?",
      cap,
      amount,
      tgId
    );
    return q.get("SELECT signals, risk_score FROM users WHERE tg_id = ?", tgId);
  });
}

export function setRisk(tgId, score) {
  q.run("UPDATE users SET risk_score = MAX(0, MIN(100, ?)) WHERE tg_id = ?", Math.round(score), tgId);
}

export function addReferralCount(tgId) {
  q.run("UPDATE users SET referrals = referrals + 1 WHERE tg_id = ?", tgId);
}

export function topUsers(limit = 10) {
  return q.all(
    "SELECT tg_id, username, first_name, last_name, points, referrals, risk_score, blocked, avatar_version FROM users WHERE is_bot = 0 ORDER BY points DESC LIMIT ?",
    limit
  );
}

export function formatUser(u) {
  return displayName(u);
}

export function userPublic(u) {
  if (!u) return null;
  return {
    tg_id: u.tg_id,
    username: u.username,
    name: displayName(u),
    first_name: u.first_name,
    last_name: u.last_name,
    lang_code: u.lang_code,
    is_premium: !!u.is_premium,
    points: u.points,
    total_earned: u.total_earned,
    referrals: u.referrals,
    ref_code: u.ref_code,
    avatar_version: u.avatar_version,
    has_avatar: !!u.avatar_path || !!u.photo_file_id,
    risk_score: u.risk_score,
    signals: u.signals,
    blocked: isBlocked(u),
    joined_at: u.joined_at,
    last_seen: u.last_seen,
  };
}
