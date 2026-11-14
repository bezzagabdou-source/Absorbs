const { redis, getJ, mgetJ, scanKeys } = require('./db');

/**
 * 📦 قراءة بيانات «اللوحة القديمة» (Redis) لتُهاجَر إلى قاعدة بيانات FT-bot.
 *
 * المصادر:
 *   contests        → prizes   (جوائز/مسابقات اللوحة القديمة)
 *   u:*             → users    (المستخدمون والنقاط والإحالات والحظر)
 *   reqs + req:<id> → requests (طلبات الجوائز)
 *   settings        → settings (نقاط الإحالة/الترحيب/التفعيل)
 *   channels        → channels (قنوات الاشتراك)
 *   stat:visits     → visits
 *
 * قراءة فقط: لا تكتب ولا تحذف أي مفتاح.
 */

const MAX_USERS = 5000;
const strip = (value) =>
  String(value == null ? '' : value)
    .replace(/\s*\([^)]*غير متوفر[^)]*\)/g, '')
    .replace(/\s*\([^)]*متوفر[^)]*\)/g, '')
    .trim();
const idOk = (id) => /^\d{1,20}$/.test(String(id || ''));

async function users() {
  const keys = await scanKeys('u:*');
  const picked = keys.filter((key) => idOk(String(key).slice(2))).slice(0, MAX_USERS);
  const rows = await mgetJ(picked);
  const out = [];
  for (const row of rows) {
    if (!row || !idOk(row.id)) continue;
    out.push({
      id: String(row.id),
      name: String(row.name || '').slice(0, 64),
      username: String(row.username || '').slice(0, 32),
      points: Math.max(0, Math.trunc(Number(row.points) || 0)),
      refs: Math.max(0, Math.trunc(Number(row.refs) || 0)),
      banned: Boolean(row.banned),
      joined: Math.trunc(Number(row.joined) || 0),
    });
  }
  return { rows: out, truncated: keys.length > picked.length, keys: keys.length };
}

async function prizes() {
  const list = await getJ('contests', []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && strip(item.title))
    .map((item, index) => ({
      id: String(item.id || '').slice(0, 64) || undefined,
      title: strip(item.title).slice(0, 100),
      emoji: String(item.emoji || '🎁').slice(0, 16),
      desc: String(item.desc || '').slice(0, 2000),
      cost: Math.max(1, Math.trunc(Number(item.cost) || 1)),
      active: item.active !== false,
      order: Math.trunc(Number(item.order) || index + 1),
    }));
}

async function requests() {
  const ids = await redis().lrange('reqs', 0, 999);
  if (!ids.length) return [];
  const rows = await mgetJ(ids.map((id) => `req:${id}`));
  return rows
    .filter((row) => row && idOk(row.uid) && strip(row.title))
    .map((row) => ({
      id: String(row.id || '').slice(0, 64) || undefined,
      uid: String(row.uid),
      title: strip(row.title).slice(0, 100),
      cost: Math.max(0, Math.trunc(Number(row.cost) || 0)),
      status: ['pending', 'approved', 'rejected'].includes(row.status) ? row.status : 'pending',
      at: Math.trunc(Number(row.done) || Number(row.at) || 0) || undefined,
    }));
}

async function channels() {
  const list = await getJ('channels', []);
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({ chat: String((item && item.chat) || item || '').trim().slice(0, 64), title: String((item && item.title) || '').slice(0, 100) }))
    .filter((item) => item.chat);
}

/** لقطة كاملة + ملخّص للعرض قبل الترحيل. */
async function snapshot() {
  const [people, items, reqs, chs, settings, visits] = await Promise.all([
    users(),
    prizes(),
    requests(),
    channels(),
    getJ('settings', {}),
    redis().get('stat:visits'),
  ]);
  const data = {
    source: 'ft-panel-legacy-v1',
    users: people.rows,
    prizes: items,
    requests: reqs,
    channels: chs,
    settings: {
      refPoints: Math.max(0, Math.min(1000, Math.trunc(Number(settings && settings.refPoints) || 0))),
      welcome: String((settings && settings.welcome) || '').slice(0, 3500),
      enabled: settings && settings.enabled !== false,
    },
    visits: Math.max(0, Math.trunc(Number(visits) || 0)),
  };
  return {
    snapshot: data,
    summary: {
      users: data.users.length,
      usersTruncated: people.truncated,
      usersKeys: people.keys,
      prizes: data.prizes.length,
      requests: data.requests.length,
      pendingRequests: data.requests.filter((row) => row.status === 'pending').length,
      channels: data.channels.length,
      visits: data.visits,
      hasSettings: Boolean((settings && (settings.refPoints || settings.welcome)) || false),
    },
  };
}

module.exports = { snapshot };
