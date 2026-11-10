/* FT AI — webhook تيليغرام: نردّ 200 فوراً ونشتغل */
import { methods } from "./_lib.js";
import { json, readState, updateState } from "../lib/core.js";
import { handleUpdate, webhookSecret } from "../lib/bot.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, x-telegram-bot-api-secret-token",
};

export default methods({
  GET: async (req, res) => {
    const state = await readState();
    return json(res, 200, { ok: true, service: "FT AI webhook", users: Object.keys(state.users).length });
  },

  OPTIONS: async (req, res) => {
    res.statusCode = 204;
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    res.end();
  },

  POST: async (req, res) => {
    const expected = webhookSecret();
    const got = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");
    if (process.env.WEBHOOK_SECRET && got !== expected) {
      return json(res, 401, { ok: false, error: "secret غالط" });
    }
    let update = {};
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { update = {}; }

    const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    // نردّ بسرعة (تيليغرام يعيد المحاولة إذا تأخّرنا) ثم ننفّذ
    const work = handleUpdate(update, { ip }).catch((e) => {
      console.error("[webhook]", e?.message ?? e);
      return { ok: false, error: String(e?.message ?? e) };
    });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
    res.end(JSON.stringify({ ok: true }));
    try { await updateState((s) => { s.metrics.visits += 0; return s; }); } catch { /* ignore */ }
    await work;
  },
});
