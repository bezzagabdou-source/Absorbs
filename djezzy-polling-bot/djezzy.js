/**
 * djezzy.js — طبقة الاتصال بواجهة جيزي (API تطبيق جيزي الرسمي)
 * ============================================================================
 * كل الطلبات تمر من هنا، مع:
 *   • ترويسات تحاكي تطبيق الهاتف الرسمي (User-Agent / Accept-Language: ar-DZ …)
 *   • دعم Proxy و Agents مخصّصة (HTTP_PROXY / DJEZZY_PROXY / httpsAgent)
 *   • مهلة قابلة للضبط + إعادة محاولة واحدة عند فشل الشبكة
 *   • تبديل تلقائي لبيانات العميل (client id/secret) عند الرفض
 *   • تحويل أخطاء جيزي إلى أخطاء مفهومة بالعربية (DjezzyError)
 *
 * الواجهات المستخدمة (من تطبيق جيزي الرسمي):
 *   OTP      : POST /mobile-api/oauth2/registration?msisdn=…&client_id=…&scope=smsotp
 *   Token    : POST /mobile-api/oauth2/token        (form: grant_type=mobile)
 *   Refresh  : POST /mobile-api/oauth2/token        (form: grant_type=refresh_token)
 *   History  : GET  /mobile-api/api/v1/subscribers/subscription-history/{msisdn}
 *   2GB Gift : POST /mobile-api/api/v1/services/walk/activate-reward/{msisdn}
 *   QR Gift  : POST /mobile-api/api/v1/services/scan/activate-reward/{msisdn}
 *   Product  : POST /mobile-api/api/v1/subscribers/activate-product/{msisdn}
 * ============================================================================
 */
import axios from 'axios';
import dns from 'node:dns';
import https from 'node:https';
import process from 'node:process';

/* ------------------- إصلاح تعليق الشبكة: IPv4 + keepAlive ------------------- */
// السبب الأشهر لـ ECONNABORTED / ETIMEDOUT على شبكات الهاتف (4G/Wi-Fi جزائرية):
// يحاول Node الاتصال عبر IPv6 أولاً فيعلق حتى انتهاء المهلة، رغم أن IPv4 يعمل.
// نفرض IPv4 صراحةً + نُبقي الاتصال مفتوحاً (keepAlive) لتقليل زمن كل طلب.
// للتعطيل (مثلاً عند وجود IPv6 سليم فقط): DJEZZY_FORCE_IPV4=0
export const FORCE_IPV4 = String(process.env.DJEZZY_FORCE_IPV4 ?? '1') !== '0';

if (FORCE_IPV4) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    /* Node قديم — نتجاهل */
  }
}

/** lookup يفرض family=4 ويتعامل مع الحالتين (with/without all) */
const ipv4Lookup = (hostname, options, callback) => {
  if (!FORCE_IPV4) return dns.lookup(hostname, options, callback);
  if (options && options.all) {
    return dns.lookup(hostname, { ...options, family: 4, all: true }, (error, list) => {
      if (error) return callback(error);
      const v4 = (list || []).filter((item) => item.family === 4 || item.family === 'IPv4');
      return callback(null, v4.length ? v4 : list);
    });
  }
  return dns.lookup(hostname, { ...options, family: 4 }, callback);
};

/** وكيل HTTPS موحّد: IPv4 فقط + keepAlive + مهلة سوكت أطول من مهلة الطلب */
export const ipv4Agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 8,
  lookup: ipv4Lookup,
  timeout: 60_000,
});

/** يرجّع سجلات DNS (A/AAAA) — يُستعمل في diag.js لشرح سبب التعليق */
export const resolveHost = (host) =>
  new Promise((resolve) => {
    dns.lookup(host, { all: true }, (error, list) => {
      if (error) return resolve({ error: error.code || error.message, list: [] });
      return resolve({
        error: null,
        list: (list || []).map((item) => ({ address: item.address, family: item.family })),
      });
    });
  });

/* ------------------------------- الأخطاء ------------------------------- */
export const KIND = {
  CONFIG: 'CONFIG',
  NETWORK: 'NETWORK',
  GEO: 'GEO',
  TIMEOUT: 'TIMEOUT',
  SERVER: 'SERVER',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  RATE_LIMITED: 'RATE_LIMITED',
  ALREADY: 'ALREADY',
  NOT_FOUND: 'NOT_FOUND',
};

