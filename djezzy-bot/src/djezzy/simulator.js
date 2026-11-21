/**
 * محاكي واجهة جيزي (للاختبار فقط — DJEZZY_DRY_RUN=true).
 * يقلّد شكل استجابات الـ API الحقيقية حتى تعمل نفس المسارات بدون شبكة.
 */
import { randomBytes, randomInt } from 'node:crypto';
import config from '../config.js';
import { DjezzyError, ERROR_CODES } from './errors.js';

const state = {
  sessions: new Map(), // `otp:${msisdn}` -> { code, expiresAt }
  history: new Map(), // msisdn -> [{ packageCode, subscriptionDateTime }]
};

const iso = () => new Date().toISOString();

export const simulator = {
  requestOtp({ msisdn }) {
    const code = String(randomInt(100000, 999999));
    state.sessions.set(`otp:${msisdn}`, { code, expiresAt: Date.now() + 180_000 });
    return {
      sessionId: `otp:${msisdn}`,
      expiresIn: 180,
      masked: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
      debugCode: code,
    };
  },

  verifyOtp({ msisdn, code }) {
    const session = state.sessions.get(`otp:${msisdn}`);
    if (!session || session.expiresAt < Date.now()) {
      throw new DjezzyError(ERROR_CODES.OTP_EXPIRED, 'انتهت صلاحية الرمز');
    }
    if (session.code !== String(code)) {
      throw new DjezzyError(ERROR_CODES.OTP_INVALID, 'رمز التحقق غير صحيح');
    }
    state.sessions.delete(`otp:${msisdn}`);
    return {
      accessToken: `sim_access_${randomBytes(16).toString('hex')}`,
      refreshToken: `sim_refresh_${randomBytes(16).toString('hex')}`,
      expiresIn: 3600,
    };
  },

  refresh() {
    return {
      accessToken: `sim_access_${randomBytes(16).toString('hex')}`,
      refreshToken: `sim_refresh_${randomBytes(16).toString('hex')}`,
      expiresIn: 3600,
    };
  },

  history({ msisdn }) {
    return { data: state.history.get(msisdn) ?? [] };
  },

  profile({ msisdn }) {
    return {
      msisdn,
      mainBalance: '100.00 DA',
      package: 'SIMULATED',
      // الشكل الحقيقي (JSON:API)
      data: {
        msisdn,
        mainBalance: '100.00 DA',
        attributes: { balance: '100.00 DA', 'activation-time': new Date().toISOString() },
      },
      included: [
        { type: 'subscription-types', attributes: { name: { text: { ar: 'باقة تجريبية' } } } },
        {
          type: 'connected-products',
          attributes: {
            products: [
              {
                name: { text: { ar: 'عرض تجريبي' } },
                'expiry-at': new Date(Date.now() + 86400000).toISOString(),
                balances: [{ 'bundle-type': 'data', 'total-amount': 1024, 'remaining-amount': 512 }],
              },
            ],
          },
        },
      ],
    };
  },

  claimGift({ msisdn, giftId = config.djezzy.giftWalkCode }) {
    const list = state.history.get(msisdn) ?? [];
    if (list.some((item) => item.packageCode === giftId)) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, 'الهدية مُستلمة مسبقاً');
    }
    list.push({ packageCode: giftId, subscriptionDateTime: iso(), packageName: giftId });
    state.history.set(msisdn, list);
    return { status: 200, message: 'successfully done' };
  },

  claimOffer({ msisdn, offerId }) {
    const list = state.history.get(msisdn) ?? [];
    list.push({ packageCode: offerId, subscriptionDateTime: iso(), packageName: offerId });
    state.history.set(msisdn, list);
    return { status: 200, message: 'successfully done' };
  },

  reset() {
    state.sessions.clear();
    state.history.clear();
  },

  get enabled() {
    return config.djezzy.dryRun;
  },
};

export default simulator;
