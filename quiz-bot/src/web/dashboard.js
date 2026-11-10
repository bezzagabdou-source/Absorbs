import fs from "node:fs";
import { config } from "../config.js";
import { q, logEvent, allSettings, setSetting, getSettingInt } from "../db.js";
import {
  json,
  readJson,
  clientIp,
  rateLimit,
  cookie,
} from "../web/http.js";
import {
  login,
  logout,
  verify,
  setSessionCookie,
  clearSessionCookie,
  cookieName,
  sessionCount,
  revokeAll,
} from "../services/auth.js";
import { userPublic, getUser, blockUser, unblockUser } from "../services/users.js";
import { awardPoints, ledger, pointsBalance } from "../services/points.js";
import { confirmReferral, rejectReferral, invitees, referrerSummary, referrersBoard, pendingReferrals } from "../services/referral.js";
import { quizStats } from "../services/quiz.js";
import { envTokens } from "../services/crypto.js";
import { changePassword } from "../services/auth.js";
import { passwordChangedAt, storedHash } from "../services/passwords.js";
import { aiProviders } from "../ai/brain.js";
import { selfDiagnose } from "../ai/shield.js";
import { isLocked, unlock, unlockIp } from "../services/guards.js";
import { startBroadcast, broadcastStatus } from "../services/broadcast.js";
import { tg } from "../services/telegram.js";
import { fmtDateTime, num } from "../util.js";

function authed(req) {
  return verify(cookie(req, cookieName()), clientIp(req));
}

function deny(res) {
  return json(res, 401, { ok: false, error: "غير مصرّح. سجّل الدخول من جديد." });
}

const guardApi = (req, res, key, opts) => {
  const rl = rateLimit(`${key}:${clientIp(req)}`, opts);
  if (!rl.ok) {
    json(res, 429, { ok: false, error: "طلبات كثيرة، تهدّى شوية.", retryAfterMs: rl.retryMs });
    return false;
  }
  return true;
};

