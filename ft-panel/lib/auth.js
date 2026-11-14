const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { redis } = require('./db');

const scrypt = promisify(crypto.scrypt);
const KEY = 'ft-panel:credentials:v1';
const MAX_AGE = 7 * 864e5;

function equal(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function sessionSecret() {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) throw new Error('SESSION_SECRET غير مهيأ');
  return secret;
}
async function credentials() {
  const raw = await redis().get(KEY);
  if (raw === null) return { raw: null, value: null };
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('تعذر قراءة إعدادات الدخول'); }
  if (!value || value.v !== 1 || !/^[a-f0-9]{32}$/.test(value.salt || '') || !/^[a-f0-9]{128}$/.test(value.hash || '') || !/^[a-f0-9]{32}$/.test(value.version || '')) {
    throw new Error('تعذر قراءة إعدادات الدخول');
  }
  return { raw, value };
}
async function verifyPassword(input, current) {
  input = String(input || '');
  if (!input || input.length > 256) return false;
  if (current.value) {
    const derived = await scrypt(input, Buffer.from(current.value.salt, 'hex'), 64);
    return crypto.timingSafeEqual(derived, Buffer.from(current.value.hash, 'hex'));
  }
  const password = process.env.ADMIN_PASSWORD || '';
  return !!password && equal(input, password);
}
function signature(exp, version) {
  // Old sessions remain valid until the administrator actually changes the password.
  const value = version ? `${exp}.${version}` : String(exp);
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}
function makeToken(version) {
  const exp = Date.now() + MAX_AGE;
  return `${exp}.${signature(exp, version)}`;
}
function tokenValid(token, version) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !/^\d{12,16}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const exp = Number(parts[0]);
  if (!Number.isSafeInteger(exp) || exp <= Date.now() || exp > Date.now() + MAX_AGE + 60_000) return false;
  return equal(signature(parts[0], version), parts[1]);
}
async function login(password) {
  const current = await credentials();
  if (!(await verifyPassword(password, current))) return null;
  return makeToken(current.value?.version);
}
async function authorize(token) {
  const current = await credentials();
  return tokenValid(token, current.value?.version);
}
async function changePassword(oldPassword, newPassword) {
  const current = await credentials();
  if (!(await verifyPassword(oldPassword, current))) throw new Error('كلمة السر الحالية غير صحيحة');
  const next = String(newPassword || '');
  if (next.length < 10 || next.length > 256) throw new Error('كلمة السر الجديدة يجب أن تكون من 10 إلى 256 حرفاً');
  if (equal(oldPassword, next)) throw new Error('اختر كلمة سر جديدة مختلفة');
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(next, salt, 64);
  const value = { v: 1, salt: salt.toString('hex'), hash: hash.toString('hex'), version: crypto.randomBytes(16).toString('hex') };
  // Compare-and-set prevents two simultaneous changes from silently overwriting each other.
  const changed = await redis().eval(`
    local current = redis.call('GET', KEYS[1])
    if ARGV[1] == 'absent' then
      if current then return 0 end
    elseif current ~= ARGV[2] then return 0 end
    redis.call('SET', KEYS[1], ARGV[3])
    return 1
  `, 1, KEY, current.raw === null ? 'absent' : 'present', current.raw || '', JSON.stringify(value));
  if (Number(changed) !== 1) throw new Error('تغيّرت كلمة السر في جلسة أخرى، حاول من جديد');
  return makeToken(value.version);
}
module.exports = { login, authorize, changePassword };
