#!/usr/bin/env node
/**
 * 🔗 مزامنة الويب هوك وقت البناء (Vercel build).
 *
 * ليش موجود: الويب هوك كان مربوط بمشروع قديم (ft-contests-bot) ويرجّع 401،
 * والبوت ما كانش يردّ أبداً. هذا السكربت يتنفّذ قبل `next build` ويربط
 * الويب هوك بدومين الإنتاج الصحيح، ويطبع تقرير كامل في لوغ البناء:
 *   - getMe
 *   - getWebhookInfo قبل
 *   - setWebhook (الرابط + السر + allowed_updates)
 *   - getWebhookInfo بعد (pending / last_error)
 *   - فحص القنوات: واش البوت أدمن في كل قناة
 *
 * ⚠️ ما يطبعش التوكن ولا السر. وما يفشّلش البناء أبداً (كل الأخطاء مسكوتة).
 *
 * التشغيل اليدوي:  npm run sync:webhook
 */

const REQUIRED_CHANNELS = (process.env.BOT_CHANNELS || "@F_M_M_T,@F_V_V_T,@F_5_5_T,@F_D_D_T,@F_Z_Z_T,@youkito_Ft")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "my_chat_member",
  "chat_join_request",
  "chat_member",
];

const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "").trim();
const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "").trim();
const host =
  (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.PRODUCTION_URL || process.env.BOT_HOST || "").trim() ||
  "";

const log = (...parts) => console.log("[webhook-sync]", ...parts);

async function tg(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json();
}

function masked(value) {
  if (!value) return "(فارغ)";
  return `${value.slice(0, 3)}…${value.slice(-2)} (${value.length})`;
}

async function main() {
  if (!token) {
    log("⚠️ ماكانش TELEGRAM_BOT_TOKEN — نتخطّاو المزامنة.");
    return;
  }
  if (!host) {
    log("⚠️ ماكانش دومين الإنتاج (VERCEL_PROJECT_PRODUCTION_URL) — نتخطّاو setWebhook.");
  }
  const expected = host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/telegram/webhook` : "";

  const me = await tg("getMe");
  if (!me.ok) {
    log("❌ getMe فشل:", me.description || "خطأ");
    return;
  }
  log(`🤖 البوت: @${me.result.username} (id=${me.result.id})`);
  log(`🔑 السر: ${secret ? masked(secret) : "بلا سر"}`);

  const before = await tg("getWebhookInfo");
  if (before.ok) {
    log(`📋 قبل: url=${before.result.url || "(فارغ)"} pending=${before.result.pending_update_count} last_error=${before.result.last_error_message || "لا شيء"}`);
  }

  if (expected && before.ok && before.result.url === expected) {
    const registered = before.result.allowed_updates || [];
    const missing = ALLOWED_UPDATES.filter((u) => !registered.includes(u));
    if (!missing.length) {
      log("✅ الويب هوك صحيح ومكتمل — ماكانش حاجة نبدّلوها.");
    } else {
      log(`⚠️ الويب هوك صحيح لكن ناقص updates: ${missing.join(",")} — نعاودو setWebhook.`);
    }
  }

  if (expected) {
    const needSet = !before.ok || before.result.url !== expected || !(before.result.allowed_updates || []).length;
    if (needSet) {
      const set = await tg("setWebhook", {
        url: expected,
        ...(secret ? { secret_token: secret } : {}),
        allowed_updates: ALLOWED_UPDATES,
        drop_pending_updates: false,
      });
      log(set.ok ? `✅ setWebhook → ${expected}` : `❌ setWebhook فشل: ${set.description || "خطأ"}`);
    }
    const commands = [
      { command: "start", description: "مرحبا بكم في بوت مسابقات FT" },
      { command: "fastest", description: "مسابقة أسرع ضيف — رابط الدعوة" },
      { command: "me", description: "جهاتي ورابطي" },
      { command: "points", description: "نقاطي ورصيدي" },
      { command: "shop", description: "متجر الجوائز — بدّل نقاطك 🎁" },
      { command: "daily", description: "هدية اليوم 🎁" },
      { command: "join", description: "دخول المجموعة" },
      { command: "top", description: "الترتيب" },
      { command: "rules", description: "الشروط" },
      { command: "owner", description: "مالك البوت" },
    ];
    const cmd = await tg("setMyCommands", { commands });
    log(cmd.ok ? "✅ setMyCommands" : `⚠️ setMyCommands: ${cmd.description || "خطأ"}`);
  }

  const after = await tg("getWebhookInfo");
  if (after.ok) {
    log("════════ حالة الويب هوك بعد المزامنة ════════");
    log(`url          : ${after.result.url || "(فارغ)"}`);
    log(`pending      : ${after.result.pending_update_count}`);
    log(`last_error   : ${after.result.last_error_message || "لا شيء"}`);
    log(`updates      : ${(after.result.allowed_updates || []).join(",") || "(افتراضي)"}`);
    log(`يطابق المتوقع: ${after.result.url === expected ? "✅ نعم" : "❌ لا"}`);
  } else {
    log("❌ getWebhookInfo فشل:", after.description || "خطأ");
  }

  // ── فحص القنوات الست: واش البوت أدمن؟
  log("════════ فحص القنوات المطلوبة ════════");
  const notAdmin = [];
  for (const chat of REQUIRED_CHANNELS) {
    const info = await tg("getChat", { chat_id: chat }).catch(() => ({ ok: false }));
    if (!info.ok) {
      notAdmin.push(chat);
      log(`❌ ${chat}: تعذّر قراءة القناة — ${info.description || "خطأ"}`);
      continue;
    }
    const member = await tg("getChatMember", { chat_id: chat, user_id: me.result.id }).catch(() => ({ ok: false }));
    const status = member.ok ? member.result.status : `خطأ: ${member.description || "?"}`;
    const isAdmin = member.ok && (member.result.status === "administrator" || member.result.status === "creator");
    if (!isAdmin) notAdmin.push(chat);
    log(`${isAdmin ? "✅" : "⚠️"} ${chat} (${info.result.title || ""}): البوت ${status}`);
  }
  log(
    notAdmin.length
      ? `⚠️ البوت ماشي أدمن في: ${notAdmin.join(", ")} — التحقّق من الاشتراك كيتجاوز هذي القنوات (البوت ما يتوقّفش).`
      : "✅ البوت أدمن في كل القنوات.",
  );
  log("════════ انتهى ════════");
}

main()
  .catch((error) => log("⚠️ خطأ غير متوقّع (ما نوقفوش البناء):", error instanceof Error ? error.message : String(error)))
  .finally(() => process.exit(0));
