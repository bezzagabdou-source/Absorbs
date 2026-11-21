/**
 * محوّل تخزين عبر تيليجرام نفسه — حل دائم يعمل على Vercel بلا KV و بلا GitHub.
 *
 * الفكرة: يحفظ البوت سجل كل مستخدم في **رسالة مثبّتة** بمحادثته الخاصة
 * (نص مشفّر base64url يبدأ بـ DZSTATE:)، ويقرأها عند الحاجة عبر getChat →
 * pinned_message. الرسالة تُعدَّل بدل إرسال رسائل جديدة، وعند أي فشل
 * (مثبّتة غير مدعومة، حذف المستخدم للرسالة…) يتحوّل المحوّل تلقائياً
 * إلى الذاكرة حتى لا يتعطّل البوت.
 */
import { Buffer } from 'node:buffer';

const PREFIX = 'DZSTATE:';
const HEADER = '🔐 سجل جلسة بوت جيزي — لا تحذف هذه الرسالة ولا تفرّغها';

const encode = (value, ttlSeconds) =>
  `${HEADER}\n${PREFIX}${Buffer.from(JSON.stringify({ value, expiresAt: Date.now() + ttlSeconds * 1000 })).toString('base64url')}`;

const decode = (text) => {
  const index = String(text || '').indexOf(PREFIX);
  if (index === -1) return null;
  try {
    return JSON.parse(Buffer.from(String(text).slice(index + PREFIX.length).trim(), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const isUnsupported = (error) => {
  const message = String(error?.description || error?.message || '');
  return /chat not found|METHOD_NOT_SUPPORTED|not enough rights|PARTICIPANT|PIN|private/i.test(message);
};

export function createTelegramAdapter({ getApi, fallback }) {
  let disabled = false;
  const queues = new Map(); // chatId → سلسلة عمليات متسلسلة (تجنب 429)

  const enqueue = (chatId, task) => {
    const previous = queues.get(chatId) || Promise.resolve();
    const next = previous.then(task, task);
    queues.set(
      chatId,
      next.catch(() => {}).finally(() => {
        if (queues.get(chatId) === next) queues.delete(chatId);
      }),
    );
    return next;
  };

  const chatOf = (key) => {
    const match = /^djezzy:user:(\d+)$/.exec(String(key));
    return match ? match[1] : null;
  };

  const useFallback = () => {
    if (!disabled) disabled = true;
    return fallback;
  };

  async function readPinned(api, chatId) {
    const chat = await api.getChat(chatId);
    const message = chat?.pinned_message;
    if (!message?.text || !message.text.includes(PREFIX)) return null;
    return { messageId: message.message_id, text: message.text };
  }

  return {
    name: 'telegram',

    async get(key) {
      if (disabled) return fallback.get(key);
      const chatId = chatOf(key);
      if (!chatId) return fallback.get(key);

      try {
        const api = await getApi();
        const pinned = await readPinned(api, chatId);
        if (!pinned) return null;
        const payload = decode(pinned.text);
        if (!payload) return null;
        if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
        return payload.value ?? null;
      } catch (error) {
        if (isUnsupported(error)) {
          useFallback();
          return fallback.get(key);
        }
        // خطأ مؤقت (شبكة/429) — نُطلق الخطأ حتى يتحوّل المُصمد للذاكرة
        // (أفضل من إرجاع فارغ يعني حذف حسابات المستخدم فعلياً)
        throw error;
      }
    },

    async set(key, value, ttlSeconds = 60 * 60 * 24 * 180) {
      if (disabled) return fallback.set(key, value, ttlSeconds);
      const chatId = chatOf(key);
      if (!chatId) return fallback.set(key, value, ttlSeconds);

      const body = encode(value, ttlSeconds);
      if (body.length > 4000) {
        // حجم زائد (أرقام كثيرة جداً) — نُبقي آخر رقمين فقط في الذاكرة
        return fallback.set(key, value, ttlSeconds);
      }

      return enqueue(chatId, async () => {
        const api = await getApi();

        const write = async () => {
          const pinned = await readPinned(api, chatId).catch(() => null);
          if (pinned) {
            try {
              await api.editMessageText(chatId, pinned.messageId, body);
              return true;
            } catch (error) {
              if (/message is not modified/i.test(String(error?.description || error?.message))) return true;
              if (isUnsupported(error)) throw error;
              // رسالة محذوفة/غير قابلة للتعديل — نُرسل رسالة جديدة ونثبّتها
            }
          }
          const sent = await api.sendMessage(chatId, body);
          try {
            await api.pinChatMessage(chatId, sent.message_id, { disable_notification: true });
          } catch {
            // المثبّتة غير مدعومة في هذه المحادثة → نُعطّل المحوّل ونتحوّل للذاكرة
            throw Object.assign(new Error('pin unsupported'), { description: 'PIN_UNSUPPORTED' });
          }
          return true;
        };

        try {
          await write();
        } catch (error) {
          if (isUnsupported(error) || /PIN_UNSUPPORTED/.test(String(error?.description || error?.message))) {
            useFallback();
            return fallback.set(key, value, ttlSeconds);
          }
          if (/too many requests|429/i.test(String(error?.description || error?.message))) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            await write();
            return;
          }
          throw error;
        }
      });
    },

    async del(key) {
      if (disabled) return fallback.del(key);
      const chatId = chatOf(key);
      if (!chatId) return fallback.del(key);

      try {
        await this.set(key, null, 1);
      } catch {
        /* تجاهل */
      }
    },

    async ping() {
      if (disabled) return fallback.ping();
      try {
        const api = await getApi();
        await api.getMe();
        return true;
      } catch {
        return false;
      }
    },

    get disabled() {
      return disabled;
    },
  };
}

export default createTelegramAdapter;
