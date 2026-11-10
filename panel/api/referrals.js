/* FT AI — مَن جاء عن طريق مَن */
import { methods, authed, body } from "./_lib.js";
import { json, updateState, recordAction } from "../lib/core.js";

const view = (s, r) => ({
  id: r.id,
  new_user: s.users[r.new_user_id]?.name ?? `#${r.new_user_id}`,
  new_user_id: r.new_user_id,
  new_username: s.users[r.new_user_id]?.username ?? null,
  referrer: s.users[r.referrer_id]?.name ?? `#${r.referrer_id}`,
  referrer_id: r.referrer_id,
  referrer_username: s.users[r.referrer_id]?.username ?? null,
  status: r.status ?? "pending",
  suspicious: !!r.suspicious,
  same_ip: !!r.same_ip,
  points_awarded: r.points_awarded ?? 0,
  at: r.at,
});

export default methods({
  GET: authed(async (req, res, state) => {
    const url = new URL(req.url, "http://x");
    const status = url.searchParams.get("status") ?? "all";
    let rows = state.referrals;
    if (status !== "all") rows = rows.filter((r) => (r.status ?? "pending") === status);
    return json(res, 200, {
      ok: true,
      count: rows.length,
      totals: {
        confirmed: state.referrals.filter((r) => r.status === "confirmed").length,
        pending: state.referrals.filter((r) => (r.status ?? "pending") === "pending").length,
        flagged: state.referrals.filter((r) => r.status === "flagged").length,
      },
      referrals: rows.slice(-300).reverse().map((r) => view(state, r)),
    });
  }),

  POST: authed(async (req, res, state) => {
    const b = await body(req);
    const id = Number(b?.id);
    const action = String(b?.action ?? "");
    const out = await updateState((s) => {
      const r = s.referrals.find((x) => x.id === id);
      if (!r) return { error: "ما لقيتش الإحالة" };
      if (action === "confirm") {
        r.status = "confirmed";
        r.points_awarded = s.settings.referralRewardReferrer;
        const a = s.users[r.referrer_id];
        if (a) { a.points += s.settings.referralRewardReferrer; a.referrals = (a.referrals ?? 0) + 1; }
        const n = s.users[r.new_user_id];
        if (n) n.points += s.settings.referralRewardNew;
      } else if (action === "reject") {
        r.status = "rejected";
        r.points_awarded = 0;
      } else if (action === "flag") {
        r.status = "flagged";
        r.suspicious = true;
      }
      recordAction(s, { kind: "referral", detail: `${action} #${id}` });
      return { ok: true };
    });
    if (out.error) return json(res, 404, { ok: false, error: out.error });
    return json(res, 200, out);
  }),
});
