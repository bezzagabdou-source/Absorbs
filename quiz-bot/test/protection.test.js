import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// قاعدة معزولة لكل تشغيل
const dbPath = path.join(os.tmpdir(), `barq-test-${process.pid}.db`);
for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
  try {
    fs.unlinkSync(f);
  } catch {}
}
process.env.DB_PATH = dbPath;
process.env.DEMO = "1";
process.env.DASHBOARD_PASSWORD = "testpass123";
process.env.SESSION_SECRET = "x".repeat(40);
process.env.BOT_TOKEN = "";
process.env.PROTECTION_LEVEL = "max";
process.env.BOT_USERNAME = "barq_test_bot";

const { q, setSetting, seedSettings } = await import("../src/db.js");
const { upsertUser, getUser, blockUser, isBlocked, unblockUser } = await import("../src/services/users.js");
const { awardPoints, pointsBalance, ledger } = await import("../src/services/points.js");
const { guard, Deny, lock, isLocked, unlock } = await import("../src/services/guards.js");
const ref = await import("../src/services/referral.js");
const quiz = await import("../src/services/quiz.js");

seedSettings();

function makeUser(id, extra = {}) {
  return upsertUser(
    {
      id,
      is_bot: false,
      first_name: extra.first_name ?? `مستخدم${id}`,
      last_name: extra.last_name ?? null,
      username: extra.username ?? `user${id}`,
      language_code: "ar",
      is_premium: extra.is_premium ?? false,
    },
    { ip: extra.ip }
  ).user;
}

before(() => {
  setSetting("quiz_seconds", "20");
  setSetting("points_correct", "10");
  setSetting("points_speed_bonus_max", "5");
  setSetting("points_daily", "25");
});

/* ────────────── النقاط ────────────── */

test("النقاط: الرصيد يتغير ويُسجّل في السجل", () => {
  const u = makeUser(1001);
  const r = awardPoints(u.tg_id, 50, "quiz");
  assert.equal(r.applied, 50);
  assert.equal(pointsBalance(u.tg_id), 50);
  assert.ok(ledger(u.tg_id, 5).length >= 1);
});

test("النقاط: لا رصيد سالب أبداً", () => {
  const u = makeUser(1002);
  awardPoints(u.tg_id, 10, "quiz");
  const r = awardPoints(u.tg_id, -999, "spend");
  assert.equal(r.applied, -10);
  assert.equal(pointsBalance(u.tg_id), 0);
});

test("النقاط: يحترم السقف", () => {
  const u = makeUser(1003);
  const r = awardPoints(u.tg_id, 500, "quiz", null, { cap: 100 });
  assert.equal(r.applied, 100);
  assert.equal(pointsBalance(u.tg_id), 100);
});

/* ────────────── الحماية من الرشق ────────────── */

test("الحماية: رشقة أسئلة سريعة تُحظر بسرعة", () => {
  const u = makeUser(2001);
  let blocked = false;
  let deniedAfter = 0;
  for (let i = 0; i < 30; i++) {
    try {
      guard(u, "quiz", { fingerprint: `quiz:mix` });
      deniedAfter++;
    } catch (e) {
      if (e instanceof Deny) {
        blocked = true;
        break;
      }
      throw e;
    }
  }
  assert.ok(blocked, "كان لازم الحماية تحظر الرشق");
  assert.ok(deniedAfter <= 8, `المسموح قبل الحظر ${deniedAfter} — لازم ≤ 8`);
});

test("الحماية: التهديد يُرفض برسالة عربية ومدة", () => {
  const u = makeUser(2002);
  lock(`u:${u.tg_id}`, 5000, "اختبار");
  try {
    guard(u, "quiz");
    assert.fail("كان لازم يرفض");
  } catch (e) {
    assert.ok(e instanceof Deny);
    assert.ok(e.retryAfterMs > 0);
    assert.ok(/[ء-ي]/.test(e.message), "رسالة عربية");
  } finally {
    unlock(`u:${u.tg_id}`);
  }
});

test("الحماية: سقف الكسب داخل نافذة زمنية", () => {
  const u = makeUser(2003);
  awardPoints(u.tg_id, 3000, "quiz"); // استُنفد الرصيد داخل النافذة
  assert.throws(() => guard(u, "quiz", { points: 10 }), /Deny|/);
});

