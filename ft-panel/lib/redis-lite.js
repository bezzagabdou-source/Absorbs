'use strict';
/**
 * 🔌 عميل Redis بسيط فوق TCP (RESP2) — بلا اعتماديات.
 *
 * علاش: عندنا `redis://...` (Redis حقيقي) ماشي Upstash REST. `ioredis` ماشي
 * مثبّت فـ package.json، و`fetch` ما كيهدرش مع بروتوكول Redis. هاد الملف كيعطي
 * بالضبط الدوال اللي كتستعملها اللوحة: get/set/del/mget/eval/lpush/lrange/
 * lindex/scan/multi — بترميز/فك ترميز RESP، إعادة اتصال تلقائية، وطابور أوامر
 * باش ما يتلخبطش الردّ.
 */
const net = require('node:net');
const tls = require('node:tls');

const CONNECT_TIMEOUT = 8000;
const COMMAND_TIMEOUT = 8000;

function encode(args) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const s = String(arg);
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
  }
  return parts.join('');
}

/** محلّل RESP2 تراكمي: كيرجّع {value, rest} أو null إلا ما كملش */
function parse(buffer) {
  if (!buffer.length) return null;
  const type = String.fromCharCode(buffer[0]);
  const nl = buffer.indexOf('\r\n');
  if (nl === -1) return null;
  const line = buffer.subarray(1, nl).toString();
  const rest = buffer.subarray(nl + 2);
  if (type === '+') return { value: line, rest };
  if (type === '-') {
    const error = new Error(line);
    error.redis = true;
    return { value: error, rest };
  }
  if (type === ':') return { value: Number(line), rest };
  if (type === '$') {
    const len = Number(line);
    if (len === -1) return { value: null, rest };
    if (rest.length < len + 2) return null;
    return { value: rest.subarray(0, len).toString(), rest: rest.subarray(len + 2) };
  }
  if (type === '*') {
    const count = Number(line);
    if (count === -1) return { value: null, rest };
    let cursor = rest;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const next = parse(cursor);
      if (!next) return null; // ما كملش — نستنّو باقي البيانات
      out.push(next.value);
      cursor = next.rest;
    }
    return { value: out, rest: cursor };
  }
  return { value: line, rest };
}

class RedisClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.socket = null;
    this.connecting = null;
    this.buffer = Buffer.alloc(0);
    this.queue = [];
    this.closed = false;
    this.listeners = { error: [], ready: [] };
    const parsed = new URL(url);
    this.host = parsed.hostname;
    this.port = Number(parsed.port || 6379);
    this.username = parsed.username ? decodeURIComponent(parsed.username) : '';
    this.password = parsed.password ? decodeURIComponent(parsed.password) : '';
    this.secure = parsed.protocol === 'rediss:';
    this.db = Number((parsed.pathname || '/0').slice(1) || 0);
  }

  on(event, handler) {
    (this.listeners[event] || (this.listeners[event] = [])).push(handler);
    return this;
  }

  emit(event, payload) {
    for (const handler of this.listeners[event] || []) {
      try { handler(payload); } catch { /* المستمع ما خاصوش يطيّح الاتصال */ }
    }
  }

  connect() {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = this.secure
        ? tls.connect({ host: this.host, port: this.port, servername: this.host, timeout: CONNECT_TIMEOUT })
        : net.connect({ host: this.host, port: this.port, timeout: CONNECT_TIMEOUT });
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        socket.destroy();
        this.emit('error', error);
        reject(error);
      };
      const ready = async () => {
        if (settled) return;
        try {
          if (this.password) {
            const args = this.username ? ['AUTH', this.username, this.password] : ['AUTH', this.password];
            const reply = await this.send(args);
            if (reply instanceof Error) throw reply;
          }
          if (this.db) {
            const reply = await this.send(['SELECT', this.db]);
            if (reply instanceof Error) throw reply;
          }
          settled = true;
          this.connecting = null;
          this.emit('ready');
          resolve();
        } catch (error) {
          fail(error);
        }
      };
      socket.once(this.secure ? 'secureConnect' : 'connect', ready);
      socket.on('data', (chunk) => this.onData(chunk));
      socket.on('error', (error) => {
        this.emit('error', error);
        this.rejectAll(error);
        if (!settled) fail(error);
      });
      socket.on('close', () => {
        this.socket = null;
        this.connecting = null;
        this.rejectAll(new Error('انقطع الاتصال بـ Redis'));
        if (!this.closed) {
          // إعادة اتصال هادئة بعد ثانية
          setTimeout(() => { this.connect().catch(() => {}); }, 1000).unref?.();
        }
      });
      socket.setNoDelay(true);
      this.socket = socket;
    });
    return this.connecting;
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = parse(this.buffer);
      if (!parsed) break;
      this.buffer = parsed.rest;
      const pending = this.queue.shift();
      if (!pending) continue;
      clearTimeout(pending.timer);
      if (parsed.value instanceof Error) pending.reject(parsed.value);
      else pending.resolve(parsed.value);
    }
  }

  rejectAll(error) {
    while (this.queue.length) {
      const pending = this.queue.shift();
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  async send(args) {
    await this.connect();
    const socket = this.socket;
    if (!socket || socket.destroyed) throw new Error('الاتصال بـ Redis غير متاح');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`مهلة Redis (${args[0]})`));
      }, this.options.commandTimeout || COMMAND_TIMEOUT);
      this.queue.push({ resolve, reject, timer });
      socket.write(encode(args));
    });
  }

  quit() {
    this.closed = true;
    this.socket?.destroy();
  }

  /* ─── الواجهة المستعملة ─── */
  get(key) { return this.send(['GET', key]); }
  mget(...keys) { return this.send(['MGET', ...keys.flat()]); }
  del(...keys) { return this.send(['DEL', ...keys.flat()]); }
  lindex(key, index) { return this.send(['LINDEX', key, index]); }
  lrange(key, start, stop) { return this.send(['LRANGE', key, start, stop]); }
  lpush(key, ...values) { return this.send(['LPUSH', key, ...values.flat()]); }
  ping() { return this.send(['PING']); }

  set(key, value, ...rest) {
    // ioredis: set(k,v,'EX',3600,'NX') → SET k v EX 3600 NX
    const args = ['SET', key, value];
    for (let i = 0; i < rest.length; i += 1) {
      const item = rest[i];
      if (item == null) continue;
      if (typeof item === 'number') { args.push(item); continue; }
      args.push(String(item));
    }
    return this.send(args);
  }

  eval(script, numKeys, ...args) {
    return this.send(['EVAL', script, numKeys, ...args]);
  }

  scan(cursor, ...args) {
    return this.send(['SCAN', cursor, ...args]);
  }

  /** multi() كيتنفّذ كسلسلة أوامر داخل MULTI/EXEC */
  multi() {
    const client = this;
    const ops = [];
    const builder = {
      set: (k, v, ...rest) => { ops.push(['SET', k, v, ...rest.filter((x) => x != null)]); return builder; },
      del: (...keys) => { ops.push(['DEL', ...keys.flat()]); return builder; },
      lpush: (k, ...vals) => { ops.push(['LPUSH', k, ...vals.flat()]); return builder; },
      exec: async () => {
        const results = [];
        const begin = await client.send(['MULTI']);
        void begin;
        for (const op of ops) results.push(await client.send(op));
        await client.send(['EXEC']);
        return results;
      },
    };
    return builder;
  }
}

const pool = new Map();

function createRedis(url, options) {
  if (!url) throw new Error('REDIS_URL غير مهيّأ');
  const key = `${url}|${JSON.stringify(options || {})}`;
  if (pool.has(key)) return pool.get(key);
  const client = new RedisClient(url, options);
  client.on('error', () => { /* الأخطاء كتوصل عبر الوعود */ });
  pool.set(key, client);
  return client;
}

module.exports = { createRedis, RedisClient };
