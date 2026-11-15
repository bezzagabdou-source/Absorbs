const { redis } = require('./db');
const audit = require('./agentAudit');

const KEY = 'ft-panel:agent:owner-instructions:v1';
async function get() {
  const raw = await redis().get(KEY);
  if (!raw) return { text: '', updatedAt: null };
  let value;
  // نسخة محفوظة بمفتاح تشفير قديم لا يجب أن توقف المساعد: نتجاهلها ونبدأ بتعليمات فارغة.
  try { value = audit.open(raw); } catch { return { text: '', updatedAt: null, unreadable: true }; }
  return { text: typeof value.text === 'string' ? value.text : '', updatedAt: value.updatedAt || null };
}
async function save(text) {
  if (typeof text !== 'string' || text.length > 12000) throw new Error('التعليمات يجب أن تكون نصاً لا يتجاوز 12000 حرف');
  const value = { text: text.trim(), updatedAt: Date.now() };
  await redis().set(KEY, audit.seal(value));
  await audit.log({ type: 'owner_instructions', status: 'updated', detail: 'تعليمات المساعد' }).catch(() => {});
  return value;
}
module.exports = { get, save };
