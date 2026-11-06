/**
 * عميل HTTP لمحرّك جيزي — يكلّم واجهة تطبيق جيزي الرسمية الحقيقية.
 *
 *  OTP:        POST /mobile-api/oauth2/registration?msisdn=…&client_id=…&scope=smsotp
 *  Token:      POST /oauth2/token            (form: grant_type=mobile + otp)
 *  Refresh:    POST /oauth2/token            (form: grant_type=refresh_token)
 *  هدية 2G:     POST /mobile-api/api/v1/services/walk/activate-reward/{msisdn}
 *  هدية ترويجية: POST /mobile-api/api/v1/services/scan/activate-reward/{msisdn}
 *  عرض مدفوع:   POST /mobile-api/api/v1/subscribers/activate-product/{msisdn}
 *  السجل:      GET  /mobile-api/api/v1/subscribers/subscription-history/{msisdn}
 *
 * ملاحظة: بيانات التطبيق (client_id / client_secret) تُقرأ من متغيّرات البيئة
 * ولا تُكتب في الكود ولا تُرفع إلى Git.
 */
import axios from 'axios';
import config from '../config.js';
import { createLogger } from '../util/logger.js';
import { DjezzyError, ERROR_CODES, normalizeError } from './errors.js';
import simulator from './simulator.js';

const log = createLogger('djezzy/client');

const fill = (path, params = {}) =>
  String(path).replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));

