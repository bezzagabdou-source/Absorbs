/**
 * تطبيق Express المشترك بين Vercel (api/index.js) والسيرفر المحلي.
 * كل المسارات تُدار من هنا حتى يبقى سلوك الإنتاج والتطوير واحداً.
 */
import express from 'express';
import { webhookCallback } from 'grammy';
import config, { validateConfig } from '../src/config.js';
import { getBot, engine } from '../src/bot.js';
import store from '../src/store/index.js';
import { statusPage } from '../src/ui/text.js';
import { createLogger } from '../src/util/logger.js';
import { safeEqual } from '../src/crypto.js';

const log = createLogger('http');

let cachedWebhook = null;

/** يُنشئ معالج Webhook مرة واحدة لكل عملية (Cold start واحد فقط) */
function webhookHandler() {
  if (cachedWebhook) return cachedWebhook;

  const bot = getBot();
  if (!bot) return null;

  cachedWebhook = webhookCallback(bot, 'express', {
    secretToken: config.bot.webhookSecret || undefined,
    timeoutMilliseconds: 25_000,
    onTimeout: 'return',
  });

  return cachedWebhook;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // تيليجرام يرسل JSON فقط
  app.use(express.json({ limit: '1mb' }));

  const warnings = validateConfig();
  if (warnings.length) {
    for (const warning of warnings) log.warn(warning);
  }

  /* --------------------------- حالة الخدمة --------------------------- */
  app.get(['/health', '/api/health'], async (_req, res) => {
    const storageOk = await store.ping();
    res.status(200).json({
      ok: Boolean(config.bot.token),
      service: 'djezzy-telegram-bot',
      version: '1.0.0',
      bot: { configured: Boolean(config.bot.token), webhookSecret: Boolean(config.bot.webhookSecret) },
      djezzy: { mode: engine.mode, baseUrl: config.djezzy.baseUrl || null },
      storage: { adapter: store.adapter, reachable: storageOk },
      publicUrl: config.bot.publicUrl || null,
      warnings,
      timestamp: new Date().toISOString(),
    });
  });

  /* ------------------------- صفحة الحالة (HTML) ------------------------- */
  app.get(['/', '/api', '/api/index', '/status'], (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        statusPage({
          botConfigured: Boolean(config.bot.token),
          mode: engine.mode,
          storage: store.adapter,
          publicUrl: config.bot.publicUrl,
          warnings,
        }),
      );
  });

  /* --------------------- ضبط الـ Webhook من المتصفح --------------------- */
  app.get(['/api/setup', '/setup'], async (req, res) => {
    const key = String(req.query.key || '');
    if (!config.bot.webhookSecret || !safeEqual(key, config.bot.webhookSecret)) {
      res.status(401).json({ ok: false, error: 'مفتاح غير صحيح — مرّر WEBHOOK_SECRET في ?key=' });
      return;
    }
    if (!config.bot.publicUrl) {
      res.status(400).json({ ok: false, error: 'PUBLIC_URL غير مضبوط' });
      return;
    }

    const bot = getBot();
    if (!bot) {
      res.status(503).json({ ok: false, error: 'BOT_TOKEN غير مضبوط' });
      return;
    }

    const url = `${config.bot.publicUrl}/api/webhook`;
    try {
      if (String(req.query.delete || '') === '1') {
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        res.json({ ok: true, deleted: true });
        return;
      }

      await bot.api.setWebhook(url, {
        secret_token: config.bot.webhookSecret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
        max_connections: 40,
      });
      const info = await bot.api.getWebhookInfo();
      log.info(`تم ضبط الـ Webhook: ${url}`);
      res.json({ ok: true, url, info });
    } catch (error) {
      log.error(`فشل ضبط الـ Webhook: ${error.message}`);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /* ----------------------------- Webhook ----------------------------- */
  const handleWebhook = (req, res, next) => {
    const handler = webhookHandler();
    if (!handler) {
      res.status(503).json({ ok: false, error: 'BOT_TOKEN غير مضبوط على الخادم' });
      return;
    }
    return handler(req, res, next);
  };

  app.post(['/api/webhook', '/webhook', '/api/index', '/'], handleWebhook);

  // شبكة أمان: أي طلب POST قادم من تيليجرام يُعالَج كتحديث
  // (يضمن العمل حتى لو غيّر Vercel شكل إعادة كتابة المسار)
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const looksLikeTelegram =
      req.body?.update_id !== undefined ||
      Boolean(req.headers['x-telegram-bot-api-secret-token']);
    if (!looksLikeTelegram) return next();
    return handleWebhook(req, res, next);
  });

  /* ----------------------------- 404 JSON ----------------------------- */
  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'المسار غير موجود', path: req.path, method: req.method });
  });

  /* ---------------------------- معالج أخطاء ---------------------------- */
  app.use((error, _req, res, _next) => {
    log.error(`خطأ HTTP: ${error.message}`);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'خطأ داخلي' });
  });

  return app;
}

export default createApp;
