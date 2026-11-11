const crypto = require('node:crypto');
const { redis } = require('./db');

// Backups are encrypted before leaving the function. Keep AGENT_BACKUP_KEY stable;
// changing it without migrating the backups makes old snapshots unreadable.
const PREFIX = 'ft-panel:agent:v1:';
const HISTORY = PREFIX + 'history';
const UNDO = PREFIX + 'undo';
const LOCK = PREFIX + 'lock';
function key() {
  const secret = process.env.AGENT_BACKUP_KEY || process.env.SESSION_SECRET || '';
  if (!secret) throw new Error('مفتاح تشفير النسخ الاحتياطية غير مهيأ');
  return crypto.createHmac('sha256', secret).update('ft-panel agent backup v1').digest();
}
function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
}
function open(raw) {
  try {
    const a = JSON.parse(raw);
    if (a.v !== 1) throw new Error('unsupported backup');
    const cipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(a.iv, 'base64'));
    cipher.setAuthTag(Buffer.from(a.tag, 'base64'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(a.data, 'base64')), cipher.final()]).toString('utf8'));
  } catch { throw new Error('تعذّر فك النسخة الاحتياطية؛ تحقّق من مفتاح التشفير'); }
}
function meta(fields) {
  // Never log prompts, tool arguments, image bytes, file contents or credentials.
  return { id: String(fields.id || crypto.randomUUID()), at: Date.now(), type: String(fields.type || 'operation').slice(0, 40),
    status: String(fields.status || 'done').slice(0, 30), detail: String(fields.detail || '').slice(0, 300) };
}
async function log(fields) {
  const item = meta(fields);
  await redis().lpush(HISTORY, JSON.stringify(item));
  return item;
}
async function history(limit = 100) {
  const n = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = await redis().lrange(HISTORY, 0, n - 1);
  return rows.flatMap(raw => { try { return [JSON.parse(raw)]; } catch { return []; } });
}
async function snapshot(value, fields = {}) {
  const item = meta({ ...fields, type: fields.type || 'backup', status: fields.status || 'prepared' });
  const tx = redis().multi();
  tx.set(PREFIX + 'backup:' + item.id, seal(value));
  tx.lpush(HISTORY, JSON.stringify(item));
  const result = await tx.exec();
  if (!result || result.some(([error]) => error)) throw new Error('تعذّر حفظ النسخة الاحتياطية؛ لم تُنفّذ الكتابة');
  return item.id;
}
async function readSnapshot(id) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(id))) throw new Error('معرّف النسخة غير صالح');
  const raw = await redis().get(PREFIX + 'backup:' + id);
  if (!raw) throw new Error('النسخة الاحتياطية غير موجودة');
  return open(raw);
}
async function addUndo(item) { await redis().lpush(UNDO, JSON.stringify(item)); }
async function latestUndo() {
  const raw = await redis().lindex(UNDO, 0);
  if (!raw) return null;
  try { return { raw, item: JSON.parse(raw) }; } catch { throw new Error('سجل التراجع غير صالح'); }
}
async function popUndo(expected) {
  const changed = await redis().eval("if redis.call('LINDEX', KEYS[1], 0) == ARGV[1] then return redis.call('LPOP', KEYS[1]) else return false end", 1, UNDO, expected);
  if (!changed) throw new Error('تغيّر سجل التراجع؛ حدّث الصفحة');
}
async function locked(fn) {
  const id = crypto.randomUUID();
  if (!await redis().set(LOCK, id, 'PX', 290000, 'NX')) throw new Error('عملية أخرى قيد التنفيذ؛ حاول بعد انتهائها');
  try { return await fn(); }
  finally { await redis().eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, LOCK, id).catch(() => {}); }
}
module.exports = { PREFIX, HISTORY, UNDO, seal, open, meta, log, history, snapshot, readSnapshot, addUndo, latestUndo, popUndo, locked };
