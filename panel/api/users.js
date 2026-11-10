/* FT AI — الأعضاء + الإحالات */
import { methods, authed } from "./_lib.js";
import { json, updateState } from "../lib/core.js";

export default methods({
  GET: authed(async (req, res, state) => {
    const url = new URL(req.url, "http://x");
    const qs = String(url.searchParams.get("q") ?? "").trim().toLowerCase();
    const filter = url.searchParams.get("filter") ?? "all";
    const sort = url.searchParams.get("sort") ?? "newest";
    let rows = Object.values(state.users);
    if (qs) rows = rows.filter((u) => [u.id, u.username, u.name, u.ref_code].some((v) => String(v ?? "").toLowerCase().includes(qs)));
    if (filter === "blocked") rows = rows.filter((u) => u.blocked);
    if (filter === "active") rows = rows.filter((u) => (u.last_seen ?? 0) >= Date.now() - 86400000);
    if (filter === "risk") rows = rows.filter((u) => (u.risk ?? 0) >= 40);
    if (filter === "flagged") rows = rows.filter((u) => u.flagged);
    const sorters = { points: (a, b) => b.points - a.points, referrals: (a, b) => b.referrals - a.referrals, risk: (a, b) => b.risk - a.risk, newest: (a, b) => b.joined_at - a.joined_at };
    rows = rows.sort(sorters[sort] ?? sorters.newest);
    return json(res, 200, {
      ok: true,
      total: Object.keys(state.users).length,
      count: rows.length,
      users: rows.slice(0, 300).map((u) => ({
        id: u.id, name: u.name, username: u.username, points: u.points, referrals: u.referrals,
        blocked: u.blocked, risk: u.risk, flagged: u.flagged, joined_at: u.joined_at, last_seen: u.last_seen,
        quiz_total: u.quiz_total, quiz_correct: u.quiz_correct, referred_by: u.referred_by, ref_code: u.ref_code,
      })),
    });
  }),

  PATCH: authed(async (req, res, state) => {
    const b = await (await import("./_lib.js")).body(req);
    const id = String(b?.id ?? "");
    const out = await updateState((s) => {
      const u = s.users[id];
      if (!u) return null;
      if (typeof b.blocked === "boolean") { u.blocked = b.blocked; if (!b.blocked) u.risk = 0; }
      if (Number.isFinite(+b.points)) u.points = Math.max(0, Math.trunc(+b.points));
      if (Number.isFinite(+b.risk)) u.risk = Math.max(0, Math.min(100, Math.trunc(+b.risk)));
      return u;
    });
    if (!out) return json(res, 404, { ok: false, error: "ما لقيتش العضو" });
    return json(res, 200, { ok: true, user: out });
  }),
});