const FRIENDLY = {
  [KIND.CONFIG]: 'إعدادات جيزي ناقصة (client id/secret).',
  [KIND.NETWORK]: 'تعذّر الاتصال بخوادم جيزي. تحقّق من الإنترنت ثم أعد المحاولة.',
  [KIND.GEO]:
    'تعذّر الوصول إلى خوادم جيزي: جيزي تقبل الاتصال من شبكات داخل الجزائر فقط.\n' +
    'أوقف أي VPN، واستعمل بيانات الهاتف (Djezzy) ثم أعد المحاولة.',
  [KIND.TIMEOUT]:
    'انتهت مهلة الاتصال بخوادم جيزي (تعليق في مسار الشبكة).\n' +
    'جرّب بالترتيب: أوقف أي VPN ← بدّل بين Wi-Fi وبيانات جيزي ← أعد المحاولة.',
  [KIND.SERVER]: 'خوادم جيزي تُعيد خطأ مؤقتاً. أعد المحاولة بعد قليل.',
  [KIND.OTP_INVALID]: 'رمز التحقق غير صحيح. أعد إدخاله.',
  [KIND.OTP_EXPIRED]: 'انتهت صلاحية الرمز — أرسل /start واطلب رمزاً جديداً.',
  [KIND.AUTH_EXPIRED]: 'انتهت الجلسة — أعد ربط الرقم برمز تحقق جديد.',
  [KIND.NOT_ELIGIBLE]: 'الشريحة غير مؤهّلة لهذه الهدية (تحتاج باقة مفعّلة أو رصيداً كافياً).',
  [KIND.RATE_LIMITED]: 'طلبات كثيرة — انتظر دقيقتين ثم أعد المحاولة.',
  [KIND.ALREADY]: 'هذه الهدية مُستلمة/مُفعّلة بالفعل على رقمك.',
  [KIND.NOT_FOUND]: 'لم يُعثر على هذا العرض في حسابك.',
};

export class DjezzyError extends Error {
  constructor(kind, message, meta = {}) {
    super(message || FRIENDLY[kind] || 'خطأ غير متوقع من جيزي.');
    this.name = 'DjezzyError';
    this.kind = kind;
    this.friendly = FRIENDLY[kind] || this.message;
    Object.assign(this, meta);
  }
}

/* ---------------------------- أدوات مساعدة ---------------------------- */
const fill = (path, params) => String(path).replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(params[key] ?? ''));

const pickMessage = (payload) => {
  if (!payload) return null;
  const message = payload.message;
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object') {
    return message.ar || message.fr || message.en || Object.values(message)[0] || null;
  }
  return payload.error_description || payload.error?.message || payload.error || payload.msg || null;
};

const parseProxy = (value) => {
  if (!value) return undefined;
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    const proxy = { protocol: url.protocol.replace(':', ''), host: url.hostname, port: Number(url.port || 80) };
    if (url.username) proxy.auth = { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
    return proxy;
  } catch {
    return undefined;
  }
};

const isTimeout = (error) =>
  ['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN'].includes(
    error?.code,
  ) || /timeout/i.test(String(error?.message || ''));

/** يتحقّق من رقم جزائري ويُعيد msisdn بصيغة 213XXXXXXXXX
 *  يقبل: 0770123456 · +213770123456 · 00213770123456 · 770123456 · أرقاماً عربية */
