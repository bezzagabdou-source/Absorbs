/* FT AI — المحادثة التنفيذية */
import { methods, authed, body, baseUrl } from "./_lib.js";
import { json } from "../lib/core.js";
import { chat, providers, aiModel } from "../lib/ai.js";

export default methods({
  GET: authed(async (req, res, state) =>
    json(res, 200, {
      ok: true,
      providers: providers(),
      model: aiModel(),
      messages: state.ai.length,
      tools: (await import("../lib/ai.js")).USER_TOOLS.length,
    })
  ),

  POST: authed(async (req, res) => {
    const b = await body(req);
    const message = String(b?.message ?? "").slice(0, 4000);
    const images = Array.isArray(b?.images) ? b.images.filter((i) => i && i.dataUrl).slice(0, 4) : [];
    if (!message.trim() && !images.length) return json(res, 400, { ok: false, error: "اكتب رسالة ولا حط صورة" });
    const out = await chat({ message, images, source: "panel", baseUrl: baseUrl(req) });
    return json(res, 200, out);
  }),

  DELETE: authed(async (req, res) => {
    await (await import("../lib/core.js")).updateState((s) => { s.ai = []; return s; });
    return json(res, 200, { ok: true });
  }),
});
