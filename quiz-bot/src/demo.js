import { q, logEvent, getSetting } from "./db.js";
import { makeRefCode } from "./services/users.js";

/**
 * وضع تجريبي: بيانات وهمية واقعية باش تشوف لوحة التحكم كاملة بلا بوت.
 * لا يُشغّل إلا إذا DEMO=1 وقاعدة البيانات فارغة.
 */

const NAMES = [
  ["يوسف", "بن علي", "youssef_dz"],
  ["أمينة", "بوزيد", "amina_bz"],
  ["رياض", "حمادي", "riad_h"],
  ["سارة", "بلقاسم", "sara_belk"],
  ["مهدي", "لعمامرة", "mehdi_lam"],
  ["نور", "شريف", "nour_ch"],
  ["أيوب", "مزيان", "ayoub_mz"],
  ["لينة", "قاسمي", "lina_k"],
  ["إسلام", "بوتخيل", "islam_bt"],
  ["هبة", "زروال", "heba_z"],
  ["أنس", "صحراوي", "anas_sah"],
  ["مريم", "عيساوي", "meriem_iss"],
];

const REASONS = ["same_network", "ip_reused", "velocity", "name_pattern", "same_device"];

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ip = () => `41.${rand(1, 250)}.${rand(1, 250)}.${rand(1, 250)}`;

export function seedDemo() {
  const existing = q.get("SELECT COUNT(*) AS n FROM users").n;
  if (existing > 0) return;

  const base = Date.now();
  const ids = [];

  for (let i = 0; i < NAMES.length; i++) {
    const [first, last, username] = NAMES[i];
    const tgId = 700000000 + i * 13;
    const joined = base - rand(0, 20) * 86400000 - rand(0, 80000000);
    q.run(
      `INSERT INTO users(tg_id, username, first_name, last_name, lang_code, is_premium, is_bot,
        ref_code, points, total_earned, referred_by, referrals, quiz_streak, best_streak, daily_streak,
        quiz_total, quiz_correct, risk_score, signals, joined_at, last_seen, last_ip, created_at)
       VALUES(?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      tgId,
      username,
      first,
      last,
      "ar",
      Math.random() > 0.7 ? 1 : 0,
      makeRefCode(tgId),
      rand(50, 4200),
      rand(200, 6000),
      null,
      rand(0, 14),
      rand(0, 12),
      rand(2, 30),
      rand(0, 9),
      rand(5, 240),
      rand(3, 210),
      pick([0, 0, 0, 5, 12, 28, 45, 62, 78]),
      rand(0, 6),
      joined,
      base - rand(0, 5) * 3600000,
      ip(),
      joined
    );
    ids.push(tgId);
  }

  // إحالات
  for (let i = 1; i < ids.length; i++) {
    const referrer = ids[rand(0, i - 1)];
    const newbie = ids[i];
    const at = base - rand(0, 7) * 86400000;
    const suspicious = Math.random() < 0.25 ? 1 : 0;
    const confirmed = !suspicious && Math.random() < 0.7;
    const reasons = suspicious ? [pick(REASONS), pick(REASONS)].join(",") : "";
    q.run(
      `INSERT INTO referral_events(new_user_id, referrer_id, at, ip, device, ua_hash, ip_hash, suspicious, reasons, points_awarded)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      newbie,
      referrer,
      at,
      ip(),
      "Telegram Mobile",
      null,
      null,
      suspicious,
      reasons,
      confirmed ? 50 : 0
    );
    q.run("UPDATE users SET referred_by = ? WHERE tg_id = ?", referrer, newbie);
    if (confirmed) {
      q.run("UPDATE users SET referrals = referrals + 1 WHERE tg_id = ?", referrer);
      q.run(
        "INSERT INTO points_ledger(user_id, delta, reason, meta, at) VALUES(?,?,?,?,?)",
        referrer,
        50,
        "referral",
        JSON.stringify({ newUser: newbie }),
        at
      );
    }
    if (suspicious) {
      q.run("UPDATE users SET referral_flagged = referral_flagged + 1 WHERE tg_id = ?", referrer);
      logEvent("referral_suspicious", { userId: referrer, severity: "warn", detail: `new=${newbie} reasons=${reasons}`, at });
    }
  }

  // سجل نقاط + أسئلة + أحداث
  for (const id of ids) {
    for (let i = 0; i < rand(2, 8); i++) {
      const at = base - rand(0, 6) * 86400000 - rand(0, 80000000);
      const correct = Math.random() < 0.68;
      q.run(
        "INSERT INTO points_ledger(user_id, delta, reason, meta, at) VALUES(?,?,?,?,?)",
        id,
        correct ? rand(8, 15) : 0,
        correct ? "quiz" : "quiz_wrong",
        null,
        at
      );
      q.run(
        `INSERT INTO quiz_sessions(user_id, chat_id, category, question, correct_idx, options, started_at, expires_at, answered_at, chosen_idx, correct, points)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        id,
        pick(["dz", "general", "science", "sport", "tech", "geo", "math", "religion"]),
        "سؤال تجريبي",
        rand(0, 3),
        JSON.stringify(["أ", "ب", "ج", "د"]),
        at,
        at + 20000,
        at + rand(1500, 15000),
        rand(0, 3),
        correct ? 1 : 0,
        correct ? rand(8, 15) : 0
      );
    }
  }

  const eventKinds = [
    ["burst_block", "warn", "80 حركة في 10 ثواني"],
    ["duplicate_block", "warn", "نفس الحركة 12 مرة"],
    ["quiz_too_fast", "high", "إجابة في 210ms"],
    ["risk_threshold", "warn", "risk 72 → 88"],
    ["webhook_denied", "warn", "bad secret header"],
    ["login_fail", "warn", "كلمة سر غالطة"],
    ["window_cap", "warn", "quiz 3120 > 3000"],
  ];
  for (let i = 0; i < 26; i++) {
    const [kind, severity, detail] = pick(eventKinds);
    logEvent(kind, {
      severity,
      detail,
      userId: Math.random() > 0.5 ? pick(ids) : null,
      ip: ip(),
      at: base - rand(0, 5) * 86400000 - rand(0, 80000000),
    });
  }

  // شبكات محظورة
  for (let i = 0; i < 3; i++) {
    q.run(
      "INSERT OR IGNORE INTO blocked_nets(net, reason, at, expires_at, auto, by_admin) VALUES(?,?,?,?,?,?)",
      `41.${rand(1, 250)}.${rand(1, 250)}.0/24`,
      "رشق نقاط عبر حسابات متعددة",
      base - rand(0, 4) * 86400000,
      null,
      1,
      0
    );
  }

  // حظر تجريبي واحد
  const badId = ids[ids.length - 1];
  q.run(
    "UPDATE users SET blocked = 1, block_reason = 'إحالات مزيفة', blocked_at = ? WHERE tg_id = ?",
    base - 3600000,
    badId
  );

  logEvent("demo_seeded", { detail: `${ids.length} مستخدم تجريبي` });
  console.log("🧪 وضع تجريبي: تعبئة بيانات وهمية");
}

export { getSetting };
