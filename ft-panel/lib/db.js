const Redis = require('ioredis');
let r;
function redis() { if (!r) { r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 8000 }); r.on('error', () => {}); } return r; }
async function getJ(k, def = null) { const v = await redis().get(k); if (v == null) return def; try { return JSON.parse(v); } catch (e) { return def; } }
async function setJ(k, v) { await redis().set(k, JSON.stringify(v)); }
async function scanKeys(pattern) { const out = []; let cur = '0'; do { const res = await redis().scan(cur, 'MATCH', pattern, 'COUNT', 1000); cur = res[0]; out.push(...res[1]); } while (cur !== '0'); return out; }
async function mgetJ(keys) { const out = []; for (let i = 0; i < keys.length; i += 200) { const vals = await redis().mget(keys.slice(i, i + 200)); for (const v of vals) { try { out.push(JSON.parse(v)); } catch (e) {} } } return out; }
module.exports = { redis, getJ, setJ, scanKeys, mgetJ };
