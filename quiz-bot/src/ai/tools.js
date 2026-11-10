import { q, logEvent, getSetting, getSettingInt, setSetting, allSettings } from "../db.js";
import { config } from "../config.js";
import { tg } from "../services/telegram.js";
import { getUser, blockUser, unblockUser, makeRefCode, userPublic } from "../services/users.js";
import { awardPoints, pointsBalance, ledger } from "../services/points.js";
import { referralLink, invitees, referrerSummary, confirmReferral, rejectReferral } from "../services/referral.js";
import { openQuiz, leaderboard, quizStats } from "../services/quiz.js";
import { categoryLabel } from "../data/questions.js";
import { CATEGORIES } from "../data/questions.js";
import { unlock, unlockIp, blockNet, profile, isLocked } from "../services/guards.js";
import { saveUpload, listUploads, deleteUpload, downloadToFile } from "../services/uploads.js";
import { startBroadcast, broadcastStatus } from "../services/broadcast.js";
import { customQuestions, addQuestion, removeQuestion, customStats } from "../services/questions.js";
import { setPassword } from "../services/passwords.js";
import { fmtDateTime, num } from "../util.js";

/**
 * كل قدرات البوت كأدوات. الذكاء الاصطناعي يختار ويُنفّذ — بلا رفض.
 * أي أداة ترجع نصاً قصيراً (نتيجة) حتى يستطيع النموذج المتابعة.
 * كل تنفيذ يُسجّل في ai_actions (مع إمكانية تراجع للأدوات الحسّاسة).
 */

const ok = (o) => ({ ok: true, ...o });

function findUser({ user_id, username }) {
  if (user_id != null && String(user_id).trim()) {
    const byId = getUser(Number(user_id));
    if (byId) return byId;
  }
  if (username) {
    const clean = String(username).replace(/^@/, "").trim();
    return q.get("SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1", clean);
  }
  return null;
}

function needUser(args) {
  const u = findUser(args);
  if (!u) throw new Error(`ما لقيتش المستخدم (user_id=${args.user_id ?? "—"} / username=${args.username ?? "—"})`);
  return u;
}

function needUserId(args) {
  if (args.user_id != null && String(args.user_id).trim()) return Number(args.user_id);
  return needUser(args).tg_id;
}