export function parsePhone(
  raw,
  allowedPrefixes = (process.env.ALLOWED_PREFIXES || '7')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter(Boolean),
) {
  // توحيد الأرقام: عربية-هندية (٠-٩)، فارسية (۰-۹)، إنجليزية — مع إبقاء +
  const digits = Array.from(String(raw || ''))
    .map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x0660 && cp <= 0x0669) return String(cp - 0x0660);
      if (cp >= 0x06f0 && cp <= 0x06f9) return String(cp - 0x06f0);
      if (cp >= 48 && cp <= 57) return ch;
      return ch === '+' ? '+' : '';
    })
    .join('');

  let national = null;
  if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^(?:\+?213|00213)\d{9}$/.test(digits)) national = digits.replace(/^(?:\+?213|00213)/, '');
  else if (/^\d{9}$/.test(digits)) national = digits;

  if (!national) return { ok: false, error: 'أرسل رقماً صحيحاً من 10 أرقام، مثال: <code>0770123456</code>' };
  if (allowedPrefixes.length > 0 && !allowedPrefixes.includes(national[0])) {
    return { ok: false, error: 'هذا البوت يدعم أرقام جيزي فقط (<code>07XXXXXXXX</code>).' };
  }
  return { ok: true, msisdn: `213${national}`, label: `0${national.slice(0, 2)} *** ** ${national.slice(-2)}` };
}

