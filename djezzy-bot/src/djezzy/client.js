/**
 * عميل HTTP لمحرّك جيزي — يكلّم واجهة تطبيق جيزي الرسمية الحقيقية.
 *
 * المسارات المؤكَّدة (تعمل فعلياً في سكربتات مفتوحة المصدر متعددة):
 *  OTP:     POST /oauth2/registration        (form: msisdn + client_id + scope=smsotp)
 *  Token:   POST /oauth2/token               (form: otp + mobileNumber + grant_type=mobile)
 *  Refresh: POST /oauth2/token               (form: grant_type=refresh_token)
 *  هدية 2G + العروض: POST /djezzy-api/api/v1/subscribers/{msisdn}/subscription-product
 *  هدية QR: POST /mobile-api/api/v1/services/scan/activate-reward/{msisdn}
 *  دعوة صديق: POST /djezzy-api/api/v1/subscribers/{msisdn}/member-get-member
 *  البروفايل: GET  /djezzy-api/api/v1/subscribers/{msisdn}
 *
 * كل الطلبات تمرّ عبر طبقة المسارات (routes.js): relay ← مباشر ← بروكسيات،
 * لتجاوز الحجب الجغرافي بأي طريقة متاحة.
 */
import config from '../config.js';
import { createLogger } from '../util/logger.js';
import { DjezzyError, ERROR_CODES, normalizeError } from './errors.js';
import simulator from './simulator.js';
import * as routes from './routes.js';

const log = createLogger('djezzy/client');

const fill = (path, params = {}) =>
  String(path).replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));

