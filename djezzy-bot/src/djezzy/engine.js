/**
 * محرّك جيزي عالي المستوى (واجهة حقيقية):
 * تسجيل الدخول عبر OTP حقيقي، حفظ/تجديد الجلسة، استلام هدية 2 جيجا الأسبوعية،
 * والهدايا الترويجية، وقراءة سجل الاشتراكات.
 *
 * لا يعرف شيئاً عن تيليجرام — قابل للاختبار بشكل مستقل.
 */
import config from '../config.js';
import { createLogger } from '../util/logger.js';
import { decrypt, encrypt } from '../crypto.js';
import { isExpired } from '../util/time.js';
import { DjezzyError, ERROR_CODES } from './errors.js';
import store from '../store/index.js';

const log = createLogger('djezzy/engine');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const pick = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

/** يبتلع الأخطاء غير الحرجة لكنه يعيد رفع أخطاء الجلسة */
const soft = (fallback) => (error) => {
  if (error?.code === ERROR_CODES.AUTH_EXPIRED || error?.status === 401) throw error;
  return fallback;
};

/** يحوّل سجل الاشتراكات إلى قائمة موحّدة */
function normalizeHistory(history) {
  const list = Array.isArray(history)
    ? history
    : Array.isArray(history?.data)
      ? history.data
      : Array.isArray(history?.subscriptions)
        ? history.subscriptions
        : [];

  return list
    .map((item) => {
      const rawDate = pick(item.subscriptionDateTime, item.date, item.createdAt, item.startDate);
      const timestamp = rawDate ? Date.parse(rawDate) : Number.NaN;
      return {
        code: String(pick(item.packageCode, item.code, item.productCode, item.id, '')),
        name: String(pick(item.packageName, item.name, item.label, '')),
        at: Number.isFinite(timestamp) ? timestamp : null,
      };
    })
    .filter((item) => item.code || item.at);
}

const isWeeklyGift = (item) => /WALKWIN/i.test(item.code) || /walk\s*win/i.test(item.name);

export class DjezzyEngine {
  constructor({ client, store: storage = store }) {
    this.client = client;
    this.store = storage;
  }

  get mode() {
    return this.client?.mode ?? (config.djezzy.dryRun ? 'simulation' : 'live');
  }

  /* --------------------------- تسجيل الدخول --------------------------- */
  async startLogin(telegramId, msisdn) {
    const result = await this.client.requestOtp({ msisdn });

    const user = await this.store.getUser(telegramId);
    user.state = {
      step: 'awaiting_otp',
      temp: { msisdn, sessionId: result.sessionId, debugCode: result.debugCode ?? null, startedAt: Date.now() },
    };
    await this.store.saveUser(user);

    log.info(`أُرسل رمز حقيقي إلى …${msisdn.slice(-4)}`);
    return {
      ok: true,
      sessionId: result.sessionId,
      expiresIn: result.expiresIn ?? 180,
      masked: result.masked,
      debugCode: result.debugCode ?? null,
    };
  }

  async confirmLogin(telegramId, msisdn, code) {
    const tokens = await this.client.verifyOtp({ msisdn, code });
    if (!tokens?.accessToken) {
      throw new DjezzyError(ERROR_CODES.AUTH, 'لم تُعد جيزي رمز وصول صالحاً.');
    }

    const user = await this.store.getUser(telegramId);
    user.accounts[msisdn] = {
      msisdn,
      local: `0${msisdn.slice(3)}`,
      label: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
      addedAt: Date.now(),
      tokenEnc: encrypt(tokens.accessToken),
      refreshEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: Date.now() + (Number(tokens.expiresIn) || 3600) * 1000,
      lastActionAt: null,
      lastResult: null,
    };
    user.activeMsisdn = msisdn;
    user.state = null;
    await this.store.saveUser(user);

    log.info(`تم ربط الرقم …${msisdn.slice(-4)} بجلسة حقيقية`);
    return { ok: true, account: this.describeAccount(user.accounts[msisdn]), expiresAt: user.accounts[msisdn].tokenExpiresAt };
  }

  /* ---------------------------- الجلسات ---------------------------- */
  describeAccount(account) {
    if (!account) return null;
    return {
      msisdn: account.msisdn,
      label: account.label,
      local: account.local,
      addedAt: account.addedAt,
      tokenExpiresAt: account.tokenExpiresAt,
      lastActionAt: account.lastActionAt,
      lastResult: account.lastResult ?? null,
      hasRefresh: Boolean(account.refreshEnc),
      sessionValid: !isExpired(account.tokenExpiresAt) || Boolean(account.refreshEnc),
    };
  }

