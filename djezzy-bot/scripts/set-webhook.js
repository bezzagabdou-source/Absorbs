#!/usr/bin/env node
/**
 * ضبط / حذف / فحص الـ Webhook لبوت تيليجرام.
 *
 *   node scripts/set-webhook.js                 # ضبط Webhook على PUBLIC_URL/api/webhook
 *   node scripts/set-webhook.js --info          # عرض معلومات الـ Webhook الحالية
 *   node scripts/set-webhook.js --delete        # حذف الـ Webhook (للإرجاع إلى polling)
 *   node scripts/set-webhook.js --url https://example.com/api/webhook
 */
import { Bot } from 'grammy';
import config from '../src/config.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const COMMANDS = [
  { command: 'start', description: 'القائمة الرئيسية' },
  { command: 'menu', description: 'عرض الأزرار' },
  { command: 'cancel', description: 'إلغاء العملية الحالية' },
  { command: 'help', description: 'شرح الاستخدام' },
];

async function main() {
  if (!config.bot.token) {
    console.error('❌ BOT_TOKEN غير مضبوط. ضعه في .env أو في متغيّرات بيئة Vercel.');
    process.exit(1);
  }

  const bot = new Bot(config.bot.token);

  try {
    if (has('--info')) {
      const info = await bot.api.getWebhookInfo();
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    if (has('--delete')) {
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      console.log('✅ تم حذف الـ Webhook.');
      return;
    }

    const url = value('--url') || (config.bot.publicUrl ? `${config.bot.publicUrl}/api/webhook` : null);
    if (!url) {
      console.error('❌ لا يوجد PUBLIC_URL. استخدم --url https://your-app.vercel.app/api/webhook');
      process.exit(1);
    }
    if (!/^https:\/\//.test(url)) {
      console.error('❌ تيليجرام يشترط HTTPS للـ Webhook.');
      process.exit(1);
    }
    if (!config.bot.webhookSecret) {
      console.warn('⚠️ WEBHOOK_SECRET غير مضبوط — يُفضّل ضبطه لحماية الـ Webhook.');
    }

    await bot.api.setWebhook(url, {
      secret_token: config.bot.webhookSecret || undefined,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
      max_connections: 40,
    });

    await bot.api.setMyCommands(COMMANDS);

    const me = await bot.api.getMe();
    const info = await bot.api.getWebhookInfo();

    console.log('✅ تم ربط البوت بنجاح');
    console.log(`   البوت      : @${me.username} (${me.id})`);
    console.log(`   Webhook    : ${url}`);
    console.log(`   الحالة     : ${info.last_error_message ? `⚠️ ${info.last_error_message}` : 'سليم'}`);
    console.log(`   تحديثات معلّقة: ${info.pending_update_count}`);
    console.log(`   وضع جيزي   : ${config.djezzy.dryRun ? '🧪 محاكاة' : '🟢 مباشر'}`);
    console.log('\nجرّب الآن إرسال /start إلى البوت.');
  } catch (error) {
    console.error('❌ فشل التنفيذ:', error?.description || error?.message || error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ فشل التنفيذ:', error?.description || error?.message || error);
  process.exit(1);
});
