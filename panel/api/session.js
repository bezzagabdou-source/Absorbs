/* FT AI — حالة الجلسة */
import { methods } from "./_lib.js";
import { json, readState, verifySession, parseCookies, COOKIE, hasRedis, ensurePassword } from "../lib/core.js";

export default methods({
  GET: async (req, res) => {
    const state = await readState();
    await ensurePassword(state);
    const token = parseCookies(req)[COOKIE];
    const sess = verifySession(token, state);
    return json(res, 200, {
      ok: true,
      authed: Boolean(sess),
      passwordSet: Boolean(state.password?.hash),
      storage: hasRedis() ? "redis" : "memory",
      botName: state.settings.botName,
    });
  },
});
