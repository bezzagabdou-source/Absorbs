/* FT AI — النواة: أدوات + Redis + التخزين + الجلسات
   صفر تبعيات: node:crypto / node:net / node:tls فقط. */
import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

/* ───────── أدوات ───────── */
export const now = () => Date.now();
export const uid = (n = 12) => crypto.randomBytes(n).toString("hex");
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const int = (v, d = 0) => (Number.isFinite(+v) ? Math.trunc(+v) : d);
export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function json(res, code, body) {
  const data = JSON.stringify(body);
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(data);
}
export function text(res, code, body, type = "text/plain; charset=utf-8") {
  res.statusCode = code;
  res.setHeader("content-type", type);
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

export async function readBody(req, limit = 6 * 1024 * 1024) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

export function parseCookies(req) {
  const raw = req.headers?.cookie ?? "";
  const out = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  const h = req.headers ?? {};
  const fwd = String(h["x-forwarded-for"] ?? h["x-real-ip"] ?? "").split(",")[0].trim();
  return fwd || "0.0.0.0";
}

/* ───────── Redis (RESP) ───────── */
let conn = null;
let connUrl = "";

function encode(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const s = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
    parts.push(Buffer.from(`$${s.length}\r\n`), s, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

function parse(buffer) {
  // يعيد {value, rest} أو null إذا البيانات ناقصة
  const read = (buf, pos) => {
    if (pos >= buf.length) return null;
    const lineEnd = buf.indexOf("\r\n", pos);
    if (lineEnd < 0) return null;
    const head = buf.toString("utf8", pos, lineEnd);
    const type = head[0];
    const rest = lineEnd + 2;
    if (type === "+") return { value: head.slice(1), next: rest };
    if (type === "-") return { value: { error: head.slice(1) }, next: rest };
    if (type === ":") return { value: Number(head.slice(1)), next: rest };
    if (type === "$") {
      const len = Number(head.slice(1));
      if (len < 0) return { value: null, next: rest };
      if (buf.length < rest + len + 2) return null;
      const value = buf.toString("utf8", rest, rest + len);
      return { value, next: rest + len + 2 };
    }
    if (type === "*") {
      const n = Number(head.slice(1));
      if (n < 0) return { value: null, next: rest };
      const arr = [];
      let p = rest;
      for (let i = 0; i < n; i++) {
        const r = read(buf, p);
        if (!r) return null;
        arr.push(r.value);
        p = r.next;
      }
      return { value: arr, next: p };
    }
    return { value: null, next: rest };
  };
  const r = read(buffer, 0);
  if (!r) return null;
  return { value: r.value, rest: buffer.subarray(r.next) };
}

function openSocket(url, secure) {
  return new Promise((resolve, reject) => {
    const opts = { host: url.hostname, port: Number(url.port || (secure ? 6380 : 6379)) };
    const sock = secure ? tls.connect({ ...opts, servername: url.hostname }) : net.connect(opts);
    sock.setNoDelay?.(true);
    const onErr = (e) => { sock.destroy(); reject(e); };
    sock.setTimeout(8000, () => onErr(new Error("redis timeout")));
    sock.once("error", onErr);
    const ready = secure ? "secureConnect" : "connect";
    sock.once(ready, () => {
      sock.removeListener("error", onErr);
      sock.setTimeout(0);
      resolve(sock);
    });
  });
}

async function connect() {
  const raw = process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL || "";
  if (!raw) return null;
  if (conn && connUrl === raw) return conn;
  const url = new URL(raw);
  // مزوّدو Redis السحابيون يطلبون TLS على منفذهم المخصّص
  const cloudHost = /(\.redis\.io|upstash\.io|redislabs\.com|redis-cloud\.com)$/i.test(url.hostname);
  const schemes = url.protocol === "rediss:" ? [true] : cloudHost ? [true, false] : [false, true];

  let sock = null;
  let lastErr = null;
  for (const secure of schemes) {
    try {
      const candidate = await openSocket(url, secure);
      const built = wire(candidate);
      // مزامنة: أول ردّ لازم يكون PONG
      const pong = await Promise.race([built.send(["PING"]), new Promise((r) => setTimeout(() => r({ error: "timeout" }), 4000))]);
      if (pong !== "PONG") throw new Error(`redis no pong (${JSON.stringify(pong).slice(0, 60)})`);
      if (url.password) {
        const user = decodeURIComponent(url.username || "default");
        const pass = decodeURIComponent(url.password);
        let r = await built.send(["AUTH", user, pass]);
        if (r && typeof r === "object" && r.error) r = await built.send(["AUTH", pass]);
        if (r && typeof r === "object" && r.error) throw new Error(`redis auth: ${r.error}`);
      }
      sock = built;
      break;
    } catch (e) {
      lastErr = e;
      try { candidate?.sock?.destroy(); } catch { /* ignore */ }
    }
  }
  if (!sock) throw lastErr ?? new Error("redis connect failed");
  conn = sock;
  connUrl = raw;
  return conn;
}

/* يركّب مستمع البيانات ويعيد واجهة send واحدة */
function wire(sock) {
  let buf = Buffer.alloc(0);
  const waiters = [];
  const fail = (err) => {
    while (waiters.length) waiters.shift().reject(err);
  };
  const api = {
    sock,
    send(args) {
      return new Promise((resolve, reject) => {
        const w = { resolve, reject };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) { waiters.splice(i, 1); reject(new Error("redis timeout")); }
        }, 8000).unref?.();
        sock.write(encode(args));
      });
    },
  };
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const r = parse(buf);
      if (!r) break;
      buf = r.rest;
      const w = waiters.shift();
      if (w) w.resolve(r.value);
    }
  });
  sock.on("error", (e) => { if (conn === api) conn = null; fail(e); });
  sock.on("close", () => { if (conn === api) conn = null; fail(new Error("redis closed")); });
  sock.setNoDelay?.(true);
  sock.resume?.();
  return api;
}

