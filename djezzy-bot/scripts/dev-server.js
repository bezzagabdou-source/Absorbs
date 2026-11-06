#!/usr/bin/env node
/**
 * سيرفر تطوير محلي.
 *
 *   npm run dev                  # Webhook محلي على http://localhost:8080
 *   USE_POLLING=1 npm run dev    # تشغيل بالـ polling (لا يحتاج رابطاً عاماً)
 *
 * للاختبار عبر تيليجرام من جهازك: شغّل نفقاً مثل `npx localtunnel --port 8080`
 * ثم: node scripts/set-webhook.js --url https://<النفق>/api/webhook
 */
import 'node:process';
import { createApp } from '../api/app.js';
import config, { validateConfig } from '../src/config.js';
import { getBot } from '../src/bot.js';
import { createLogger } from '../src/util/logger.js';

const log = createLogger('dev');
const PORT = Number(process.env.PORT || 8080);
const usePolling = /^(1|true|yes)$/i.test(String(process.env.USE_POLLING || ''));

for (const warning of validateConfig()) log.warn(warning);

if (usePolling) {
  const bot = getBot();
  if (!bot) {
    log.error('BOT_TOKEN غير مضبوط — لا يمكن التشغيل بالـ polling.');
    process.exit(1);
  }
  // إزالة أي Webhook سابق: يتعارض مع الـ polling (خطأ 409 Conflict)
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    log.info('أُزيل الـ Webhook السابق (وضع polling).');
  } catch (error) {
    log.warn(`تعذّر إزالة الـ Webhook: ${error.message} — أكمل على أي حال.`);
  }

  bot.start({
    drop_pending_updates: true,
    onStart: (me) =>
      log.info(`البوت @${me.username} يعمل بالـ polling (وضع جيزي: ${config.djezzy.dryRun ? 'محاكاة' : 'مباشر'})`),
  });
} else {
  const app = createApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    log.info(`السيرفر يعمل على http://0.0.0.0:${PORT}`);
    log.info(`  الصحة      : GET  /health`);
    log.info(`  Webhook    : POST /api/webhook`);
    log.info(`  ضبط الويبهوك: GET  /api/setup?key=<WEBHOOK_SECRET>`);
  });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}
