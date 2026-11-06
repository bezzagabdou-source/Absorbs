/**
 * عميل HTTP لمحرّك جيزي.
 * يحاكي تطبيق الهاتف الرسمي (ترويسات + JSON) ويوحّد شكل الاستجابات والأخطاء.
 *
 * ملاحظة مهمة: مسارات الـ API تُقرأ من متغيّرات البيئة (DJEZZY_PATH_*).
 * لا يوجد مسار «رسمي» موثّق علناً؛ استخرج ما يناسب حسابك من حركة تطبيقك
 * واضبطه في البيئة. في وضع DJEZZY_DRY_RUN يعمل العميل على المحاكي.
 */
import axios from 'axios';
import config from '../config.js';
import { createLogger } from '../util/logger.js';
import { DjezzyError, ERROR_CODES, normalizeError } from './errors.js';
import simulator from './simulator.js';

const log = createLogger('djezzy/client');

/** يستبدل {id} في المسار */
const fill = (path, params = {}) =>
  String(path).replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));

/** يستخرج الحمولة المفيدة من استجابات متعددة الأشكال */
function unwrap(data) {
  if (data === null || data === undefined) return {};
  if (typeof data !== 'object') return { value: data };
  if (data.data && typeof data.data === 'object') return data.data;
  return data;
}

export class DjezzyClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? config.djezzy.baseUrl;
    this.paths = options.paths ?? config.djezzy.paths;
    this.headers = options.headers ?? config.djezzy.headers;
    this.timeoutMs = options.timeoutMs ?? config.djezzy.timeoutMs;
    this.dryRun = options.dryRun ?? config.djezzy.dryRun;

    this.http = axios.create({
      baseURL: this.baseUrl || undefined,
      timeout: this.timeoutMs,
      // نتحكم في رمز الحالة بأنفسنا
      validateStatus: () => true,
      maxRedirects: 0,
      headers: this.headers,
    });
  }

  get mode() {
    return this.dryRun ? 'simulation' : 'live';
  }

  /** الطلب الأساسي: يُرجع الحمولة أو يرمي DjezzyError */
  async request({ method = 'GET', path, data, query, token, msisdn, retries = 0, expect }) {
    if (this.dryRun) {
      return this.#simulate({ method, path, data });
    }

    if (!this.baseUrl) {
      throw new DjezzyError(ERROR_CODES.CONFIG, 'DJEZZY_BASE_URL غير مضبوط', {});
    }

    const headers = {
      ...this.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(msisdn ? { 'X-Msisdn': msisdn } : {}),
      'X-Request-Id': `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    };

    try {
      const response = await this.http.request({
        method,
        url: path,
        params: query,
        data,
        headers,
      });

      if (response.status >= 200 && response.status < 300) {
        return unwrap(response.data);
      }

      // إعادة محاولة واحدة للأخطاء المؤقتة (5xx / 429)
      if (retries > 0 && (response.status >= 500 || response.status === 429)) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return this.request({ method, path, data, query, token, msisdn, retries: retries - 1, expect });
      }

      throw normalizeError({ response, message: `HTTP ${response.status}` }, { expect });
    } catch (error) {
      if (error instanceof DjezzyError) {
        log.warn(`فشل ${method} ${path} → ${error.code} (${error.status ?? 'n/a'})`);
        throw error;
      }
      if (retries > 0 && !error?.response) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return this.request({ method, path, data, query, token, msisdn, retries: retries - 1, expect });
      }
      throw normalizeError(error, { expect });
    }
  }

  /* ------------------------------ OTP ------------------------------ */
  async requestOtp({ msisdn }) {
    if (this.dryRun) return simulator.requestOtp({ msisdn });
    return this.request({
      method: 'POST',
      path: this.paths.requestOtp,
      data: { msisdn, phoneNumber: msisdn, lang: 'fr' },
      msisdn,
      retries: 1,
      expect: 'otp',
    });
  }

  async verifyOtp({ msisdn, code, sessionId }) {
    if (this.dryRun) return simulator.verifyOtp({ msisdn, code, sessionId });
    return this.request({
      method: 'POST',
      path: this.paths.verifyOtp,
      data: { msisdn, phoneNumber: msisdn, otp: code, code, sessionId, transactionId: sessionId },
      msisdn,
      retries: 0,
      expect: 'otp',
    });
  }

  async refreshSession({ refreshToken, msisdn }) {
    if (this.dryRun) return simulator.refresh();
    return this.request({
      method: 'POST',
      path: this.paths.refresh,
      data: { refreshToken },
      token: refreshToken,
      msisdn,
      retries: 1,
    });
  }

  /* ---------------------------- الحساب ---------------------------- */
  async getProfile({ token, msisdn }) {
    if (this.dryRun) return simulator.profile({ msisdn });
    return this.request({ method: 'GET', path: this.paths.profile, token, msisdn, retries: 1 });
  }

  async listOffers({ token, msisdn }) {
    if (this.dryRun) return simulator.offers();
    return this.request({ method: 'GET', path: this.paths.offers, token, msisdn, retries: 1 });
  }

  async claimOffer({ token, msisdn, offerId, extra = {} }) {
    if (this.dryRun) return simulator.claimOffer({ msisdn, offerId });
    return this.request({
      method: 'POST',
      path: fill(this.paths.claimOffer, { id: offerId }),
      data: { offerId, ...extra },
      token,
      msisdn,
      retries: 0,
    });
  }

  /* ----------------------------- الهدايا ----------------------------- */
  async listGifts({ token, msisdn }) {
    if (this.dryRun) return simulator.gifts();
    return this.request({ method: 'GET', path: this.paths.gifts, token, msisdn, retries: 1 });
  }

  async claimGift({ token, msisdn, giftId }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId });
    return this.request({
      method: 'POST',
      path: fill(this.paths.claimGift, { id: giftId }),
      data: { giftId },
      token,
      msisdn,
      retries: 0,
    });
  }

  /* ---------------------------- التحديات ---------------------------- */
  async verifyChallenge({ token, msisdn, challengeId, code }) {
    if (this.dryRun) return simulator.challenge();
    return this.request({
      method: 'POST',
      path: fill(this.paths.challenge, { id: challengeId }),
      data: { challengeId, code, answer: code },
      token,
      msisdn,
      retries: 0,
    });
  }

  /* ---------------------------- المحاكاة ---------------------------- */
  #simulate({ method, path, data }) {
    log.debug(`محاكاة ${method} ${path}`);
    return { status: 'OK', simulation: true, path, echo: data ?? null };
  }
}

export const client = new DjezzyClient();
export default client;