export async function rc(...args) {
  try {
    const c = await connect();
    if (!c) return null;
    const r = await c.send(args);
    if (r && typeof r === "object" && r.error) throw new Error(r.error);
    return r;
  } catch (e) {
    conn = null;
    throw e;
  }
}

export const hasRedis = () =>
  Boolean(process.env.REDIS_URL || process.env.KV_URL || process.env.UPSTASH_REDIS_URL);

/* ───────── التخزين ───────── */
const STATE_KEY = "ftai:state:v2";
const IMG = (id) => `ftai:img:${id}`;

let memState = null;
let queue = Promise.resolve();

export function defaultState() {
  return {
    v: 2,
    createdAt: now(),
    password: null,
    settings: {
      botName: "مسابقات FT",
      botToken: "",
      protectionLevel: "max",
      rewardCorrect: 10,
      rewardStreak: 5,
      dailyBonus: 20,
      referralRewardNew: 30,
      referralRewardReferrer: 50,
      minAnswerMs: 700,
      cooldownMs: 1200,
      maxAnswersPer10m: 40,
      maxReferralsPerDay: 25,
      broadcastRate: 18,
      welcomeText: "مرحبا بيك في FT AI ⚡ جاوب على الأسئلة واجمع النقاط، وعيّط لأصحابك باش تربح أكثر!",
      aiPersona: "",
    },
    users: {},
    referrals: [],
    questions: [],
    uploads: [],
    ai: [],
    actions: [],
    metrics: { visits: 0, answers: 0, correct: 0, broadcasts: 0 },
    meta: { passwordChangedAt: 0, lastBroadcastAt: 0, webhookAt: 0, bootAt: 0, updatesTotal: 0, updates: [] },
  };
}

let memAt = 0;
const MEM_TTL = 1200; // ملّي ثانية: تمنع قراءة قديمة بين نسخ الدوال على Vercel

