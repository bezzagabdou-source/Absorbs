import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.avatarDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  tg_id          INTEGER PRIMARY KEY,
  username       TEXT,
  first_name     TEXT,
  last_name      TEXT,
  lang_code      TEXT,
  is_premium     INTEGER DEFAULT 0,
  is_bot         INTEGER DEFAULT 0,
  photo_file_id  TEXT,
  avatar_path    TEXT,
  avatar_version INTEGER DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  total_earned   INTEGER NOT NULL DEFAULT 0,
  ref_code       TEXT NOT NULL UNIQUE,
  referred_by    INTEGER,
  referrals      INTEGER NOT NULL DEFAULT 0,
  quiz_streak    INTEGER NOT NULL DEFAULT 0,
  best_streak    INTEGER NOT NULL DEFAULT 0,
  daily_streak   INTEGER NOT NULL DEFAULT 0,
  quiz_total     INTEGER NOT NULL DEFAULT 0,
  quiz_correct   INTEGER NOT NULL DEFAULT 0,
  blocked        INTEGER NOT NULL DEFAULT 0,
  block_reason   TEXT,
  blocked_by     INTEGER,
  blocked_at     INTEGER,
  blocked_until  INTEGER,
  signals        INTEGER NOT NULL DEFAULT 0,
  risk_score     INTEGER NOT NULL DEFAULT 0,
  referral_flagged INTEGER NOT NULL DEFAULT 0,
  last_seen      INTEGER,
  joined_at      INTEGER NOT NULL,
  last_ip        TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_ref     ON users(ref_code);
CREATE INDEX IF NOT EXISTS idx_users_by_ref  ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_points  ON users(points DESC);
CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(blocked);

CREATE TABLE IF NOT EXISTS referral_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  new_user_id INTEGER NOT NULL,
  referrer_id INTEGER NOT NULL,
  at          INTEGER NOT NULL,
  ip          TEXT,
  device      TEXT,
  ua_hash     TEXT,
  ip_hash     TEXT,
  sub_token   TEXT,
  suspicious  INTEGER NOT NULL DEFAULT 0,
  reasons     TEXT,
  points_awarded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_refev_new  ON referral_events(new_user_id);
CREATE INDEX IF NOT EXISTS idx_refev_ref  ON referral_events(referrer_id);
CREATE INDEX IF NOT EXISTS idx_refev_ip   ON referral_events(ip_hash);

CREATE TABLE IF NOT EXISTS referral_subs (
  token      TEXT PRIMARY KEY,
  referrer_id INTEGER NOT NULL,
  ip_hash    TEXT,
  ua_hash    TEXT,
  at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta   INTEGER NOT NULL,
  reason  TEXT NOT NULL,
  meta    TEXT,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_at   ON points_ledger(at DESC);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  chat_id     INTEGER NOT NULL,
  category    TEXT NOT NULL,
  question    TEXT NOT NULL,
  correct_idx INTEGER NOT NULL,
  options     TEXT NOT NULL,
  msg_id      INTEGER,
  started_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  answered_at INTEGER,
  chosen_idx  INTEGER,
  correct     INTEGER,
  points      INTEGER DEFAULT 0,
  token       TEXT
);
CREATE INDEX IF NOT EXISTS idx_qs_user ON quiz_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qs_open ON quiz_sessions(user_id, answered_at, expires_at);

