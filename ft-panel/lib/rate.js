const crypto = require('node:crypto');
const { redis } = require('./db');

function clientId(req) {
  // Vercel supplies x-real-ip. Use the socket address outside Vercel, not an arbitrary user-supplied header.
  const ip = process.env.VERCEL ? (req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown') : (req.socket?.remoteAddress || 'unknown');
  return crypto.createHash('sha256').update(String(ip).slice(0, 200)).digest('hex');
}
async function checkLimit(scope, id, max, seconds) {
  const key = `ft-panel:rate:${scope}:${id}`;
  const result = await redis().eval(`
    local n = redis.call('INCR', KEYS[1])
    if n == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return {n, redis.call('TTL', KEYS[1])}
  `, 1, key, seconds);
  return { allowed: Number(result[0]) <= max, retryAfter: Math.max(1, Number(result[1]) || seconds) };
}
async function allow(req, login) {
  const id = clientId(req);
  const general = await checkLimit('api', id, 120, 60);
  if (!general.allowed || !login) return general;
  return checkLimit('login', id, 8, 15 * 60);
}
module.exports = { allow, checkLimit };
