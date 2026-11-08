/* =====================================================================
   نغم — api.js · طبقة المصادر (موسيقى كاملة + معاينات + إذاعات)
   كل المصادر مجانية وقانونية:
   • Audius  → أعمال منشورة من الفنانين أنفسهم ببث كامل مجاني (CORS مفتوح)
   • iTunes  → معاينات 30 ثانية رسمية من أبل للأغاني الشهيرة
   • Radio Browser → بث الإذاعات الحية (مكتبة مفتوحة)
   التطبيق لا يهرّب أي محتوى محمي: روابط البث تأتي من مزودها الأصلي.
   ===================================================================== */
import { fetchJSON, fetchJSONOrJsonp, jsonp } from './core.js';
import { cached } from './store.js';

const AUDIUS = 'https://api.audius.co/v1';
const APP = 'nagham-web';
const RADIO_HOSTS = ['de1', 'nl1', 'fi1', 'at1', 'es1'].map((h) => `https://${h}.api.radio-browser.info`);

export const GENRES = [
  { name: 'Electronic', ar: 'إلكتروني', hue: '#22d3ee' },
  { name: 'Pop', ar: 'بوب', hue: '#f472b6' },
  { name: 'Hip hop', ar: 'هيب هوب', hue: '#f59e0b' },
  { name: 'RnB and soul', ar: 'آر آند بي', hue: '#a78bfa' },
  { name: 'Jazz', ar: 'جاز', hue: '#60a5fa' },
  { name: 'Rock', ar: 'روك', hue: '#ef4444' },
  { name: 'Ambient', ar: 'هدوئي', hue: '#34d399' },
  { name: 'Classical', ar: 'كلاسيك', hue: '#e2e8f0' },
];

/** الموضوعات العربية التي تُبنى منها أرفف المكتبة (بحث iTunes، نتائج رسمية). */
export const TOPICS = [
  { q: 'rai', ar: 'وهراني · راي', hue: '#f97316' },
  { q: 'chaabi algérien', ar: 'شعلالي', hue: '#14b8a6' },
  { q: 'algarian rap', ar: 'راب جزائري', hue: '#8b5cf6' },
  { q: 'andalou', ar: 'أندلسي', hue: '#0ea5e9' },
  { q: 'diwan', ar: 'ديوان', hue: '#ef4444' },
  { q: 'souf music', ar: 'سوني', hue: '#22c55e' },
  { q: 'tnaoui', ar: 'تقناوي', hue: '#eab308' },
  { q: 'ouled el hawat', ar: 'أولاد الهواوي', hue: '#ec4899' },
  { q: 'cheb', ar: 'شباب', hue: '#06b6d4' },
  { q: 'raï 90s', ar: 'راي التسعينات', hue: '#a855f7' },
  { q: 'algerian wedding', ar: 'أعراس', hue: '#f43f5e' },
  { q: 'oriental pop', ar: 'شرقي بوب', hue: '#84cc16' },
];

/* ------------------------------- normalizers ------------------------------ */
function originOf(u) { try { return new URL(u).origin; } catch { return ''; } }

function audiusStream(t) {
  const main = t.stream?.url || null;
  const mirrors = [];
  const cands = [...(t.stream?.mirrors || []), ...(t.artwork?.mirrors || [])];
  if (main) {
    let path = '';
    try { const x = new URL(main); path = x.pathname + x.search; } catch {}
    for (const m of cands) {
      if (!path) break;
      const o = m.startsWith('http') ? m : `https://${m}`;
      if (originOf(o) && originOf(o) !== originOf(main)) mirrors.push(o.replace(/\/$/, '') + path);
    }
  }
  return { main, mirrors };
}

function normAudius(t) {
  const { main, mirrors } = audiusStream(t);
  const art = t.artwork?.['480x480'] || t.artwork?.['150x150'] || t.user?.profile_picture?.['480x480'] || null;
  return {
    id: `aud:${t.id}`,
    src: 'audius',
    title: (t.title || '').trim() || 'بدون عنوان',
    artist: t.user?.name || t.user?.handle || 'فنان غير معروف',
    artistHandle: t.user?.handle || '',
    album: '',
    art,
    url: main,
    mirrors,
    cid: t.track_cid || '',
    dur: Math.round(t.duration || 0),
    full: !!main,
    live: false,
    plays: t.play_count || 0,
    likes: t.favorite_count || 0,
    genre: t.genre || '',
    mood: t.mood || '',
    year: t.release_date ? new Date(t.release_date).getFullYear() : null,
    link: `https://audius.co/${t.user?.handle || ''}/${t.slug || ''}-${t.id}`,
    externalId: t.id,
    streamable: t.is_streamable !== false,
    downloadable: true,
  };
}