/* --------------------------------- العميل -------------------------------- */
export class Djezzy {
  constructor(options = {}) {
    const env = options.env || process.env;

    this.baseUrl = (options.baseUrl || env.DJEZZY_BASE_URL || 'https://apim.djezzy.dz').replace(/\/+$/, '');
    this.timeoutMs = Number(options.timeoutMs || env.DJEZZY_TIMEOUT_MS || 45000);
    this.retries = Number(options.retries ?? env.DJEZZY_RETRIES ?? 2);

    this.paths = {
      requestOtp: '/mobile-api/oauth2/registration',
      token: '/mobile-api/oauth2/token',
      history: '/mobile-api/api/v1/subscribers/subscription-history/{msisdn}',
      walkReward: '/mobile-api/api/v1/services/walk/activate-reward/{msisdn}',
      scanReward: '/mobile-api/api/v1/services/scan/activate-reward/{msisdn}',
      activateProduct: '/mobile-api/api/v1/subscribers/activate-product/{msisdn}',
      ...(options.paths || {}),
    };

    // بيانات تطبيق جيزي: الزوج الأساسي + زوج بديل يُجرَّب عند الرفض
    this.credentials = [
      {
        id: options.clientId || env.DJEZZY_CLIENT_ID,
        secret: options.clientSecret || env.DJEZZY_CLIENT_SECRET,
      },
      {
        id: options.legacyClientId || env.DJEZZY_CLIENT_ID_LEGACY,
        secret: options.legacyClientSecret || env.DJEZZY_CLIENT_SECRET_LEGACY,
      },
    ].filter((pair) => pair.id && pair.secret);

    this.activeCredentials = null;

    this.giftCode = options.giftCode || env.DJEZZY_GIFT_WALK_CODE || 'GIFTWALKWIN2GO';
    this.scanQr = options.scanQr || env.DJEZZY_SCAN_QR || 'https://www.djezzy.dz/scanwin-wd26?1';

    // ترويسات تحاكي تطبيق الهاتف الرسمي
    this.headers = {
      'User-Agent': options.userAgent || env.DJEZZY_USER_AGENT || 'MobileApp/3.0.9 (Android 13; DalilDjezzy)',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': options.acceptLanguage || env.DJEZZY_ACCEPT_LANGUAGE || 'ar-DZ',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'X-Requested-With': 'dz.djezzy.mobile',
      ...(options.headers || {}),
    };

    const proxyUrl = options.proxyUrl || env.DJEZZY_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';
    const proxy = options.proxy === false ? false : options.proxy || parseProxy(proxyUrl);

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      proxy,
      // عند وجود Proxy لا نضع وكيلاً مخصّصاً (axios يتكفّل بالنفق)
      httpsAgent: options.httpsAgent || (proxy ? undefined : ipv4Agent),
      httpAgent: options.httpAgent,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(data) => data],
      maxRedirects: 0,
      headers: { ...this.headers },
    });

    this.meta = { proxy: proxy || null, timeoutMs: this.timeoutMs, baseUrl: this.baseUrl, forceIpv4: FORCE_IPV4, retries: this.retries };
  }

  /** ينشئ العميل من متغيّرات البيئة */
  static fromEnv(env = process.env) {
    const client = new Djezzy({ env });
    if (client.credentials.length === 0) {
      throw new DjezzyError(KIND.CONFIG, 'أضف DJEZZY_CLIENT_ID و DJEZZY_CLIENT_SECRET في ملف .env');
    }
    return client;
  }

  /* --------------------------- الطلب الأساسي --------------------------- */
  async #send({ method = 'POST', path, params, data, form = false, token, attempt = 0 }) {
    const headers = { ...this.headers };
    let payload;

    if (data !== undefined) {
      if (form) {
        payload = new URLSearchParams(data).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        payload = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
      }
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!headers['X-Request-Id']) headers['X-Request-Id'] = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    try {
      const response = await this.http.request({ method, url: path, params, data: payload, headers });
      const text = typeof response.data === 'string' ? response.data : '';
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (response.status >= 500 && attempt < this.retries) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return this.#send({ method, path, params, data, form, token, attempt: attempt + 1 });
      }

      return { status: response.status, json, text };
    } catch (error) {
      // تعليق/انقطاع الشبكة: إعادة محاولة بفاصل متزايد قبل إبلاغ المستخدم
      if (attempt < this.retries && isTimeout(error)) {
        await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        return this.#send({ method, path, params, data, form, token, attempt: attempt + 1 });
      }
      const code = error?.code || '';
      const timedOut = ['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) || /timeout/i.test(String(error?.message || ''));
      const kind = timedOut ? KIND.TIMEOUT : isTimeout(error) || !error?.response ? KIND.GEO : KIND.NETWORK;
      throw new DjezzyError(kind, null, { cause: code || error?.message });
    }
  }

  /* ------------------------ بيانات العميل النشطة ------------------------ */
  get #pair() {
    return this.activeCredentials || this.credentials[0] || { id: '', secret: '' };
  }

  #rejected(response) {
    if (![400, 401, 403].includes(response.status)) return false;
    const text = String(response.text || '').toLowerCase();
    return /invalid_client|unauthorized_client|client_id|client not/.test(text);
  }

  async #withCredentials(run) {
    const candidates = this.activeCredentials ? [this.activeCredentials] : this.credentials;
    if (candidates.length === 0) throw new DjezzyError(KIND.CONFIG);

    let last = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const pair = candidates[index];
      const response = await run(pair);
      last = response;
      if (this.#rejected(response) && index < candidates.length - 1) continue;
      this.activeCredentials = pair;
      return response;
    }
    return last;
  }

  /* ------------------------------- OTP ------------------------------- */
  /** يطلب رمز تحقق (SMS) حقيقي للرقم */
  async requestOtp(msisdn) {
    const response = await this.#withCredentials((pair) =>
      this.#send({
        path: this.paths.requestOtp,
        params: { msisdn, client_id: pair.id, scope: 'smsotp' },
        data: { 'consent-agreement': [{ 'marketing-notifications': false }], 'is-consent': true },
      }),
    );

    if (response.status === 429) throw new DjezzyError(KIND.RATE_LIMITED);
    if (response.status >= 500) throw new DjezzyError(KIND.SERVER);
    if (response.status < 200 || response.status >= 300) {
      const detail = pickMessage(response.json) || response.text?.slice(0, 160) || `HTTP ${response.status}`;
      throw new DjezzyError(KIND.SERVER, `رفضت جيزي طلب الرمز (${response.status}): ${detail}`, { status: response.status });
    }
    return { ok: true, status: response.status };
  }

  /** يتحقّق من الرمز ويُعيد التوكنات */
  async verifyOtp(msisdn, otp) {
    const pair = this.#pair;
    const response = await this.#send({
      path: this.paths.token,
      form: true,
      data: {
        scope: 'djezzyAppV2',
        client_secret: pair.secret,
        client_id: pair.id,
        otp: String(otp),
        mobileNumber: msisdn,
        grant_type: 'mobile',
      },
    });

    const { json } = response;
    if (response.status >= 200 && response.status < 300 && json?.access_token) {
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        expiresIn: Number(json.expires_in) || 3600,
      };
    }

    const description = String(json?.error_description || json?.error || '').toLowerCase();
    if (response.status === 429) throw new DjezzyError(KIND.RATE_LIMITED);
    if (/expired|périmé|منته/.test(description)) throw new DjezzyError(KIND.OTP_EXPIRED);
    throw new DjezzyError(KIND.OTP_INVALID, pickMessage(json) || 'رمز التحقق غير صحيح.', { status: response.status });
  }

  /** يجدّد الجلسة دون رمز SMS */
  async refresh(refreshToken) {
    if (!refreshToken) throw new DjezzyError(KIND.AUTH_EXPIRED);
    const pair = this.#pair;
    const response = await this.#send({
      path: this.paths.token,
      form: true,
      data: {
        scope: 'djezzyAppV2',
        client_secret: pair.secret,
        client_id: pair.id,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
    });

    const { json } = response;
    if (response.status >= 200 && response.status < 300 && json?.access_token) {
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token || refreshToken,
        expiresIn: Number(json.expires_in) || 3600,
      };
    }
    throw new DjezzyError(KIND.AUTH_EXPIRED, null, { status: response.status });
  }

  /* --------------------------- طلبات الهدايا --------------------------- */
  #rewardError(kindHint, response) {
    const text = `${response.text || ''}`.toLowerCase();
    if (/already|déjà|مسبق/.test(text)) return new DjezzyError(KIND.ALREADY, pickMessage(response.json) || null);
    if (response.status === 402 || response.status === 403) return new DjezzyError(KIND.NOT_ELIGIBLE, pickMessage(response.json) || null);
    if (response.status === 429) return new DjezzyError(KIND.RATE_LIMITED);
    if (response.status === 401 || /900901/.test(text)) return new DjezzyError(KIND.AUTH_EXPIRED);
    return new DjezzyError(kindHint, pickMessage(response.json) || `فشل الطلب (HTTP ${response.status}).`, {
      status: response.status,
    });
  }

  async #reward(path, token, body) {
    const response = await this.#send({ path, data: body, token });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, message: pickMessage(response.json) || 'تم بنجاح.' };
    }
    throw this.#rewardError(KIND.SERVER, response);
  }

  /** هدية 2 جيجا الأسبوعية (Walk & Win) */
  claimWeeklyGift(msisdn, token, packageCode = this.giftCode) {
    return this.#reward(fill(this.paths.walkReward, { msisdn }), token, { packageCode });
  }

  /** الهدية الترويجية عبر رمز QR */
  claimScanGift(msisdn, token, qrCode = this.scanQr) {
    return this.#reward(fill(this.paths.scanReward, { msisdn }), token, { qrCode });
  }

  /** باقة/عرض مدفوع (قد يُخصم من الرصيد) */
  activateProduct(msisdn, token, packageCode) {
    return this.#reward(fill(this.paths.activateProduct, { msisdn }), token, { packageCode });
  }

  /* ----------------------------- السجل ----------------------------- */
  /** سجل الاشتراكات — يُستخدم لمعرفة آخر هدية أسبوعية */
  async history(msisdn, token) {
    const response = await this.#send({ method: 'GET', path: fill(this.paths.history, { msisdn }), token });
    if (response.status === 401 || /900901/.test(response.text || '')) throw new DjezzyError(KIND.AUTH_EXPIRED);
    if (response.status < 200 || response.status >= 300) {
      throw new DjezzyError(KIND.SERVER, `تعذّر قراءة سجل الاشتراكات (HTTP ${response.status}).`, { status: response.status });
    }
    const list = Array.isArray(response.json?.data)
      ? response.json.data
      : Array.isArray(response.json)
        ? response.json
        : [];
    return list.map((item) => ({
      code: String(item.packageCode || item.code || item.productCode || ''),
      at: Date.parse(item.subscriptionDateTime || item.date || item.createdAt || '') || null,
    }));
  }

  /* --------------------------- فحص الاتصال --------------------------- */
  /** يتحقّق إن كان الوصول إلى جيزي ممكناً من هذا الجهاز (TCP/HTTP حقيقي) */
  async probe() {
    const started = Date.now();
    try {
      const response = await this.http.request({
        method: 'GET',
        url: '/mobile-api/',
        timeout: Math.min(this.timeoutMs, 20000),
        headers: { ...this.headers },
      });
      return { reachable: true, status: response.status, ms: Date.now() - started, proxy: this.meta.proxy };
    } catch (error) {
      return { reachable: false, error: error?.code || error?.message, ms: Date.now() - started, proxy: this.meta.proxy };
    }
  }
}

export default Djezzy;