export async function readState({ fresh = false } = {}) {
  if (memState && !fresh && now() - memAt < MEM_TTL) return memState;
  let s = null;
  try {
    const raw = await rc("GET", STATE_KEY);
    if (raw) s = JSON.parse(raw);
  } catch { /* بلا Redis: ذاكرة */ }
  if (!s) s = defaultState();
  const base = defaultState();
  s.settings = { ...base.settings, ...(s.settings || {}) };
  // ترقية: أي اسم قديم للبوت يتحوّل لاسم FT (بلا أي براند قديم)
  if (!s.settings.botName || /برق|barq/i.test(s.settings.botName)) s.settings.botName = base.settings.botName;
  if (typeof s.settings.botToken !== "string") s.settings.botToken = "";
  s.metrics = { ...base.metrics, ...(s.metrics || {}) };
  s.meta = { ...base.meta, ...(s.meta || {}) };
  if (!Array.isArray(s.referrals)) s.referrals = [];
  if (!Array.isArray(s.questions)) s.questions = [];
  if (!Array.isArray(s.uploads)) s.uploads = [];
  if (!Array.isArray(s.ai)) s.ai = [];
  if (!Array.isArray(s.actions)) s.actions = [];
  if (!s.users || typeof s.users !== "object") s.users = {};
  memState = s;
  memAt = now();
  return s;
}

/** قراءة موثوقة للتحقّق من الجلسات (بلا كاش) */
export const readStateFresh = () => readState({ fresh: true });

export async function writeState(s) {
  memState = s;
  memAt = now();
  try {
    await rc("SET", STATE_KEY, JSON.stringify(s));
  } catch { /* نحتفظ بالنسخة في الذاكرة */ }
  return s;
}