CREATE TABLE IF NOT EXISTS daily_rewards (
  user_id INTEGER NOT NULL,
  day     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  points  INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  at       INTEGER NOT NULL,
  kind     TEXT NOT NULL,
  user_id  INTEGER,
  severity TEXT NOT NULL DEFAULT 'info',
  detail   TEXT,
  ip       TEXT,
  ua       TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_at   ON events(at DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, at DESC);

CREATE TABLE IF NOT EXISTS blocked_nets (
  net        TEXT PRIMARY KEY,
  reason     TEXT,
  at         INTEGER NOT NULL,
  expires_at INTEGER,
  auto       INTEGER NOT NULL DEFAULT 1,
  by_admin   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  text       TEXT NOT NULL,
  total      INTEGER NOT NULL DEFAULT 0,
  sent       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  blocked    INTEGER NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  cursor_id  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,
  question      TEXT NOT NULL,
  options       TEXT NOT NULL,
  correct_idx   INTEGER NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cq_cat ON custom_questions(category, active);

CREATE TABLE IF NOT EXISTS uploads (
  id        TEXT PRIMARY KEY,
  name      TEXT,
  mime      TEXT,
  bytes     INTEGER NOT NULL,
  path      TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'image',
  at        INTEGER NOT NULL,
  used_at   INTEGER,
  note      TEXT
);
CREATE INDEX IF NOT EXISTS idx_uploads_at ON uploads(at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  role      TEXT NOT NULL,
  content   TEXT,
  tools     TEXT,
  tokens    INTEGER DEFAULT 0,
  provider  TEXT,
  model     TEXT,
  latency   INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ai_at ON ai_messages(at DESC);

CREATE TABLE IF NOT EXISTS ai_actions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  tool      TEXT NOT NULL,
  args      TEXT,
  result    TEXT,
  ok        INTEGER NOT NULL DEFAULT 1,
  source    TEXT NOT NULL DEFAULT 'ai',
  undo      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_at ON ai_actions(at DESC);

CREATE TABLE IF NOT EXISTS visits (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  path    TEXT,
  ip      TEXT,
  country TEXT,
  ua      TEXT,
  ref_token TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_at ON visits(at DESC);
`);

/* ─────────────────────────── أدوات مساعدة ─────────────────────────── */

export const q = {
  get: (sql, ...params) => db.prepare(sql).get(...params),
  all: (sql, ...params) => db.prepare(sql).all(...params),
  run: (sql, ...params) => db.prepare(sql).run(...params),
};

let txDepth = 0;

/**
 * معاملة آمنة تدعم التداخل (SAVEPOINT).
 * كل تغيير في النقاط يمرّ من هنا، فلا سباق ولا كتابة جزئية.
 */
export function tx(fn) {
  if (txDepth > 0) {
    const name = `sp_${txDepth}`;
    txDepth++;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const out = fn();
      db.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      try {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      txDepth--;
    }
  }
  db.exec("BEGIN IMMEDIATE");
  txDepth = 1;
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    txDepth = 0;
  }
}

/* ─────────────────────────── الإعدادات ─────────────────────────── */

export const DEFAULT_SETTINGS = {
  bot_enabled: "1",
  maintenance_note: "",
  welcome_text:
    "أهلاً بيك في <b>برق ⚡</b> — بوت المسابقات!\n\n" +
    "• جاوب على الأسئلة واجمع النقاط\n" +
    "• عازم صحابك برابط الإحالة وتربح أكثر\n" +
    "• اجمع نقاطك اليومية بلا ما تخسر السلسلة",
  points_correct: "10",
  points_speed_bonus_max: "5",
  points_daily: "25",
  referral_points: "50",
  referee_points: "15",
  max_referrals_per_day: "25",
  min_account_age_for_referrals_min: "0",
  require_engagement_for_referral: "1",
  quiz_seconds: "20",
  quiz_questions_per_session: "5",
  rate_window_sec: "60",
  max_actions_per_window: "40",
};

export function getSetting(key, fallback = undefined) {
  const row = q.get("SELECT value FROM settings WHERE key = ?", key);
  if (row) return row.value;
  if (fallback !== undefined) return fallback;
  return DEFAULT_SETTINGS[key];
}

export function getSettingInt(key, fallback = undefined) {
  const n = Number.parseInt(getSetting(key, fallback), 10);
  if (Number.isFinite(n)) return n;
  return Number.parseInt(DEFAULT_SETTINGS[key] ?? "0", 10);
}

export function setSetting(key, value) {
  q.run(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    String(value)
  );
}

export function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of q.all("SELECT key, value FROM settings")) out[row.key] = row.value;
  return out;
}

export function seedSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    q.run("INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", k, v);
  }
}

/* ─────────────────────────── السجلات ─────────────────────────── */

export function logEvent(kind, { userId = null, severity = "info", detail = null, ip = null, ua = null, at = Date.now() } = {}) {
  try {
    q.run(
      "INSERT INTO events(at, kind, user_id, severity, detail, ip, ua) VALUES(?,?,?,?,?,?,?)",
      at,
      kind,
      userId,
      severity,
      detail == null ? null : String(detail).slice(0, 2000),
      ip,
      ua ? String(ua).slice(0, 300) : null
    );
  } catch {
    /* never break the bot because of logging */
  }
}

export function pruneOld() {
  const cut = Date.now() - 30 * 86400000;
  q.run("DELETE FROM events WHERE at < ?", cut);
  q.run("DELETE FROM visits WHERE at < ?", cut);
  q.run("DELETE FROM referral_subs WHERE at < ?", Date.now() - 7 * 86400000);
  q.run("DELETE FROM quiz_sessions WHERE expires_at < ?", Date.now() - 86400000);
}
