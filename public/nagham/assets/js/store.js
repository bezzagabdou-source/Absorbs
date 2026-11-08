/* =====================================================================
   نغم — store.js · التخزين المحلي (IndexedDB + localStorage)
   المفضّلة، قوائم التشغيل، التحميلات بلا إنترنت، سجل الاستماع، وكاش الـ API.
   ===================================================================== */
import { ls, bus, uid } from './core.js';

const DB_NAME = 'nagham-db';
const DB_VER = 1;
const STORES = ['likes', 'playlists', 'downloads', 'recent', 'cache'];

/* IndexedDB هو الأساس؛ وإن كان محجوبًا (وضع التصفح الخواص، متصفح قديم،
   صلاحيات معطّلة) نسقط تلقائيًا إلى نسخة JSON في localStorage فلا تنكسر
   المفضّلة ولا قوائم التشغيل. */
let dbp = null;
let degraded = false;
export const isDegraded = () => degraded;

function db() {
  if (degraded) return Promise.reject(new Error('IndexedDB معطّل'));
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window) || !window.indexedDB) return reject(new Error('no indexedDB'));
    let r;
    try { r = window.indexedDB.open(DB_NAME, DB_VER); } catch (e) { return reject(e); }
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('db error'));
    r.onblocked = () => reject(new Error('db blocked'));
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error || new Error('tx error'));
    t.onabort = () => reject(t.error || new Error('aborted'));
  });
}

/* ------------------------------ النسخة الاحتياطية ------------------------------ */
const tbl = (s) => `nagham:tbl:${s}`;
const read = (s) => { try { return JSON.parse(localStorage.getItem(tbl(s)) || '{}'); } catch { return {}; } };
const write = (s, m) => { try { localStorage.setItem(tbl(s), JSON.stringify(m)); return true; } catch { return false; } };
const lsDb = {
  get: (s, k) => { const v = read(s)[k]; return v === undefined ? null : v; },
  all: (s) => Object.values(read(s)),
  keys: (s) => Object.keys(read(s)),
  set: (s, k, v) => { const m = read(s); m[k] = v; return write(s, m); },
  del: (s, k) => { const m = read(s); delete m[k]; return write(s, m); },
  clear: (s) => write(s, {}),
  count: (s) => Object.keys(read(s)).length,
};

async function run(store, mode, idbOp, lsOp) {
  if (!degraded) {
    try { return await idbOp(); } catch (e) {
      degraded = true;
      console.info('[store] IndexedDB غير متاح، نحوّل إلى localStorage:', e?.message || e);
    }
  }
  try { return lsOp(); } catch (e) { console.warn('[store] التخزين المحلي فشل', e); return mode === 'readonly' ? null : false; }
}

export const idb = {
  get: (s, k) => run(s, 'readonly', () => tx(s, 'readonly', (o) => o.get(k)), () => lsDb.get(s, k)),
  all: (s) => run(s, 'readonly', () => tx(s, 'readonly', (o) => o.getAll()), () => lsDb.all(s)),
  keys: (s) => run(s, 'readonly', () => tx(s, 'readonly', (o) => o.getAllKeys()), () => lsDb.keys(s)),
  set: (s, k, v) => run(s, 'readwrite', () => tx(s, 'readwrite', (o) => o.put(v, k)), () => lsDb.set(s, k, v)),
  del: (s, k) => run(s, 'readwrite', () => tx(s, 'readwrite', (o) => o.delete(k)), () => lsDb.del(s, k)),
  clear: (s) => run(s, 'readwrite', () => tx(s, 'readwrite', (o) => o.clear()), () => lsDb.clear(s)),
  count: (s) => run(s, 'readonly', () => tx(s, 'readonly', (o) => o.count()), () => lsDb.count(s)),
};

/* ------------------------------ API responses cache ------------------------------ */
export async function cached(key, ttlMs, loader) {
  let hit = null;
  try { hit = await idb.get('cache', key); } catch {}
  if (hit && Date.now() - hit.at < ttlMs) return hit.val;
  const val = await loader();
  /* في الوضع الاحتياطي (localStorage) لا نملأ الكاش — حجمه أكبر من الحصة المسموحة */
  if (val && !degraded && (!Array.isArray(val) || val.length)) {
    try { await idb.set('cache', key, { at: Date.now(), val }); } catch {}
  }
  return val ?? (hit ? hit.val : []);
}

export async function cachePeek(key, maxAgeMs = 86_400_000) {
  try {
    const hit = await idb.get('cache', key);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.val;
  } catch {}
  return null;
}

/* --------------------------------- likes --------------------------------- */
export async function listLikes() {
  const all = (await idb.all('likes').catch(() => [])) || [];
  return all.sort((a, b) => (b.at || 0) - (a.at || 0)).map((x) => x.track);
}
export async function likeMap() {
  const all = (await idb.all('likes').catch(() => [])) || [];
  const m = new Map();
  for (const x of all) m.set(x.track.id, x.at);
  return m;
}
export const isLiked = async (id) => !!(await idb.get('likes', id).catch(() => null));
export async function toggleLike(track) {
  const existing = await idb.get('likes', track.id).catch(() => null);
  if (existing) { await idb.del('likes', track.id); bus.emit('likes'); return false; }
  await idb.set('likes', track.id, { track, at: Date.now() });
  bus.emit('likes');
  return true;
}

