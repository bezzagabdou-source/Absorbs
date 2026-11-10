/* FT AI — إرسال رسالة / بثّ / فحص / تصليح webhook */
import { methods, authed, body, baseUrl } from "./_lib.js";
import { json, readState, updateState, recordAction } from "../lib/core.js";
import { sendMessage, sendPhoto, getMe, getWebhookInfo } from "../lib/tg.js";
import { ensureWebhook } from "../lib/bot.js";

export default methods({
  POST: authed(async (req, res) => {
    const b = await body(req);
    const job = String(b?.job ?? "");
    const state = await readState();

    if (job === "message") {
      const to = String(b?.user_id ?? "").trim();
      const text = String(b?.text ?? "").slice(0, 4000);
      if (!to || !text) return json(res, 400, { ok: false, error: "لازم العضو والنص" });
      const r = b?.photo_url ? await sendPhoto(to, String(b.photo_url), { caption: text }) : await sendMessage(to, text);
      await updateState((s) => { recordAction(s, { kind: "message", detail: `${to}: ${text.slice(0, 60)}` }); return s; });
      return json(res, 200, { ok: !!r?.ok, sent: !!r?.ok, message_id: r?.result?.message_id ?? null, error: r?.ok ? null : r?.description });
    }

    if (job === "broadcast") {
      const text = String(b?.text ?? "").slice(0, 4000);
      if (!text) return json(res, 400, { ok: false, error: "اكتب نص البثّ" });
      const targets = Object.values(state.users).filter((u) => !u.blocked).slice(0, Number(b?.limit) || 100);
      let sent = 0;
      const errors = [];
      for (const u of targets) {
        const r = await sendMessage(u.id, text);
        if (r?.ok) sent++;
        else if (errors.length < 3) errors.push({ id: u.id, error: r?.description ?? "خطأ" });
        await new Promise((r2) => setTimeout(r2, 900 + Math.random() * 200));
      }
      await updateState((s) => {
        s.metrics.broadcasts += 1;
        s.meta.lastBroadcastAt = Date.now();
        recordAction(s, { kind: "broadcast", detail: `${sent}/${targets.length}` });
        return s;
      });
      return json(res, 200, { ok: true, sent, failed: targets.length - sent, total: targets.length, errors });
    }

    if (job === "diagnose") {
      const me = await getMe();
      const hook = await getWebhookInfo();
      return json(res, 200, {
        ok: true,
        bot: me?.ok ? me.result : null,
        bot_error: me?.ok ? null : me?.description ?? "ما قدرتش نوصل لتيليغرام",
        demo: !process.env.BOT_TOKEN,
        webhook: hook?.ok ? hook.result : null,
        expected_webhook: `${baseUrl(req)}/api/webhook`,
        secrets: {
          BOT_TOKEN: Boolean(process.env.BOT_TOKEN),
          OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
          XAI_API_KEY: Boolean(process.env.XAI_API_KEY || process.env.GROK_API_KEY),
          REDIS_URL: Boolean(process.env.REDIS_URL),
          DASHBOARD_PASSWORD: Boolean(process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD),
        },
      });
    }

    if (job === "fix_webhook") {
      const out = await ensureWebhook(baseUrl(req));
      await updateState((s) => { s.meta.webhookAt = Date.now(); recordAction(s, { kind: "webhook", detail: out.url }); return s; });
      return json(res, 200, out);
    }

    return json(res, 400, { ok: false, error: `job غير معروف: ${job}` });
  }),
});