export async function dashboardApi(req, res, url) {
  const p = url.pathname;
  const method = req.method ?? "GET";
  const ip = clientIp(req);

  /* ───────────── الدخول ───────────── */

  if (p === "/api/auth/login" && method === "POST") {
    if (!guardApi(req, res, "login", { max: 10, windowMs: 60000 })) return true;
    const body = await readJson(req, 8192);
    if (body === null) return json(res, 400, { ok: false, error: "JSON غير صالح" }), true;
    if (!config.dashboardPassword) {
      return json(res, 500, { ok: false, error: "DASHBOARD_PASSWORD غير مضبوط على السيرفر" }), true;
    }
    const out = login(ip, String(body.password ?? ""), req.headers["user-agent"] ?? "");
    if (!out.ok) {
      logEvent("login_fail", { severity: "warn", ip, detail: out.error });
      json(res, 401, { ok: false, error: out.error, left: out.left });
      return true;
    }
    setSessionCookie(res, out.cookie);
    logEvent("login_ok", { ip });
    json(res, 200, { ok: true });
    return true;
  }

  if (p === "/api/auth/password" && method === "POST") {
    if (!guardApi(req, res, "pwchange", { max: 6, windowMs: 300000 })) return true;
    const s2 = authed(req);
    if (!s2) return deny(res), true;
    const body = await readJson(req, 8192);
    const out = changePassword(body?.current, body?.next);
    if (!out.ok) {
      logEvent("password_change_fail", { severity: "warn", ip, detail: out.error });
      json(res, 400, { ok: false, error: out.error });
      return true;
    }
    logEvent("password_change_ok", { ip });
    clearSessionCookie(res);
    json(res, 200, { ok: true, relogin: true });
    return true;
  }

  if (p === "/api/auth/logout" && method === "POST") {
    logout(cookie(req, cookieName()));
    clearSessionCookie(res);
    json(res, 200, { ok: true });
    return true;
  }

  if (p === "/api/auth/session") {
    const s = authed(req);
    json(res, 200, {
      ok: true,
      authed: Boolean(s),
      demo: config.demo,
      ai: aiProviders(),
      passwordChangedAt: passwordChangedAt(),
      passwordCustom: Boolean(storedHash()),
      startedAt: s?.at ?? null,
      sessions: sessionCount(),
      bot: tg.me ? { username: tg.me.username, name: tg.me.first_name } : null,
    });
    return true;
  }

  /* ───────────── كل ما تحت يحتاج جلسة ───────────── */

  const session = authed(req);
  if (p.startsWith("/api/") && !session) return deny(res), true;

  /* ───────────── النظرة العامة ───────────── */

  if (p === "/api/overview") {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const t = today.getTime();
    const users = q.get("SELECT COUNT(*) AS n FROM users WHERE is_bot = 0").n;
    const newToday = q.get("SELECT COUNT(*) AS n FROM users WHERE joined_at >= ?", t).n;
    const active = q.get("SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?", Date.now() - 86400000).n;
    const points = q.get("SELECT COALESCE(SUM(points),0) AS n FROM users").n;
    const earnedToday = q.get("SELECT COALESCE(SUM(delta),0) AS n FROM points_ledger WHERE at >= ? AND delta > 0", t).n;
    const confirmed = q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded > 0").n;
    const pending = q.get("SELECT COUNT(*) AS n FROM referral_events WHERE points_awarded = 0 AND suspicious = 0").n;
    const flagged = q.get("SELECT COUNT(*) AS n FROM referral_events WHERE suspicious = 1").n;
    const blocked = q.get("SELECT COUNT(*) AS n FROM users WHERE blocked = 1").n;
    const nets = q.get("SELECT COUNT(*) AS n FROM blocked_nets").n;
    const quizzes = q.get("SELECT COUNT(*) AS n FROM quiz_sessions WHERE answered_at IS NOT NULL").n;
    const correct = q.get("SELECT COALESCE(SUM(correct),0) AS n FROM quiz_sessions").n;

    // سلسلة زمنية 14 يوم
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const from = t - i * 86400000;
      const to = from + 86400000;
      series.push({
        day: new Date(from).toISOString().slice(5, 10),
        joins: q.get("SELECT COUNT(*) AS n FROM users WHERE joined_at >= ? AND joined_at < ?", from, to).n,
        refs: q.get("SELECT COUNT(*) AS n FROM referral_events WHERE at >= ? AND at < ?", from, to).n,
        quiz: q.get("SELECT COUNT(*) AS n FROM quiz_sessions WHERE started_at >= ? AND started_at < ?", from, to).n,
        points: q.get("SELECT COALESCE(SUM(delta),0) AS n FROM points_ledger WHERE at >= ? AND at < ? AND delta > 0", from, to).n,
      });
    }

    const recent = q.all(
      `SELECT e.at, e.suspicious, e.reasons, e.points_awarded,
              u.tg_id AS new_id, u.first_name, u.username, u.avatar_version, u.avatar_path,
              r.tg_id AS ref_id, r.first_name AS ref_first, r.username AS ref_user, r.avatar_path AS ref_avatar
         FROM referral_events e
         JOIN users u ON u.tg_id = e.new_user_id
         JOIN users r ON r.tg_id = e.referrer_id
        ORDER BY e.at DESC LIMIT 12`
    ).map((r) => ({
      at: r.at,
      newUser: { tg_id: r.new_id, name: r.first_name, username: r.username, has_avatar: Boolean(r.avatar_path) },
      referrer: { tg_id: r.ref_id, name: r.ref_first, username: r.ref_user, has_avatar: Boolean(r.ref_avatar) },
      status: r.points_awarded > 0 ? "confirmed" : r.suspicious ? "flagged" : "pending",
      reasons: r.reasons,
    }));

    const top = q.all(
      `SELECT tg_id, first_name, username, points, referrals, avatar_path FROM users WHERE is_bot = 0 ORDER BY points DESC LIMIT 8`
    );

    json(res, 200, {
      ok: true,
      level: config.protectionLevel,
      demo: config.demo,
      stats: {
        users, newToday, active, points, earnedToday, confirmed, pending, flagged, blocked, nets,
        quizzes, correct,
        accuracy: quizzes ? Math.round((correct / quizzes) * 100) : 0,
      },
      series,
      recent,
      top,
      queue: tg.stats,
      autoBanAt: 60,
    });
    return true;
  }

  /* ───────────── المستخدمون ───────────── */

  if (p === "/api/users" && method === "GET") {
    const search = (url.searchParams.get("q") ?? "").trim();
    const filter = url.searchParams.get("filter") ?? "all";
    const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const per = 25;
    let where = "WHERE is_bot = 0";
    const args = [];
    if (search) {
      where += " AND (CAST(tg_id AS TEXT) LIKE ? OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR ref_code LIKE ?)";
      const like = `%${search}%`;
      args.push(like, like, like, like, like);
    }
    if (filter === "blocked") where += " AND blocked = 1";
    else if (filter === "risk") where += " AND risk_score >= 40";
    else if (filter === "flagged") where += " AND referral_flagged > 0";
    else if (filter === "active") where += " AND last_seen >= " + (Date.now() - 86400000);
    const total = q.get(`SELECT COUNT(*) AS n FROM users ${where}`, ...args).n;
    const rows = q.all(
      `SELECT * FROM users ${where} ORDER BY joined_at DESC LIMIT ? OFFSET ?`,
      ...args,
      per,
      page * per
    );
    json(res, 200, {
      ok: true,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / per)),
      users: rows.map((u) => ({
        ...userPublic(u),
        risk_score: u.risk_score,
        referrals: u.referrals,
        inline: isLocked(`u:${u.tg_id}`) ? Math.max(0, isLocked(`u:${u.tg_id}`).until - Date.now()) : 0,
      })),
    });
    return true;
  }

  const userMatch = /^\/api\/users\/(\d+)$/.exec(p);
  if (userMatch) {
    const id = Number(userMatch[1]);
    const u = getUser(id);
    if (!u) return json(res, 404, { ok: false, error: "المستخدم غير موجود" }), true;

    if (method === "GET") {
      const inviter = u.referred_by ? getUser(u.referred_by) : null;
      const inviterEvent = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", id);
      const myInvites = invitees(id, 25);
      const quiz = quizStats(id);
      const led = ledger(id, 25);
      const sessions = q.all(
        "SELECT id, category, started_at, answered_at, correct, points FROM quiz_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 15",
        id
      );
      const pointsByReason = q.all(
        "SELECT reason, COALESCE(SUM(delta),0) AS total, COUNT(*) AS n FROM points_ledger WHERE user_id = ? GROUP BY reason ORDER BY total DESC",
        id
      );
      const riskEvents = q.all(
        "SELECT * FROM events WHERE user_id = ? ORDER BY at DESC LIMIT 15",
        id
      );
      json(res, 200, {
        ok: true,
        user: {
          ...userPublic(u),
          blocked_reason: u.block_reason,
          blocked_until: u.blocked_until,
          blocked_at: u.blocked_at,
          lock: isLocked(`u:${id}`),
          referral_flagged: u.referral_flagged,
          last_ip: u.last_ip,
          last_seen: u.last_seen,
          daily_streak: u.daily_streak,
          best_streak: u.best_streak,
          total_earned: u.total_earned,
        },
        inviter: inviter
          ? { ...userPublic(inviter), event: inviterEvent ?? null }
          : null,
        invites: myInvites.map((r) => ({
          id: r.id,
          at: r.at,
          tg_id: r.tg_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(" "),
          username: r.username,
          has_avatar: Boolean(r.avatar_path),
          status: r.points_awarded > 0 ? "confirmed" : r.suspicious ? "flagged" : "pending",
          reasons: r.reasons,
          points_awarded: r.points_awarded,
        })),
        referralSummary: referrerSummary(id),
        quiz,
        ledger: led,
        pointsByReason,
        sessions,
        riskEvents,
        stats: {
          invites: myInvites.length,
          confirmed: myInvites.filter((r) => r.points_awarded > 0).length,
          flagged: myInvites.filter((r) => r.suspicious).length,
        },
      });
      return true;
    }

    if (method === "POST") {
      const body = await readJson(req, 16384);
      if (!body || typeof body !== "object") return json(res, 400, { ok: false, error: "طلب غير صالح" }), true;
      const action = body.action;

      if (action === "block") {
        const minutes = Number(body.minutes ?? 0);
        blockUser(id, {
          reason: String(body.reason ?? "حظر من لوحة التحكم").slice(0, 200),
          by: "dashboard",
          minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
        });
        logEvent("admin_block", { userId: id, severity: "warn", detail: `by=dashboard minutes=${minutes || "∞"}`, ip });
        json(res, 200, { ok: true });
        return true;
      }
      if (action === "unblock") {
        unblockUser(id);
        unlock(`u:${id}`);
        if (body.unlockIp && u.last_ip) unlockIp(u.last_ip);
        logEvent("admin_unblock", { userId: id, detail: "by=dashboard", ip });
        json(res, 200, { ok: true });
        return true;
      }
      if (action === "points") {
        const delta = Math.trunc(Number(body.delta ?? 0));
        if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) {
          return json(res, 400, { ok: false, error: "قيمة النقاط غير صالحة (الحد 100000)" }), true;
        }
        const res2 = awardPoints(id, delta, String(body.reason ?? "adjust").slice(0, 60), { by: "dashboard" });
        logEvent("admin_points", { userId: id, detail: `${delta} → ${res2.applied}`, ip });
        json(res, 200, { ok: true, applied: res2.applied, balance: pointsBalance(id) });
        return true;
      }
      if (action === "reset-risk") {
        q.run("UPDATE users SET risk_score = 0, signals = 0 WHERE tg_id = ?", id);
        unlock(`u:${id}`);
        json(res, 200, { ok: true });
        return true;
      }
      if (action === "flag-referral") {
        rejectReferral(id, "dashboard");
        json(res, 200, { ok: true });
        return true;
      }
      if (action === "confirm-referral") {
        const out = confirmReferral(id, { by: "dashboard" });
        json(res, 200, { ok: out.ok, ...out });
        return true;
      }
      return json(res, 400, { ok: false, error: "إجراء غير معروف" }), true;
    }
  }

  const avatarMatch = /^\/api\/avatar\/(\d+)$/.exec(p);
  if (avatarMatch) {
    const id = Number(avatarMatch[1]);
    const u = getUser(id);
    if (!u?.avatar_path || !fs.existsSync(u.avatar_path)) {
      // صورة افتراضية SVG بالحرف الأول
      const initial = encodeURIComponent((u?.first_name ?? "?").slice(0, 1).toUpperCase());
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#1e293b"/><text x="48" y="62" font-family="system-ui,sans-serif" font-size="42" fill="#94a3b8" text-anchor="middle">${initial}</text></svg>`;
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=60" });
      res.end(svg);
      return true;
    }
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    });
    fs.createReadStream(u.avatar_path).pipe(res);
    return true;
  }

  /* ───────────── الإحالات ───────────── */

  if (p === "/api/referrals") {
    const status = url.searchParams.get("status") ?? "all";
    const limit = Math.min(200, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100);
    let rows;
    if (status === "pending") rows = pendingReferrals(limit);
    else {
      const where =
        status === "confirmed"
          ? "WHERE e.points_awarded > 0"
          : status === "flagged"
          ? "WHERE e.suspicious = 1"
          : "WHERE 1=1";
      rows = q.all(
        `SELECT e.*, u.first_name, u.last_name, u.username, u.avatar_path, u.points,
                r.first_name AS ref_first, r.last_name AS ref_last, r.username AS ref_user, r.avatar_path AS ref_avatar
           FROM referral_events e
           JOIN users u ON u.tg_id = e.new_user_id
           JOIN users r ON r.tg_id = e.referrer_id
           ${where} ORDER BY e.at DESC LIMIT ?`,
        limit
      );
    }
    json(res, 200, {
      ok: true,
      rows: rows.map((r) => ({
        id: r.id,
        at: r.at,
        status: r.points_awarded > 0 ? "confirmed" : r.suspicious ? "flagged" : "pending",
        reasons: r.reasons,
        points_awarded: r.points_awarded,
        ip: r.ip,
        device: r.device,
        newUser: {
          tg_id: r.new_user_id,
          name: [r.first_name ?? "", r.last_name ?? ""].join(" ").trim(),
          username: r.username,
          has_avatar: Boolean(r.avatar_path),
          points: r.points,
        },
        referrer: {
          tg_id: r.referrer_id,
          name: [r.ref_first ?? "", r.ref_last ?? ""].join(" ").trim(),
          username: r.ref_user,
          has_avatar: Boolean(r.ref_avatar),
        },
      })),
    });
    return true;
  }

  const refAct = /^\/api\/referrals\/(\d+)\/(confirm|reject)$/.exec(p);
  if (refAct && method === "POST") {
    const id = Number(refAct[1]);
    const ev = q.get("SELECT * FROM referral_events WHERE new_user_id = ?", id);
    if (!ev) return json(res, 404, { ok: false, error: "الإحالة غير موجودة" }), true;
    if (refAct[2] === "confirm") {
      if (ev.suspicious) q.run("UPDATE referral_events SET suspicious = 0, reasons = COALESCE(reasons,'') || ',manual_ok' WHERE id = ?", ev.id);
      const out = confirmReferral(id, { by: "dashboard" });
      json(res, 200, { ok: out.ok, ...out });
    } else {
      rejectReferral(id, "dashboard");
      json(res, 200, { ok: true });
    }
    return true;
  }

  if (p === "/api/referrers") {
    json(res, 200, { ok: true, rows: referrersBoard(100) });
    return true;
  }

  /* ───────────── الحماية ───────────── */

  if (p === "/api/security") {
    const ev = q.all("SELECT * FROM events ORDER BY at DESC LIMIT 100");
    const nets = q.all("SELECT * FROM blocked_nets ORDER BY at DESC LIMIT 100");
    const counts = q.all(
      "SELECT kind, COUNT(*) AS n FROM events WHERE at > ? GROUP BY kind ORDER BY n DESC LIMIT 20",
      Date.now() - 7 * 86400000
    );
    json(res, 200, {
      ok: true,
      level: config.protectionLevel,
      queue: tg.stats,
      env: envTokens(),
      events: ev,
      nets,
      counts,
      sessions: sessionCount(),
    });
    return true;
  }

  if (p === "/api/nets" && method === "POST") {
    const body = await readJson(req, 8192);
    if (body?.action === "delete" && body.net) {
      q.run("DELETE FROM blocked_nets WHERE net = ?", String(body.net));
      logEvent("net_unblock", { detail: String(body.net), ip });
      json(res, 200, { ok: true });
      return true;
    }
    json(res, 400, { ok: false, error: "طلب غير صالح" });
    return true;
  }

  /* ───────────── الإعدادات ───────────── */

  if (p === "/api/settings") {
    if (method === "GET") {
      json(res, 200, {
        ok: true,
        settings: allSettings(),
        env: envTokens(),
        level: config.protectionLevel,
      });
      return true;
    }
    if (method === "POST") {
      const body = await readJson(req, 32768);
      if (!body || typeof body !== "object") return json(res, 400, { ok: false, error: "طلب غير صالح" }), true;
      const allowed = new Set([
        "bot_enabled", "maintenance_note", "welcome_text", "points_correct", "points_speed_bonus_max",
        "points_daily", "referral_points", "referee_points", "max_referrals_per_day",
        "require_engagement_for_referral", "quiz_seconds", "quiz_questions_per_session",
        "max_actions_per_window", "rate_window_sec", "quiz_per_day", "daily_points_cap",
        "min_account_age_for_referrals_min",
      ]);
      let n = 0;
      for (const [k, v] of Object.entries(body)) {
        if (!allowed.has(k)) continue;
        if (k === "welcome_text" && String(v).length > 2000) continue;
        if (k !== "welcome_text" && k !== "maintenance_note" && !/^-?\d+$/.test(String(v))) continue;
        setSetting(k, String(v).slice(0, 2000));
        n++;
      }
      logEvent("settings_update", { detail: `${n} key(s)`, ip });
      json(res, 200, { ok: true, updated: n, settings: allSettings() });
      return true;
    }
  }

  /* ───────────── البثّ ───────────── */

  if (p === "/api/broadcast") {
    if (method === "GET") {
      json(res, 200, { ok: true, job: broadcastStatus() });
      return true;
    }
    if (method === "POST") {
      const body = await readJson(req, 8192);
      const text = String(body?.text ?? "").trim();
      if (text.length < 3) return json(res, 400, { ok: false, error: "النص قصير" }), true;
      if (text.length > 3500) return json(res, 400, { ok: false, error: "النص طويل (3500 حرف كحد أقصى)" }), true;
      const job = startBroadcast(text);
      logEvent("broadcast_start", { detail: `${job.total} user(s)`, ip });
      json(res, 200, { ok: true, job });
      return true;
    }
  }

  if (p === "/api/export/users.csv") {
    const rows = q.all("SELECT tg_id, username, first_name, last_name, points, referrals, risk_score, blocked, joined_at FROM users WHERE is_bot = 0 ORDER BY points DESC");
    const head = "tg_id,username,first_name,last_name,points,referrals,risk,blocked,joined_at\n";
    const csv = rows
      .map((r) =>
        [r.tg_id, r.username ?? "", r.first_name ?? "", r.last_name ?? "", r.points, r.referrals, r.risk_score, r.blocked, fmtDateTime(r.joined_at)]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="barq-users.csv"',
    });
    res.end("\ufeff" + head + csv);
    return true;
  }

  if (p === "/api/ai/status") {
    const diag = selfDiagnose();
    return json(res, 200, { ok: true, providers: aiProviders(), diag }), true;
  }

  if (p === "/api/health") {
    json(res, 200, { ok: true, uptime: process.uptime(), level: config.protectionLevel, demo: config.demo });
    return true;
  }

  return json(res, 404, { ok: false, error: "مسار غير موجود" }), true;
}

export { revokeAll, getSettingInt, num };