export class DjezzyClient {
  static MIN_REQUEST_GAP_MS = 1200; // فاصل أدنى1.2 ثانية بين أي طلبين
  #lastRequestAt;
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? config.djezzy.baseUrl;
    this.paths = options.paths ?? config.djezzy.paths;
    this.headers = options.headers ?? config.djezzy.headers;
    this.timeoutMs = options.timeoutMs ?? config.djezzy.timeoutMs;
    this.dryRun = options.dryRun ?? config.djezzy.dryRun;
    this.clientId = options.clientId ?? config.djezzy.clientId;
    this.clientSecret = options.clientSecret ?? config.djezzy.clientSecret;
    this.legacyClientId = options.legacyClientId ?? config.djezzy.legacyClientId;
    this.legacyClientSecret = options.legacyClientSecret ?? config.djezzy.legacyClientSecret;
    this.activePair = null;
    this.#lastRequestAt = 0;
    this.giftCode = options.giftCode ?? config.djezzy.giftWalkCode;
    this.giftWalk6Code = options.giftWalk6Code ?? config.djezzy.giftWalk6Code;
    this.scanQr = options.scanQr ?? config.djezzy.scanQr;
    this.userAgent = options.userAgent ?? config.djezzy.userAgent;
    // عند التحديد الصريح في الاختبارات: لا نستخدم طبقات المسارات (اختبار ضد سيرفر وهمي محلي)
    this.forceDirect = options.forceDirect ?? false;
  }

  get mode() {
    return this.dryRun ? 'simulation' : 'live';
  }

  /* --------------------------- الطلب الأساسي --------------------------- */
  /** فاصل زمني إلزامي بين الطلبات (احترام حدود السرعة — لا ضغط على السيرفر) */
  async #pace() {
    const now = Date.now();
    const wait = Math.max(0, this.#lastRequestAt + DjezzyClient.MIN_REQUEST_GAP_MS - now);
    this.#lastRequestAt = now + wait;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }

  async #send({ method = 'POST', path, query, body, form = false, token, ua }) {
    if (!this.baseUrl) {
      throw new DjezzyError(ERROR_CODES.CONFIG, 'DJEZZY_BASE_URL غير مضبوط');
    }
    await this.#pace();

    const headers = {
      'User-Agent': ua || this.userAgent,
      ...this.headers,
    };
    let data;

    if (body !== undefined) {
      if (form) {
        data = new URLSearchParams(
          Object.entries(body).map(([key, value]) => [key, String(value)]),
        ).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        data = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`;

    const url = `${this.baseUrl}${path}`;

    try {
      const response = this.forceDirect
        ? await this.#sendDirect({ method, url, query, headers, data })
        : await routes.request({ method, url, query, headers, data, timeoutMs: this.timeoutMs });

      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      // لا إعادة إرسال عند5xx أو أي رفض — يُعرض الردّ كما هو فوراً (القواعد الصارمة)
      return { status: response.status, json, text, headers: response.headers, route: response.route || 'direct' };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  /** اتصال مباشر (يُستخدم في الاختبارات المحلية وعند تعطيل الطبقات) */
  async #sendDirect({ method, url, query, headers, data }) {
    const axios = (await import('axios')).default;
    const http = axios.create({
      timeout: this.timeoutMs,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(payload) => payload],
      maxRedirects: 0,
      proxy: false,
    });
    const response = await http.request({ method, url, params: query, data, headers });
    return { status: response.status, data: response.data, headers: response.headers, route: 'direct' };
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

  /* --------------------- أزواج بيانات التطبيق --------------------- */
  #pairs() {
    const pairs = [];
    if (this.clientId && this.clientSecret) pairs.push({ id: this.clientId, secret: this.clientSecret, tag: 'app' });
    if (this.legacyClientId && this.legacyClientSecret) {
      pairs.push({ id: this.legacyClientId, secret: this.legacyClientSecret, tag: 'legacy' });
    }
    return pairs;
  }

  /** هل رفضت جيزي بيانات العميل؟ (وقتها نجرّب الزوج البديل) */

  /** الزوج المعتمد الوحيد — طلب واحد فقط، بلا إعادة بزوج بديل بعد أي رفض */
  #primaryPair() {
    const pair = this.activePair || this.#pairs()[0] || (this.clientId ? { id: this.clientId, secret: this.clientSecret, tag: 'app' } : null);
    if (!pair) {
      throw new DjezzyError(ERROR_CODES.CONFIG, 'بيانات تطبيق جيزي (client id/secret) غير مضبوطة.');
    }
    this.activePair = pair;
    return pair;
  }

  /* ------------------------------ OTP ------------------------------ */
  async requestOtp({ msisdn }) {
    if (this.dryRun) return simulator.requestOtp({ msisdn });

    const pair = this.#primaryPair();
    const response = await this.#send({
      method: 'POST',
      path: this.paths.requestOtp,
      form: true,
      body: { msisdn, client_id: pair.id, scope: 'smsotp' },
    });

    if (response.status === 429) {
      throw new DjezzyError(ERROR_CODES.RATE_LIMITED, 'طلبات كثيرة على إرسال الرمز — انتظر دقائق.', { status: 429 });
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = DjezzyClient.message(response.json) || response.text?.slice(0, 200) || `HTTP ${response.status}`;
      if ((response.status === 403 || response.status === 451) && /forbidden|nginx/i.test(String(response.text || ''))) {
        throw new DjezzyError(ERROR_CODES.BLOCKED, null, { status: response.status, payload: response.json });
      }
      throw new DjezzyError(ERROR_CODES.UNKNOWN, detail, { status: response.status, payload: response.json });
    }

    log.info(`تم إرسال رمز تحقق حقيقي إلى …${msisdn.slice(-4)}${response.route && response.route !== 'direct' ? ` عبر ${response.route}` : ''}`);
    return {
      sessionId: `otp:${msisdn}`,
      expiresIn: 180,
      masked: `0${msisdn.slice(3, 5)} *** ** ${msisdn.slice(-2)}`,
    };
  }

  async verifyOtp({ msisdn, code }) {
    if (this.dryRun) return simulator.verifyOtp({ msisdn, code, sessionId: `otp:${msisdn}` });

    const pair = this.#primaryPair();
    // الزوج الحالي يستخدم scope=openid (كما في تطبيق Djezzy الحديث)؛ الزوج القديم djezzyAppV2
    const scope = pair.tag === 'legacy' ? 'djezzyAppV2' : 'openid';
    const response = await this.#send({
      method: 'POST',
      path: this.paths.verifyOtp,
      form: true,
      body: {
        scope,
        client_secret: pair.secret,
        client_id: pair.id,
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

    const pair = this.#primaryPair();
    const response = await this.#send({
      method: 'POST',
      path: this.paths.refresh,
      form: true,
      body: {
        scope: 'djezzyAppV2',
        client_secret: pair.secret,
        client_id: pair.id,
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

  /* ---------------------------- الحساب والسجل ---------------------------- */
  async getProfile({ token, msisdn }) {
    if (this.dryRun) return simulator.profile({ msisdn });
    const response = await this.#send({
      method: 'GET',
      path: fill(this.paths.subscriber, { msisdn }),
      // الشكل الحقيقي (hex bot): الرصيد في data.attributes.balance + العروض في included
      query: { include: 'connected-products,supplementary-informations' },
      token,
    });
    this.#ensure(response, { ok: (s) => s === 200 || s === 204 });
    return response.json ?? {};
  }

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

  /* ------------------------- تفعيل منتج/هدية (subscription-product) ------------------------- */
  /** حمولة هدية 2 جيجا (Walk Win) — نفس الحمولة المعتمدة في كل السكربتات العاملة */
  #walkPayload() {
    return {
      data: {
        id: config.djezzy.walkProductId,
        type: 'products',
        meta: {
          services: {
            steps: config.djezzy.walkSteps,
            code: this.giftCode,
            id: config.djezzy.walkServiceId,
          },
        },
      },
    };
  }

  async #activateSubscriptionProduct({ token, msisdn, payload, ua }) {
    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.subscriptionProduct, { msisdn }),
      body: payload,
      token,
      ua,
    });
    return response;
  }

  async claimWalkGift({ token, msisdn }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: this.giftCode });
    const response = await this.#activateSubscriptionProduct({
      token,
      msisdn,
      payload: this.#walkPayload(),
      ua: 'Djezzy/2.7.5',
    });
    // مسار رسمي واحد فقط — بلا إعادة أو بديل بعد الرفض
    return this.#interpretReward(response, 'هدية 2 جيجا');
  }

  /**6 جيجا — مستوى20000 خطوة في Walk Win (أي طريقة: subscription-product ثم walk/activate-reward) */
  async claimWalk6Gift({ token, msisdn }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: this.giftWalk6Code });
    const payload = {
      data: {
        id: config.djezzy.walkProductId,
        type: 'products',
        meta: { services: { steps: 20000, code: this.giftWalk6Code, id: 'WALKWIN' } },
      },
    };
    const response = await this.#activateSubscriptionProduct({ token, msisdn, payload, ua: 'Djezzy/2.7.5' });
    // مسار رسمي واحد فقط — بلا إعادة أو بديل بعد الرفض
    return this.#interpretReward(response, 'هدية 6 جيجا');
  }

  async claimScanGift({ token, msisdn, qrCode = this.scanQr }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: 'SCAN' });

    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.scanReward, { msisdn }),
      token,
      body: { qrCode },
      ua: 'MobileApp/3.0.9',
    });
    return this.#interpretReward(response, 'الهدية الترويجية');
  }

  /** تفعيل عرض/باقة بالرمز (مدفوع أو مجاني حسب الكتالوج) */
  async activateProduct({ token, msisdn, packageCode }) {
    if (this.dryRun) return simulator.claimOffer({ msisdn, offerId: packageCode });

    const response = await this.#activateSubscriptionProduct({
      token,
      msisdn,
      payload: { data: { id: packageCode, type: 'products' } },
      ua: 'Djezzy/2.7.5',
    });
    // مسار رسمي واحد فقط — بلا إعادة أو بديل بعد الرفض
    return this.#interpretReward(response, packageCode);
  }

  /** بونص الدعوة (Member-Get-Member) */
  async memberGetMember({ token, msisdn, friendMsisdn }) {
    if (this.dryRun) return simulator.claimGift({ msisdn, giftId: `MGM:${friendMsisdn}` });

    const response = await this.#send({
      method: 'POST',
      path: fill(this.paths.memberGetMember, { msisdn }),
      token,
      body: {
        data: {
          id: 'MGM-BONUS',
          type: 'products',
          meta: { services: { 'b-number': friendMsisdn, id: 'MemberGetMember' } },
        },
      },
      ua: 'Djezzy/2.6.10',
    });
    return this.#interpretReward(response, 'بونص الدعوة');
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

    // حجب جغرافي (nginx) ليس خطأ رصيد
    if (
      (response.status === 403 || response.status === 451) &&
      /403 forbidden|nginx/i.test(String(response.text || ''))
    ) {
      throw new DjezzyError(ERROR_CODES.BLOCKED, null, { status: response.status, payload: json });
    }

    if (response.status === 402 || response.status === 403 || innerStatus === 402 || innerStatus === 403) {
      const balance = json?.data?.mainBalance ?? json?.data?.attributes?.balance;
      const balanceLine = balance ? `\n💰 رصيدك الحالي: ${balance} دج` : '';
      const planLine = /2 جيجا|2G|GIFTWALKWIN/i.test(String(label))
        ? '\nℹ️ شرط جيزي: قد يتطلب الاستلام اشتراك باقة 100 دج أو أكثر أسبوعياً.'
        : '';
      throw new DjezzyError(
        ERROR_CODES.BALANCE,
        (message || 'جيزي ترفض التفعيل: الرصيد غير كافٍ أو الشريحة غير مؤهّلة لهذا العرض.') +
          balanceLine +
          planLine,
        { status: response.status, payload: json },
      );
    }

    const success =
      (response.status === 200 || response.status === 201) &&
      (innerStatus === 200 || innerStatus === 201 || /success/i.test(String(message || '')) || !message);

    if (success) {
      return { ok: true, status: 'claimed', message: message || `تم تفعيل ${label} بنجاح.`, payload: json, route: response.route };
    }

    if (response.status === 429) {
      throw new DjezzyError(ERROR_CODES.RATE_LIMITED, message || 'طلبات كثيرة — انتظر قليلاً.', { status: 429 });
    }
    if (/already|déjà|مسبق/i.test(String(message || ''))) {
      throw new DjezzyError(ERROR_CODES.OFFER_ALREADY_ACTIVE, message, { status: response.status, payload: json });
    }
    if (response.status === 400 && /not found|inconnu|غير موجود/i.test(String(message || ''))) {
      throw new DjezzyError(ERROR_CODES.OFFER_NOT_FOUND, message, { status: response.status, payload: json });
    }

    throw new DjezzyError(
      ERROR_CODES.UNKNOWN,
      message || `فشل تفعيل ${label} (HTTP ${response.status}).`,
      { status: response.status, payload: json },
    );
  }
}

export const client = new DjezzyClient();
export default client;
