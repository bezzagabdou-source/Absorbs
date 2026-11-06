/**
 * محرّك جيزي عالي المستوى:
 * تسجيل الدخول عبر OTP، إدارة/تجديد الجلسات وتشفيرها،
 * تفعيل عرض 6 جيغا، واستلام هدية 2 جيغا الأسبوعية وبقية الهدايا.
 *
 * هذه الطبقة لا تعرف شيئاً عن تيليجرام ولا عن أزراره — قابلة للاختبار منفصلة.
 */
import config from '../config.js';
import { createLogger } from '../util/logger.js';
import { decrypt, encrypt } from '../crypto.js';
import { isExpired } from '../util/time.js';
import { DjezzyError, ERROR_CODES } from './errors.js';
import store from '../store/index.js';

const log = createLogger('djezzy/engine');

const pick = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

/** يبتلع الأخطاء غير الحرجة (حتى تُكمل بقية البيانات) لكنه يعيد رفع أخطاء الجلسة */
const soft = (fallback) => (error) => {
  if (error?.code === ERROR_CODES.AUTH_EXPIRED || error?.status === 401) throw error;
  return fallback;
};

/** يحوّل قائمة عروض/هدايا بأشكال مختلفة إلى شكل موحّد */
function normalizeItems(rawList) {
  const list = Array.isArray(rawList)
    ? rawList
    : Array.isArray(rawList?.offers)
      ? rawList.offers
      : Array.isArray(rawList?.gifts)
        ? rawList.gifts
        : Array.isArray(rawList?.items)
          ? rawList.items
          : Array.isArray(rawList?.data)
            ? rawList.data
            : [];
  return list.map((item) => ({
    id: String(pick(item.id, item.offerId, item.giftId, item.code, item.key, '')),
    name: String(pick(item.name, item.title, item.label, item.description, item.offerName, item.type, 'عرض')),
    data: String(pick(item.data, item.volume, item.size, item.quota, '')),
    validity: String(pick(item.validity, item.duration, item.period, '')),
    code: String(pick(item.code, item.offerCode, '')),
    claimable: Boolean(pick(item.claimable, item.isClaimable, item.available, item.canClaim, true)),
    raw: item,
  }));
}

/** مطابقة عرض 6 جيغا */
function isSixGb(item) {
  const text = `${item.name} ${item.code} ${item.data}`;
  return /(6\s*(gb|go|giga|جيجا|جيغا))|(\b6gb\b)/i.test(text) || (item.code || '').toUpperCase() === '6GB';
}