export class DjezzyClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? config.djezzy.baseUrl;
    this.paths = options.paths ?? config.djezzy.paths;
    this.headers = options.headers ?? config.djezzy.headers;
    this.timeoutMs = options.timeoutMs ?? config.djezzy.timeoutMs;
    this.dryRun = options.dryRun ?? config.djezzy.dryRun;
    this.clientId = options.clientId ?? config.djezzy.clientId;
    this.clientSecret = options.clientSecret ?? config.djezzy.clientSecret;
    this.giftCode = options.giftCode ?? config.djezzy.giftWalkCode;
    this.scanQr = options.scanQr ?? config.djezzy.scanQr;

    this.http = axios.create({
      baseURL: this.baseUrl || undefined,
      timeout: this.timeoutMs,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(data) => data],
      // نمنع axios من إضافة ترويسات لا يستخدمها التطبيق
      headers: { ...this.headers },
      maxRedirects: 0,
    });
  }

  get mode() {
    return this.dryRun ? 'simulation' : 'live';
  }

  /* --------------------------- الطلب الأساسي --------------------------- */
  async #send({ method = 'POST', path, query, body, form = false, token, retries = 1 }) {
    if (!this.baseUrl) {
      throw new DjezzyError(ERROR_CODES.CONFIG, 'DJEZZY_BASE_URL غير مضبوط');
    }

    const headers = { ...this.headers };
    let data;

    if (body !== undefined) {
      if (form) {
        data = new URLSearchParams(body).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        data = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await this.http.request({ method, url: path, params: query, data, headers });
      const text = typeof response.data === 'string' ? response.data : '';
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (response.status >= 500 && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return this.#send({ method, path, query, body, form, token, retries: retries - 1 });
      }

      return { status: response.status, json, text, headers: response.headers };
    } catch (error) {
      if (retries > 0 && !error?.response) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return this.#send({ method, path, query, body, form, token, retries: retries - 1 });
      }
      throw normalizeError(error);
    }
  }

  /** يرمي DjezzyError عند فشل الطلب */
  #ensure(response, { ok = (status) => status >= 200 && status < 300, context = {} } = {}) {
    if (ok(response.status)) return response;
    const payload = response.json ?? { message: response.text?.slice(0, 200) };
    throw normalizeError({ response: { status: response.status, data: payload }, message: `HTTP ${response.status}` }, context);
  }

  /** رسالة نصية من استجابة جيزي (message قد تكون كائناً {en, fr, ar}) */
  static message(json) {
    const message = json?.message;
    if (!message) return null;
    if (typeof message === 'string') return message;
    return message.ar || message.fr || message.en || Object.values(message)[0] || null;
  }

  /* ------------------------------ OTP ------------------------------ */
  async requestOtp({ msisdn }) {
    if (this.dryRun) return simulator.requestOtp({ msisdn });

    const response = await this.#send({
      method: 'POST',
      path: this.paths.requestOtp,
      query: { msisdn, client_id: this.clientId, scope: 'smsotp' },
      body: { 'consent-agreement': [{ 'marketing-notifications': false }], 'is-consent': true },
    });

    if (response.status === 429) {
      throw new DjezzyError(ERROR_CODES.RATE_LIMITED, 'طلبات كثيرة على إرسال الرمز — انتظر دقائق.', { status: 429 });
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = DjezzyClient.message(response.json) || response.text?.slice(0, 200) || `HTTP ${response.status}`;
      throw new DjezzyError(ERROR_CODES.UNKNOWN, detail, { status: response.status, payload: response.json });
    }

    log.info(`تم إرسال رمز تحقق حقيقي إلى …${msisdn.slice(-4)}`);
    return {
      sessionId: `otp:${msisdn}`,
      expiresIn: 180,
      masked: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
    };
  }

  async verifyOtp({ msisdn, code }) {
    if (this.dryRun) return simulator.verifyOtp({ msisdn, code, sessionId: `otp:${msisdn}` });

    const response = await this.#send({
      method: 'POST',
      path: this.paths.verifyOtp,
      form: true,
      body: {
        scope: 'djezzyAppV2',
        client_secret: this.clientSecret,
        client_id: this.clientId,
        otp: String(code),
        mobileNumber: msisdn,
        grant_type: 'mobile',
      },
    });

    const json = response.json;
    if (response.status >= 200 && response.status < 300 && json?.access_token) {
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        expiresIn: Number(json.expires_in) || 3600,
      };
    }

    const description = String(json?.error_description || json?.error || response.text || '').toLowerCase();
    const codeType = /expired|منته/.test(description) ? ERROR_CODES.OTP_EXPIRED : ERROR_CODES.OTP_INVALID;
    throw new DjezzyError(
      response.status === 429 ? ERROR_CODES.RATE_LIMITED : codeType,
      DjezzyClient.message(json) || json?.error_description || `HTTP ${response.status}`,
      { status: response.status, payload: json },
    );
  }

  async refreshSession({ refreshToken }) {
    if (this.dryRun) return simulator.refresh();

    const response = await this.#send({
      method: 'POST',
      path: this.paths.refresh,
      form: true,
      body: {
        scope: 'djezzyAppV2',
        client_secret: this.clientSecret,
        client_id: this.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
    });

    const json = response.json;
    if (response.status >= 200 && response.status < 300 && json?.access_token) {
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        expiresIn: Number(json.expires_in) || 3600,
      };
    }
    throw new DjezzyError(ERROR_CODES.AUTH_EXPIRED, 'انتهت الجلسة — أعد إضافة الرقم برمز جديد.', {
      status: response.status,
      payload: json,
    });
  }

  /* ---------------------------- السجل ---------------------------- */
  async getHistory({ token, msisdn }) {
    if (this.dryRun) return simulator.history({ msisdn });
    const response = await this.#send({
      method: 'GET',
      path: fill(this.paths.history, { msisdn }),
      token,
    });
    this.#ensure(response, { ok: (s) => s === 200 || s === 204 });
    return response.json?.data ?? response.json ?? {};
  }

  /* ---------------------------- الهدايا ---------------------------- */
  async claimWalkGift({ token, msisdn }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: this.giftCode });

    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.walkReward, { msisdn }),
      token,
      body: { packageCode: this.giftCode },
    });
    return this.#interpretReward(response, 'هدية 2 جيجا');
  }

  async claimScanGift({ token, msisdn, qrCode = this.scanQr }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: 'SCAN' });

    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.scanReward, { msisdn }),
      token,
      body: { qrCode },
    });
    return this.#interpretReward(response, 'الهدية الترويجية');
  }

  /** تفعيل عرض مدفوع/باقة بالرمز (activate-product) */
  async activateProduct({ token, msisdn, packageCode }) {
    if (this.dryRun) return simulator.claimOffer({ msisdn, offerId: packageCode });

    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.activateProduct, { msisdn }),
      token,
      body: { packageCode },
    });
    return this.#interpretReward(response, packageCode);
  }

  /** تفسير استجابة تفعيل الهدية/العرض */
  #interpretReward(response, label) {
    const json = response.json;
    const faultCode = Number(json?.fault?.code ?? json?.error?.code ?? 0);
    const innerStatus = Number(json?.status ?? 0);
    const message = DjezzyClient.message(json) || json?.fault?.message || json?.error?.description;

    // 900901 = توكن غير صالح/منتهٍ
    if (faultCode === 900901 || response.status === 401) {
      throw new DjezzyError(ERROR_CODES.AUTH_EXPIRED, message || 'الجلسة منتهية', { status: response.status, payload: json });
    }

    if (response.status === 402 || response.status === 403 || innerStatus === 402 || innerStatus === 403) {
      throw new DjezzyError(
        ERROR_CODES.BALANCE,
        message ||
          'جيزي ترفض التفعيل: يلزم أن تكون مشتركاً في عرض/باقة (100 دج أو أكثر) لتكون مؤهّلاً لهذه الهدية.',
        { status: response.status, payload: json },
      );
    }

    const success =
      (response.status === 200 || response.status === 201) &&
      (innerStatus === 200 || innerStatus === 201 || /success/i.test(String(message || '')) || !message);

    if (success) {
      return { ok: true, status: 'claimed', message: message || `تم تفعيل ${label} بنجاح.`, payload: json };
    }

    if (response.status === 429) {
      throw new DjezzyError(ERROR_CODES.RATE_LIMITED, message || 'طلبات كثيرة — انتظر قليلاً.', { status: 429 });
    }
    if (/already|déjà|مسبق/i.test(String(message || ''))) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, message, { status: response.status, payload: json });
    }

    throw new DjezzyError(
      ERROR_CODES.UNKNOWN,
      message || `فشل تفعيل ${label} (HTTP ${response.status}).`,
      { status: response.status, payload: json },
    );
  }

  /* ---------------------------- للتوافق ---------------------------- */
  async getProfile({ token, msisdn }) {
    const history = await this.getHistory({ token, msisdn }).catch(() => ({}));
    return { msisdn, history };
  }
}

export const client = new DjezzyClient();
export default client;