/* ────────────── المسابقة ────────────── */

test("المسابقة: الجواب لا يُرسل للعميل قبل الاختيار", () => {
  const u = makeUser(3001);
  const s = quiz.openQuiz(u, { chatId: u.tg_id });
  assert.ok(s.ok);
  const json = JSON.stringify(s);
  assert.ok(!json.includes('"correct"'), "الرمز لا يجب أن يحتوي الجواب");
  const payload = quiz.verifyPayload(s.token);
  assert.ok(payload, "الرموز موقّعة وصالحة");
});

test("المسابقة: التلاعب بالرمز مرفوض ويُحظر المستخدم", () => {
  const u = makeUser(3002);
  const s = quiz.openQuiz(u, { chatId: u.tg_id });
  const parts = s.token.split(".");
  const tampered = `${parts[0].slice(0, -2)}XX.${parts[1]}`;
  assert.throws(
    () => quiz.answerQuiz(u, { sessionId: s.sessionId, choice: 0, token: tampered }),
    (e) => e instanceof Deny && e.code === "bad_token"
  );
  assert.ok(isLocked(`u:${u.tg_id}`), "المتلاعب يُقفل");
});

test("المسابقة: لا يمكن الإجابة مرتين على نفس السؤال", () => {
  const u = makeUser(3003);
  const s = quiz.openQuiz(u, { chatId: u.tg_id });
  // نسرّع الوقت: نبدّل started_at للوراء باش نتجاوزو فحص السرعة
  q.run("UPDATE quiz_sessions SET started_at = started_at - 3000 WHERE id = ?", s.sessionId);
  const first = quiz.answerQuiz(u, { sessionId: s.sessionId, choice: 1, token: s.token });
  assert.ok(first.ok);
  assert.throws(
    () => quiz.answerQuiz(u, { sessionId: s.sessionId, choice: 1, token: s.token }),
    (e) => e instanceof Deny && e.code === "already_answered"
  );
});

test("المسابقة: جلسة مستخدم آخر مرفوضة", () => {
  const a = makeUser(3004);
  const b = makeUser(3005);
  const s = quiz.openQuiz(a, { chatId: a.tg_id });
  assert.throws(
    () => quiz.answerQuiz(b, { sessionId: s.sessionId, choice: 0, token: s.token }),
    (e) => e instanceof Deny && e.code === "foreign_session"
  );
});

test("المسابقة: الإجابة الأسرع من الآدمي مرفوضة", () => {
  const u = makeUser(3006);
  const s = quiz.openQuiz(u, { chatId: u.tg_id });
  assert.throws(
    () => quiz.answerQuiz(u, { sessionId: s.sessionId, choice: 0, token: s.token }),
    (e) => e instanceof Deny && (e.code === "too_fast" || e.code === "burst")
  );
});

test("المكافأة اليومية: مرة واحدة فقط في اليوم", () => {
  const u = makeUser(3007);
  const a = quiz.dailyReward(u);
  assert.ok(a.ok);
  const b = quiz.dailyReward(u);
  assert.equal(b.ok, false);
  assert.equal(b.reason, "already");
});

/* ────────────── الإحالات ────────────── */

test("الإحالة: رابط فريد لكل مستخدم", () => {
  const a = makeUser(4001);
  const b = makeUser(4002);
  assert.notEqual(ref.referralLink(a), ref.referralLink(b));
  assert.match(ref.referralLink(a), /^https:\/\/t\.me\/\w+\?start=ref_/);
});

test("الإحالة: نفس الشخص لا يعزم نفسه", () => {
  const a = makeUser(4003);
  const res = ref.registerReferral(a, a, { ip: "1.2.3.4" });
  assert.ok(res.suspicious);
  assert.match(res.reasons.join(","), /self_referral/);
});

test("الإحالة: نفس الشبكة = مشبوهة ولا نقاط", () => {
  const a = makeUser(4004, { ip: "41.100.10.5" });
  const b = makeUser(4005, { ip: "41.100.10.9" });
  const before = pointsBalance(a.tg_id);
  const res = ref.registerReferral(b, a, { ip: "41.100.10.77" });
  assert.ok(res.suspicious, "لازم تُعلَّم مشبوهة");
  ref.confirmReferral(b.tg_id, { by: "test" });
  assert.equal(pointsBalance(a.tg_id), before, "ما تزادش حتى نقطة");
});

