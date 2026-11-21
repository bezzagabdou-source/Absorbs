/**
 * تطبيق Express المشترك بين Vercel (api/index.js) والسيرفر المحلي.
 * كل المسارات تُدار من هنا حتى يبقى سلوك الإنتاج والتطوير واحداً.
 *
 * المسارات:
 *   POST /api/webhook        ← تيليجرام
 *   GET  /health             ← فحص سريع (JSON)
 *   GET  /api/diagnose?key=  ← تشخيص كامل داخل الإنتاج
 *   GET  /api/setup?key=     ← ضبط الـ Webhook
 *   GET  /                   ← صفحة حالة
 */
import net from 'node:net';
import express from 'express';
import axios from 'axios';
import { GrammyError, webhookCallback } from 'grammy';
import config, { validateConfig } from '../src/config.js';
import { getBot, engine } from '../src/bot.js';
import store from '../src/store/index.js';
import { statusPage } from '../src/ui/text.js';
import { appPage, emojisPage } from '../src/ui/pages.js';
import { PAID_OFFERS, findOffer } from '../src/djezzy/catalog.js';
import { describeRoutes, parseProxy } from '../src/djezzy/routes.js';
import { verifyInitData } from '../src/util/telegram-auth.js';
import { createLogger, sanitize } from '../src/util/logger.js';
import { safeEqual } from '../src/crypto.js';
import { formatDateTime, withTimeout } from '../src/util/time.js';
import * as txt from '../src/ui/text.js';

const log = createLogger('http');
const STARTED_AT = Date.now();

let cachedWebhook = null;
let updatesReceived = 0;
const recentUpdates = [];

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

/** وصف مختصر للتحديث (بدون أي بيانات حسّاسة) */
function describeUpdate(update) {
  if (!update || typeof update !== 'object') return { type: 'unknown' };
  const keys = Object.keys(update).filter((key) => key !== 'update_id');
  const type = keys[0] || 'unknown';
  const payload = update[type] || {};
  return {
    type,
    userId: payload.from?.id ?? null,
    callbackData: payload.data ?? undefined,
    textPreview: typeof payload.text === 'string' ? payload.text.slice(0, 24) : undefined,
  };
}

/** حماية: مفتاح التشخيص/الضبط = WEBHOOK_SECRET */
function authorized(req) {
  if (!config.bot.webhookSecret) return false;
  const key = String(req.query.key || req.headers['x-setup-key'] || '');
  return safeEqual(key, config.bot.webhookSecret);
}

/* ----------------------------- المعالجات ----------------------------- */

async function healthHandler(_req, res) {
  const storageOk = await store.ping();
  const lastUpdate = await store.getMeta('lastUpdate');

  res.status(200).json({
    ok: Boolean(config.bot.token),
    service: 'djezzy-telegram-bot',
    version: '2.0.0',
    uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
    bot: { configured: Boolean(config.bot.token), webhookSecret: Boolean(config.bot.webhookSecret) },
    djezzy: { mode: engine.mode, baseUrl: config.djezzy.baseUrl || null, routes: describeRoutes() },
    storage: { adapter: store.adapter, reachable: storageOk },
    publicUrl: config.bot.publicUrl || null,
    webhookPath: '/api/webhook',
    updatesReceived,
    lastUpdate: lastUpdate || null,
    warnings: validateConfig(),
    timestamp: new Date().toISOString(),
  });
}

async function setupHandler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({
      ok: false,
      error: 'مفتاح غير صحيح — أضف ?key=<WEBHOOK_SECRET>',
    });
    return;
  }
  if (!config.bot.publicUrl) {
    res.status(400).json({ ok: false, error: 'PUBLIC_URL غير مضبوط (ولا يمكن استنتاجه)' });
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

    if (!config.bot.webhookSecret) {
      res.status(400).json({ ok: false, error: 'WEBHOOK_SECRET غير مضبوط — لا يمكن تأمين الـ Webhook' });
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
    res.status(500).json({ ok: false, error: error.message, code: error?.error_code ?? null });
  }
}

const tcpProbe = (host, port, timeoutMs) =>
  new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ host, port, ms: Date.now() - started, ...payload });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ connected: true }));
    socket.once('timeout', () => finish({ connected: false, error: 'ETIMEDOUT' }));
    socket.once('error', (error) => finish({ connected: false, error: error.code || error.message }));
    socket.connect(port, host);
  });

