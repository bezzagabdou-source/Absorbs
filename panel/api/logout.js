import { methods } from "./_lib.js";
import { json, clearCookie } from "../lib/core.js";

export default methods({
  POST: async (req, res) => {
    res.setHeader("set-cookie", clearCookie());
    return json(res, 200, { ok: true });
  },
});
