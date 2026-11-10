import crypto from "node:crypto";
import { q, tx, getSettingInt, getSetting, logEvent } from "../db.js";
import { config } from "../config.js";
import { QUESTIONS, CATEGORIES, categoryLabel, shuffledQuestion } from "../data/questions.js";
import { randomCustomQuestion } from "./questions.js";
import { awardPoints } from "./points.js";
import { guard, Deny, jitter, profile, lock } from "./guards.js";
import { confirmOnEngagement } from "./referral.js";
import { sha256 } from "../util.js";

const SECRET = config.sessionSecret || "barq-quiz";

/* ───────────── رموز موقّعة (تمنع التلاعب من العميل) ───────────── */

export function signPayload(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url").slice(0, 22);
  return `${body}.${mac}`;
}

export function verifyPayload(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url").slice(0, 22);
  if (mac !== expect) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/* ───────────── إنشاء سؤال ───────────── */

const recentByUser = new Map(); // userId -> last N question ids

function chooseQuestion(category) {
  const pool = category && category !== "mix"
    ? QUESTIONS.filter((x) => x.cat === category)
    : QUESTIONS;
  // الأسئلة المخصّصة (مضافة من اللوحة أو الذكاء الاصطناعي) تُدمج بنسبة 40%
  if (Math.random() < 0.4) {
    const custom = randomCustomQuestion(category);
    if (custom) return { ...custom, text: custom.text, options: custom.options, correct: custom.correct, cat: custom.cat };
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function openQuiz(user, { chatId, category = "mix" } = {}) {
  const open = q.get(
    "SELECT id FROM quiz_sessions WHERE user_id = ? AND answered_at IS NULL AND expires_at > ? LIMIT 1",
    user.tg_id,
    Date.now()
  );
  if (open) return { ok: false, reason: "open_session", sessionId: open.id };

  // حد يومي للأسئلة (مقاومة الرشق)
  const perDay = getSettingInt("quiz_per_day", 200);
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const playedToday = q.get(
    "SELECT COUNT(*) AS n FROM quiz_sessions WHERE user_id = ? AND started_at >= ?",
    user.tg_id,
    from.getTime()
  ).n;
  if (playedToday >= perDay) {
    return { ok: false, reason: "daily_cap", cap: perDay };
  }

  guard(user, "quiz", { fingerprint: `quiz:${category}`, points: getSettingInt("points_correct", 10) });

  const base = chooseQuestion(category);
  const shuffled = shuffledQuestion(base);
  const seconds = Math.max(5, Math.min(120, getSettingInt("quiz_seconds", 20)));
  const startedAt = Date.now();
  const expiresAt = startedAt + seconds * 1000;

  const r = q.run(
    `INSERT INTO quiz_sessions(user_id, chat_id, category, question, correct_idx, options, started_at, expires_at)
     VALUES(?,?,?,?,?,?,?,?)`,
    user.tg_id,
    chatId,
    base.cat,
    base.text,
    shuffled.correct,
    JSON.stringify(shuffled.options),
    startedAt,
    expiresAt
  );

  const sessionId = Number(r.lastInsertRowid);
  const token = signPayload({
    s: sessionId,
    u: user.tg_id,
    a: shuffled.correct,
    e: expiresAt,
    n: crypto.randomBytes(6).toString("hex"),
  });

  q.run("UPDATE quiz_sessions SET token = ? WHERE id = ?", token, sessionId);

  q.run("UPDATE users SET quiz_total = quiz_total + 1 WHERE tg_id = ?", user.tg_id);

  return {
    ok: true,
    sessionId,
    token,
    question: base.text,
    options: shuffled.options,
    category: base.cat,
    categoryLabel: categoryLabel(base.cat),
    seconds,
    expiresAt,
  };
}

/* ───────────── الإجابة ───────────── */

export function answerQuiz(user, { sessionId, choice, token, ip = null }) {
  const now = Date.now();
  const s = q.get("SELECT * FROM quiz_sessions WHERE id = ?", Number(sessionId));
  if (!s) throw new Deny("السؤال غير موجود", { code: "no_session" });
  if (s.user_id !== user.tg_id) {
    logEvent("quiz_foreign_session", {
      userId: user.tg_id,
      severity: "high",
      detail: `session=${sessionId} owner=${s.user_id}`,
      ip,
    });
    lock(`u:${user.tg_id}`, 5 * 60000, "محاولة انتحال جلسة");
    throw new Deny("هذا السؤال ماشي تاعك 🛑", { code: "foreign_session", severity: "high" });
  }
  if (s.answered_at) throw new Deny("جاوبت عليه من قبل ✋", { code: "already_answered" });
  if (now > s.expires_at) throw new Deny("وقت السؤال فات ⏱️", { code: "expired" });

  const payload = verifyPayload(token ?? s.token);
  if (!payload || payload.s !== s.id || payload.u !== user.tg_id) {
    logEvent("quiz_bad_token", { userId: user.tg_id, severity: "high", detail: `session=${sessionId}`, ip });
    lock(`u:${user.tg_id}`, 10 * 60000, "رمز جلسة مزوّر");
    throw new Deny("محاولة تلاعب مرفوضة 🛑", { code: "bad_token", severity: "high" });
  }

  // فحص السرعة المستحيلة: إجابة أسرع من 700 مللي ثانية = بوت
  const elapsed = now - s.started_at;
  if (elapsed < 700) {
    lock(`u:${user.tg_id}`, 3 * 60000, "إجابة أسرع من الآدمي");
    logEvent("quiz_too_fast", { userId: user.tg_id, severity: "high", detail: `${elapsed}ms`, ip });
    throw new Deny("سرعة مستحيلة 🇿🇼🛑 توقّف شوية", { code: "too_fast", severity: "high" });
  }

  guard(user, "quiz", { fingerprint: `answer:${sessionId}`, points: getSettingInt("points_correct", 10) });

  const idx = Number(choice);
  if (!Number.isInteger(idx) || idx < 0 || idx > 3) throw new Deny("اختيار غير صحيح", { code: "bad_choice" });

  const correct = idx === s.correct_idx;
  const basePts = getSettingInt("points_correct", 10);
  const speedMax = getSettingInt("points_speed_bonus_max", 5);
  const window = Math.max(1, s.expires_at - s.started_at);
  const ratio = Math.max(0, Math.min(1, 1 - elapsed / window));
  const speedBonus = correct ? Math.round(speedMax * ratio) : 0;
  const points = correct ? basePts + speedBonus : 0;

  tx(() => {
    q.run(
      "UPDATE quiz_sessions SET answered_at = ?, chosen_idx = ?, correct = ?, points = ? WHERE id = ? AND answered_at IS NULL",
      now,
      idx,
      correct ? 1 : 0,
      points,
      s.id
    );
    if (correct) {
      q.run(
        "UPDATE users SET quiz_correct = quiz_correct + 1, quiz_streak = quiz_streak + 1 WHERE tg_id = ?",
        user.tg_id
      );
      q.run(
        "UPDATE users SET best_streak = MAX(best_streak, quiz_streak) WHERE tg_id = ?",
        user.tg_id
      );
    } else {
      q.run("UPDATE users SET quiz_streak = 0 WHERE tg_id = ?", user.tg_id);
    }
  });

  let awarded = 0;
  if (points > 0) {
    const res = awardPoints(user.tg_id, points, "quiz", { session: s.id, elapsed, speedBonus });
    awarded = res.applied ?? 0;
  }

  // أول إجابة صحيحة = تفعيل الإحالة المعلّقة (نشاط حقيقي)
  let referral = null;
  if (correct) referral = confirmOnEngagement(user.tg_id);

  return {
    ok: true,
    correct,
    correctIndex: s.correct_idx,
    options: JSON.parse(s.options),
    points: awarded,
    speedBonus,
    streak: q.get("SELECT quiz_streak, best_streak FROM users WHERE tg_id = ?", user.tg_id),
    referral,
  };
}

/* ───────────── الإحصاءات ───────────── */

export function quizStats(userId) {
  const u = q.get("SELECT quiz_total, quiz_correct, quiz_streak, best_streak FROM users WHERE tg_id = ?", userId);
  const daily = q.get(
    `SELECT COUNT(*) AS n, SUM(correct) AS c FROM quiz_sessions
      WHERE user_id = ? AND answered_at IS NOT NULL AND started_at >= ?`,
    userId,
    (() => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    })()
  );
  const acc = u?.quiz_total ? Math.round((u.quiz_correct / u.quiz_total) * 100) : 0;
  return {
    total: u?.quiz_total ?? 0,
    correct: u?.quiz_correct ?? 0,
    streak: u?.quiz_streak ?? 0,
    best: u?.best_streak ?? 0,
    accuracy: acc,
    today: daily?.n ?? 0,
    todayCorrect: daily?.c ?? 0,
  };
}

export function categories() {
  return CATEGORIES;
}

export function leaderboard(limit = 10) {
  return q.all(
    "SELECT tg_id, username, first_name, last_name, points, quiz_streak, avatar_version, avatar_path FROM users WHERE is_bot = 0 ORDER BY points DESC LIMIT ?",
    limit
  );
}

export function dailyReward(user, ip = null) {
  const day = new Date().toISOString().slice(0, 10);
  const already = q.get("SELECT * FROM daily_rewards WHERE user_id = ? AND day = ?", user.tg_id, day);
  if (already) return { ok: false, reason: "already", points: already.points, at: already.at };

  const pts = getSettingInt("points_daily", 25);
  // مكافأة سلسلة: +5 لكل يوم متتالي حتى 30
  const prevDay = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const hadYesterday = q.get("SELECT 1 AS x FROM daily_rewards WHERE user_id = ? AND day = ?", user.tg_id, prevDay);
  const streak = (user.daily_streak ?? 0) + 1;
  const effectiveStreak = hadYesterday ? streak : 1;
  const bonus = Math.min(30, (effectiveStreak - 1) * 5);
  const total = pts + bonus;

  guard(user, "daily", { fingerprint: `daily:${day}`, points: total, ip });

  const out = tx(() => {
    q.run("INSERT INTO daily_rewards(user_id, day, at, points) VALUES(?,?,?,?)", user.tg_id, day, Date.now(), total);
    q.run("UPDATE users SET daily_streak = ? WHERE tg_id = ?", effectiveStreak, user.tg_id);
    return awardPoints(user.tg_id, total, "daily", { day, bonus, streak: effectiveStreak });
  });
  return { ok: true, points: out.applied ?? 0, bonus, streak: effectiveStreak, base: pts };
}

export { sha256, getSetting, profile, jitter };
