/* FT AI — كل بيانات اللوحة في نداء واحد */
import { methods, authed } from "./_lib.js";
import { json, now } from "../lib/core.js";
import { providers, aiModel } from "../lib/ai.js";
import { botToken, demoMode } from "../lib/tg.js";

export default methods({
  GET: authed(async (req, res, state) => {
    const users = Object.values(state.users);
    const refs = state.referrals;
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    return json(res, 200, {
      ok: true,
      at: now(),
      bot: {
        name: state.settings.botName,
        username: process.env.BOT_USERNAME || null,
        tokenSet: Boolean(botToken()),
        demo: demoMode(),
        webhook: `${process.env.PUBLIC_URL ?? ""}/api/webhook`,
      },
      stats: {
        users: users.length,
        new_today: users.filter((u) => u.joined_at >= start.getTime()).length,
        active_24h: users.filter((u) => (u.last_seen ?? 0) >= now() - 86400000).length,
        blocked: users.filter((u) => u.blocked).length,
        points_total: users.reduce((n, u) => n + (u.points || 0), 0),
        refs_confirmed: refs.filter((r) => r.status === "confirmed").length,
        refs_pending: refs.filter((r) => r.status === "pending").length,
        refs_flagged: refs.filter((r) => r.status === "flagged").length,
        questions: state.questions.length,
        uploads: state.uploads.length,
        visits: state.metrics.visits,
        answers: state.metrics.answers,
        correct: state.metrics.correct,
        broadcasts: state.metrics.broadcasts,
      },
      protection: {
        level: state.settings.protectionLevel,
        min_answer_ms: state.settings.minAnswerMs,
        cooldown_ms: state.settings.cooldownMs,
        max_answers_10m: state.settings.maxAnswersPer10m,
        max_referrals_day: state.settings.maxReferralsPerDay,
        broadcast_rate: state.settings.broadcastRate,
      },
      settings: state.settings,
      security: {
        password_changed_at: state.meta.passwordChangedAt ?? 0,
        last_login: state.meta.lastLoginAt ?? 0,
        session_hours: 12,
        storage: process.env.REDIS_URL ? "redis" : "memory",
      },
      ai: { providers: providers(), model: aiModel(), messages: state.ai.length },
      actions: state.actions.slice(0, 12),
      top: users.sort((a, b) => b.points - a.points).slice(0, 5).map((u) => ({ name: u.name, points: u.points, username: u.username })),
    });
  }),
});
