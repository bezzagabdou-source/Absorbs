/* FT AI — تغيير كلمة سر اللوحة (الزر الأهم) */
import { methods, authed, body } from "./_lib.js";
import {
  json, updateState, recordAction, checkPassword, hashPassword, passwordProblem,
  makeSession, sessionCookie, now,
} from "../lib/core.js";

export default methods({
  POST: authed(async (req, res, state) => {
    const b = await body(req);
    const current = String(b?.current ?? "");
    const next = String(b?.next ?? "");
    if (!state.password?.hash || !checkPassword(current, state.password.hash)) {
      return json(res, 401, { ok: false, error: "كلمة السر الحالية غالطة" });
    }
    const problem = passwordProblem(next);
    if (problem) return json(res, 400, { ok: false, error: problem });
    if (checkPassword(next, state.password.hash)) return json(res, 400, { ok: false, error: "كلمة السر الجديدة كيما القديمة" });

    const out = await updateState((s) => {
      s.password = { hash: hashPassword(next), version: (s.password?.version ?? 0) + 1, changedAt: now() };
      s.meta.passwordChangedAt = now();
      recordAction(s, { kind: "password", detail: "تغيير كلمة سر اللوحة" });
      return s;
    });

    // جلسة جديدة بالنسخة الجديدة (الباقي كله ينقطع)
    const token = makeSession(out, req);
    res.setHeader("set-cookie", sessionCookie(token, String(req.headers["x-forwarded-proto"] ?? "").includes("https")));
    return json(res, 200, {
      ok: true,
      changed_at: out.meta.passwordChangedAt,
      note: "تم التغيير — كل الأجهزة الأخرى خرجت",
    });
  }),
});