function normItunes(r) {
  const art = (r.artworkUrl100 || '').replace('/100x100bb.jpg', '/600x600bb.jpg') || null;
  const url = r.previewUrl || null;
  return {
    id: `itn:${r.trackId}`,
    src: 'itunes',
    title: r.trackName || '',
    artist: r.artistName || '',
    album: r.collectionName || '',
    art,
    url,
    mirrors: url ? [url.replace(/^https:/, 'http:')] : [],
    dur: 30,                                  /* المعاينة الرسمية 30 ثانية */
    fullDur: Math.round((r.trackTimeMillis || 0) / 1000),
    full: false,
    live: false,
    preview: true,
    genre: r.primaryGenreName || '',
    year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
    explicit: r.trackExplicitness === 'explicit',
    link: r.trackViewUrl || r.collectionViewUrl || '',
    externalId: r.trackId,
    downloadable: false,
  };
}

function normStation(s) {
  const url = s.url_resolved || s.url;
  return {
    id: `rad:${s.stationuuid}`,
    src: 'radio',
    title: (s.name || '').replace(/\s+/g, ' ').trim(),
    artist: [s.state && s.state.trim(), s.codec && `${String(s.codec).toUpperCase()}${s.bitrate ? ' · ' + s.bitrate : ''}`].filter(Boolean).join(' · ') || 'بث مباشر',
    album: '',
    art: s.favicon || null,
    url, http: /^http:/i.test(url || ''),
    dur: 0, full: true, live: true,
    tags: (s.tags || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6),
    lang: s.language || '',
    votes: s.votes || 0,
    clickcount: s.clickcount || 0,
    country: s.countrycode || '',
    link: s.homepage || '',
    externalId: s.stationuuid,
    downloadable: false,
  };
}

/* --------------------------------- Audius --------------------------------- */
async function audius(path, params = {}, opt = {}) {
  const u = new URL(AUDIUS + path);
  u.searchParams.set('app_name', APP);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const data = await fetchJSON(u.toString(), { timeout: opt.timeout ?? 15000, retries: opt.retries ?? 1 });
  return (data?.data || []).map(normAudius).filter((t) => t.url && t.streamable);
}

export async function audiusTrending({ genre = '', limit = 24 } = {}) {
  const key = `aud:trending:${genre || 'all'}:${limit}`;
  return cached(key, 5 * 60_000, () => audius('/tracks/trending', { genre, limit, offset: 0 }));
}
export async function audiusLatest({ genre = '', limit = 24 } = {}) {
  const key = `aud:latest:${genre || 'all'}:${limit}`;
  return cached(key, 5 * 60_000, () => audius('/tracks/latest', { genre, limit }));
}
export async function audiusPlaycount({ genre = '', limit = 24 } = {}) {
  return audius('/tracks/top', { genre, limit });
}
export async function audiusSearch(q, { limit = 30, offset = 0 } = {}) {
  const data = await audius('/tracks/search', { query: q, page_size: limit, offset });
  /* ترتيب حسب المشاهدات مع تنويع الفنان حتى لا يتكرر نفس الاسم 20 مرة */
  const seen = new Map();
  for (const t of data) {
    const k = t.artist.toLowerCase();
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(t);
  }
  const buckets = [...seen.values()].sort((a, b) => (b[0].plays || 0) - (a[0].plays || 0));
  const out = [];
  let i = 0;
  while (out.length < limit && i < 40) { for (const b of buckets) { if (b[i]) out.push(b[i]); if (out.length >= limit) break; } i++; }
  return out.length ? out : data.slice(0, limit);
}
export async function audiusArtistTracks(handle, { limit = 30 } = {}) {
  return audius(`/users/handle/${encodeURIComponent(handle)}/tracks`, { limit });
}
export async function audiusResolveTracks(ids) {
  return audius('/resolve/sounds', { id: ids.join(','), timeout: 12000 });
}

/* --------------------------------- iTunes --------------------------------- */
const itunes = (params) => {
  const u = new URL('https://itunes.apple.com/search');
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, String(v));
  return u.toString();
};

export async function itunesSearch(q, { limit = 25, country = 'DZ', entity = 'song' } = {}) {
  if (!q || !q.trim()) return [];
  const url = itunes({ term: q.trim(), media: 'music', entity, limit, country });
  let data;
  try { data = await fetchJSONOrJsonp(url, { timeout: 11000 }); }
  catch { data = await jsonp(url, { timeout: 11000 }); }
  return (data?.results || [])
    .filter((r) => r.previewUrl)
    .map(normItunes);
}
export async function itunesArtist(q, { limit = 20, country = 'DZ' } = {}) {
  return itunesSearch(q, { limit, country, entity: 'song' });
}
export const shelfForTopic = (q, country) => itunesSearch(q, { limit: 20, country });

/* -------------------------------- Radio Browser --------------------------- */
const secure = (list) => (location.protocol === 'https:' ? list.filter((s) => !s.http) : list);

