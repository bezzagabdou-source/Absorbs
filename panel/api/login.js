/* FT AI — الدخول */
import { methods, body } from "./_lib.js";
import {
  json, readState, writeState, ensurePassword, checkPassword, makeSession, sessionCookie,
  loginAllowed, clientIp, now,
} from "../lib/core.js";

export default methods({
  POST: async (req, res) => {
    const ip = clientIp(req);
    if (!(await loginAllowed(ip))) return json(res, 429, { ok: false, error: "محاولات كثيرة — عاود بعد 5 دقايق" });
    const b = await body(req);
    const state = await readState();
    await ensurePassword(state);
    if (!state.password?.hash) {
      return json(res, 400, {
        ok: false,
        error: "كلمة السر ماشي مضبوطة في Vercel — زيد DASHBOARD_PASSWORD في Environment Variables",
      });
    }
    const pw = String(b?.password ?? "");
    if (!pw || !checkPassword(pw, state.password.hash)) {
      return json(res, 401, { ok: false, error: "كلمة السر غالطة" });
    }
    const token = makeSession(state, req);
    state.meta.lastLoginAt = now();
    await writeState(state);
    res.setHeader("set-cookie", sessionCookie(token, String(req.headers["x-forwarded-proto"] ?? "").includes("https")));
    return json(res, 200, { ok: true, at: now() });
  },
});
