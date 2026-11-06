/**
 * محاكي محرّك جيزي (وضع DJEZZY_DRY_RUN).
 * يسمح بتشغيل البوت واختبار كل الواجهات دون أي طلب حقيقي،
 * ويُستخدم أيضاً في الاختبارات الآلية.
 */
import { randomBytes, randomInt } from 'node:crypto';
import config from '../config.js';
import { DjezzyError, ERROR_CODES } from './errors.js';

const state = {
  sessions: new Map(), // sessionId -> { msisdn, code, expiresAt }
  claims: new Set(), // `${msisdn}:${id}`
  profile: new Map(), // msisdn -> profile
};

const id = (prefix) => `${prefix}_${randomBytes(4).toString('hex')}`;

const sixGbOffer = () => ({
  id: 'OFFER_6GB_WEB',
  code: '6GB',
  name: 'عرض 6 جيغا إنترنت',
  data: '6 GB',
  price: '0 DZD',
  validity: '7 أيام',
  claimable: true,
});

const giftList = () => [
  {
    id: 'GIFT_2GB_WEEKLY',
    code: '2GB_WEEK',
    name: 'هدية 2 جيغا الأسبوعية',
    data: '2 GB',
    validity: '7 أيام',
    frequency: 'weekly',
    claimable: true,
  },
  {
    id: 'GIFT_NIGHT_1GB',
    code: 'NIGHT_1GB',
    name: 'هدية 1 جيغا ليلية',
    data: '1 GB',
    validity: 'ليلة واحدة',
    frequency: 'daily',
    claimable: false,
  },
];

export const simulator = {
  requestOtp({ msisdn }) {
    const sessionId = id('otpsess');
    const code = String(randomInt(100000, 999999));
    state.sessions.set(sessionId, { msisdn, code, expiresAt: Date.now() + 120_000 });
    return {
      ok: true,
      sessionId,
      expiresIn: 120,
      masked: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
      simulation: true,
      // في وضع المحاكاة فقط: نُظهر الرمز حتى تتمكن من تجربة المسار كاملاً
      debugCode: code,
    };
  },

  verifyOtp({ msisdn, code, sessionId }) {
    const session = state.sessions.get(sessionId);
    if (!session || session.msisdn !== msisdn) {
      throw new DjezzyError(ERROR_CODES.OTP_EXPIRED, 'جلسة تحقق غير معروفة أو منتهية');
    }
    if (session.expiresAt < Date.now()) {
      state.sessions.delete(sessionId);
      throw new DjezzyError(ERROR_CODES.OTP_EXPIRED, 'انتهت صلاحية الرمز');
    }
    if (session.code !== String(code)) {
      throw new DjezzyError(ERROR_CODES.OTP_INVALID, 'رمز التحقق غير صحيح');
    }
    state.sessions.delete(sessionId);
    return {
      accessToken: `sim_access_${randomBytes(16).toString('hex')}`,
      refreshToken: `sim_refresh_${randomBytes(16).toString('hex')}`,
      expiresIn: 3600,
      simulation: true,
    };
  },

  refresh() {
    return {
      accessToken: `sim_access_${randomBytes(16).toString('hex')}`,
      refreshToken: `sim_refresh_${randomBytes(16).toString('hex')}`,
      expiresIn: 3600,
      simulation: true,
    };
  },

  profile({ msisdn }) {
    if (!state.profile.has(msisdn)) {
      state.profile.set(msisdn, {
        msisdn,
        name: 'مشترك جيزي',
        plan: 'Djezzy Prépayé',
        balance: '250 DZD',
        dataLeft: '1.2 GB',
        simulation: true,
      });
    }
    return state.profile.get(msisdn);
  },

  offers() {
    return { offers: [sixGbOffer()], simulation: true };
  },

  claimOffer({ msisdn, offerId }) {
    const key = `${msisdn}:${offerId}`;
    if (state.claims.has(key)) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, 'العرض مُفعّل مسبقاً');
    }
    state.claims.add(key);
    return { status: 'ACTIVATED', offerId, activatedAt: Date.now(), simulation: true };
  },

  gifts() {
    return { gifts: giftList(), simulation: true };
  },

  claimGift({ msisdn, giftId }) {
    const gift = giftList().find((item) => item.id === giftId);
    if (!gift) throw new DjezzyError(ERROR_CODES.OFFER_NOT_FOUND, 'الهدية غير موجودة');
    if (!gift.claimable) {
      throw new DjezzyError(ERROR_CODES.OFFER_NOT_FOUND, 'الهدية غير متاحة حالياً');
    }
    const key = `${msisdn}:${giftId}`;
    if (state.claims.has(key)) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, 'الهدية مُستلمة مسبقاً');
    }
    state.claims.add(key);
    return { status: 'CLAIMED', giftId, claimedAt: Date.now(), simulation: true };
  },

  challenge() {
    return { status: 'ACTIVATED', simulation: true };
  },

  reset() {
    state.sessions.clear();
    state.claims.clear();
    state.profile.clear();
  },

  get enabled() {
    return config.djezzy.dryRun;
  },
};

export default simulator;