export const TOOLS = [
  /* ─────────── بحث وقراءة ─────────── */
  {
    name: "get_stats",
    category: "read",
    description: "إحصائيات البوت الكاملة: المستخدمون، النقاط، الإحالات (مفعّلة/معلّقة/مشبوهة)، المحظورون، الشبكات المحظورة، الأسئلة، حالة طابور تيليغرام ومستوى الحماية.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => {
      const t = new Date();
      t.setUTCHours(0, 0, 0, 0);
      return ok({
        users: q.get("SELECT COUNT(*) AS n FROM users WHERE is_bot = 0").n,
        new_today: q.get("SELECT COUNT(*) AS n FROM users WHERE joined_at >= ?", t.getTime()).n,
        active_24h: q.get("SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?", Date.now() - 86400000).n,
        points_total: q.get("SELECT COALESCE(SUM(points),0) AS n FROM users").n,
        referrals_confirmed: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded > 0").n,
        referrals_pending: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded = 0 AND suspicious = 0").n,
        referrals_flagged: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1").n,
        blocked_users: q.get("SELECT COUNT(*) AS n FROM users WHERE blocked = 1").n,
        blocked_nets: q.get("SELECT COUNT(*) AS n FROM blocked_nets").n,
        quizzes: q.get("SELECT COUNT(*) AS n FROM quiz_sessions WHERE answered_at IS NOT NULL").n,
        custom_questions: customStats().total,
        protection_level: config.protectionLevel,
        queue: tg.stats,
        demo: config.demo,
      });
    },
  },
  {
    name: "list_users",
    category: "read",
    description: "يعرض المستخدمين مع نقاطهم وإحالاتهم وحالتهم. يدعم البحث بالاسم/اليوزر/ID والفرز والحد.",
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "نص البحث: اسم، @يوزر، أو ID" },
        sort: { type: "string", enum: ["newest", "points", "referrals", "risk"], description: "الترتيب" },
        limit: { type: "integer", description: "العدد (افتراضي 15، الأقصى 50)" },
        filter: { type: "string", enum: ["all", "blocked", "active", "risk", "flagged"] },
      },
      required: [],
    },
    run: async ({ q: qs = "", sort = "newest", limit = 15, filter = "all" } = {}) => {
      let where = "WHERE is_bot = 0";
      const args = [];
      if (qs) {
        where += " AND (CAST(tg_id AS TEXT) LIKE ? OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR ref_code LIKE ?)";
        const like = `%${qs}%`;
        args.push(like, like, like, like, like);
      }
      if (filter === "blocked") where += " AND blocked = 1";
      if (filter === "active") where += ` AND last_seen >= ${Date.now() - 86400000}`;
      if (filter === "risk") where += " AND risk_score >= 40";
      if (filter === "flagged") where += " AND referral_flagged > 0";
      const order =
        sort === "points" ? "points DESC" : sort === "referrals" ? "referrals DESC" : sort === "risk" ? "risk_score DESC" : "joined_at DESC";
      const rows = q.all(
        `SELECT tg_id, username, first_name, last_name, points, referrals, risk_score, blocked, joined_at, last_seen FROM users ${where} ORDER BY ${order} LIMIT ?`,
        ...args,
        Math.min(50, Math.max(1, Number(limit) || 15))
      );
      return ok({
        count: rows.length,
        users: rows.map((u) => ({
          id: u.tg_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" "),
          username: u.username,
          points: u.points,
          referrals: u.referrals,
          risk: u.risk_score,
          blocked: !!u.blocked,
          joined: fmtDateTime(u.joined_at),
          last_seen: fmtDateTime(u.last_seen),
        })),
      });
    },
  },
  {
    name: "get_user",
    category: "read",
    description: "ملف مستخدم كامل: النقاط، الإحالات (من طرف شكون دخل + اللي جابهم)، سجل النقاط، نتائج المسابقات، وسجل الحماية.",
    parameters: {
      type: "object",
      properties: { user_id: { type: "integer" }, username: { type: "string" } },
      required: [],
    },
    run: async (args) => {
      const u = needUser(args);
      const env = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", u.tg_id);
      const inviter = u.referred_by ? getUser(u.referred_by) : null;
      return ok({
        user: userPublic(u),
        last_ip: u.last_ip,
        inviter: inviter ? { id: inviter.tg_id, name: [inviter.first_name, inviter.last_name].filter(Boolean).join(" "), username: inviter.username } : null,
        referral_event: env ? { at: fmtDateTime(env.at), suspicious: !!env.suspicious, reasons: env.reasons, points_awarded: env.points_awarded } : null,
        invited: invitees(u.tg_id, 10).map((r) => ({
          id: r.tg_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" "),
          username: r.username,
          status: r.points_awarded > 0 ? "confirmed" : r.suspicious ? "flagged" : "pending",
        })),
        referral_summary: referrerSummary(u.tg_id),
        quiz: quizStats(u.tg_id),
        recent_points: ledger(u.tg_id, 8).map((l) => ({ reason: l.reason, delta: l.delta, at: fmtDateTime(l.at) })),
        locked: Boolean(lockCheck(u.tg_id)),
      });
    },
  },
  {
    name: "get_referrals",
    category: "read",
    description: "سلسلة الإحالات: شكون جاب شكون. الفلترة: all | confirmed | pending | flagged. يرجع المحيل والمحال والأسباب.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["all", "confirmed", "pending", "flagged"] },
        limit: { type: "integer" },
      },
      required: [],
    },
    run: async ({ status = "all", limit = 20 } = {}) => {
      const where =
        status === "confirmed" ? "WHERE e.points_awarded > 0" : status === "flagged" ? "WHERE e.suspicious = 1" : status === "pending" ? "WHERE e.points_awarded = 0 AND e.suspicious = 0" : "WHERE 1=1";
      const rows = q.all(
        `SELECT e.*, u.first_name, u.last_name, u.username, r.first_name AS rf, r.last_name AS rl, r.username AS ru
           FROM referral_events e JOIN users u ON u.tg_id = e.new_user_id JOIN users r ON r.tg_id = e.referrer_id
           ${where} ORDER BY e.at DESC LIMIT ?`,
        Math.min(50, Math.max(1, Number(limit) || 20))
      );
      return ok({
        count: rows.length,
        referrals: rows.map((r) => ({
          referrer: { id: r.referrer_id, name: [r.rf, r.rl].filter(Boolean).join(" "), username: r.ru },
          joined: { id: r.new_user_id, name: [r.first_name, r.last_name].filter(Boolean).join(" "), username: r.username },
          at: fmtDateTime(r.at),
          status: r.points_awarded > 0 ? "confirmed" : r.suspicious ? "flagged" : "pending",
          reasons: r.reasons,
        })),
      });
    },
  },
  {
    name: "get_security",
    category: "read",
    description: "حالة الحماية: مستوى الحماية، طابور تيليغرام، الشبكات المحظورة، وآخر 30 حدث حماية.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () =>
      ok({
        level: config.protectionLevel,
        profile: profile(),
        queue: tg.stats,
        blocked_nets: q.all("SELECT net, reason, at FROM blocked_nets ORDER BY at DESC LIMIT 30").map((n) => ({ ...n, at: fmtDateTime(n.at) })),
        events: q.all("SELECT kind, severity, detail, user_id, at FROM events ORDER BY at DESC LIMIT 30").map((e) => ({
          ...e,
          at: fmtDateTime(e.at),
        })),
      }),
  },
  {
    name: "get_settings",
    category: "read",
    description: "كل إعدادات البوت (النقاط، السقوف، المكافآت، معلومات عامة).",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => ok({ settings: allSettings() }),
  },
  {
    name: "get_questions",
    category: "read",
    description: "قائمة أقسام الأسئلة، عدد الأسئلة المخصّصة، وآخر الأسئلة المضافة.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () =>
      ok({
        categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
        custom: customStats(),
        last: customQuestions(15),
      }),
  },

  /* ─────────── تعديل البوت ─────────── */
  {
    name: "update_settings",
    category: "write",
    description:
      "يعدّل إعدادات البوت فوراً. المفاتيح المتاحة: points_correct, points_speed_bonus_max, points_daily, referral_points, referee_points, max_referrals_per_day, require_engagement_for_referral, quiz_seconds, quiz_questions_per_session, quiz_per_day, daily_points_cap, bot_enabled, maintenance_note, welcome_text, min_account_age_for_referrals_min, dashboard_title, theme_color.",
    parameters: {
      type: "object",
      properties: {
        settings: { type: "object", description: "قاموس مفتاح → قيمة" },
      },
      required: ["settings"],
    },
    run: async ({ settings = {} } = {}) => {
      const ALLOWED = new Set([
        "points_correct", "points_speed_bonus_max", "points_daily", "referral_points", "referee_points",
        "max_referrals_per_day", "require_engagement_for_referral", "quiz_seconds", "quiz_questions_per_session",
        "quiz_per_day", "daily_points_cap", "bot_enabled", "maintenance_note", "welcome_text",
        "min_account_age_for_referrals_min", "dashboard_title", "theme_color",
      ]);
      const changed = [];
      for (const [k, v] of Object.entries(settings)) {
        if (!ALLOWED.has(k)) continue;
        setSetting(k, String(v).slice(0, 2000));
        changed.push(k);
      }
      if (!changed.length) throw new Error("ما كانش حتى مفتاح صالح في settings");
      return ok({ changed });
    },
  },
  {
    name: "send_message",
    category: "write",
    description: "يرسل رسالة لمستخدم واحد (بـ user_id أو @username) — يدعم HTML.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "integer" },
        username: { type: "string" },
        text: { type: "string" },
      },
      required: ["text"],
    },
    run: async (args = {}) => {
      const uid = needUserId(args);
      const res = await tg.sendMessage(uid, String(args.text ?? ""));
      return ok({ sent: Boolean(res?.ok), to: uid, error: res?.ok ? null : res?.description });
    },
  },
  {
    name: "broadcast",
    category: "write",
    description: "بثّ رسالة لكل المستخدمين تدريجياً (محصّن ضد الحظر ويتوقف تلقائياً لو كثُر الفشل).",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    run: async ({ text } = {}) => {
      if (!text || String(text).length < 3) throw new Error("النص قصير");
      const job = startBroadcast(String(text));
      return ok({ started: true, total: job.total });
    },
  },
  {
    name: "block_user",
    category: "write",
    description: "يحظر مستخدماً (دائم أو لمدة دقائق محددة).",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "integer" },
        username: { type: "string" },
        reason: { type: "string" },
        minutes: { type: "integer", description: "0 = دائم" },
      },
      required: [],
    },
    run: async (args = {}) => {
      const u = needUser(args);
      const minutes = Number(args.minutes ?? 0) || null;
      const prev = { blocked: u.blocked, block_reason: u.block_reason, blocked_until: u.blocked_until };
      blockUser(u.tg_id, { reason: args.reason ?? "حظر من الذكاء الاصطناعي", by: "ai", minutes });
      return ok({ blocked: u.tg_id, minutes, undo: { tool: "unblock_user", args: { user_id: u.tg_id }, prev } });
    },
  },
  {
    name: "unblock_user",
    category: "write",
    description: "يفكّ الحظر عن مستخدم ويزيل أي تهدئة مؤقتة.",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      unblockUser(u.tg_id);
      unlock(`u:${u.tg_id}`);
      if (u.last_ip) unlockIp(u.last_ip);
      return ok({ unblocked: u.tg_id });
    },
  },
  {
    name: "give_points",
    category: "write",
    description: "يمنح أو يخصم نقاطاً لمستخدم (delta موجب أو سالب) مع تسجيل التدقيق.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "integer" },
        username: { type: "string" },
        delta: { type: "integer", description: "موجب = منح، سالب = خصم" },
        reason: { type: "string" },
      },
      required: ["delta"],
    },
    run: async (args = {}) => {
      const uid = needUserId(args);
      const delta = Math.trunc(Number(args.delta));
      if (!Number.isFinite(delta) || delta === 0) throw new Error("delta غير صالح");
      const r = awardPoints(uid, delta, String(args.reason ?? "ai_adjust").slice(0, 60), { by: "ai" });
      return ok({
        user_id: uid,
        applied: r.applied,
        balance: pointsBalance(uid),
        undo: { tool: "give_points", args: { user_id: uid, delta: -(r.applied ?? 0), reason: "undo" } },
      });
    },
  },
  {
    name: "reset_user_risk",
    category: "write",
    description: "يصفّر درجة الخطر والإشارات ويزيل القفل عن مستخدم.",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      q.run("UPDATE users SET risk_score = 0, signals = 0 WHERE tg_id = ?", u.tg_id);
      unlock(`u:${u.tg_id}`);
      return ok({ user_id: u.tg_id, risk: 0 });
    },
  },
  {
    name: "confirm_referral",
    category: "write",
    description: "يؤكّد إحالة معلّقة ويمنح نقاطها (المحيل + العضو الجديد).",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      const ev = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", u.tg_id);
      if (ev?.suspicious) q.run("UPDATE referral_events SET suspicious = 0, reasons = COALESCE(reasons,'') || ',ai_ok' WHERE id = ?", ev.id);
      const out = confirmReferral(u.tg_id, { by: "ai" });
      return ok({ ...out });
    },
  },
  {
    name: "reject_referral",
    category: "write",
    description: "يرفض إحالة (يعلّمها مشبوهة ويمنع نقاطها).",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      rejectReferral(u.tg_id, "ai");
      return ok({ rejected: u.tg_id });
    },
  },
  {
    name: "block_network",
    category: "write",
    description: "يحظر شبكة IP (مثلاً 41.100.10.0/24 أو عنوان IP فيُحوَّل تلقائياً).",
    parameters: {
      type: "object",
      properties: { ip: { type: "string" }, reason: { type: "string" }, minutes: { type: "integer" } },
      required: ["ip"],
    },
    run: async ({ ip, reason = "حظر من الذكاء الاصطناعي", minutes = 0 } = {}) => {
      const net = blockNet(ip, { reason, minutes: Number(minutes) || null, auto: false, byAdmin: true });
      if (!net) throw new Error("IP غير صالح");
      return ok({ blocked_net: net });
    },
  },
  {
    name: "add_question",
    category: "write",
    description: "يضيف سؤالاً جديداً للمسابقات. options: مصفوفة من 2 إلى 6 خيارات، correct: فهرس الخيار الصحيح (يبدأ من 0).",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        correct: { type: "integer" },
        category: { type: "string" },
      },
      required: ["question", "options", "correct"],
    },
    run: async ({ question, options, correct, category = "general" } = {}) =>
      ok(addQuestion({ question, options, correct, category, createdBy: "ai" })),
  },
  {
    name: "delete_question",
    category: "write",
    description: "يحذف سؤالاً مخصّصاً بالمعرّف (id) الذي ظهر في get_questions/last.",
    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    run: async ({ id } = {}) => {
      removeQuestion(Number(id));
      return ok({ deleted: Number(id) });
    },
  },
  {
    name: "send_quiz_to_user",
    category: "write",
    description: "يفتح سؤالاً مباشرة للمستخدم داخل البوت (يظهر له بأزرار).",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" }, category: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      const quiz = openQuiz(u, { chatId: u.tg_id, category: args.category ?? "mix" });
      if (!quiz.ok) throw new Error(`ما قدرتش نفتح سؤال: ${quiz.reason}`);
      const kb = quiz.options.map((o, i) => [{ text: `${"ABCD"[i]}) ${o}`, callback_data: `ans:${quiz.sessionId}:${i}` }]);
      await tg.sendMessage(u.tg_id, `❓ <b>${quiz.question}</b>\n\n⏱️ ${quiz.seconds} ثانية`, { reply_markup: { inline_keyboard: kb } });
      return ok({ sent_quiz_to: u.tg_id, session: quiz.sessionId });
    },
  },
  {
    name: "unlock_user_cooldowns",
    category: "write",
    description: "يفكّ كل التهدئات (rate limits) عن مستخدم وشبكته.",
    parameters: { type: "object", properties: { user_id: { type: "integer" }, username: { type: "string" } }, required: [] },
    run: async (args = {}) => {
      const u = needUser(args);
      unlock(`u:${u.tg_id}`);
      if (u.last_ip) unlockIp(u.last_ip);
      return ok({ unlocked: u.tg_id });
    },
  },
  {
    name: "change_dashboard_password",
    category: "write",
    description: "يغيّر كلمة سر لوحة التحكم فوراً (8 أحرف على الأقل) ويُبطل كل الجلسات الحالية.",
    parameters: { type: "object", properties: { password: { type: "string" } }, required: ["password"] },
    run: async ({ password } = {}) => {
      setPassword(String(password ?? ""));
      return ok({ changed: true, sessions_revoked: true });
    },
  },
  {
    name: "get_leaderboard",
    category: "read",
    description: "لوحة الشرف: أعلى المستخدمين بالنقاط.",
    parameters: { type: "object", properties: { limit: { type: "integer" } }, required: [] },
    run: async ({ limit = 10 } = {}) =>
      ok({
        top: leaderboard(Math.min(50, Number(limit) || 10)).map((u, i) => ({
          rank: i + 1,
          id: u.tg_id,
          name: [u.first_name, u.last_name].filter(Boolean).join(" "),
          username: u.username,
          points: u.points,
        })),
      }),
  },
  {
    name: "add_upload",
    category: "write",
    description: "يسجّل صورة مرفوعة (id من الرفع في الواجهة) ويعلّق عليها أو يربطها بغرض.",
    parameters: {
      type: "object",
      properties: { upload_id: { type: "string" }, note: { type: "string" } },
      required: ["upload_id"],
    },
    run: async ({ upload_id, note } = {}) => {
      const row = q.get("SELECT * FROM uploads WHERE id = ?", String(upload_id));
      if (!row) throw new Error("الصورة غير موجودة");
      q.run("UPDATE uploads SET note = ? WHERE id = ?", note ? String(note).slice(0, 300) : row.note, row.id);
      return ok({ upload: { id: row.id, url: `/uploads/${row.id}`, name: row.name, bytes: row.bytes } });
    },
  },
  {
    name: "list_uploads",
    category: "read",
    description: "الصور المرفوعة مؤخراً.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => ok({ uploads: listUploads(40) }),
  },
  {
    name: "import_image_from_url",
    category: "write",
    description: "ينزّل صورة من رابط ويحفظها في مكتبة البوت.",
    parameters: { type: "object", properties: { url: { type: "string" }, name: { type: "string" } }, required: ["url"] },
    run: async ({ url, name } = {}) => {
      if (!/^https?:\/\//.test(String(url ?? ""))) throw new Error("الرابط لازم يبدأ بـ http");
      const out = await downloadToFile(String(url), { name: name ?? "imported.jpg", kind: "image" });
      if (!out) throw new Error("ما قدرتش ننزّل الصورة");
      return ok(out);
    },
  },
  {
    name: "delete_upload",
    category: "write",
    description: "يحذف صورة من مكتبة البوت.",
    parameters: { type: "object", properties: { upload_id: { type: "string" } }, required: ["upload_id"] },
    run: async ({ upload_id } = {}) => ok({ deleted: deleteUpload(String(upload_id)) }),
  },
  {
    name: "set_protection_level",
    category: "write",
    description: "يغيّر مستوى الحماية فوراً: off | normal | high | max (يُحفظ ويُطبَّق بلا إعادة تشغيل).",
    parameters: { type: "object", properties: { level: { type: "string", enum: ["off", "normal", "high", "max"] } }, required: ["level"] },
    run: async ({ level } = {}) => {
      const lvl = String(level ?? "").toLowerCase();
      if (!["off", "normal", "high", "max"].includes(lvl)) throw new Error("مستوى غير صالح");
      setSetting("protection_level", lvl);
      config.protectionLevel = lvl;
      return ok({ level: lvl });
    },
  },
  {
    name: "list_blocked_networks",
    category: "read",
    description: "الشبكات المحظورة.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => ok({ nets: q.all("SELECT net, reason, at, expires_at FROM blocked_nets ORDER BY at DESC LIMIT 100") }),
  },
  {
    name: "unblock_network",
    category: "write",
    description: "يرفع الحظر عن شبكة.",
    parameters: { type: "object", properties: { net: { type: "string" } }, required: ["net"] },
    run: async ({ net } = {}) => {
      q.run("DELETE FROM blocked_nets WHERE net = ?", String(net));
      return ok({ removed: String(net) });
    },
  },
  {
    name: "get_broadcast_status",
    category: "read",
    description: "حالة آخر بثّ.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => ok({ job: broadcastStatus() }),
  },
  {
    name: "fix_webhook",
    category: "write",
    description:
      "يعيد ربط البوت بتيليغرام: يحذف الـ webhook القديم، يضبطه من جديد على PUBLIC_URL، ويتحقق من getMe. استعمله عندما لا يستقبل البوت رسائل.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => {
      const { setupBot } = await import("../bot.js");
      if (config.demo) return ok({ demo: true, message: "وضع تجريبي: ما كاين webhook حقيقي" });
      if (!config.publicUrl) throw new Error("PUBLIC_URL غير مضبوط على السيرفر");
      await tg.deleteWebhook();
      const me = await setupBot();
      const info = await tg.api("getWebhookInfo", {});
      return ok({
        bot: me?.username ?? null,
        webhook: info?.result?.url ?? null,
        pending_updates: info?.result?.pending_update_count ?? null,
        last_error: info?.result?.last_error_message ?? null,
      });
    },
  },
  {
    name: "bot_health",
    category: "read",
    description: "فحص شامل: هل البوت مربوط بتيليغرام؟ هل الـ webhook سليم؟ آخر خطأ؟ عدد التحديثات المعلّقة.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => {
      let webhook = null;
      let me = null;
      if (!config.demo && config.botToken) {
        try {
          const info = await tg.api("getWebhookInfo", {});
          webhook = info?.result ?? null;
        } catch (e) {
          webhook = { error: String(e?.message ?? e) };
        }
        try {
          const m = await tg.api("getMe", {});
          me = m?.result ?? null;
        } catch (e) {
          me = { error: String(e?.message ?? e) };
        }
      }
      const errors24h = q.get(
        "SELECT COUNT(*) AS n FROM events WHERE severity IN ('error','high') AND at > ?",
        Date.now() - 86400000
      ).n;
      return ok({
        demo: config.demo,
        token_set: Boolean(config.botToken),
        public_url: config.publicUrl || null,
        bot: me,
        webhook: webhook
          ? {
              url: webhook.url || null,
              pending: webhook.pending_update_count ?? null,
              last_error: webhook.last_error_message ?? null,
              last_error_at: webhook.last_error_date ? new Date(webhook.last_error_date * 1000).toISOString() : null,
            }
          : null,
        errors_24h: errors24h,
        queue: tg.stats,
        healthy: Boolean(me && !me.error && (!webhook || !webhook.last_error_message)),
      });
    },
  },
  {
    name: "run_sql_read",
    category: "read",
    description: "استعلام SELECT للقراءة فقط (للتشخيص المتقدم). ممنوع أي تعديل.",
    parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
    run: async ({ sql } = {}) => {
      const s = String(sql ?? "").trim();
      if (!/^select\s/i.test(s) || /;/.test(s.replace(/;\s*$/, ""))) throw new Error("مسموح SELECT واحد فقط");
      const rows = q.all(s);
      return ok({ rows: rows.slice(0, 50), count: rows.length });
    },
  },
];

