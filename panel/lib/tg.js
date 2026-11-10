/* FT AI — اتصال تيليغرام: حماية من الحظر + إرسال آمن */
import { now } from "./core.js";

const API_BASE = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
export const botToken = () => process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
export const demoMode = () => !botToken();

/* ───── سقف معدّل عالمي ───── */
class Bucket {
  constructor(rate, burst = rate) { this.rate = rate; this.cap = Math.max(1, burst); this.tokens = this.cap; this.last = now(); }
  take() {
    const t = now();
    this.tokens = Math.min(this.cap, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens >= 1) { this.tokens -= 1; return 0; }
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000);
  }
}
const bucket = new Bucket(Number(process.env.TG_RATE ?? 22), 22);
const chatNext = new Map();
const muted = new Map(); // chatId → until

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isMuted(chatId) {
  const until = muted.get(chatId);
  return Boolean(until && until > now());
}

export async function tg(method, payload = {}, { timeoutMs = 20000, retries = 2 } = {}) {
  const token = botToken();
  if (!token) {
    return { ok: true, result: demoResult(method, payload), demo: true };
  }
  const chatId = payload.chat_id;
  if (chatId != null && isMuted(chatId)) {
    return { ok: false, error_code: 403, description: "المحادثة محظورة مؤقتاً (حماية من الحظر)" };
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    // 1) سقف عالمي
    const wait = bucket.take();
    if (wait) await sleep(wait);
    // 2) مسافة بين رسالتين لنفس المحادثة
    if (chatId != null) {
      const at = chatNext.get(chatId) ?? 0;
      if (at > now()) await sleep(at - now());
      chatNext.set(chatId, now() + 1100);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let out = null;
    try {
      const res = await fetch(`${API_BASE()}/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      out = await res.json().catch(() => ({ ok: false, description: "رد غير صالح" }));
    } catch (e) {
      out = { ok: false, error_code: -1, description: String(e?.message ?? e) };
    } finally {
      clearTimeout(timer);
    }
    if (out?.ok) return out;
    const code = out?.error_code;
    if (code === 429) {
      const after = Number(out?.parameters?.retry_after ?? 2);
      await sleep(Math.min(30, after) * 1000);
      continue;
    }
    if (code === 403) muted.set(chatId, now() + 30 * 60 * 1000);
    if (code && code >= 400 && code < 500) return out; // خطأ نهائي، لا نعاود
    await sleep(600 * (attempt + 1));
  }
  return { ok: false, description: "فشل الإرسال بعد المحاولات" };
}

function demoResult(method, payload) {
  if (method === "getMe") return { id: 1, is_bot: true, first_name: "FT AI", username: "ft_ai_demo_bot" };
  if (method === "getWebhookInfo") return { url: "", pending_update_count: 0 };
  return { message_id: Math.floor(Math.random() * 90000) + 1000, date: Math.floor(now() / 1000), chat: { id: payload.chat_id ?? 0 }, demo: true };
}

export const sendMessage = (chatId, text, extra = {}) =>
  tg("sendMessage", { chat_id: chatId, text: String(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });

export const sendPhoto = (chatId, photo, extra = {}) =>
  tg("sendPhoto", { chat_id: chatId, photo, ...extra });

export const getMe = () => tg("getMe", {}, { retries: 0 });
export const getWebhookInfo = () => tg("getWebhookInfo", {}, { retries: 0 });
export const setWebhook = (url, secret_token) =>
  tg("setWebhook", { url, secret_token, drop_pending_updates: false, allowed_updates: ["message", "callback_query"], max_connections: 40 }, { retries: 0 });
export const deleteWebhook = (drop = false) => tg("deleteWebhook", { drop_pending_updates: drop }, { retries: 0 });

/* الإرسال الجماعي: نبضات + سقف + احترام 429 */
export async function broadcast(chatIds, text, { perSecond = 18, onProgress = null } = {}) {
  const list = [...new Set(chatIds.map(Number).filter(Boolean))].slice(0, 500);
  const results = { ok: 0, failed: 0, errors: [] };
  const gap = Math.ceil(1000 / Math.max(1, Math.min(20, perSecond)));
  for (let i = 0; i < list.length; i++) {
    const id = list[i];
    const r = await sendMessage(id, text);
    if (r?.ok) results.ok++;
    else {
      results.failed++;
      if (results.errors.length < 5) results.errors.push({ id, error: r?.description ?? "خطأ" });
    }
    if (onProgress) onProgress(i + 1, list.length);
    await sleep(gap + Math.floor(Math.random() * 120));
  }
  return results;
}