  async ensureToken(user, msisdn) {
    const account = user.accounts?.[msisdn];
    if (!account) throw new DjezzyError(ERROR_CODES.AUTH, 'الرقم غير مربوط بعد — أضفه أولاً.');

    if (!isExpired(account.tokenExpiresAt)) {
      const token = decrypt(account.tokenEnc);
      if (token) return token;
    }

    const refreshToken = decrypt(account.refreshEnc);
    if (!refreshToken) {
      throw new DjezzyError(ERROR_CODES.AUTH_EXPIRED, 'انتهت الجلسة — أعد إضافة الرقم برمز تحقق جديد.');
    }

    const refreshed = await this.client.refreshSession({ refreshToken });
    account.tokenEnc = encrypt(refreshed.accessToken);
    if (refreshed.refreshToken) account.refreshEnc = encrypt(refreshed.refreshToken);
    account.tokenExpiresAt = Date.now() + (Number(refreshed.expiresIn) || 3600) * 1000;
    await this.store.saveUser(user);

    log.info(`تم تجديد جلسة …${msisdn.slice(-4)}`);
    return refreshed.accessToken;
  }

  async #withAuth(telegramId, msisdn, operation) {
    let user = await this.store.getUser(telegramId);
    if (!user.accounts?.[msisdn]) throw new DjezzyError(ERROR_CODES.AUTH, 'الرقم غير مربوط بعد — أضفه أولاً.');