function lockCheck(userId) {
  return isLocked(`u:${userId}`);
}

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolSchemas() {
  return TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function runTool(name, args = {}, { source = "ai" } = {}) {
  const tool = TOOL_MAP.get(name);
  if (!tool) {
    recordAction(name, args, { ok: false, error: "أداة غير موجودة" }, source);
    return { ok: false, error: `أداة غير موجودة: ${name}` };
  }
  try {
    const out = await tool.run(args ?? {});
    recordAction(name, args, out, source);
    return out;
  } catch (e) {
    const err = String(e?.message ?? e);
    recordAction(name, args, { ok: false, error: err }, source);
    logEvent("ai_tool_error", { severity: "warn", detail: `${name}: ${err}` });
    return { ok: false, error: err };
  }
}

function recordAction(tool, args, result, source) {
  try {
    q.run(
      "INSERT INTO ai_actions(at, tool, args, result, ok, source, undo) VALUES(?,?,?,?,?,?,?)",
      Date.now(),
      tool,
      JSON.stringify(args ?? {}).slice(0, 4000),
      JSON.stringify(result ?? {}).slice(0, 4000),
      result?.ok === false ? 0 : 1,
      source,
      result?.undo ? JSON.stringify(result.undo) : null
    );
  } catch {
    /* ignore */
  }
}

export { num, getSettingInt };
