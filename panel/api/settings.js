/* FT AI — الإعدادات + مستوى الحماية */
import { methods, authed, body } from "./_lib.js";
import { json, updateState, recordAction } from "../lib/core.js";

const LEVELS = ["off", "light", "normal", "high", "max"];

export default methods({
  GET: authed(async (req, res, state) => json(res, 200, { ok: true, settings: state.settings, levels: LEVELS })),

  POST: authed(async (req, res) => {
    const b = await body(req);
    const patch = b?.settings && typeof b.settings === "object" ? b.settings : {};
    const out = await updateState((s) => {
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in s.settings)) continue;
        if (k === "protectionLevel" && !LEVELS.includes(String(v))) continue;
        s.settings[k] = typeof s.settings[k] === "number" ? Math.trunc(Number(v) || 0) : String(v).slice(0, 600);
      }
      recordAction(s, { kind: "settings", detail: Object.keys(patch).join(", ") });
      return s.settings;
    });
    return json(res, 200, { ok: true, settings: out });
  }),
});