/** مطابقة هدية 2 جيغا الأسبوعية */
function isWeeklyTwoGb(item) {
  const text = `${item.name} ${item.code} ${item.data}`;
  const twoGb = /(2\s*(gb|go|giga|جيجا|جيغا))|(\b2gb\b)/i.test(text);
  const weekly = /(week|hebdo|semaine|أسبوع|اسبوع|7\s*day|7\s*jour)/i.test(text);
  return twoGb && (weekly || /weekly/i.test(item.code));
}

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
    const sessionId = String(pick(result.sessionId, result.transactionId, result.id, result.txId, ''));
    if (!sessionId) {
      throw new DjezzyError(ERROR_CODES.UNKNOWN, 'لم تُعد جيزي معرّف جلسة التحقق (sessionId).');
    }

    const user = await this.store.getUser(telegramId);
    user.state = {
      step: 'awaiting_otp',
      temp: {
        msisdn,
        sessionId,
        startedAt: Date.now(),
        debugCode: result.debugCode ?? null,
      },
    };
    await this.store.saveUser(user);

    log.info(`بدأ تسجيل دخول لرقم …${msisdn.slice(-4)}`);
    return {
      ok: true,
      sessionId,
      expiresIn: Number(pick(result.expiresIn, 120)),
      masked: String(pick(result.masked, result.phone, `…${msisdn.slice(-4)}`)),
      debugCode: result.debugCode ?? null,
    };
  }

  async confirmLogin(telegramId, msisdn, code, sessionId) {
    const tokens = await this.client.verifyOtp({ msisdn, code, sessionId });
    const accessToken = String(pick(tokens.accessToken, tokens.access_token, tokens.token, ''));
    if (!accessToken) {
      throw new DjezzyError(ERROR_CODES.AUTH, 'لم تُعد جيزي رمز وصول صالحاً (access_token).');
    }
    const refreshToken = String(pick(tokens.refreshToken, tokens.refresh_token, ''));
    const expiresIn = Number(pick(tokens.expiresIn, tokens.expires_in, 3600));

    const user = await this.store.getUser(telegramId);
    user.accounts[msisdn] = {
      msisdn,
      local: `0${msisdn.slice(3)}`,
      label: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
      addedAt: Date.now(),
      tokenEnc: encrypt(accessToken),
      refreshEnc: refreshToken ? encrypt(refreshToken) : null,
      tokenExpiresAt: Date.now() + expiresIn * 1000,
      lastActionAt: null,
      lastResult: null,
    };
    user.activeMsisdn = msisdn;
    user.state = null;
    await this.store.saveUser(user);

    log.info(`تم ربط الرقم بـ …${msisdn.slice(-4)}`);
    return {
      ok: true,
      account: this.describeAccount(user.accounts[msisdn]),
      expiresAt: user.accounts[msisdn].tokenExpiresAt,
    };
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

  /** يعيد توكن وصول صالحاً، ويجدّده تلقائياً عند الحاجة ويحفظ النتيجة */
  async ensureToken(user, msisdn) {
    const account = user.accounts?.[msisdn];
    if (!account) {
      throw new DjezzyError(ERROR_CODES.AUTH, 'الرقم غير مربوط بعد — أضفه أولاً.');
    }

    if (!isExpired(account.tokenExpiresAt)) {
      const token = decrypt(account.tokenEnc);
      if (token) return token;
    }

    const refreshToken = decrypt(account.refreshEnc);
    if (!refreshToken) {
      throw new DjezzyError(ERROR_CODES.AUTH_EXPIRED, 'لا توجد جلسة صالحة ولا رمز تجديد — أعد إضافة الرقم.');
    }

    const refreshed = await this.client.refreshSession({ refreshToken, msisdn });
    const accessToken = String(pick(refreshed.accessToken, refreshed.access_token, refreshed.token, ''));
    if (!accessToken) throw new DjezzyError(ERROR_CODES.AUTH_EXPIRED, 'فشل تجديد الجلسة.');

    account.tokenEnc = encrypt(accessToken);
    const newRefresh = pick(refreshed.refreshToken, refreshed.refresh_token);
    if (newRefresh) account.refreshEnc = encrypt(String(newRefresh));
    account.tokenExpiresAt = Date.now() + Number(pick(refreshed.expiresIn, refreshed.expires_in, 3600)) * 1000;

    await this.store.saveUser(user);
    log.info(`تم تجديد جلسة …${msisdn.slice(-4)}`);
    return accessToken;
  }

  /** ينفّذ عملية موثّقة مع إعادة محاولة واحدة بعد تجديد الجلسة */
  async #withAuth(telegramId, msisdn, operation) {
    let user = await this.store.getUser(telegramId);
    if (!user.accounts?.[msisdn]) {
      throw new DjezzyError(ERROR_CODES.AUTH, 'الرقم غير مربوط بعد — أضفه أولاً.');
    }

    let token = await this.ensureToken(user, msisdn);

    try {
      return await operation({ token, user, account: user.accounts[msisdn] });
    } catch (error) {
      if (error?.code !== ERROR_CODES.AUTH_EXPIRED && error?.status !== 401) throw error;

      log.warn(`جلسة منتهية لـ …${msisdn.slice(-4)} — محاولة تجديد ثم إعادة التنفيذ.`);
      user = await this.store.getUser(telegramId);
      user.accounts[msisdn].tokenExpiresAt = 0; // أجبر التجديد
      token = await this.ensureToken(user, msisdn);
      return operation({ token, user, account: user.accounts[msisdn] });
    }
  }

  /** حصّة يومية للعمليات الحسّاسة (حماية الحساب من الحجب) */
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
    const account = user.accounts[msisdn];
    if (!account) return;
    account.lastActionAt = Date.now();
    account.lastResult = { ok: result.ok, status: result.status, message: result.message, at: Date.now() };
    user.meta.claimCount = user.meta.claimCount ?? 0;
    await this.store.saveUser(user);
  }

  /* ---------------------------- نظرة عامة ---------------------------- */
  async getOverview(telegramId, msisdn) {
    return this.#withAuth(telegramId, msisdn, async ({ token }) => {
      const [profile, offersRaw, giftsRaw] = await Promise.all([
        this.client.getProfile({ token, msisdn }).catch(soft({})),
        this.client.listOffers({ token, msisdn }).catch(soft({})),
        this.client.listGifts({ token, msisdn }).catch(soft({})),
      ]);

      const offers = normalizeItems(offersRaw);
      const gifts = normalizeItems(giftsRaw);

      return {
        ok: true,
        profile,
        offers,
        gifts,
        sixGbOffer: offers.find(isSixGb) ?? null,
        weeklyGift: gifts.find(isWeeklyTwoGb) ?? null,
        mode: this.mode,
      };
    });
  }

  /* --------------------------- تفعيل 6 جيغا --------------------------- */
  async activateSixGb(telegramId, msisdn) {
    let user = await this.store.getUser(telegramId);
    user = await this.#guardQuota(user);
    await this.store.saveUser(user);

    return this.#withAuth(telegramId, msisdn, async ({ token, user: freshUser }) => {
      const offersRaw = await this.client.listOffers({ token, msisdn });
      const offers = normalizeItems(offersRaw);
      let offer = offers.find(isSixGb);

      // بعض الحسابات تُتيح الهدية في قائمة الهدايا لا في العروض
      if (!offer) {
        const gifts = normalizeItems(await this.client.listGifts({ token, msisdn }).catch(soft({})));
        offer = gifts.find(isSixGb);
      }

      if (!offer) {
        throw new DjezzyError(ERROR_CODES.OFFER_NOT_FOUND, 'لم يُعثر على عرض 6 جيغا في حسابك.');
      }
      if (!offer.claimable) {
        throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, 'عرض 6 جيغا غير قابل للتفعيل حالياً (مُفعّل مسبقاً أو غير مؤهّل).');
      }

      const response = await this.client.claimOffer({
        token,
        msisdn,
        offerId: offer.id,
        extra: { msisdn, offerCode: offer.code || undefined },
      });

      const result = this.#interpretClaim(response, offer, 'عرض 6 جيغا');
      await this.#recordResult(freshUser, msisdn, result);
      return result;
    });
  }

  /* ------------------------ الهدية والهدايا ------------------------ */
  async claimWeeklyGift(telegramId, msisdn) {
    return this.#claimGifts(telegramId, msisdn, { onlyWeekly: true });
  }

  async claimAllGifts(telegramId, msisdn) {
    return this.#claimGifts(telegramId, msisdn, { onlyWeekly: false });
  }

  async #claimGifts(telegramId, msisdn, { onlyWeekly }) {
    let user = await this.store.getUser(telegramId);
    user = await this.#guardQuota(user);
    await this.store.saveUser(user);

    return this.#withAuth(telegramId, msisdn, async ({ token, user: freshUser }) => {
      const giftsRaw = await this.client.listGifts({ token, msisdn });
      const gifts = normalizeItems(giftsRaw);

      const weekly = gifts.find(isWeeklyTwoGb) ?? null;
      const targets = onlyWeekly
        ? weekly
          ? [weekly]
          : []
        : gifts.filter((gift) => gift.claimable && gift.id);

      if (targets.length === 0) {
        throw new DjezzyError(
          ERROR_CODES.OFFER_NOT_FOUND,
          onlyWeekly
            ? 'هدية 2 جيغا الأسبوعية غير متاحة لهذا الرقم حالياً.'
            : 'لا توجد هدايا متاحة للاستلام الآن.',
        );
      }

      const claimed = [];
      const failed = [];

      for (const gift of targets) {
        try {
          const response = await this.client.claimGift({ token, msisdn, giftId: gift.id });
          claimed.push({
            name: gift.name,
            data: gift.data || null,
            status: String(pick(response.status, response.state, 'CLAIMED')),
          });
        } catch (error) {
          if (error?.code === ERROR_CODES.OFFER_ALREADY_ACTIVE) {
            failed.push({ name: gift.name, reason: 'مُستلمة مسبقاً' });
          } else if (error?.code === ERROR_CODES.CHALLENGE_REQUIRED) {
            // نتوقف ونطلب التحقق من المستخدم
            await this.#recordResult(freshUser, msisdn, { ok: false, status: 'challenge', message: error.message });
            return {
              ok: false,
              status: 'pending_challenge',
              challengeId: error.payload?.challengeId ?? error.payload?.id ?? null,
              message: error.message,
              claimed,
              failed,
            };
          } else {
            failed.push({ name: gift.name, reason: error?.friendly || error?.message || 'فشل' });
          }
        }
      }

      const result = {
        ok: claimed.length > 0,
        status: claimed.length > 0 ? 'claimed' : 'failed',
        claimed,
        failed,
        weeklyClaimed: Boolean(weekly && claimed.some((item) => item.name === weekly.name)),
        message:
          claimed.length > 0
            ? `تم استلام ${claimed.length} هدية بنجاح.`
            : 'لم يتم استلام أي هدية.',
      };

      await this.#recordResult(freshUser, msisdn, result);
      return result;
    });
  }

  /* ---------------------------- التحديات ---------------------------- */
  async submitChallenge(telegramId, msisdn, challengeId, code) {
    return this.#withAuth(telegramId, msisdn, async ({ token, user }) => {
      const response = await this.client.verifyChallenge({ token, msisdn, challengeId, code });
      const result = this.#interpretClaim(response, { name: 'خطوة التحقق' }, 'التحقق');
      await this.#recordResult(user, msisdn, result);
      return result;
    });
  }

  /* ----------------------------- الحساب ----------------------------- */
  async removeAccount(telegramId, msisdn) {
    const user = await this.store.getUser(telegramId);
    delete user.accounts[msisdn];
    if (user.activeMsisdn === msisdn) {
      user.activeMsisdn = Object.keys(user.accounts)[0] ?? null;
    }
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

  /** تفسير استجابة التفعيل: نجاح / تحدي / انتظار */
  #interpretClaim(response, item, label) {
    const rawStatus = String(pick(response.status, response.state, response.result, '')).toUpperCase();

    const challengeId = pick(
      response.challengeId,
      response.challenge?.id,
      response.verificationId,
      response.requiredAction === 'CHALLENGE' ? pick(response.id, response.stepId) : null,
    );

    if (challengeId || /CHALLENGE|VERIFY|OTP_REQUIRED|STEP/.test(rawStatus)) {
      return {
        ok: false,
        status: 'pending_challenge',
        challengeId: challengeId ? String(challengeId) : null,
        message: pick(response.message, `جيزي تطلب خطوة تحقّق إضافية لإتمام تفعيل ${label}.`),
        item: item.name,
      };
    }

    if (/ALREADY|ACTIVE|SUBSCRIBED/.test(rawStatus) && !/ACTIVATED|SUCCESS|OK|CLAIMED/.test(rawStatus)) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, `${label} مُفعّل مسبقاً على هذا الرقم.`);
    }

    if (response.success === false && !rawStatus) {
      throw new DjezzyError(ERROR_CODES.UNKNOWN, pick(response.message, `فشل تفعيل ${label}.`));
    }

    return {
      ok: true,
      status: 'activated',
      message: pick(response.message, `تم تفعيل ${label} بنجاح.`),
      item: item.name,
      data: item.data || null,
      validity: item.validity || null,
      rawStatus: rawStatus || 'OK',
    };
  }
}

export function createEngine(client) {
  return new DjezzyEngine({ client });
}

export default DjezzyEngine;