export async function updateState(fn) {
  const run = async () => {
    const s = await readState({ fresh: true });
    const out = await fn(s);
    await writeState(s);
    return out;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export async function putImage(id, obj) {
  memImages.set(id, obj);
  try { await rc("SET", IMG(id), JSON.stringify(obj), "EX", 60 * 60 * 24 * 30); } catch { /* mem */ }
}
export async function getImage(id) {
  if (memImages.has(id)) return memImages.get(id);
  try {
    const raw = await rc("GET", IMG(id));
    if (raw) {
      const o = JSON.parse(raw);
      memImages.set(id, o);
      return o;
    }
  } catch { /* mem */ }
  return null;
}
export async function delImage(id) {
  memImages.delete(id);
  try { await rc("DEL", IMG(id)); } catch { /* mem */ }
}
const memImages = new Map();

/* ───────── كلمات السر ───────── */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [tag, salt, key] = String(stored).split("$");
  if (tag !== "scrypt" || !salt || !key) return false;
  const got = crypto.scryptSync(String(pw), salt, 64);
  const want = Buffer.from(key, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
export function passwordProblem(pw) {
  const s = String(pw ?? "");
  if (s.length < 8) return "كلمة السر لازم 8 حروف ولا أكثر";
  if (!/[0-9]/.test(s)) return "لازم تحتوي على رقم واحد على الأقل";
  return null;
}

/* ───────── الجلسات (مخزّنة في Redis — بلا اعتماد على ذاكرة النسخة) ───────── */
export const COOKIE = "ftai_sess";
const TTL_MS = 1000 * 60 * 60 * 12;
const SESSION_KEY = (sid) => `ftai:sess:${sid}`;
const SESSION_INDEX = "ftai:sess:index";

export function secret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.BOT_TOKEN || "ftai-dev-secret";
  return crypto.createHash("sha256").update(`ftai|${base}`).digest();
}

function b64(buf) { return Buffer.from(buf).toString("base64url"); }

/** توقيع بسيط (احتياطي عندما لا يوجد Redis) */
export function signSession(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = b64(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
  return `${body}.${sig}`;
}

const memSessions = new Map();

/** تفتح جلسة جديدة وتخزّنها (Redis) — الكوكي يحمل المعرّف فقط */
export async function openSession(req) {
  const sid = crypto.randomBytes(24).toString("hex");
  const exp = now() + TTL_MS;
  const rec = { exp, ip: clientIp(req).slice(0, 24), at: now() };
  memSessions.set(sid, rec);
  try {
    await rc("SET", SESSION_KEY(sid), JSON.stringify(rec), "PX", TTL_MS);
    await rc("SADD", SESSION_INDEX, sid);
  } catch { /* ذاكرة */ }
  return sid;
}

/** تحقّق: معرّف موجود في Redis وغير منتهي */
export async function verifySession(token) {
  if (!token) return null;
  // جلسة مخزّنة
  const sid = String(token);
  if (/^[a-f0-9]{32,64}$/.test(sid)) {
    let rec = memSessions.get(sid) ?? null;
    try {
      const raw = await rc("GET", SESSION_KEY(sid));
      if (raw) rec = JSON.parse(raw);
    } catch { /* بلا Redis: ذاكرة */ }
    if (!rec || rec.exp < now()) return null;
    return { sid, ...rec };
  }
  // احتياطي: توقيع HMAC (توكنات قديمة)
  if (!sid.includes(".")) return null;
  const [body, sig] = sid.split(".");
  const want = b64(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
  if (sig !== want) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p && p.exp > now() ? p : null;
  } catch { return null; }
}

export async function closeSession(token) {
  const sid = String(token ?? "");
  memSessions.delete(sid);
  try {
    await rc("DEL", SESSION_KEY(sid));
    await rc("SREM", SESSION_INDEX, sid);
  } catch { /* ignore */ }
}

/** بعد تغيير كلمة السر: اقطع كل الجلسات إلا الحالية */
export async function purgeSessions(keepSid = null) {
  for (const sid of [...memSessions.keys()]) if (sid !== keepSid) memSessions.delete(sid);
  let listed = null;
  try {
    const members = await rc("SMEMBERS", SESSION_INDEX);
    if (Array.isArray(members)) listed = members;
  } catch { /* لا فهرس */ }
  if (!listed) {
    // احتياط: SCAN
    try {
      const out = await rc("SCAN", "0", "MATCH", "ftai:sess:*", "COUNT", 500);
      if (Array.isArray(out) && Array.isArray(out[1])) {
        listed = out[1].map((k) => String(k).split("ftai:sess:").pop()).filter(Boolean);
      }
    } catch { /* بلا */ }
  }
  for (const sid of listed ?? []) {
    if (!sid || sid === keepSid || sid === "index") continue;
    try {
      await rc("DEL", SESSION_KEY(sid));
      await rc("SREM", SESSION_INDEX, sid);
    } catch { /* ignore */ }
  }
}

export function sessionCookie(token, secure = true) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL_MS / 1000)}${secure ? "; Secure" : ""}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function requireAuth(req, res) {
  const token = parseCookies(req)[COOKIE];
  const sess = await verifySession(token);
  if (!sess) {
    json(res, 401, {
      ok: false,
      error: "الجلسة انتهت ولا ماشي موجودة — عاود ادخل بكلمة السر",
      code: "session",
    });
    return null;
  }
  const state = await readStateFresh();
  await ensurePassword(state);
  return state;
}

/** كلمة السر الأولى: من متغيّر البيئة، وإلا تُنشأ واحدة */
export async function ensurePassword(state) {
  if (state.password?.hash) return state;
  const envPw = process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD || process.env.PANEL_PASSWORD;
  if (!envPw) return state;
  state.password = { hash: hashPassword(envPw), version: 1, changedAt: now(), seeded: true };
  state.meta.passwordChangedAt = now();
  await writeState(state);
  return state;
}

/* حدّ المحاولات */
export async function loginAllowed(ip) {
  const key = `ftai:rl:${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
  try {
    const n = Number(await rc("INCR", key));
    if (n === 1) await rc("EXPIRE", key, 300);
    return n <= 12;
  } catch {
    const t = rlMem.get(key) ?? { n: 0, at: now() };
    if (now() - t.at > 300000) { t.n = 0; t.at = now(); }
    t.n += 1;
    rlMem.set(key, t);
    return t.n <= 12;
  }
}
const rlMem = new Map();

/* سجلّ الأعمال */
export function recordAction(state, entry) {
  state.actions.unshift({ at: now(), ...entry });
  if (state.actions.length > 200) state.actions.length = 200;
}