async function radio(path, params = {}) {
  const qs = new URLSearchParams({ limit: '40', offset: '0', hidebroken: 'true', order: 'clickcount', reverse: 'true', ...Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null)) });
  let lastErr;
  for (const host of RADIO_HOSTS) {
    try {
      const arr = await fetchJSON(`${host}${path}?${qs}`, { timeout: 11000, retries: 0 });
      if (Array.isArray(arr)) return arr.map(normStation);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('radio unreachable');
}

export async function radioSearch({ q = '', tag = '', cc = '', limit = 40 } = {}) {
  const list = await radio('/json/stations/search', { name: q, tag, countrycode: cc, limit });
  return secure(list);
}
export async function radioTop({ cc = '', limit = 30 } = {}) {
  const key = `rad:top:${cc || 'world'}:${limit}`;
  return cached(key, 30 * 60_000, async () => {
    /* bycountrycodeexact يرتّب داخليًا حسب الإعدادات، و topclick يأخذ العدد في المسار */
    const list = cc
      ? await radio('/json/stations/bycountrycodeexact/' + encodeURIComponent(cc), { limit })
      : await radio('/json/stations/topclick/' + Number(limit), {});
    return secure(list);
  });
}
export async function radioTags(q) {
  try { return await fetchJSON(`${RADIO_HOSTS[0]}/json/tags/${encodeURIComponent(q)}`, { timeout: 9000, retries: 0 }); }
  catch { return []; }
}
export const radioSearchTags = async (tag, { cc = '', limit = 40 } = {}) =>
  secure(await radio('/json/stations/search', { tag, countrycode: cc, limit }));

/* --------------------------------- aggregated -------------------------------- */
export const COUNTRIES = [
  { cc: 'DZ', ar: 'الجزائر' }, { cc: 'MA', ar: 'المغرب' }, { cc: 'TN', ar: 'تونس' }, { cc: 'LY', ar: 'ليبيا' },
  { cc: 'EG', ar: 'مصر' }, { cc: 'SA', ar: 'السعودية' }, { cc: 'AE', ar: 'الإمارات' }, { cc: 'IQ', ar: 'العراق' },
  { cc: 'LB', ar: 'لبنان' }, { cc: 'JO', ar: 'الأردن' }, { cc: 'PS', ar: 'فلسطين' }, { cc: 'FR', ar: 'فرنسا' },
  { cc: 'GB', ar: 'بريطانيا' }, { cc: 'US', ar: 'أمريكا' },
];
export const STORES = [
  { cc: 'DZ', ar: 'الجزائر' }, { cc: 'SA', ar: 'السعودية' }, { cc: 'EG', ar: 'مصر' },
  { cc: 'MA', ar: 'المغرب' }, { cc: 'FR', ar: 'فرنسا' }, { cc: 'US', ar: 'أمريكا' }, { 'cc': 'GB', ar: 'بريطانيا' },
];

/** بحث موحّد عبر كل المصادر. */
export async function searchAll(q, { country = 'DZ', limit = 25 } = {}) {
  const [aud, itn, rad] = await Promise.allSettled([
    audiusSearch(q, { limit }),
    itunesSearch(q, { limit, country }),
    radioSearch({ q, limit: 12 }),
  ]);
  const pick = (r) => (r.status === 'fulfilled' ? r.value : []);
  return { full: pick(aud), preview: pick(itn), radio: pick(rad) };
}

/** أرفف الصفحة الرئيسية — تُخزَّن للاستعمال بلا إنترنت. */
export async function homeShelves({ country = 'DZ' } = {}) {
  const jobs = [
    { id: 'trending', ar: 'الأكثر رواجًا الآن', sub: 'أغانٍ كاملة مجانية من Audius', kind: 'cards', run: () => audiusTrending({ limit: 20 }) },
    { id: 'rai', ar: 'راي خالد', sub: 'معاينات رسمية', kind: 'rows', run: () => itunesSearch('rai', { limit: 14, country }) },
    { id: 'chaabi', ar: 'شعلالي وأصيل', sub: 'معاينات رسمية', kind: 'rows', run: () => itunesSearch('chaabi algérien', { limit: 12, country }) },
    { id: 'latest', ar: 'إصدارات جديدة', sub: 'مباشرة من الفنانين', kind: 'cards', run: () => audiusLatest({ limit: 20 }) },
    { id: 'electro', ar: 'إلكتروني وهاوس', sub: 'بث كامل', kind: 'cards', run: () => audiusTrending({ genre: 'Electronic', limit: 16 }) },
    { id: 'hip', ar: 'راب جزائري', sub: 'معاينات رسمية', kind: 'rows', run: () => itunesSearch('algarian rap', { limit: 12, country }) },
  ];
  const res = await Promise.allSettled(jobs.map((j) => j.run()));
  return jobs.map((j, i) => ({ ...j, tracks: res[i].status === 'fulfilled' ? res[i].value : [], failed: res[i].status !== 'fulfilled' }))
    .filter((s) => s.tracks.length);
}