    let token = await this.ensureToken(user, msisdn);
    try {
      return await operation({ token, user, account: user.accounts[msisdn] });
    } catch (error) {
      if (error?.code !== ERROR_CODES.AUTH_EXPIRED && error?.status !== 401) throw error;

      log.warn(`جلسة منتهية — تجديد ثم إعادة التنفيذ (…${msisdn.slice(-4)})`);
      user = await this.store.getUser(telegramId);
      user.accounts[msisdn].tokenExpiresAt = 0;
      token = await this.ensureToken(user, msisdn);
      return operation({ token, user, account: user.accounts[msisdn] });
    }
  }

  async #guardQuota(user) {
    const windowMs = 24 * 60 * 60 * 1000;
    const meta = user.meta || {};
    if (!meta.claimWindowStart || Date.now() - meta.claimWindowStart > windowMs) {
      meta.claimWindowStart = Date.now();
      meta.claimCount = 0;
    }
    if (meta.claimCount >= config.limits.maxClaimsPerDay) {
      throw new DjezzyError(
        ERROR_CODES.QUOTA,
        `تم بلوغ الحد اليومي (${config.limits.maxClaimsPerDay} عمليات). أعد المحاولة بعد 24 ساعة.`,
      );
    }
    meta.claimCount += 1;
    user.meta = meta;
    return user;
  }

  async #recordResult(user, msisdn, result) {
    const account = user.accounts?.[msisdn];
    if (!account) return;
    account.lastActionAt = Date.now();
    account.lastResult = { ok: result.ok, status: result.status, message: result.message, at: Date.now() };
    await this.store.saveUser(user);
  }

  /* ------------------------- سجل الاشتراكات ------------------------- */
  async #weeklyStatus(telegramId, msisdn) {
    return this.#withAuth(telegramId, msisdn, async ({ token }) => {
      const history = normalizeHistory(await this.client.getHistory({ token, msisdn }).catch(soft({})));
      const weekly = history.filter(isWeeklyGift).filter((item) => item.at).sort((a, b) => b.at - a.at);
      const lastAt = weekly[0]?.at ?? null;
      return { lastAt, nextEligibleAt: lastAt ? lastAt + WEEK_MS : null, history };
    });
  }

  async getOverview(telegramId, msisdn) {
    const { lastAt, nextEligibleAt, history } = await this.#weeklyStatus(telegramId, msisdn);
    const now = Date.now();

    return {
      ok: true,
      mode: this.mode,
      lastWeeklyAt: lastAt,
      nextEligibleAt,
      canClaimNow: !lastAt || now >= nextEligibleAt,
      recent: history.filter((item) => item.at).sort((a, b) => b.at - a.at).slice(0, 5),
      promoConfigured: Boolean(config.djezzy.scanQr),
    };
  }

  /* -------------------------- هدية 2 جيجا -------------------------- */
  async claimWeeklyGift(telegramId, msisdn) {
    let user = await this.#guardQuota(await this.store.getUser(telegramId));
    await this.store.saveUser(user);

    const status = await this.#weeklyStatus(telegramId, msisdn);
    if (status.lastAt && Date.now() < status.nextEligibleAt) {
      const next = new Date(status.nextEligibleAt);
      return {
        ok: false,
        status: 'cooldown',
        lastAt: status.lastAt,
        nextEligibleAt: status.nextEligibleAt,
        message: `استلمت هدية 2 جيجا مؤخراً. المتاح التالي: ${next.toISOString().slice(0, 10)}.`,
      };
    }

    return this.#withAuth(telegramId, msisdn, async ({ token, user: freshUser }) => {
      const response = await this.client.claimWalkGift({ token, msisdn });
      const result = {
        ok: true,
        status: 'claimed',
        claimed: [{ name: 'هدية 2 جيجا الأسبوعية', data: '2 GB' }],
        failed: [],
        weeklyClaimed: true,
        message: response?.message || 'تم تفعيل هدية 2 جيجا بنجاح.',
      };
      await this.#recordResult(freshUser, msisdn, result);
      return result;
    });
  }

  /* ------------------------ الهدية الترويجية ------------------------ */
  async claimPromoGift(telegramId, msisdn) {
    let user = await this.#guardQuota(await this.store.getUser(telegramId));
    await this.store.saveUser(user);

    if (!config.djezzy.scanQr) {
      throw new DjezzyError(ERROR_CODES.OFFER_NOT_FOUND, 'لا توجد هدية ترويجية مضبوطة حالياً (DJEZZY_SCAN_QR).');
    }

    return this.#withAuth(telegramId, msisdn, async ({ token, user: freshUser }) => {
      const response = await this.client.claimScanGift({ token, msisdn });
      const result = {
        ok: true,
        status: 'claimed',
        claimed: [{ name: 'الهدية الترويجية (QR)', data: null }],
        failed: [],
        message: response?.message || 'تم تفعيل الهدية الترويجية.',
      };
      await this.#recordResult(freshUser, msisdn, result);
      return result;
    });
  }

  /* ------------------------ كل ما هو متاح ------------------------ */
  async claimAllGifts(telegramId, msisdn) {
    const claimed = [];
    const failed = [];

    try {
      const weekly = await this.claimWeeklyGift(telegramId, msisdn);
      if (weekly.status === 'claimed') claimed.push(...weekly.claimed);
      else if (weekly.status === 'cooldown') failed.push({ name: 'هدية 2 جيجا الأسبوعية', reason: 'مُستلمة هذا الأسبوع' });
    } catch (error) {
      failed.push({ name: 'هدية 2 جيجا الأسبوعية', reason: error?.friendly || error?.message });
    }

    if (config.djezzy.scanQr) {
      try {
        const promo = await this.claimPromoGift(telegramId, msisdn);
        claimed.push(...promo.claimed);
      } catch (error) {
        if (error?.code !== ERROR_CODES.OFFER_ALREADY_ACTIVE) {
          failed.push({ name: 'الهدية الترويجية', reason: error?.friendly || error?.message });
        }
      }
    }

    return {
      ok: claimed.length > 0,
      status: claimed.length > 0 ? 'claimed' : 'failed',
      claimed,
      failed,
      weeklyClaimed: claimed.some((item) => /2 جيجا/.test(item.name)),
      message: claimed.length > 0 ? `تم تفعيل ${claimed.length} هدية.` : 'لم يتم تفعيل أي هدية.',
    };
  }

  /* --------------------- عرض مدفوع (بموافقة صريحة) --------------------- */
  async activatePaidOffer(telegramId, msisdn) {
    const code = config.djezzy.paidProductCode;
    if (!code) {
      throw new DjezzyError(
        ERROR_CODES.OFFER_NOT_FOUND,
        'لم تُضبط أي باقة مدفوعة. عروض 6 جيجا ليست هدية مجانية — رمزها يختلف حسب عرضك (OFFER_PAID_CODE).',
      );
    }

    let user = await this.#guardQuota(await this.store.getUser(telegramId));
    await this.store.saveUser(user);

    return this.#withAuth(telegramId, msisdn, async ({ token, user: freshUser }) => {
      const response = await this.client.activateProduct({ token, msisdn, packageCode: code });
      const result = {
        ok: true,
        status: 'activated',
        message: response?.message || `تم تفعيل الباقة ${code}.`,
        item: code,
      };
      await this.#recordResult(freshUser, msisdn, result);
      return result;
    });
  }

  /* ----------------------------- الحساب ----------------------------- */
  async removeAccount(telegramId, msisdn) {
    const user = await this.store.getUser(telegramId);
    delete user.accounts[msisdn];
    if (user.activeMsisdn === msisdn) user.activeMsisdn = Object.keys(user.accounts)[0] ?? null;
    await this.store.saveUser(user);
    return { ok: true, accounts: Object.keys(user.accounts) };
  }

  async setActive(telegramId, msisdn) {
    const user = await this.store.getUser(telegramId);
    if (!user.accounts[msisdn]) throw new DjezzyError(ERROR_CODES.AUTH, 'الرقم غير مربوط.');
    user.activeMsisdn = msisdn;
    await this.store.saveUser(user);
    return this.describeAccount(user.accounts[msisdn]);
  }
}

export function createEngine(client) {
  return new DjezzyEngine({ client });
}

export default DjezzyEngine;