/* -------------------------------- recent -------------------------------- */
export async function listRecent(limit = 40) {
  const all = (await idb.all('recent').catch(() => [])) || [];
  return all.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, limit).map((x) => ({ ...x.track, resumeAt: x.pos || 0 }));
}
export async function saveRecent(track, pos = 0) {
  if (!track?.id) return;
  try { await idb.set('recent', track.id, { track, at: Date.now(), pos }); } catch {}
  bus.emit('recent');
}

/* ------------------------------- playlists ------------------------------- */
export async function listPlaylists() {
  const all = (await idb.all('playlists').catch(() => [])) || [];
  return all
    .map((p) => ({ id: p.id, name: p.name, at: p.at || 0, cover: p.cover || null, tracks: p.tracks || [] }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function createPlaylist(name, tracks = []) {
  const p = { id: uid('pl'), name: name?.trim() || 'قائمة تشغيل', at: Date.now(), cover: tracks[0]?.art || null, tracks };
  await idb.set('playlists', p.id, p);
  bus.emit('playlists');
  return p;
}
export async function updatePlaylist(id, patch) {
  const p = await idb.get('playlists', id);
  if (!p) return null;
  const next = { ...p, ...patch, at: Date.now() };
  await idb.set('playlists', id, next);
  bus.emit('playlists');
  return next;
}
export async function deletePlaylist(id) { await idb.del('playlists', id); bus.emit('playlists'); }
export async function addToPlaylist(id, track) {
  const p = await idb.get('playlists', id);
  if (!p) return null;
  const tracks = [track, ...(p.tracks || [])].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  return updatePlaylist(id, { tracks, cover: p.cover || track.art || null });
}
export async function removeFromPlaylist(id, trackId) {
  const p = await idb.get('playlists', id);
  if (!p) return null;
  return updatePlaylist(id, { tracks: (p.tracks || []).filter((t) => t.id !== trackId) });
}

/* -------------------------------- downloads --------------------------------
   تُخزَّن ملفّات Audius فقط (بث كامل مرخّص من أصحابه) كي تعمل الأغاني في
   الطائرة أو عند انقطاع الشبكة. المعاينات القصيرة لا تُحمَّل.            */
export async function listDownloads() {
  const keys = (await idb.keys('downloads').catch(() => [])) || [];
  const out = [];
  for (const k of keys) {
    const rec = await idb.get('downloads', k).catch(() => null);
    if (rec) out.push({ ...rec.track, bytes: rec.bytes, at: rec.at, blobKey: k });
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export const downloadIds = async () => new Set((await idb.keys('downloads').catch(() => [])) || []);

export async function saveDownload(track, blob) {
  if (degraded) throw new Error('الحفظ بلا إنترنت يحتاج IndexedDB (غير متاح في هذا الوضع)');
  const rec = { track, blob, bytes: blob.size, at: Date.now() };
  await idb.set('downloads', track.id, rec);
  bus.emit('downloads');
  return rec;
}
export async function removeDownload(id) { await idb.del('downloads', id); bus.emit('downloads'); }
export async function getDownload(id) { return idb.get('downloads', id).catch(() => null); }

export async function storageInfo() {
  let usage = null;
  try { if (navigator.storage?.estimate) usage = (await navigator.storage.estimate()).usage ?? null; } catch {}
  let files = 0, bytes = 0;
  try {
    const keys = (await idb.keys('downloads').catch(() => [])) || [];
    files = keys.length;
    for (const k of keys) {
      const rec = await idb.get('downloads', k).catch(() => null);
      if (rec?.bytes) bytes += rec.bytes;
    }
  } catch {}
  return { usage, files, bytes, favs: (await idb.count('likes').catch(() => 0)) || 0 };
}

export async function clearAllData({ keepPrefs = true } = {}) {
  for (const s of STORES) await idb.clear(s).catch(() => {});
  if (!keepPrefs) { Object.keys(localStorage).filter((k) => k.startsWith('nagham:')).forEach((k) => localStorage.removeItem(k)); }
  bus.emit('playlists'); bus.emit('likes'); bus.emit('downloads');
}

/* ----------------------------- export / import ----------------------------- */
export async function exportData() {
  const [likes, playlists, recent] = await Promise.all([idb.all('likes'), idb.all('playlists'), idb.all('recent')]);
  return {
    app: 'nagham', version: 1, at: new Date().toISOString(),
    settings: ls.get('settings', {}),
    likes: (likes || []).map((x) => x.track),
    playlists: playlists || [],
    recent: (recent || []).map((x) => ({ id: x.track?.id, title: x.track?.title, at: x.at, pos: x.pos })),
  };
}
export async function importData(obj) {
  if (!obj || obj.app !== 'nagham') throw new Error('ملف غير صالح');
  if (obj.settings) { ls.set('settings', { ...ls.get('settings', {}), ...obj.settings }); }
  for (const tr of obj.likes || []) await idb.set('likes', tr.id, { track: tr, at: Date.now() }).catch(() => {});
  for (const p of obj.playlists || []) await idb.set('playlists', p.id, p).catch(() => {});
  bus.emit('likes'); bus.emit('playlists');
  return true;
}
