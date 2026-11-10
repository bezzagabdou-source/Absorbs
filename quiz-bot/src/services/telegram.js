import { config } from "../config.js";
import { sleep } from "../util.js";

/**
 * عميل تيليغرام — مبنيّ ضد الحظر:
 *  1) سقف عالمي للمعدّل (token bucket) أقل من حدود تيليغرام
 *  2) مسافة إلزامية بين رسالتين لنفس المحادثة
 *  3) طابور بعدة عمال + ترتيب عادل بين المحادثات
 *  4) احترام retry_after من 429 والرجوع الأُسّي
 *  5) حظر تلقائي مؤقت للمحادثة التي ترفض باستمرار (403/blocked)
 *  6) إعادة إرسال آمنة فقط للأخطاء الشبكية (لا تكرار لرسائل أُرسلت)
 */

class TokenBucket {
  constructor(ratePerSec, burst = ratePerSec) {
    this.rate = Math.max(1, ratePerSec);
    this.capacity = Math.max(1, burst);
    this.tokens = this.capacity;
    this.last = Date.now();
  }
  take() {
    const t = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000);
  }
  /** تأخير لطيف بعد خطأ عام */
  penalize(ms = 1000) {
    this.tokens = Math.max(0, this.tokens - this.rate * (ms / 1000));
  }
}

class ChatGate {
  constructor() {
    this.next = new Map();
  }
  delay(chatId) {
    const now = Date.now();
    const at = this.next.get(chatId) ?? 0;
    const wait = Math.max(0, at - now);
    this.next.set(chatId, Math.max(at, now) + config.telegram.perChatMs);
    return wait;
  }
  reset(chatId) {
    this.next.delete(chatId);
  }
}

const sleepers = new Map();
function chatSleep(chatId, ms) {
  const key = String(chatId);
  const prev = sleepers.get(key) ?? Promise.resolve();
  const next = prev.then(() => sleep(ms));
  sleepers.set(key, next.catch(() => {}));
  next.finally(() => {
    if (sleepers.get(key) === next) sleepers.delete(key);
  });
  return next;
}

export class TelegramClient {
  constructor(token = config.botToken, { demo = config.demo } = {}) {
    this.token = token;
    this.demo = demo || !token;
    this.bucket = new TokenBucket(config.telegram.msgPerSec, Math.max(5, config.telegram.msgPerSec));
    this.gate = new ChatGate();
    this.queue = [];
    this.active = 0;
    this.banned = new Map(); // chatId -> until
    this.stats = { sent: 0, failed: 0, retried: 0, throttled: 0, blocked: 0 };
    this.me = null;
    if (!this.demo) this.drain();
  }

  supported = { files: 0 };