async function tcpHandler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'مفتاح غير صحيح' });
    return;
  }

  const host = String(req.query.host || new URL(config.djezzy.baseUrl).hostname);
  const port = Number(req.query.port || 443);
  const timeoutMs = Math.min(Number(req.query.timeout || 20000), 55000);

  const result = await tcpProbe(host, port, timeoutMs);
  res.status(result.connected ? 200 : 502).json({
    ok: result.connected,
    region: process.env.VERCEL_REGION || null,
    result,
    hint: result.connected
      ? 'المسار الشبكي مفتوح — المشكلة قد تكون بطئاً في TLS/الاستجابة. جرّب مهلة أطول.'
      : 'الحزمة لا تصل (حجب على مستوى الشبكة).',
  });
}

async function probeHandler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'مفتاح غير صحيح — أضف ?key=<WEBHOOK_SECRET>' });
    return;
  }

  const started = Date.now();
  const target = `${config.djezzy.baseUrl}${config.djezzy.paths.requestOtp}`;

  try {
    if (req.query.mode === 'proxies') {
      /* اكتشاف بروكسيات جزائرية واختبارها فعلياً ضد بوابة جيزي من هنا */
      const testOne = async (proxy) => {
        try {
          const response = await axios({
            method: 'POST',
            url: target,
            headers: { ...config.djezzy.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({ msisdn: '213000000000', client_id: config.djezzy.clientId, scope: 'smsotp' }),
            timeout: 9000,
            validateStatus: () => true,
            responseType: 'text',
            transformResponse: [(d) => d],
            proxy: proxy
              ? { protocol: 'http', host: proxy.host, port: proxy.port, ...(proxy.auth ? { auth: proxy.auth } : {}) }
              : false,
          });
          const blocked = response.status === 403 || response.status === 451;
          // 5xx هنا غالباً خطأ من البروكسي نفسه (مثل 502 عند فشل CONNECT) — ليس نجاحاً
          const ok = !blocked && response.status < 500;
          return {
            route: proxy ? proxy.label : 'direct',
            status: response.status,
            ok,
            sample: String(response.data || '').slice(0, 100),
          };
        } catch (error) {
          return { route: proxy ? proxy.label : 'direct', error: error.code || error.message, ok: false };
        }
      };

      // مسارات معدّة فقط (مباشر + بروكسيات المستخدم) — بلا اكتشاف أو تدوير
      const envProxies = config.djezzy.proxies.map((raw) => parseProxy(raw)).filter(Boolean);
      const tested = await Promise.all([testOne(null), ...envProxies.map((proxy) => testOne(proxy))]);
      const results = tested;
      const working = results.filter((item) => item.ok).map((item) => item.route);

      res.status(200).json({
        ok: true,
        mode: 'proxies',
        latencyMs: Date.now() - started,
        discovered: 0,
        working,
        results,
        verdict: working.length
          ? `مسار يعمل: ${working.join(' , ')} — البوت سيستخدمه تلقائياً.`
          : 'لا يوجد مسار عامل حالياً — شغّل الـ relay داخل الجزائر (relay/server.js) واضبط DJEZZY_RELAY_URL.',
      });
      return;
    }

    if (req.query.mode === 'otp') {
      /* اختبار POST حقيقي بنفس شكل إرسال رمز التحقق (بلا إرسال SMS لرقم حقيقي:
         msisdn غير صالح يرفضه الباك-إند بعد عبور البوابة/WAF) */
      const msisdn = String(req.query.msisdn || '213000000000');
      const response = await fetch(target, {
        method: 'POST',
        headers: { ...config.djezzy.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ msisdn, client_id: config.djezzy.clientId, scope: 'smsotp' }),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text().catch(() => '');
      const blocked = response.status === 403 || response.status === 451;
      res.status(200).json({
        ok: !blocked,
        mode: 'otp-post',
        status: response.status,
        latencyMs: Date.now() - started,
        sample: text.slice(0, 300),
        verdict: blocked
          ? '403/451 — البوابة ترفض من منطقة Vercel (حجب جغرافي محتمل). جرّب مسار relay.'
          : 'POST عبَر البوابة ووصل لتطبيق جيزي — المسار مباشر ويعمل من Vercel.',
      });
      return;
    }

    // GET بدون أي معاملات: لا يُرسل رمزاً ولا يمسّ أي حساب — فحص اتصال فقط
    const response = await fetch(target, {
      method: 'GET',
      headers: config.djezzy.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text().catch(() => '');
    res.json({
      ok: true,
      reachable: true,
      mode: engine.mode,
      baseUrl: config.djezzy.baseUrl,
      path: config.djezzy.paths.requestOtp,
      status: response.status,
      latencyMs: Date.now() - started,
      sample: text.slice(0, 200),
      note: 'الوصول إلى خوادم جيزي من Vercel يعمل. رمز 400/401/405 هنا طبيعي (طلب بلا معاملات).',
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      reachable: false,
      baseUrl: config.djezzy.baseUrl,
      latencyMs: Date.now() - started,
      error: error?.message || String(error),
    });
  }
}

async function diagnoseHandler(req, res) {
  if (!authorized(req)) {
    res.status(401).json({ ok: false, error: 'مفتاح غير صحيح — أضف ?key=<WEBHOOK_SECRET>' });
    return;
  }

  const checks = [];
  const add = (name, ok, detail, fix = null) => checks.push({ name, ok, detail, fix });

  /* 1) المتغيّرات */
  const tokenShape = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(config.bot.token);
  add('BOT_TOKEN موجود', Boolean(config.bot.token), config.bot.token ? `ينتهي بـ …${config.bot.token.slice(-4)}` : 'مفقود', 'أضفه في Vercel → Settings → Environment Variables ثم Redeploy');
  add('BOT_TOKEN بصيغة صحيحة', tokenShape, tokenShape ? 'مناسب' : 'الصيغة غير متوقّعة', 'أعد نسخه من @BotFather');
  add('WEBHOOK_SECRET', Boolean(config.bot.webhookSecret), config.bot.webhookSecret ? 'مضبوط' : 'مفقود', 'ولّده: randomBytes(24).toString("base64url")');
  add('SESSION_ENCRYPTION_KEY', (config.storage.encryptionKey || '').length >= 32, `${(config.storage.encryptionKey || '').length} حرفاً`, 'استخدم 64 حرفاً hex ثابتاً');
  add('PUBLIC_URL', Boolean(config.bot.publicUrl), config.bot.publicUrl || 'غير معروف', 'اضبطه على https://<project>.vercel.app');
  add(
    'تخزين دائم (KV)',
    ['kv', 'github', 'telegram', 'file'].includes(store.adapter),
    { kv: 'Upstash/Vercel KV', github: 'GitHub bot-state', telegram: 'رسالة مثبّتة بتيليجرام', file: 'قرص محلي' }[
      store.adapter
    ] || 'ذاكرة مؤقتة — الجلسات تُفقد',
    'أنشئ Upstash Redis وأضف KV_REST_API_URL/TOKEN',
  );

  /* 2) البوت نفسه */
  const bot = getBot();
  let botInfo = null;
  if (bot) {
    try {
      botInfo = await withTimeout(bot.api.getMe(), 8000, 'getMe');
      add('BOT_TOKEN صالح لدى تيليجرام', true, `@${botInfo.username} (${botInfo.id})`);
    } catch (error) {
      add(
        'BOT_TOKEN صالح لدى تيليجرام',
        false,
        error?.description || error?.message || 'فشل getMe',
        'إن كان 401 فالتوكن ملغى/خاطئ: أنشئ واحداً جديداً من @BotFather وضعَه في Vercel',
      );
    }

    /* 3) الـ Webhook */
    if (botInfo) {
      try {
        const info = await withTimeout(bot.api.getWebhookInfo(), 8000, 'getWebhookInfo');
        const expected = config.bot.publicUrl ? `${config.bot.publicUrl}/api/webhook` : null;
        add('Webhook مضبوط', Boolean(info.url), info.url || 'لا يوجد — البوت لن يستقبل أي رسالة', expected ? `افتح ${config.bot.publicUrl}/api/setup?key=<WEBHOOK_SECRET>` : null);
        if (info.url && expected) {
          add('Webhook يطابق PUBLIC_URL', info.url === expected, info.url, `أعد ضبطه على ${expected}`);
        }
        add(
          'لا أخطاء تسليم أخيرة',
          !info.last_error_message,
          info.last_error_message
            ? `${info.last_error_message} (${formatDateTime(info.last_error_date * 1000)})`
            : 'لا يوجد',
          'خطأ 401 يعني عدم تطابق secret_token — أعد الضبط من /api/setup',
        );
        add('تحديثات معلّقة', info.pending_update_count < 20, String(info.pending_update_count), 'ارتفاعها يعني أن الخدمة لا ترد');
        add(
          'allowed_updates',
          !info.allowed_updates || info.allowed_updates.includes('message'),
          JSON.stringify(info.allowed_updates ?? 'الكل'),
          'أعد الضبط عبر /api/setup',
        );
      } catch (error) {
        add('قراءة معلومات الـ Webhook', false, error?.description || error?.message, 'تحقّق من الشبكة/التوكن');
      }
    }
  } else {
    add('تهيئة البوت', false, 'BOT_TOKEN مفقود', 'اضبط BOT_TOKEN');
  }

  /* 4) الخدمة نفسها */
  add('الخدمة تعمل', true, `استقبلت ${updatesReceived} تحديثاً منذ آخر تشغيل (cold start)`);
  const lastUpdate = await store.getMeta('lastUpdate');
  add(
    'آخر تحديث وصل للخدمة',
    Boolean(lastUpdate),
    lastUpdate ? `${lastUpdate.type} — ${formatDateTime(lastUpdate.at)}` : 'لا شيء بعد',
    'إن لم يصل شيء أبداً فالطلب لا يصل إلى الدالة: راجع Rewrites/Deployment أو أعد ضبط الـ Webhook',
  );

  res.json({
    ok: checks.every((check) => check.ok),
    environment: {
      node: process.version,
      region: process.env.VERCEL_REGION || null,
      vercel: Boolean(process.env.VERCEL),
      env: process.env.VERCEL_ENV || null,
    },
    bot: botInfo ? { id: botInfo.id, username: botInfo.username } : null,
    lastUpdate: lastUpdate || null,
    checks,
    note: 'كل بند أحمر (ok:false) يحمل معه خطوة الإصلاح في حقل fix.',
  });
}

/* --------------------- لوحة الويب: أزرار عبر initData --------------------- */

let cachedUsername = null;
let cachedUsernameAt = 0;

async function resolveBotUsername() {
  if (cachedUsername && Date.now() - cachedUsernameAt < 60 * 60 * 1000) return cachedUsername;
  const bot = getBot();
  if (!bot) return '';
  try {
    if (bot.botInfo?.username) {
      cachedUsername = bot.botInfo.username;
    } else {
      const info = await withTimeout(bot.api.getMe(), 8000, 'getMe');
      cachedUsername = info.username || '';
    }
    cachedUsernameAt = Date.now();
  } catch {
    cachedUsername = cachedUsername || '';
  }
  return cachedUsername;
}

/** تصفية رسالة نتيجة لعرضها في الويب (HTML → نص) */
const plain = (value) => String(value || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

async function appActionHandler(req, res) {
  const auth = verifyInitData(req.headers['x-telegram-init-data'], config.bot.token);
  if (!auth.ok) {
    res.status(401).json({ ok: false, error: 'بيانات الدخول غير صالحة — افتح اللوحة من داخل البوت.' });
    return;
  }

  const userId = auth.user.id;
  const { action, code, friend } = req.body || {};

  try {
    const user = await store.getUser(userId);
    const msisdn = user.activeMsisdn || Object.keys(user.accounts || {})[0];

    const needAccount = () => {
      if (!msisdn || !user.accounts?.[msisdn]) {
        const error = new Error('لا يوجد رقم مربوط — اربط رقمك من البوت أولاً (📱 إضافة رقم).');
        error.status = 400;
        throw error;
      }
    };

    let message = '';

    if (action === 'claim-weekly') {
      needAccount();
      const result = await engine.claimWeeklyGift(userId, msisdn);
      message = plain(txt.giftsResult(result));
      if (result.ok) message = `✅ ${message}`;
    } else if (action === 'claim-promo') {
      needAccount();
      const result = await engine.claimPromoGift(userId, msisdn);
      message = result.ok ? '✅ تم استلام الهدية الترويجية بنجاح.' : `⚠️ ${result.message || 'لم تُستلم الهدية.'}`;
    } else if (action === 'overview') {
      needAccount();
      const overview = await engine.getOverview(userId, msisdn);
      message = plain(txt.overviewText({ account: engine.describeAccount(user.accounts[msisdn]), overview }));
    } else if (action === 'activate-offer') {
      needAccount();
      const offer = findOffer(String(code || ''));
      if (!offer) {
        const error = new Error('العرض غير موجود في الكتالوج.');
        error.status = 404;
        throw error;
      }
      const result = await engine.activateOffer(userId, msisdn, offer.code);
      message = `✅ تم تفعيل ${offer.name} بنجاح.`;
    } else if (action === 'remove-account') {
      needAccount();
      await engine.removeAccount(userId, msisdn);
      message = '🗑 تم حذف الرقم المربوط من البوت.';
    } else {
      const error = new Error('عملية غير معروفة.');
      error.status = 400;
      throw error;
    }

    res.json({ ok: true, message });
  } catch (error) {
    const friendly = error?.friendly || error?.message || 'حدث خطأ غير متوقع.';
    res.status(error?.status || 400).json({ ok: false, error: plain(friendly) });
  }
}

/* ------------------------------ التطبيق ------------------------------ */

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const warnings = validateConfig();
  for (const warning of warnings) log.warn(warning);
  log.info(`بدء الخدمة — وضع جيزي: ${engine.mode} | تخزين: ${store.adapter} | PUBLIC_URL: ${config.bot.publicUrl || '—'}`);

  /* --------------------------- المسارات --------------------------- */
  app.get(['/health', '/api/health'], healthHandler);
  app.get(['/api/setup', '/setup'], setupHandler);
  app.get(['/api/diagnose', '/diagnose'], diagnoseHandler);
  app.get(['/api/probe', '/probe'], probeHandler);
  app.get(['/api/tcp'], tcpHandler);

  /* صفحات الويب: لوحة الأزرار الملوّنة + معرض الإيموجيات المتحركة */
  app.get('/app', async (_req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        appPage({
          publicUrl: config.bot.publicUrl || '',
          botUsername: await resolveBotUsername(),
          mode: engine.mode,
          storage: store.adapter,
          offers: PAID_OFFERS,
        }),
      );
  });
  app.get('/emojis', (_req, res) => {
    res.status(200).type('html').send(emojisPage({ publicUrl: config.bot.publicUrl || '' }));
  });

  /* أزرار لوحة الويب — مصادقة عبر initData الخاصة بتيليجرام */
  app.post('/api/app/action', express.json({ limit: '32kb' }), appActionHandler);

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

  /* --------------------------- Webhook --------------------------- */
  const handleWebhook = async (req, res, next) => {
    const handler = webhookHandler();
    if (!handler) {
      log.error('وصل طلب Webhook لكن BOT_TOKEN غير مضبوط');
      res.status(503).json({ ok: false, error: 'BOT_TOKEN غير مضبوط على الخادم' });
      return;
    }

    const update = req.body;
    updatesReceived += 1;
    const info = describeUpdate(update);

    // سجل مرئي في Vercel Logs: هل تصل التحديثات أصلاً؟
    log.info(`webhook ← update ${update?.update_id ?? '?'} (${info.type}) من ${info.userId ?? '?'}`);

    if (recentUpdates.length < 20) recentUpdates.push({ ...info, updateId: update?.update_id ?? null, at: Date.now() });
    await withTimeout(
      store.setMeta('lastUpdate', { ...info, updateId: update?.update_id ?? null, at: Date.now() }),
      2000,
      'meta',
    ).catch(() => {});

    try {
      return await handler(req, res, next);
    } catch (error) {
      const isConfig = error instanceof GrammyError && [401, 404].includes(error.error_code);
      log.error(`فشل معالجة التحديث: ${sanitize(error?.message || String(error))}`);
      if (isConfig) {
        // خطأ إعداد (توكن) → 500 حتى يعيد تيليجرام المحاولة بعد إصلاحه
        if (!res.headersSent) res.status(500).json({ ok: false, error: 'bot initialization failed' });
        return;
      }
      // أخطاء منطق التحديث: نرد 200 حتى لا يتكرر الطلب إلى ما لا نهاية
      if (!res.headersSent) res.status(200).json({ ok: true, ignored: true });
      return;
    }
  };

  app.post(['/api/webhook', '/webhook', '/api/index', '/'], handleWebhook);

  // شبكة أمان: أي POST قادم من تيليجرام يُعالَج كتحديث
  // (يضمن العمل حتى لو غيّر Vercel شكل إعادة كتابة المسار)
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const looksLikeTelegram =
      req.body?.update_id !== undefined ||
      Boolean(req.headers['x-telegram-bot-api-secret-token']);
    if (!looksLikeTelegram) return next();
    return handleWebhook(req, res, next);
  });

  // GET مع مفتاح على أي مسار → ضبط الويبهوك (احتياط لو غُيّر المسار)
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.query.key) return setupHandler(req, res);
    return next();
  });

  /* ----------------------------- 404 ----------------------------- */
  app.use((req, res) => {
    res.status(404).json({ ok: false, error: 'المسار غير موجود', path: req.path, method: req.method });
  });

  /* ------------------------- معالج الأخطاء ------------------------- */
  app.use((error, _req, res, _next) => {
    log.error(`خطأ HTTP: ${sanitize(error?.message || String(error))}`);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'خطأ داخلي' });
  });

  return app;
}

export default createApp;