test("الإحالة: التفعيل بعد النشاط يمنح النقاط مرة واحدة", () => {
  const a = makeUser(4006);
  const b = makeUser(4007);
  setSetting("require_engagement_for_referral", "1");
  const res = ref.registerReferral(b, a, { ip: "8.8.8.8" });
  assert.equal(res.pending, true);
  const first = ref.confirmReferral(b.tg_id, { by: "engagement" });
  assert.equal(first.ok, true);
  assert.ok(first.referrer > 0);
  const second = ref.confirmReferral(b.tg_id, { by: "engagement" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "already");
});

test("الإحالة: السقف اليومي يوقف الفارم", () => {
  const a = makeUser(4008);
  setSetting("max_referrals_per_day", "2");
  setSetting("require_engagement_for_referral", "0");
  const r1 = ref.registerReferral(makeUser(4009), a, { ip: "9.9.9.1" });
  const r2 = ref.registerReferral(makeUser(4010), a, { ip: "9.9.9.2" });
  const r3 = ref.registerReferral(makeUser(4011), a, { ip: "9.9.9.3" });
  assert.ok(!r1.suspicious && !r2.suspicious);
  assert.ok(r3.suspicious);
  assert.match(r3.reasons.join(","), /daily_cap/);
  setSetting("max_referrals_per_day", "25");
});

test("الإحالة: إحالة حساب محظور مرفوضة", () => {
  const a = makeUser(4012);
  const b = makeUser(4013);
  blockUser(a.tg_id, { reason: "اختبار" });
  const res = ref.registerReferral(b, a, { ip: "7.7.7.7" });
  assert.ok(res.suspicious);
  assert.match(res.reasons.join(","), /referrer_blocked/);
});

/* ────────────── الحظر ────────────── */

test("الحظر: مؤقت ثم يرجع", () => {
  const u = makeUser(5001);
  blockUser(u.tg_id, { reason: "اختبار", minutes: 1 });
  assert.equal(isBlocked(getUser(u.tg_id)), true);
  q.run("UPDATE users SET blocked_until = ? WHERE tg_id = ?", Date.now() - 1000, u.tg_id);
  assert.equal(isBlocked(getUser(u.tg_id)), false);
  unblockUser(u.tg_id);
  assert.equal(isBlocked(getUser(u.tg_id)), false);
});

/* ────────────── اللوحة ────────────── */

test("اللوحة: كلمة السر الغالطة مرفوضة والجلسة موقّعة", async () => {
  const auth = await import("../src/services/auth.js");
  const bad = auth.login("10.0.0.1", "wrong");
  assert.equal(bad.ok, false);
  const good = auth.login("10.0.0.1", "testpass123");
  assert.equal(good.ok, true);
  assert.ok(auth.verify(good.cookie, "10.0.0.1"), "الجلسة صالحة");
  const parts = good.cookie.split(".");
  const forged = `${parts[0]}.${parts[1]}.AAAA`;
  assert.equal(auth.verify(forged), null, "التوقيع المزوّر مرفوض");
});

test("اللوحة: الرموز لا تُسرَّب أبداً", async () => {
  const { envTokens } = await import("../src/services/crypto.js");
  const list = envTokens();
  const json = JSON.stringify(list);
  assert.ok(!json.includes("testpass123"), "كلمة السر ما تظهرش");
  assert.ok(list.every((x) => !("value" in x)));
});

/* ────────────── ضد الفارم في الأسماء ────────────── */

test("الإحالة: أسماء متشابهة تُعلَّم", () => {
  const a = makeUser(6001);
  setSetting("max_referrals_per_day", "50");
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const u = makeUser(6100 + i, { first_name: "محمد", last_name: "بن علي" });
    ids.push(u);
    ref.registerReferral(u, a, { ip: `11.11.${i}.1` });
  }
  const last = q.get("SELECT reasons FROM referral_events WHERE new_user_id = ?", ids[3].tg_id);
  assert.match(String(last?.reasons ?? ""), /name_pattern/);
});

test.after?.(() => {
  try {
    fs.unlinkSync(dbPath);
  } catch {}
});