  async api(method, payload = {}, { timeoutMs = 20000 } = {}) {
    if (this.demo) return this.#demoReply(method, payload);
    const url = `${config.telegram.apiBase}/bot${this.token}/${method}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      return await res.json().catch(() => ({}));
    } finally {
      clearTimeout(timer);
    }
  }

  isBanned(chatId) {
    const until = this.banned.get(chatId);
    if (!until) return false;
    if (until < Date.now()) {
      this.banned.delete(chatId);
      return false;
    }
    return true;
  }

  ban(chatId, ms) {
    this.banned.set(chatId, Date.now() + ms);
    this.gate.reset(chatId);
  }

  enqueue(method, payload, { priority = false } = {}) {
    return new Promise((resolve) => {
      const job = { method, payload, resolve, tries: 0, priority };
      if (priority) this.queue.unshift(job);
      else this.queue.push(job);
      this.drain();
    });
  }

  drain() {
    while (this.active < config.telegram.concurrency && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      this.runJob(job).finally(() => {
        this.active--;
        this.drain();
      });
    }
  }

  async runJob(job) {
    const chatId = job.payload.chat_id;
    try {
      if (chatId != null && this.isBanned(chatId)) {
        this.stats.blocked++;
        return job.resolve({ ok: false, error_code: 403, description: "chat is temporarily muted", muted: true });
      }
      let wait = this.bucket.take();
      if (chatId != null) wait = Math.max(wait, this.gate.delay(chatId));
      if (wait) await chatSleep(chatId ?? "global", wait);

      const res = await this.api(job.method, job.payload);
      if (res && res.ok) {
        this.stats.sent++;
        return job.resolve(res);
      }

      const code = res?.error_code ?? 0;
      const desc = res?.description ?? "";
      const retryAfter =
        res?.parameters?.retry_after ?? res?.parameters?.migrate_to_chat_id ?? null;

      // 429 — تهدئة إلزامية
      if (code === 429) {
        this.stats.throttled++;
        const ms = ((retryAfter ?? 5) + 0.5) * 1000;
        this.bucket.penalize(ms);
        if (chatId != null) await chatSleep(chatId, ms);
        job.tries++;
        if (job.tries <= config.telegram.maxRetries) {
          this.stats.retried++;
          if (chatId != null) this.queue.unshift({ ...job, priority: false });
          else this.queue.push(job);
          return;
        }
        return job.resolve(res);
      }

      // 403 — المستخدم حظر البوت أو مجموعة ممنوعة: نرفع مهلة المحادثة
      if (code === 403) {
        this.stats.blocked++;
        if (chatId != null) this.ban(chatId, 30 * 60000);
        return job.resolve(res);
      }

      // 400 — خطأ في الطلب: لا نعيد المحاولة إلا لحالات واضحة
      if (code === 400 && /too many requests|flood|retry later/i.test(desc)) {
        const ms = Math.min(60000, 2000 * Math.pow(2, job.tries));
        job.tries++;
        if (job.tries <= config.telegram.maxRetries) {
          this.stats.retried++;
          setTimeout(() => this.queue.push(job), ms);
          return;
        }
        return job.resolve(res);
      }

      // أخطاء شبكية / 5xx
      if (code === 0 || code >= 500) {
        job.tries++;
        if (job.tries <= config.telegram.maxRetries) {
          this.stats.retried++;
          const ms = Math.min(30000, 800 * Math.pow(2, job.tries));
          setTimeout(() => this.queue.push(job), ms);
          return;
        }
        this.stats.failed++;
        return job.resolve(res);
      }

      this.stats.failed++;
      return job.resolve(res);
    } catch (e) {
      job.tries++;
      if (job.tries <= config.telegram.maxRetries) {
        this.stats.retried++;
        setTimeout(() => this.queue.push(job), 1000 * job.tries);
        return;
      }
      this.stats.failed++;
      return job.resolve({ ok: false, error_code: -1, description: String(e?.message ?? e) });
    }
  }

  /* ───────────────── واجهات مريحة ───────────────── */

  sendMessage(chatId, text, extra = {}) {
    return this.enqueue("sendMessage", {
      chat_id: chatId,
      text: String(text).slice(0, 4096),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  editMessageText(chatId, messageId, text, extra = {}) {
    return this.enqueue("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: String(text).slice(0, 4096),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }

  answerCallbackQuery(id, text = undefined, extra = {}) {
    return this.enqueue("answerCallbackQuery", { callback_query_id: id, text, ...extra }, { priority: true });
  }

  deleteMessage(chatId, messageId) {
    return this.enqueue("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  setMyCommands(commands) {
    return this.enqueue("setMyCommands", { commands });
  }

  getMe() {
    return this.enqueue("getMe", {}, { priority: true });
  }

  getChat(chatId) {
    return this.enqueue("getChat", { chat_id: chatId });
  }

  setWebhook(url, secret) {
    if (this.demo) return Promise.resolve({ ok: true, demo: true });
    return this.api("setWebhook", {
      url,
      secret_token: secret,
      max_connections: 40,
      allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
      drop_pending_updates: true,
    });
  }

  deleteWebhook() {
    if (this.demo) return Promise.resolve({ ok: true, demo: true });
    return this.api("deleteWebhook", { drop_pending_updates: true });
  }

  /** ملف شخصي للحساب: الصورة + بيانات getChat */
  async getUserPhoto(tgId) {
    if (this.demo) return null;
    // getChat يعطي الصورة الصغيرة لملف المستخدم العام
    const chat = await this.api("getChat", { chat_id: tgId });
    const small = chat?.result?.photo?.small_file_id ?? chat?.result?.photo?.big_file_id ?? null;
    if (!small) return null;
    const file = await this.api("getFile", { file_id: small });
    const filePath = file?.result?.file_path;
    if (!filePath) return null;
    const url = `${config.telegram.apiBase}/file/bot${this.token}/${filePath}`;
    return { fileId: small, url };
  }

  /** يرسل ويعيد معلومات الأزرار للتفاعل */
  sendWithButtons(chatId, text, buttons) {
    return this.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  #demoReply(method, payload) {
    if (method === "getMe") {
      return Promise.resolve({
        ok: true,
        result: { id: 1, is_bot: true, first_name: "FT AI (وضع تجريبي)", username: "ft_ai_demo_bot" },
      });
    }
    return Promise.resolve({ ok: true, result: { message_id: Math.floor(Math.random() * 1e6), demo: true } });
  }
}

export const tg = new TelegramClient();
