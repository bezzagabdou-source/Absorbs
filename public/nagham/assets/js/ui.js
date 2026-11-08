/* =====================================================================
   نغم — ui.js · الواجهات (رئيسية · بحث · مكتبة · إذاعة · إعدادات · مشغّل)
   ===================================================================== */
import {
  $, $$, esc, t, setLang, getLang, bus, cfg, fmtTime, fmtCount, fmtBytes, clamp,
  toast, debounce, initials, gradientFor, dominantColor, isTouch, prefersReduced, greeting,
} from './core.js';
import * as api from './api.js';
import * as store from './store.js';
import { player, EQ_PRESETS } from './player.js';

/* ------------------------------- state ------------------------------- */
export const LISTS = new Map();
export const REG = new Map();
let likes = new Set();
let dlSet = new Set();
let playlists = [];
let route = { name: 'home', param: '' };
let searchTab = 'all';
let query = '';
let rafViz = null;
let ctxTarget = null;

export function reg(key, tracks) {
  LISTS.set(key, tracks);
  for (const tr of tracks) if (tr?.id) REG.set(tr.id, tr);
  return key;
}
export const getTrack = (id) => REG.get(id);

/* ------------------------------ boot view ---------------------------- */
export async function refreshCollections() {
  likes = await store.likeMap().then((m) => new Set(m.keys())).catch(() => likes);
  dlSet = await store.downloadIds().catch(() => new Set());
  playlists = await store.listPlaylists().catch(() => []);
}

export function init() {
  bindDelegates();
  bus.on('likes', async () => { likes = new Set((await store.likeMap()).keys()); paintLikes(); });
  bus.on('downloads', async () => { dlSet = await store.downloadIds(); mark(ctxTarget?.id); });
  bus.on('playlists', async () => { playlists = await store.listPlaylists(); renderRailPlaylists(); });
  bus.on('player', () => { renderMini(); renderTabbarBadge(); if ($('#sheet').classList.contains('open')) renderSheet(); syncQueue(); });
  bus.on('time', syncTime);
  bus.on('cfg', () => { renderMini(); });
  const ro = new ResizeObserver(debounce(() => { if ($('#sheet').classList.contains('open')) renderSheet(); }, 250));
  ro.observe(document.body);
}

/* --------------------------- tiny html builders --------------------------- */
function artHTML(tr, cls = 'cover') {
  const label = esc(initials(tr.artist, tr.title));
  const bg = gradientFor(tr.id || tr.title);
  const img = tr.art ? `<img src="${esc(tr.art)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">` : '';
  return `<div class="${cls}" style="background:${bg}">${!tr.art ? `<span class="ph">${label}</span>` : ''}${img}</div>`;
}
function srcBadge(tr) {
  if (tr.live) return `<span class="flag live">LIVE</span>`;
  if (tr.preview) return `<span class="flag">${t('player.preview30', 'معاينة 30 ثانية')}</span>`;
  if (tr.src === 'audius') return `<span class="flag full">${t('player.full', 'كاملة')}</span>`;
  return '';
}

/* ------------------------------- rows ------------------------------- */
function trackRow(tr, i, key) {
  const active = player.track?.id === tr.id;
  const liked = likes.has(tr.id);
  const saved = dlSet.has(tr.id);
  return `<div class="row ${active ? 'active' : ''} ${active && !player.playing ? 'paused' : ''}" data-act="play:row" data-key="${key}" data-i="${i}" data-id="${esc(tr.id)}" role="button" tabindex="0" aria-label="${esc(tr.title)}">
    <div class="n" data-n="${i + 1}">${active ? '<span class="eqbars"><i></i><i></i><i></i><i></i></span>' : ''}</div>
    <div class="th" style="background:${gradientFor(tr.id)}">${tr.art ? `<img src="${esc(tr.art)}" alt="" loading="lazy" onerror="this.remove()">` : `<span class="ph">${esc(initials(tr.artist, tr.title))}</span>`}</div>
    <div class="meta">
      <b>${esc(tr.title)}</b>
      <span>${esc(tr.artist)}${tr.album ? ` · ${esc(tr.album)}` : ''}</span>
    </div>
    <div class="side">
      ${saved ? '<span class="dl" title="محفوظة بلا إنترنت">⤓</span>' : ''}
      ${srcBadge(tr)}
      <span class="dur">${tr.live ? '●' : fmtTime(tr.dur)}</span>
      <button class="like" data-act="like" data-id="${esc(tr.id)}" aria-pressed="${liked}" title="${t('player.like', 'إعجاب')}">${liked ? '♥' : '♡'}</button>
      <button class="more" data-act="ctx" data-id="${esc(tr.id)}" aria-label="خيارات">⋯</button>
    </div>
  </div>`;
}
const trackList = (tracks, key) => `<div class="list">${tracks.map((tr, i) => trackRow(tr, i, key)).join('')}</div>`;

function cardHTML(tr, key, i, { label = '', sub = '' } = {}) {
  const active = player.track?.id === tr.id;
  return `<div class="card ${active ? 'playing' : ''}" data-act="play:row" data-key="${key}" data-i="${i}" data-id="${esc(tr.id)}" role="button" tabindex="0">
    ${artHTML(tr)}
    <button class="fab" data-act="play:row" data-key="${key}" data-i="${i}" data-id="${esc(tr.id)}" aria-label="${t('common.play', 'تشغيل')}">▶</button>
    <div>
      <div class="t">${esc(label || tr.title)}</div>
      <div class="s">${esc(sub || tr.artist)}</div>
    </div>
  </div>`;
}
function shelf(id, title, sub, tracks, kind = 'cards', extra = '') {
  if (!tracks?.length) return '';
  const key = reg(id, tracks);
  const body = kind === 'cards'
    ? `<div class="cards">${tracks.map((tr, i) => cardHTML(tr, key, i)).join('')}</div>`
    : `<div class="list-wrap">${trackList(tracks.slice(0, 12), key)}${tracks.length > 12 ? `<button class="more-inline" data-act="nav:list" data-key="${key}" data-title="${esc(title)}">${t('common.all', 'عرض الكل')} ←</button>` : ''}</div>`;
  return `<section class="section">
    <div class="section-head">
      <div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      ${extra}
    </div>
    ${body}
  </section>`;
}

/* ================================ VIEWS ================================ */
let renderToken = 0;
export async function render(name, param = '', opts = {}) {
  const VIEWS = {
    home: homeHTML, search: searchView, library: libraryView, radio: radioView, settings: settingsView,
    playlist: playlistView, list: listPageView, genre: genreView, topic: topicView, artist: artistView,
  };
  route = { name, param, opts };
  const token = ++renderToken;
  const v = $('#view');
  const keepScroll = v.scrollTop;
  const F = VIEWS[name] || homeHTML;
  const isHome = name === 'home';
  if (isHome) v.innerHTML = home();
  let html;
  try { html = await F(param, opts); }
  catch (e) { console.warn('[view]', e); html = `<div class="empty"><div class="big">⚠️</div><h3>تعذّر تحميل هذه الصفحة</h3><p>${esc(String(e?.message || e))}</p><button class="btn primary" data-act="home:reload">${t('common.retry', 'إعادة')}</button></div>`; }
  if (token !== renderToken) return;
  v.innerHTML = html;
  if (isHome) v.scrollTop = keepScroll;
  afterRender(name);
  $$('#railNav button, #tabbar button').forEach((b) => {
    const on = b.dataset.nav === name || (name === 'playlist' && b.dataset.nav === 'library') || ((name === 'genre' || name === 'topic' || name === 'list') && b.dataset.nav === 'home');
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
}
function afterRender(name) {
  /* حقل البحث داخل الصفحة */
  const si = $('#searchInput');
  if (si) {
    si.addEventListener('input', debounce((e) => { query = e.target.value.trim(); $('#topSearch') && ($('#topSearch').value = query); doSearch(); }, 480));
    si.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); query = e.target.value.trim(); doSearch(true); } });
    setTimeout(() => { if (!query) si.focus(); }, 60);
  }
  if (name === 'search' && query && !searchedOnce) doSearch();
  const rq = $('#radioQ');
  if (rq) {
    rq.addEventListener('input', debounce((e) => {
      radioState = { ...radioState, q: e.target.value.trim() };
      radioList = [];
      api.radioSearch({ q: radioState.q, tag: radioState.tag, cc: radioState.cc, limit: 60 })
        .then((r) => { radioList = r; if (route.name === 'radio') render('radio'); });
    }, 500));
  }
  /* شرائط المعادل */
  $$('input[data-act="eq:band"]').forEach((r) => r.addEventListener('input', () => {
    const gains = $$('input[data-act="eq:band"]').map((x) => +x.value);
    cfg.patch({ eq: gains, eqPreset: 'custom' });
    player.applyEq(gains);
  }));
  /* القوائم المنسدلة */
  const st = $('[data-act="set:store"]'); if (st) st.addEventListener('change', (e) => { cfg.set('store', e.target.value); homePromise = null; toast('تم', 'ok', 1200); });
  const rc = $('[data-act="set:radio"]'); if (rc) rc.addEventListener('change', (e) => { cfg.set('radioCountry', e.target.value); radioList = []; radioState = { ...radioState, cc: e.target.value }; toast('تم', 'ok', 1200); });
  const cap = $('[data-act="set:cap"]'); if (cap) cap.addEventListener('change', (e) => { cfg.set('sizeCapMB', +e.target.value); render('settings'); });
  if (name === 'settings') showSize();
  mark();
}

/* -------------------------------- home -------------------------------- */
async function homeHTML() {
  const [, g] = greeting();
  const recent = await store.listRecent(12);
  const liked = await store.listLikes();
  const [shelves, stations] = await Promise.all([
    cachedHome(),
    api.radioTop({ cc: cfg.get('radioCountry') || 'DZ', limit: 10 }).catch(() => []),
  ]);
  const heroArt = shelves[0]?.tracks[0]?.art || null;
  return `
  <section class="hero">
    ${heroArt ? `<img class="art" src="${esc(heroArt)}" alt="">` : ''}
    <h2>${esc(g)} · ${t('home.hero.title', 'صوتك، على بعد نقرة')}</h2>
    <p>${t('home.hero.sub', 'أغانٍ كاملة مجانية، معاينات لأشهر الأغاني، وإذاعات حيّة — مع تحكّم من شاشة القفل واستماع في الخلفية وقوائم تعمل بلا إنترنت.')}</p>
    <div class="actions">
      <button class="btn primary" data-act="play:shelf" data-key="home:trending">▶ ${t('home.hero.cta', 'شغّل الأكثر رواجًا')}</button>
      <button class="btn" data-act="nav:search">🔎 ${t('home.hero.cta2', 'تصفّح الأنواع')}</button>
      <button class="btn ghost" data-act="nav:radio">📻 ${t('radio.title', 'إذاعة حيّة')}</button>
    </div>
  </section>

  ${recent.length ? shelf('home:recent', t('home.recent', 'واصل الاستماع'), '', recent, 'cards') : ''}

  <section class="section">
    <div class="section-head"><h2>${t('home.genres', 'تصفّح حسب النوع')}</h2></div>
    <div class="tiles">
      ${api.GENRES.map((g2) => `<button class="tile" data-act="nav:genre" data-genre="${esc(g2.name)}" style="--h:${g2.hue}">
        <span>${esc(g2.ar)}</span><small>${esc(g2.name)}</small></button>`).join('')}
      ${api.TOPICS.slice(0, 6).map((tp) => `<button class="tile" data-act="nav:topic" data-q="${esc(tp.q)}" style="--h:${tp.hue}">
        <span>${esc(tp.ar)}</span><small>${esc(tp.q)}</small></button>`).join('')}
    </div>
  </section>

  ${shelves.map((s) => shelf('home:' + s.id, s.ar, s.sub, s.tracks, s.kind,
    s.failed ? `<span class="retry" data-act="home:reload">${t('common.retry', 'إعادة')}</span>` : '')).join('')}

  ${liked.length ? shelf('home:liked', t('lib.likes', 'المفضّلة'), `${liked.length} ${t('common.tracks', 'أغنية')}`, liked, 'cards') : ''}

  ${stations.length ? `<section class="section">
      <div class="section-head"><h2>${t('radio.title', 'إذاعة حيّة')}</h2><p>${esc((api.COUNTRIES.find((c) => c.cc === (cfg.get('radioCountry') || 'DZ')) || {}).ar || '')}</p>
      <button class="more" data-act="nav:radio">${t('common.all', 'الكل')} ←</button></div>
      <div class="cards">${stations.map((s2, i) => cardHTML(s2, reg('home:radio', stations), i, { label: s2.title, sub: '● ' + t('radio.live', 'مباشر') })).join('')}</div>
    </section>` : ''}

  <section class="section tips">
    <div class="section-head"><h2>${t('set.offlineT', 'خارج التطبيق')}</h2></div>
    <div class="panel-grid">
      ${panelBgListen()}
      <div class="panel"><h3>💾 ${t('set.data', 'بياناتك على جهازك')}</h3>
        <p class="hint">المفضّلة وقوائم التشغيل والحفظ بلا إنترنت تُخزَّن في متصفحك فقط (IndexedDB) — لا خوادم عندنا، ولا حساب، ولا تتبّع.</p>
        <button class="btn sm" data-act="nav:settings">⚙ ${t('nav.settings', 'الإعدادات')}</button></div>
    </div>
  </section>
  <footer class="foot">
    <span>نغم · مصادر مفتوحة: <b>Audius</b> (بث كامل) · <b>iTunes</b> (معاينات ٣٠ ثانية) · <b>Radio Browser</b> (إذاعات)</span>
  </footer>`;
}
let homePromise = null;
function cachedHome() {
  homePromise = homePromise || api.homeShelves({ country: cfg.get('store') }).then(async (s) => {
    store.idb.set('cache', 'home:shelves', { at: Date.now(), val: s }).catch(() => {});
    return s;
  }).catch(async () => (await store.cachePeek('home:shelves', 7 * 864e5)) || []);
  return homePromise;
}
function home() {
  return `<div class="sk-wrap">
    <div class="skeleton" style="height:170px;border-radius:24px"></div>
    <div class="cards" style="margin-top:26px">${'<div class="sk-card skeleton"></div>'.repeat(6)}</div>
    <div class="sk-rows">${'<div class="sk-row skeleton"></div>'.repeat(6)}</div>
  </div>`;
}

/* ------------------------------- search ------------------------------- */
let searchResults = { full: [], preview: [], radio: [] };
let searching = false, searchedOnce = false;

async function searchView() {
  const topics = api.TOPICS;
  return `
  <h1 class="page-title">${t('nav.search', 'بحث')}</h1>
  <label class="searchbox big">
    <svg viewBox="0 0 24 24"><path d="M15.5 15.5 20 20M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="searchInput" type="search" data-i18n-ph="search.ph" placeholder="${esc(t('search.ph', 'أغنية، فنان، راي، شعبي…'))}" value="${esc(query)}" autocomplete="off">
    <button class="x" data-act="search:clear" aria-label="مسح">✕</button>
  </label>
  <div class="chips" style="margin-top:14px">
    ${[['all', t('search.all', 'الكل')], ['full', t('search.full', 'كاملة (مجانية)')], ['preview', t('search.preview', 'معاينات')], ['radio', t('search.radio', 'إذاعات')]]
      .map(([k, v]) => `<button class="chip" data-act="search:tab" data-tab="${k}" aria-pressed="${searchTab === k}">${v}</button>`).join('')}
  </div>
  <div id="searchBody">${searchBody(topics)}</div>`;
}
function searchBody(topics = []) {
  if (searching || (query && !searchedOnce)) return `<div class="sk-rows" style="margin-top:22px">${'<div class="sk-row skeleton"></div>'.repeat(7)}</div>`;
  if (!query) {
    const recent = (storeLS.get('recentq', []) || []);
    return `
      ${recent.length ? `<section class="section"><div class="section-head"><h2>${t('search.recent', 'أحدث عمليات البحث')}</h2>
        <button class="more" data-act="search:clearq">${t('common.clear', 'مسح')}</button></div>
        <div class="chips">${recent.map((q) => `<button class="chip grid" data-act="search:q" data-q="${esc(q)}">🕘 ${esc(q)}</button>`).join('')}</div></section>` : ''}
      <section class="section"><div class="section-head"><h2>${t('search.topics', 'مواضيع رائج في الجزائر')}</h2></div>
      <div class="tiles">${topics.map((tp) => `<button class="tile" data-act="search:q" data-q="${esc(tp.q)}" style="--h:${tp.hue}"><span>${esc(tp.ar)}</span><small>${esc(tp.q)}</small></button>`).join('')}</div></section>`;
  }
  const out = [];
  const all = searchTab === 'all';
  const cnt = (a) => a.length;
  if ((all || searchTab === 'full') && cnt(searchResults.full)) out.push(shelf('sr:full', t('search.full', 'أغانٍ كاملة مجانية'), `${cnt(searchResults.full)} ${t('common.tracks', 'نتيجة')} · Audius`, searchResults.full, 'rows'));
  if ((all || searchTab === 'preview') && cnt(searchResults.preview)) out.push(shelf('sr:preview', t('search.preview', 'معاينات رسمية'), `${cnt(searchResults.preview)} · iTunes`, searchResults.preview, 'rows'));
  if ((all || searchTab === 'radio') && cnt(searchResults.radio)) out.push(`<section class="section"><div class="section-head"><h2>${t('search.radio', 'إذاعات')}</h2><p>${cnt(searchResults.radio)} محطة</p></div>
    <div class="grid-cards">${searchResults.radio.map((s, i) => stationCard(s, reg('sr:radio', searchResults.radio), i)).join('')}</div></section>`);
  if (!out.length) return `<div class="empty"><div class="big">🔍</div><h3>${t('search.none', 'لا نتائج')}</h3>
    <p>جرّب كتابة اسم فنان بالفرنسية (Khaled, DJ Sneak, Souad Massi) أو نوع موسيقي، أو بدّل المصدر من الشرائح فوق.</p>
    <button class="btn primary" data-act="search:go" data-q="${esc(query)}">${t('common.retry', 'أعد البحث')}</button></div>`;
  return `<p class="page-sub">${t('search.for', 'نتائج البحث عن')}: <b>${esc(query)}</b></p>` + out.join('');
}
const storeLS = { get: (k, d) => cfg.get(k) ?? d, set: (k, v) => cfg.set(k, v) };

/* ------------------------------- library ------------------------------- */
let libTab = 'likes';
async function libraryView() {
  const liked = await store.listLikes();
  const recent = await store.listRecent(30);
  const dls = await store.listDownloads();
  reg('lib:likes', liked); reg('lib:recent', recent); reg('lib:dl', dls);
  const tabs = [['likes', `♥ ${t('lib.likes', 'المفضّلة')}`, liked.length], ['playlists', `≡ ${t('lib.playlists', 'قوائم التشغيل')}`, playlists.length], ['downloads', `⤓ ${t('lib.downloads', 'محفوظة')}`, dls.length], ['recent', `🕘 ${t('lib.recent', 'استمعت لها')}`, recent.length]];
  let body = '';
  if (libTab === 'likes') body = liked.length ? `<div class="pl-actions">${playButtons('lib:likes', liked)}</div>${trackList(liked, 'lib:likes')}` : emptyBox('♥', t('lib.empty', 'لا شيء بعد'), 'اضغط ♡ في أي أغنية وستجدها هنا — مع الحفظ بلا إنترنت للأغاني الكاملة.');
  if (libTab === 'downloads') body = dls.length ? `<div class="pl-actions">${playButtons('lib:dl', dls)}</div>${trackList(dls, 'lib:dl')}` : emptyBox('⤓', t('lib.empty', 'لا شيء محفوظ'), 'افتح قائمة أي أغنية كاملة من Audius واختر «احفظها بلا إنترنت» لتسمعها في الطائرة أو عند انقطاع الشبكة.');
  if (libTab === 'recent') body = recent.length ? trackList(recent, 'lib:recent') : emptyBox('🕘', t('lib.empty', 'السجل فارغ'), 'شغّل أي أغنية وسيظهر سجلّك هنا مع نقطة التوقف.');
  if (libTab === 'playlists') body = playlists.length
    ? `<div class="cards wrap">${playlists.map((p) => playlistCard(p)).join('')}</div>`
    : emptyBox('≡', 'لا قوائم بعد', 'أنشئ قائمة تشغيل واملأها بما يعجبك، ثم شغّلها بلا إنترنت.');
  return `
  <h1 class="page-title">${t('nav.library', 'مكتبتك')}</h1>
  <div class="chips">${tabs.map(([k, l, n]) => `<button class="chip" data-act="lib:tab" data-tab="${k}" aria-pressed="${libTab === k}">${l}${n ? ` <b>${n}</b>` : ''}</button>`).join('')}
    <button class="chip on" data-act="pl:new">+ ${t('lib.new', 'قائمة جديدة')}</button></div>
  ${body}`;
}
const emptyBox = (ic, h, p) => `<div class="empty"><div class="big">${ic}</div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;
function playButtons(key, tracks) {
  return `<button class="btn primary" data-act="play:shelf" data-key="${key}">▶ ${t('common.play', 'تشغيل')}</button>
  <button class="btn" data-act="play:shuffle" data-key="${key}">🔀 ${t('pl.shuffle', 'خلط')}</button>
  ${tracks.length > 1 ? `<button class="btn ghost" data-act="queue:all" data-key="${key}">⇥ ${t('pl.toQueue', 'إلى قائمة الانتظار')}</button>` : ''}`;
}
function playlistCard(p) {
  const key = 'plc:' + p.id;
  reg(key, p.tracks || []);
  return `<div class="card" data-act="nav:playlist" data-id="${p.id}">
    ${p.cover ? `<div class="cover"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>` : `<div class="cover" style="background:${gradientFor(p.id)}"><span class="ph">≡</span></div>`}
    <button class="fab" data-act="play:shelf" data-key="${key}" aria-label="${t('common.play', 'تشغيل')}">▶</button>
    <div><div class="t">${esc(p.name)}</div><div class="s">${(p.tracks || []).length} ${t('common.tracks', 'أغنية')}</div></div>
  </div>`;
}
async function playlistView(id) {
  const p = await store.idb.get('playlists', id);
  if (!p) return emptyBox('≡', 'قائمة غير موجودة', 'ربما حُذفت من هذا الجهاز.');
  const key = reg('pl:' + id, p.tracks || []);
  return `<div class="pl-hero">
    ${p.cover ? `<img src="${esc(p.cover)}" alt="">` : `<div class="cover-ph" style="background:${gradientFor(p.id)}">≡</div>`}
    <div class="txt"><small>${t('lib.playlists', 'قائمة تشغيل')}</small><h1>${esc(p.name)}</h1>
      <p>${(p.tracks || []).length} ${t('common.tracks', 'أغنية')} · ${p.tracks?.length ? fmtCount(p.tracks.reduce((a, b) => a + (b.dur || 0), 0)) + ' دقيقة' : ''}</p></div>
  </div>
  <div class="pl-actions">
    ${playButtons(key, p.tracks || [])}
    <button class="btn ghost" data-act="pl:rename" data-id="${id}">✎ ${t('pl.rename', 'إعادة تسمية')}</button>
    <button class="btn danger" data-act="pl:del" data-id="${id}">🗑 ${t('common.delete', 'حذف')}</button>
  </div>
  ${p.tracks?.length ? trackList(p.tracks, key) : emptyBox('♪', 'فارغة', 'أضف أغاني من أي قائمة عبر زر ⋯ ← «أضف إلى قائمة تشغيل».')}
  <p class="note">💡 ${t('pl.offlineNote', 'احفظ أغاني هذه القائمة بلا إنترنت لتسمعها في أي مكان.')}</p>`;
}

/* ------------------------------- radio ------------------------------- */
let radioState = { q: '', cc: cfg.get('radioCountry') || 'DZ', tag: '' };
let radioList = [];
async function radioView() {
  const cc = radioState.cc;
  if (!radioList.length) radioList = await api.radioTop({ cc, limit: 60 }).catch(() => []);
  const key = reg('radio:list', radioList);
  return `
  <h1 class="page-title">${t('radio.title', 'إذاعة حيّة')}</h1>
  <p class="page-sub">${t('radio.sub', 'محطات مجانية ببث مباشر — مثالية للاستماع خارج التطبيق.')} ${radioList.length ? `· ${radioList.length} ${t('radio.st', 'محطة')}` : ''}</p>
  <label class="searchbox big">
    <input id="radioQ" type="search" placeholder="اسم المحطة أو نوعها…" value="${esc(radioState.q)}" autocomplete="off">
    <button class="x" data-act="radio:clearq" aria-label="مسح">✕</button>
  </label>
  <div class="chips" style="margin-top:12px">${api.COUNTRIES.map((c) => `<button class="chip" data-act="radio:cc" data-cc="${c.cc}" aria-pressed="${c.cc === cc}">${esc(c.ar)}</button>`).join('')}</div>
  <div class="chips">${['', 'rai', 'pop', 'chaabi', 'quran', 'news', 'electro', 'hip hop', 'andalou'].map((tg) => `<button class="chip" data-act="radio:tag" data-tag="${tg}" aria-pressed="${tg === radioState.tag}">${tg ? esc(tg) : t('common.all', 'الكل')}</button>`).join('')}</div>
  ${radioList.length ? `<div class="grid-cards" style="margin-top:18px">${radioList.map((s, i) => stationCard(s, key, i)).join('')}</div>`
    : `<div class="empty"><div class="big">📻</div><h3>لم تصل المحطات</h3><p>مكتبة Radio Browser عامة ومجانية أحيانًا تتأخر. ${navigator.onLine ? '' : 'أنت غير متصل بالإنترنت.'}</p>
      <button class="btn primary" data-act="radio:reload">${t('common.retry', 'إعادة')}</button></div>`}`;
}
function stationCard(s, key, i) {
  const active = player.track?.id === s.id;
  return `<div class="station ${active ? 'playing' : ''}" data-act="play:row" data-key="${key}" data-i="${i}" data-id="${esc(s.id)}" role="button" tabindex="0">
    <div class="sq">${s.art ? `<img src="${esc(s.art)}" alt="" loading="lazy" onerror="this.remove()">` : `<span>📻</span>`}</div>
    <div class="meta"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>
    ${active && player.playing ? '<span class="eqbars"><i></i><i></i><i></i><i></i></span>' : '<span class="dot"></span>'}
    <button class="more" data-act="ctx" data-id="${esc(s.id)}" aria-label="خيارات">⋯</button>
  </div>`;
}

/* --------------------------- genre / topic pages --------------------------- */
async function genreView(g) {
  const tracks = await api.audiusTrending({ genre: g, limit: 40 }).catch(() => []);
  const key = reg('genre:' + g, tracks);
  return `${pageHead(g, `${tracks.length} ${t('common.tracks', 'أغنية')} · بث كامل مجاني من Audius`)}
    ${tracks.length ? `<div class="pl-actions">${playButtons(key, tracks)}</div><div class="list-wrap">${trackList(tracks, key)}</div>` : emptyBox('♪', 'لا نتائج', 'جرّب نوعًا آخر من الرئيسية.')}
    <div class="chips" style="margin-top:20px">${api.GENRES.map((x) => `<button class="chip" data-act="nav:genre" data-genre="${esc(x.name)}" aria-pressed="${x.name === g}">${esc(x.ar)}</button>`).join('')}</div>`;
}
async function topicView(q) {
  const tracks = await api.itunesSearch(q, { limit: 30, country: cfg.get('store') }).catch(() => []);
  const key = reg('topic:' + q, tracks);
  return `${pageHead(q, `معاينات 30 ثانية رسمية من iTunes · ${tracks.length} ${t('common.tracks', 'نتيجة')}`)}
    ${tracks.length ? `<div class="pl-actions">${playButtons(key, tracks)}</div><div class="list-wrap">${trackList(tracks, key)}</div>` : emptyBox('🎼', 'لا نتائج', 'جرّب موضوعًا آخر.')}
    <div class="chips" style="margin-top:20px">${api.TOPICS.map((x) => `<button class="chip" data-act="nav:topic" data-q="${esc(x.q)}" aria-pressed="${x.q === q}">${esc(x.ar)}</button>`).join('')}</div>`;
}
async function listPageView(key) {
  const tracks = LISTS.get(key) || [];
  const title = key.split(':').pop();
  return `${pageHead(title, `${tracks.length} ${t('common.tracks', 'أغنية')}`)}<div class="list-wrap">${trackList(tracks, key)}</div>`;
}
async function artistView(handle) {
  const tracks = await api.audiusArtistTracks(handle, { limit: 40 }).catch(() => []);
  const key = reg('artist:' + handle, tracks);
  const nm = tracks[0]?.artist || handle;
  return `${pageHead(nm, `@${esc(handle)} · Audius · ${tracks.length} ${t('common.tracks', 'أغنية')}`)}
    <div class="pl-actions">${playButtons(key, tracks)}<button class="btn ghost" data-act="search:q" data-q="${esc(handle)}">🔎 ${t('art.similar', 'أغانٍ شبيهة')}</button></div>
    <div class="list-wrap">${trackList(tracks, key)}</div>`;
}
const pageHead = (title, sub) => `<h1 class="page-title">${esc(title)}</h1><p class="page-sub">${esc(sub)}</p>`;

/* ------------------------------- settings ------------------------------- */
function panelBgListen() {
  return `<div class="panel"><h3>🎧 ${t('player.bg', 'التشغيل خارج التطبيق')}</h3>
    <p class="hint">${t('bg.hint', 'شغّل الأغنية ثم اخرج من التطبيق أو أقفل الشاشة: تبقى الموسيقى تعمل، وتتحكّم بها من إشعار النظام وأزرار شاشة القفل (Media Session). لأكفأ تجربة ثبّت «نغم» كتطبيق مستقل.')}</p>
    <div class="opt"><div class="lbl"><b>${t('bg.keepAwake', 'إبقاء الشاشة عامدة')}</b><small>${t('bg.keepAwakeSub', 'يمنع إطفاء الشاشة أثناء المشاهدة — لا يؤثر على الصوت.')}</small></div>
      <button class="switch" role="switch" data-act="set:wake" aria-checked="${!!wakeOn}" aria-label="${t('bg.keepAwake', 'إبقاء الشاشة')}"></button></div>
    <div class="opt"><div class="lbl"><b>${t('bg.dimm', 'إخفاء الرسوم في الخلفية')}</b><small>${t('bg.dimmSub', 'يوقف المؤثرات عند تصغير التبويب لتوفير البطارية.')}</small></div>
      <button class="switch" role="switch" data-act="set:cfg" data-key="bgDim" aria-checked="${!!cfg.get('bgDim')}" ></button></div>
    <div class="opt"><div class="lbl"><b>${t('bg.resume', 'مواصلة من نقطة التوقف')}</b><small>${t('bg.resumeSub', 'يعيدك لنفس الثانية في الأغنية عند التشغيل لاحقًا.')}</small></div>
      <button class="switch" role="switch" data-act="set:cfg" data-key="resume" aria-checked="${!!cfg.get('resume')}"></button></div>
  </div>`;
}
let wakeOn = false;
function settingsView() {
  const s = cfg.all();
  const accents = [['#8b5cf6', '#22d3ee'], ['#f43f5e', '#fb923c'], ['#22c55e', '#a3e635'], ['#3b82f6', '#22d3ee'], ['#eab308', '#f97316'], ['#a855f7', '#ec4899'], ['#14b8a6', '#22d3ee'], ['#e2e8f0', '#94a3b8']];
  return `
  <h1 class="page-title">${t('nav.settings', 'الإعدادات')}</h1>
  <div class="set-grid">
    <div class="panel">
      <h3>🎨 ${t('set.appearance', 'المظهر')}</h3>
      <div class="opt"><div class="lbl"><b>${t('set.theme', 'السمة')}</b></div>
        <div class="seg">${[['dark', 'ليلي'], ['light', 'نهاري'], ['amoled', 'أسود']].map(([k, v]) => `<button data-act="set:theme" data-theme="${k}" aria-pressed="${s.theme === k}">${v}</button>`).join('')}</div></div>
      <div class="opt"><div class="lbl"><b>${t('set.accent', 'اللون المميّز')}</b></div>
        <div class="swatches">${accents.map(([a, b]) => `<button class="swatch" data-act="set:accent" data-a="${a}" data-b="${b}" aria-pressed="${s.accent === a}" style="background:linear-gradient(135deg,${a},${b})" aria-label="${a}"></button>`).join('')}</div></div>
      <div class="opt"><div class="lbl"><b>${t('set.lang', 'اللغة')}</b></div>
        <div class="seg">${[['ar', 'العربية'], ['fr', 'Français'], ['en', 'English']].map(([k, v]) => `<button data-act="set:lang" data-lang="${k}" aria-pressed="${getLang() === k}">${v}</button>`).join('')}</div></div>
      <div class="opt"><div class="lbl"><b>${t('set.motion', 'الحركات والتأثيرات')}</b><small>${s.motion ? t('common.on', 'مفعّلة') : t('common.off', 'متوقفة')}</small></div>
        <button class="switch" role="switch" data-act="set:cfg" data-key="motion" aria-checked="${!!s.motion}"></button></div>
      <div class="opt"><div class="lbl"><b>${t('set.glow', 'تلوين الخلفية حسب الغلاف')}</b><small>${t('set.glowSub', 'يستخرج اللون الغالب من صورة الألبوم.')}</small></div>
        <button class="switch" role="switch" data-act="set:cfg" data-key="artworkGlow" aria-checked="${!!s.artworkGlow}"></button></div>
    </div>

    <div class="panel">
      <h3>🎚 ${t('set.audio', 'الصوت')}</h3>
      <p class="hint">${t('set.eqNote', 'المعادل يستعمل Web Audio؛ يحتاج مصادر تدعم CORS (Audius تدعمها).')}</p>
      <div class="opt"><div class="lbl"><b>${t('player.eq', 'المعادل الصوتي')}</b></div>
        <button class="switch" role="switch" data-act="set:eq" aria-checked="${!!s.eqOn}"></button></div>
      <div class="eq-wrap" ${s.eqOn ? '' : 'data-off="1"'}>${EQ_LABELS.map((lb, i) => `
        <label class="band"><input type="range" min="-12" max="12" step="1" value="${(s.eq || [0, 0, 0, 0, 0])[i] || 0}" data-act="eq:band" data-i="${i}" ${s.eqOn ? '' : 'disabled'}>
        <span>${lb}</span></label>`).join('')}
      </div>
      <div class="chips">${Object.entries(EQ_PRESETS).map(([k, v]) => `<button class="chip" data-act="eq:preset" data-p="${k}" aria-pressed="${s.eqPreset === k}">${EQ_PRESET_NAMES[k]}</button>`).join('')}</div>
      <div class="opt"><div class="lbl"><b>${t('set.normalize', 'محدّد مستوى الصوت')}</b><small>${t('set.normalizeSub', 'يضغط القفزات الحادة لحماية الأذن والسمّاعات.')}</small></div>
        <button class="switch" role="switch" data-act="set:cfg" data-key="normalize" aria-checked="${!!s.normalize}"></button></div>
      <div class="opt"><div class="lbl"><b>${t('player.speed', 'السرعة')} · ${s.rate}×</b></div>
        <div class="seg">${[0.75, 1, 1.25, 1.5, 2].map((r) => `<button data-act="set:rate" data-rate="${r}" aria-pressed="${Number(s.rate) === r}">${r}×</button>`).join('')}</div></div>
    </div>

    <div class="panel">
      <h3>▶ ${t('set.playback', 'التشغيل')}</h3>
      <div class="opt"><div class="lbl"><b>${t('set.autoPlay', 'تشغيل أغنية شبيهة تلقائيًا')}</b><small>${t('set.autoPlaySub', 'عند نهاية القائمة تختار نغم لك عملا قريبا من نفس الفنان.')}</small></div>
        <button class="switch" role="switch" data-act="set:cfg" data-key="autoplaySimilar" aria-checked="${!!s.autoplaySimilar}"></button></div>
      <div class="opt"><div class="lbl"><b>${t('set.tap', 'نقرتان على الغلاف = تقديم/ترجيع')}</b></div>
        <div class="seg">${[5, 10, 30].map((v) => `<button data-act="set:tap" data-v="${v}" aria-pressed="${Number(s.tapSeek) === v}">${v}ث</button>`).join('')}</div></div>
      <div class="opt"><div class="lbl"><b>${t('player.sleep', 'مؤقّت النوم')}</b><small>${s.sleepMin ? `يوقف التشغيل بعد ${s.sleepMin} دقيقة` : t('common.off', 'متوقف')}</small></div>
        <div class="seg">${[0, 15, 30, 45, 60, 90].map((v) => `<button data-act="set:sleep" data-v="${v}" aria-pressed="${Number(s.sleepMin) === v}">${v ? v + 'د' : t('common.off', ' off')}</button>`).join('')}</div></div>
      <div class="opt"><div class="lbl"><b>🎧 ${t('player.bg', 'التشغيل خارج التطبيق')}</b></div>
        <button class="btn sm" data-act="set:bginfo">ℹ شرح</button></div>
    </div>

    ${panelBgListen()}

    <div class="panel">
      <h3>🌍 ${t('set.content', 'المحتوى')}</h3>
      <div class="opt"><div class="lbl"><b>${t('set.store', 'متجر الموسيقى')}${' (iTunes)'}</b><small>${t('set.storeSub', 'يحدّد توفر المعاينات والأسعار المحلية.')}</small></div>
        <select data-act="set:store">${api.STORES.map((c) => `<option value="${c.cc}" ${s.store === c.cc ? 'selected' : ''}>${esc(c.ar)} · ${c.cc}</option>`).join('')}</select></div>
      <div class="opt"><div class="lbl"><b>📻 ${t('radio.title', 'دولة الإذاعة')}</b></div>
        <select data-act="set:radio">${api.COUNTRIES.map((c) => `<option value="${c.cc}" ${s.radioCountry === c.cc ? 'selected' : ''}>${esc(c.ar)} · ${c.cc}</option>`).join('')}</select></div>
      <div class="opt"><div class="lbl"><b>${t('set.src', 'المصدر المفضّل في البحث')}</b><small>${t('set.srcSub', 'الأغاني الكاملة من Audius، والمعاينات الرسمية من iTunes.')}</small></div>
        <div class="seg">${[['auto', 'تلقائي'], ['full', 'كاملة'], ['preview', 'معاينة']].map(([k, v]) => `<button data-act="set:src" data-v="${k}" aria-pressed="${s.defaultSource === k}">${v}</button>`).join('')}</div></div>
    </div>

    <div class="panel">
      <h3>🗄 ${t('set.data', 'التخزين والخصوصية')}</h3>
      <div class="opt"><div class="lbl"><b>${t('set.cacheSize', 'المساحة المستعملة')}</b><small id="sizeLine">…</small></div>
        <button class="btn sm" data-act="set:clear">🧹 ${t('set.clear', 'تفريغ الكاش')}</button></div>
      <div class="opt"><div class="lbl"><b>${t('set.maxSize', 'حدّ الحفظ بلا إنترنت')}</b><small>${s.sizeCapMB} MB</small></div>
        <input type="range" min="100" max="2000" step="100" value="${s.sizeCapMB}" data-act="set:cap" style="max-width:130px"></div>
      <div class="opt"><div class="lbl"><b>${t('set.export', 'تصدير بياناتي')}</b><small>${t('set.exportSub', 'ملف JSON فيه مفضّلتك وقوائمك — للانتقال لجهاز آخر.')}</small></div>
        <div style="display:flex;gap:6px"><button class="btn sm" data-act="set:export">⭳</button><button class="btn sm" data-act="set:import">⭱</button></div></div>
      <div class="opt"><div class="lbl"><b>${t('set.reset', 'مسح كل البيانات')}</b></div>
        <button class="btn sm danger" data-act="set:reset">🗑</button></div>
      <p class="hint">🔒 ${t('set.privacy', 'لا يتصل نغم بأي خادم إعلاني أو تحليلي. الطلبات تذهب مباشرة لمزودي الموسيقى فقط.')}</p>
    </div>

    <div class="panel">
      <h3>ℹ ${t('set.about', 'حول')}</h3>
      <p class="hint">${t('about.p', 'نغم تطبيق ويب تقدّمي (PWA) بلا بناء ولا خوادم: HTML + CSS + JavaScript خالص. يعمل كتطبيق مستقل، ويخزّن قوائمه محليًا.')}</p>
      <ul class="about-list">
        <li><b>Audius</b><span>أغانٍ كاملة ببث مجاني من الفنانين أنفسهم</span></li>
        <li><b>iTunes Search</b><span>معاينات 30 ثانية رسمية</span></li>
        <li><b>Radio Browser</b><span>دليل إذاعات مفتوح</span></li>
        <li><b>Media Session</b><span>تحكّم شاشة القفل + إشعار النظام</span></li>
        <li><b>Service Worker</b><span>واجهة تعمل بلا إنترنت + تثبيت</span></li>
      </ul>
      <div class="opt"><div class="lbl"><b>${t('about.keys', 'اختصارات لوحة المفاتيح')}</b><small>مسافة: تشغيل/إيقاف · ← →: ±10ث · L: إعجاب · Q: قائمة الانتظار · F: ملء الشاشة · /: بحث · M: كتم</small></div></div>
      ${s2_installRow()}
    </div>
  </div>`;
}
const s2_installRow = () => `<div class="opt"><div class="lbl"><b>${t('app.install', 'ثبّت التطبيق')}</b><small>${deferredPrompt ? t('about.installNow', 'متاح الآن — ثبّته بلمسة واحدة') : t('about.installHint', 'من قائمة المتصفح ⋮ → «إضافة إلى الشاشة الرئيسية»')}</small></div>
  <button class="btn sm primary" data-act="app:install" ${deferredPrompt ? '' : 'disabled'}>${t('app.install', 'تثبيت')}</button></div>`;
let deferredPrompt = null;
export const setDeferredPrompt = (v) => { deferredPrompt = v; };
const EQ_LABELS = ['60Hz', '230', '910', '3.6k', '12k'];
const EQ_PRESET_NAMES = { flat: 'مسطّح', bass: 'جهير', vocal: 'غناء', night: 'سهرة', rai: 'راي', rock: 'روك', elec: 'إلكترو' };

/* ------------------------------- mini ------------------------------- */
export function renderMini() {
  const wrap = $('#miniWrap'), el = $('#mini');
  const tr = player.track;
  if (!tr) { wrap.hidden = true; return; }
  wrap.hidden = false; wrap.classList.add('up');
  const liked = likes.has(tr.id);
  el.innerHTML = `
    <div class="art" style="background:${gradientFor(tr.id)}">${tr.art ? `<img src="${esc(tr.art)}" alt="" onerror="this.remove()">` : ''}</div>
    <div class="txt"><b>${esc(tr.title)}</b><span>${esc(tr.artist)}</span></div>
    <div class="ctrl">
      <button class="likeb" data-act="like" data-id="${esc(tr.id)}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button>
      <button class="pbtn" data-act="tr:prev" aria-label="السابق">⏮</button>
      <button class="pbtn" data-act="tr:toggle" aria-label="${player.playing ? 'إيقاف' : 'تشغيل'}">${player.playing ? '❚❚' : '▶'}</button>
      <button class="pbtn" data-act="tr:next" aria-label="التالي">⏭</button>
    </div>
    <button data-act="sheet:open" class="expand only-desktop" aria-label="ملء الشاشة">⤢</button>`;
  el.setAttribute('data-act', 'sheet:open');
  $('#railNow') && ($('#railNow').hidden = false, $('#railNow').innerHTML = `<span class="eqbars ${player.playing ? '' : 'paused'}"><i></i><i></i><i></i><i></i></span> <b>${esc(tr.title)}</b>`);
  syncTime({ pos: player.el?.currentTime || 0, dur: player.maxTime() });
}

/* ------------------------------- sheet ------------------------------- */
export function renderSheet() {
  const sh = $('#sheet');
  const tr = player.track;
  if (!tr) { sh.classList.remove('open'); sh.setAttribute('aria-hidden', 'true'); document.body.classList.remove('playing'); return; }
  const liked = likes.has(tr.id);
  const saved = dlSet.has(tr.id);
  const st = player.state();
  sh.innerHTML = `
  <div class="bg-art" ${tr.art ? `style="background-image:url('${esc(tr.art)}')"` : ''}></div>
  <div class="sheet-inner">
    <div class="dragger" data-act="sheet:close"></div>
    <div class="sheet-top">
      <button class="icon-btn" data-act="sheet:close" aria-label="${esc(t('common.close', 'إغلاق'))}">⌄</button>
      <div class="ttl">${tr.live ? '<span class="dot"></span> ' : ''}${esc(t('player.now', 'قيد التشغيل'))}${tr.src === 'itunes' ? ' · ' + t('player.preview30', 'معاينة') : ''}</div>
      <button class="icon-btn" data-act="ctx" data-id="${esc(tr.id)}" aria-label="خيارات">⋯</button>
    </div>

    <div class="sheet-body" id="sheetBody">
      <div class="cover-wrap ${player.playing ? 'spin' : ''}" id="coverWrap">
        <span class="glowdisc"></span>
        <div class="big-art" data-act="cover:tap" style="background:${gradientFor(tr.id)}">
          ${tr.art ? `<img src="${esc(tr.art)}" alt="" onerror="this.remove()">` : `<span class="ph">${esc(initials(tr.artist, tr.title))}</span>`}
          ${tr.live ? `<span class="live-badge"><span class="dot"></span>${t('radio.live', 'مباشر')}</span>` : ''}
        </div>
      </div>

      <div class="side-panel">
        <div class="track-head">
          <h3>${esc(tr.title)}</h3>
          <p>${tr.artist ? `<button data-act="nav:artist" data-handle="${esc(tr.artistHandle || '')}" ${tr.artistHandle ? '' : 'disabled style="opacity:.8"'}>${esc(tr.artist)}</button>` : ''}
            ${tr.album ? `· <span>${esc(tr.album)}</span>` : ''}
            <span class="src-tag">${tr.src === 'audius' ? 'Audius · ' + t('player.full', 'كاملة') : tr.src === 'itunes' ? 'iTunes · ' + t('player.preview30', 'معاينة') : 'Radio'}</span>
            ${saved ? `<span class="src-tag" style="color:var(--ok)">⤓ ${t('player.downloaded', 'متاحة بلا إنترنت')}</span>` : ''}
          </p>
        </div>

        <div class="viz ${st.fx ? '' : 'sim'}" id="viz" aria-hidden="true">${'<i></i>'.repeat(28)}</div>

        <div class="transport">
          <div class="seek" id="seek">
            <span id="cur">0:00</span>
            <div class="bar" role="slider" tabindex="0" aria-label="الموضع" aria-valuemin="0" aria-valuemax="${Math.round(tr.dur || 0)}" aria-valuenow="0">
              <div class="t"><b id="sb"></b></div><span class="knob" id="knob"></span>
            </div>
            <span id="dur">${tr.live ? '●' : fmtTime(st.dur)}</span>
          </div>
          <div class="ctrls">
            <button class="tbtn" data-act="tr:shuffle" aria-pressed="${st.shuffle}" title="${t('pl.shuffle', 'خلط')}">🔀</button>
            <button class="tbtn" data-act="tr:prev" title="السابق">⏮</button>
            <button class="play-main" data-act="tr:toggle" aria-label="${player.playing ? t('common.pause') : t('common.play')}">${player.playing ? '❚❚' : '▶'}</button>
            <button class="tbtn" data-act="tr:next" title="التالي">⏭</button>
            <button class="tbtn" data-act="tr:repeat" aria-pressed="${st.repeat !== 'off'}" title="${st.repeat === 'one' ? 'تكرار الأغنية' : 'تكرار القائمة'}">${st.repeat === 'one' ? '🔂' : '🔁'}</button>
          </div>
          <div class="row2">
            <div class="grp">
              <button class="tbtn" data-act="like" data-id="${esc(tr.id)}" aria-pressed="${liked}" title="${t('player.like')}">${liked ? '♥' : '♡'}</button>
              <button class="tbtn" data-act="dl:save" data-id="${esc(tr.id)}" aria-pressed="${saved}" title="${saved ? t('player.downloaded') : t('player.download')}">⤓</button>
              <button class="tbtn" data-act="drawer:queue" title="${t('player.queue', 'قائمة الانتظار')}">☰</button>
              <button class="tbtn" data-act="sheet:sleep" aria-pressed="${!!st.sleepAt}" title="${t('player.sleep')}">☾</button>
            </div>
            <div class="grp vol">
              <button class="tbtn" data-act="tr:mute" title="الصوت">${st.volume === 0 ? '🔇' : '🔉'}</button>
              <input type="range" min="0" max="1" step="0.01" value="${st.volume}" data-act="tr:vol" aria-label="مستوى الصوت">
            </div>
          </div>
          <div class="row2">
            <div class="grp"><button class="chip" data-act="sheet:eq" aria-pressed="${st.fx}">🎚 ${t('player.eq', 'معادل')}</button>
              <button class="chip" data-act="sheet:rate">${st.rate}×</button>
              <button class="chip" data-act="set:wake" aria-pressed="${wakeOn}">💡 الشاشة</button></div>
            <div class="grp"><button class="chip" data-act="share" data-id="${esc(tr.id)}">↗ ${t('common.share', 'مشاركة')}</button></div>
          </div>
          ${st.error ? `<div class="errbar">⚠ ${esc(st.error)} <button class="chip" data-act="tr:retry">${t('common.retry', 'إعادة')}</button></div>` : ''}
          ${player.buffering ? `<div class="errbar">${t('player.buffering', 'تحضير…')}</div>` : ''}
        </div>
      </div>
    </div>
  </div>`;
  sh.setAttribute('aria-hidden', 'false');
  sh.classList.add('open');
  document.body.classList.toggle('playing', player.playing);
  wireSheet();
  applyHue(tr);
  startViz();
}
async function applyHue(tr) {
  if (!cfg.get('artworkGlow') || !tr?.art) return;
  const c = await dominantColor(tr.art);
  if (!c) return;
  $('#sheet').style.setProperty('--sheet-hue', c);
  document.querySelector('.bg')?.style.setProperty('--accent-glow', c);
}

/* ------------------------------- drawer ------------------------------- */
let drawerMode = '';
export function openDrawer(mode) {
  drawerMode = mode;
  const d = $('#drawer');
  d.innerHTML = `<div class="drawer-head"><h3>${mode === 'queue' ? t('player.queue', 'قائمة الانتظار') : t('lib.playlists', 'قوائم التشغيل')}</h3>
    ${mode === 'queue' ? `<button class="chip" data-act="queue:clear">🗑 ${t('common.clear', 'تفريغ')}</button>` : ''}
    <button class="icon-btn x" data-act="drawer:close" aria-label="${t('common.close')}">✕</button></div>
    <div class="drawer-body" id="drawerBody"></div>`;
  syncQueue(true);
  d.classList.add('open'); $('#scrim').hidden = false; requestAnimationFrame(() => $('#scrim').classList.add('on'));
}
export function closeDrawer() {
  $('#drawer').classList.remove('open'); $('#scrim').classList.remove('on');
  setTimeout(() => { $('#scrim').hidden = true; }, 250);
}
export function syncQueue(force) {
  if (!$('#drawer').classList.contains('open')) return;
  if (drawerMode !== 'queue' && !force) return;
  const b = $('#drawerBody'); if (!b) return;
  const q = player.queue;
  if (!q.length) { b.innerHTML = emptyBox('☰', t('player.queueEmpty', 'القائمة فارغة'), 'أضف أغاني من زر ⋯ أو شغّل قائمة لتبدأ.'); return; }
  b.innerHTML = q.map((tr, i) => `<div class="row ${i === player.index ? 'active' : ''}" data-act="queue:go" data-i="${i}">
      <div class="n" data-n="${i + 1}">${i === player.index ? '<span class="eqbars ' + (player.playing ? '' : 'paused') + '"><i></i><i></i><i></i><i></i></span>' : ''}</div>
      <div class="th" style="background:${gradientFor(tr.id)}">${tr.art ? `<img src="${esc(tr.art)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
      <div class="meta"><b>${esc(tr.title)}</b><span>${esc(tr.artist)}</span></div>
      <div class="side"><span class="dur">${tr.live ? '●' : fmtTime(tr.dur)}</span>
        <button class="more" data-act="queue:top" data-i="${i}" title="التالي مباشرة">⇈</button>
        <button class="more" data-act="queue:rm" data-i="${i}" title="إزالة">✕</button></div>
    </div>`).join('');
}
function renderRailPlaylists() {
  const box = $('#railPlaylists'); if (!box) return;
  box.innerHTML = playlists.map((p) => `<button class="pl-link" data-act="nav:playlist" data-id="${p.id}">
    <span class="sq">${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : '≡'}</span>
    <span>${esc(p.name)}</span><small>${(p.tracks || []).length}</small></button>`).join('')
    || `<div class="pl-link" style="opacity:.65">لا قوائم بعد — اضغط +</div>`;
}
export function renderTabbarBadge() { /* placeholder for future badges */ void 0; }
export function paintLikes() {
  $$('[data-act="like"]').forEach((b) => { const on = likes.has(b.dataset.id); b.setAttribute('aria-pressed', on); b.textContent = on ? '♥' : '♡'; });
}

/* ------------------------------- context menu ------------------------------- */
function openCtx(x, y, id) {
  const tr = REG.get(id); if (!tr) return;
  ctxTarget = tr;
  const liked = likes.has(tr.id);
  const saved = dlSet.has(tr.id);
  const items = [
    ['ctx:next', '⏭', t('ctx.playNext', 'شغّل التالية')],
    ['ctx:queue', '⇥', t('player.addQueue', 'أضف لقائمة الانتظار')],
    ['ctx:like', liked ? '♥' : '♡', liked ? t('ctx.unlike', 'إزالة من المفضّلة') : t('ctx.like', 'أضف للمفضّلة')],
    ['ctx:pl', '≡', t('ctx.addToPlaylist', 'أضف إلى قائمة تشغيل')],
  ];
  if (tr.src === 'audius' && !tr.live) items.push(saved ? ['ctx:undl', '🗑', t('ctx.unsave', 'حذف النسخة المحفوظة')] : ['ctx:dl', '⤓', t('player.download', 'احفظها بلا إنترنت')]);
  items.push(['ctx:sep', '', '']);
  if (tr.artistHandle) items.push(['ctx:artist', '👤', `${t('ctx.artist', 'صفحة الفنان')} · ${tr.artist}`]);
  items.push(['ctx:copy', '⧉', t('ctx.copy', 'نسخ الاسم')]);
  if (tr.link) items.push(['ctx:ext', '↗', t('ctx.open', 'فتح لدى المزوّد')]);
  const menu = $('#ctx');
  menu.innerHTML = items.filter(([, , l]) => l).map(([a, i, l]) => `<button data-act="${a}" data-id="${esc(tr.id)}"><span class="i">${i}</span><span>${esc(l)}</span></button>`).join('');
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  const w = r.width || 240, h = r.height || 260;
  menu.style.insetInlineStart = 'auto'; menu.style.insetInlineEnd = 'auto';
  const px = clamp(x - (document.dir === 'rtl' ? w : 0), 8, innerWidth - w - 8);
  menu.style.left = px + 'px';
  menu.style.top = clamp(y, 8, innerHeight - h - 8) + 'px';
  if (y + h > innerHeight - 20) menu.style.top = Math.max(8, y - h - 12) + 'px';
}
const closeCtx = () => { const m = $('#ctx'); m.hidden = true; ctxTarget = null; };

/* ------------------------------- modal ------------------------------- */
export function openModal(html, onMount) {
  const m = $('#modal');
  m.innerHTML = `<div class="box">${html}</div>`;
  m.hidden = false;
  onMount?.(m);
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  const f = m.querySelector('input,select,button');
  setTimeout(() => f?.focus(), 30);
}
export const closeModal = () => { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; };

function modalAddToPlaylist(tr) {
  const rows = playlists.map((p) => `<button class="pl-pick" data-act="modal:addpl" data-pl="${p.id}" data-id="${esc(tr.id)}">
      <span class="sq">${p.cover ? `<img src="${esc(p.cover)}" alt="">` : '≡'}</span>
      <b>${esc(p.name)}</b><small>${(p.tracks || []).length}</small></button>`).join('');
  openModal(`<h3>${t('ctx.addToPlaylist', 'أضف إلى قائمة تشغيل')}</h3>
    <p class="sub">${esc(tr.title)} — ${esc(tr.artist)}</p>
    <div class="picks">${rows || ''}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn primary" data-act="modal:newpl" data-id="${esc(tr.id)}">+ ${t('lib.new', 'قائمة جديدة')}</button>
      <button class="btn ghost" data-act="modal:close">${t('common.cancel', 'إلغاء')}</button>
    </div>`);
}
function modalNewPlaylist(editId) {
  const p = editId ? playlists.find((x) => x.id === editId) : null;
  openModal(`<h3>${p ? t('pl.rename', 'إعادة تسمية') : t('lib.new', 'قائمة تشغيل جديدة')}</h3>
    <div class="field"><label>الاسم</label><input id="plName" type="text" maxlength="60" value="${esc(p?.name || '')}" placeholder="راي الليل · تمرينا…"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn ghost" data-act="modal:close">${t('common.cancel', 'إلغاء')}</button>
      <button class="btn primary" data-act="modal:savepl" data-edit="${p?.id || ''}">${p ? t('common.save') : t('common.create')}</button></div>`,
    (m) => m.querySelector('#plName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-act="modal:savepl"]', m).click(); }));
}
function modalSleep() {
  const cur = cfg.get('sleepMin') || 0;
  openModal(`<h3>${t('player.sleep', 'مؤقّت النوم')}</h3><p class="sub">يوقف التشغيل تدريجيًا بعد المدة المختارة.</p>
    <div class="chips">${[0, 10, 15, 30, 45, 60, 90, 120].map((v) => `<button class="chip" data-act="modal:sleep" data-v="${v}" aria-pressed="${v === cur}">${v ? v + ' دقيقة' : t('common.off', 'إيقاف')}</button>`).join('')}</div>
    <div class="field" style="margin-top:14px"><label>مدة مخصّصة (دقائق)</label><input id="sleepN" type="text" inputmode="numeric" placeholder="مثال: 25"></div>
    <button class="btn primary block" data-act="modal:sleepN">تطبيق</button>`);
}
function modalBgInfo() {
  openModal(`<h3>🎧 ${t('player.bg', 'الاستماع خارج التطبيق')}</h3>
  <p class="sub">نغم مضبوط للاستمرار في الصوت مع التطبيقات الأخرى.</p>
  <ul class="steps">
    <li><b>1.</b> ثبّت التطبيق: ⋮ في Chrome/Edge ← «إضافة إلى الشاشة الرئيسية» — عندئذٍ يعمل الصوت في الخلفية بلا توقف التبويب.</li>
    <li><b>2.</b> شغّل الأغنية ثم اخرج من التطبيق أو أقفل الشاشة؛ ستجد أزرار التشغيل في الإشعار وشاشة القفل (Media Session).</li>
    <li><b>3.</b> على iOS: التطبيق يجب أن يكون مُضافًا للشاشة الرئيسية، وإلا أوقف Safari الصوت عند التصغير.</li>
    <li><b>4.</b> فعّل «إبقاء الشاشة» إن أردت المشاهدة بلا إطفاء، أو أوقفه لتوفير البطارية.</li>
    <li><b>5.</b> الإذاعات الحيّة تعطي استماعًا مستمرًا بلا نهاية قائمة — مثالية للعمل والسهر.</li>
  </ul>
  <button class="btn primary block" data-act="modal:close">تم</button>`);
}

/* ============================ interactions ============================ */
function bindDelegates() {
  document.addEventListener('click', onClick);
  /* Enter/Space على الصفوف والبطاقات (role=button) = نفس نقرة الزر */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const n = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!n || n.tagName === 'BUTTON' || n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'A') return;
    e.preventDefault();
    n.click ? n.click() : onClick({ target: n, preventDefault() {}, stopPropagation() {} });
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) closeCtx(); }, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCtx(); closeModal(); closeDrawer(); if ($('#sheet').classList.contains('open')) closeSheet(); $('#rail').classList.remove('open'); } });
  const inp = $('#topSearch');
  inp?.addEventListener('input', debounce((e) => {
    query = e.target.value.trim();
    if (route.name !== 'search') location.hash = '#/search';
    doSearch();
  }, 420));
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); query = e.target.value.trim(); if (route.name !== 'search') location.hash = '#/search'; doSearch(true); } });
}

async function onClick(e) {
  const node = e.target.closest('[data-act]');
  if (!node) return;
  const act = node.dataset.act;
  const d = node.dataset;
  const tr = d.id ? REG.get(d.id) : null;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };

  switch (act) {
    /* تنقّل */
    case 'nav:home': case 'nav:search': case 'nav:library': case 'nav:radio': case 'nav:settings':
      stop(); location.hash = '#/' + act.split(':')[1]; $('#rail').classList.remove('open'); break;
    case 'nav:playlist': stop(); location.hash = '#/playlist/' + d.id; break;
    case 'nav:genre': stop(); location.hash = '#/genre/' + encodeURIComponent(d.genre); break;
    case 'nav:topic': stop(); location.hash = '#/topic/' + encodeURIComponent(d.q); break;
    case 'nav:list': stop(); location.hash = '#/list/' + encodeURIComponent(d.key); break;
    case 'nav:artist': if (d.handle) { stop(); location.hash = '#/artist/' + encodeURIComponent(d.handle); } break;
    case 'nav:back': stop(); history.back(); break;

    /* تشغيل */
    case 'play:row': {
      stop();
      const key = d.key, i = +d.i;
      const list = LISTS.get(key) || [];
      if (!list.length) break;
      const resumeOk = cfg.get('resume') && tr?.resumeAt;
      player.setQueue(list, i);
      if (resumeOk && tr.resumeAt > 5) setTimeout(() => player.seekTo(tr.resumeAt), 700);
      break;
    }
    case 'play:shelf': { stop(); const list = LISTS.get(d.key) || []; if (list.length) player.setQueue(list, 0); break; }
    case 'play:shuffle': { stop(); const list = LISTS.get(d.key) || []; if (!list.length) break;
      if (!player.shuffle) player.toggleShuffle();
      player.setQueue(list, Math.floor(Math.random() * list.length)); break; }
    case 'queue:all': { stop(); player.enqueue(LISTS.get(d.key) || []); break; }
    case 'tr:toggle': stop(); player.toggle(); break;
    case 'tr:next': stop(); player.next(); break;
    case 'tr:prev': stop(); player.prev(); break;
    case 'tr:shuffle': stop(); player.toggleShuffle(); break;
    case 'tr:repeat': stop(); player.cycleRepeat(); break;
    case 'tr:mute': stop(); player.toggleMute(); break;
    case 'tr:vol': break;
    case 'tr:retry': { stop(); if (player.track) player.load(player.track, { autoplay: true, resume: player.el?.currentTime || 0 }); break; }
    case 'sheet:open': stop(); openSheet(); break;
    case 'sheet:close': stop(); closeSheet(); break;
    case 'sheet:sleep': stop(); modalSleep(); break;
    case 'sheet:eq': stop(); location.hash = '#/settings'; setTimeout(() => $('#sheet')?.classList.remove('open'), 50); break;
    case 'sheet:rate': { stop(); const rates = [1, 1.25, 1.5, 2, 0.75]; player.setRate(rates[(rates.indexOf(player.rate) + 1) % rates.length]); break; }
    case 'cover:tap': stop(); break;

    /* مفضّلة / حفظ */
    case 'like': { stop(); if (!tr) break; const on = await store.toggleLike(tr); on ? likes.add(tr.id) : likes.delete(tr.id); paintLikes(); renderMini(); toast(on ? t('toast.liked', 'أُضيف للمفضّلة') : t('toast.unliked', 'أُزيل من المفضّلة'), 'ok', 1900); break; }
    case 'dl:save': { stop(); if (!tr) break; dlSet.has(tr.id) ? await doRemoveDownload(tr) : await doDownload(tr); break; }
    case 'ctx': stop(); openCtx(e.clientX || 20, e.clientY || 20, d.id); break;
    case 'ctx:queue': closeCtx(); player.enqueue(tr); break;
    case 'ctx:next': closeCtx(); player.playNextInQueue(tr); break;
    case 'ctx:like': closeCtx(); await likeTrack(tr); break;
    case 'ctx:pl': closeCtx(); modalAddToPlaylist(tr); break;
    case 'ctx:dl': closeCtx(); doDownload(tr); break;
    case 'ctx:undl': closeCtx(); doRemoveDownload(tr); break;
    case 'ctx:artist': closeCtx(); if (tr.artistHandle) location.hash = '#/artist/' + encodeURIComponent(tr.artistHandle); break;
    case 'ctx:copy': closeCtx(); copy(`${tr.title} — ${tr.artist}`); break;
    case 'ctx:ext': closeCtx(); window.open(tr.link, '_blank', 'noopener'); break;
    case 'share': closeCtx(); await share(tr); break;

    /* قائمة الانتظار */
    case 'drawer:queue': stop(); openDrawer('queue'); break;
    case 'drawer:close': stop(); closeDrawer(); break;
    case 'queue:go': stop(); player.load(player.queue[+d.i], { autoplay: true, index: +d.i }); syncQueue(true); break;
    case 'queue:rm': stop(); player.removeAt(+d.i); syncQueue(true); break;
    case 'queue:top': stop(); player.bump(+d.i); syncQueue(true); break;
    case 'queue:clear': stop(); player.clearQueue(); syncQueue(true); break;

    /* بحث */
    case 'search:tab': stop(); searchTab = d.tab; $('#searchBody') && ($('#searchBody').innerHTML = searchBody(api.TOPICS)); break;
    case 'search:q': stop(); query = d.q; $('#topSearch') && ($('#topSearch').value = d.q); const si = $('#searchInput'); if (si) si.value = d.q; if (route.name !== 'search') location.hash = '#/search'; doSearch(true); break;
    case 'search:go': stop(); doSearch(true); break;
    case 'search:clear': case 'search:clearq': stop(); query = ''; $('#topSearch') && ($('#topSearch').value = ''); storeLS.set('recentq', []); render('search'); break;

    /* مكتبة / قوائم */
    case 'lib:tab': stop(); libTab = d.tab; render('library'); break;
    case 'pl:new': stop(); modalNewPlaylist(); break;
    case 'pl:rename': stop(); modalNewPlaylist(d.id); break;
    case 'pl:del': stop(); confirmDelete(d.id); break;
    case 'modal:close': stop(); closeModal(); break;
    case 'modal:newpl': stop(); window.__plTrack = REG.get(d.id) || null; closeModal(); modalNewPlaylist(); break;
    case 'modal:savepl': stop(); await savePlaylist(d.edit); break;
    case 'modal:addpl': stop(); { const p = await store.addToPlaylist(d.pl, REG.get(d.id)); toast(`✓ ${p?.name || ''}`, 'ok', 2000); closeModal(); } break;
    case 'modal:sleep': stop(); { player.setSleep(+d.v); cfg.set('sleepMin', +d.v); closeModal(); toast(d.v ? `${t('toast.sleep', 'مؤقّت النوم')}: ${d.v} دقيقة` : t('common.off', 'أُوقف'), 'info'); } break;
    case 'modal:sleepN': stop(); { const n = clamp(parseInt($('#sleepN')?.value || '0', 10) || 0, 0, 600); player.setSleep(n); cfg.set('sleepMin', n); closeModal(); } break;

    /* إذاعة */
    case 'radio:cc': stop(); radioState = { ...radioState, cc: d.cc, tag: '' }; radioList = []; cfg.set('radioCountry', d.cc); render('radio'); api.radioTop({ cc: d.cc, limit: 60 }).then((r) => { radioList = r; if (route.name === 'radio') render('radio'); }); break;
    case 'radio:tag': stop(); radioState = { ...radioState, tag: d.tag }; radioList = []; render('radio'); api.radioSearch({ tag: d.tag, cc: radioState.cc, limit: 60 }).then((r) => { radioList = r; if (route.name === 'radio') render('radio'); }); break;
    case 'radio:reload': case 'radio:clearq': stop(); radioList = []; radioState = { ...radioState, q: act === 'radio:clearq' ? '' : radioState.q }; render('radio'); break;

    /* إعدادات */
    case 'set:theme': stop(); cfg.set('theme', d.theme); render('settings'); break;
    case 'set:accent': stop(); cfg.patch({ accent: d.a, accent2: d.b }); render('settings'); break;
    case 'set:lang': stop(); cfg.set('lang', d.lang); setLang(d.lang); location.reload(); break;
    case 'set:cfg': stop(); {
      const k = d.key;
      const nv = !cfg.get(k);
      cfg.set(k, nv);
      if (k === 'normalize' && cfg.get('eqOn')) player.setEqOn(true);
      if (k === 'artworkGlow' && nv) applyHue(player.track);
      render(route.name, route.param);
    } break;
    case 'set:eq': stop(); { const on = !cfg.get('eqOn'); player.setEqOn(on); render('settings'); if (on) toast('المعادل مفعّل — أعد تشغيل الأغنية إن لم تسمع صوتًا', 'info', 3200); } break;
    case 'eq:preset': stop(); { cfg.patch({ eq: EQ_PRESETS[d.p], eqPreset: d.p }); player.applyEq(EQ_PRESETS[d.p]); render('settings'); } break;
    case 'set:rate': stop(); player.setRate(+d.rate); render('settings'); break;
    case 'set:tap': stop(); cfg.set('tapSeek', +d.v); render('settings'); break;
    case 'set:sleep': stop(); player.setSleep(+d.v); cfg.set('sleepMin', +d.v); render('settings'); break;
    case 'set:src': stop(); cfg.set('defaultSource', d.v); render('settings'); break;
    case 'set:bginfo': stop(); modalBgInfo(); break;
    case 'set:clear': stop(); await clearCache(); break;
    case 'set:export': stop(); exportFile(); break;
    case 'set:import': stop(); importFile(); break;
    case 'set:reset': stop(); confirmReset(); break;
    case 'set:wake': stop(); toggleWake(); break;

    /* التطبيق */
    case 'app:install': stop(); await installApp(); break;
    case 'home:reload': stop(); homePromise = null; store.idb.del('cache', 'home:shelves').catch(() => {}); render('home'); break;
    default: break;
  }
}

/* ------------------------------ actions impl ------------------------------ */
async function doDownload(tr) {
  if (!tr) return;
  const bar = document.createElement('div');
  openModal(`<h3>⤓ ${t('player.download', 'حفظ للاستماع بلا إنترنت')}</h3><p class="sub">${esc(tr.title)} — ${esc(tr.artist)}</p>
    <div class="dlbar"><i></i></div><p class="sub" id="dlTxt">…</p>`, (m) => { bar.remove(); void m; });
  try {
    const blob = await player.download(tr, (p, got, total) => {
      const el = $('.dlbar i'), tx = $('#dlTxt');
      if (el) el.style.width = Math.round((p || 0.05) * 100) + '%';
      if (tx) tx.textContent = total ? `${Math.round(p * 100)}٪ · ${fmtBytes(got)} / ${fmtBytes(total)}` : fmtBytes(got);
    });
    await store.saveDownload(tr, blob);
    dlSet.add(tr.id);
    closeModal();
    toast(t('toast.saved', 'حُفظت — تعمل بلا إنترنت'), 'ok', 2600);
    if (player.track?.id === tr.id) player.load(tr, { autoplay: true, resume: player.el.currentTime });
  } catch (e) {
    closeModal();
    toast(e?.message?.includes('HTTP') ? 'تعذّر التنزيل (شبكة)' : String(e.message || 'غير مدعوم لهذا المصدر'), 'err', 3400);
  }
}
async function doRemoveDownload(tr) { await player.removeDownload(tr); dlSet.delete(tr.id); }

async function savePlaylist(editId) {
  const name = $('#plName')?.value?.trim();
  if (!name) { toast('اكتب اسمًا للقائمة', 'err', 2000); return; }
  if (editId) { await store.updatePlaylist(editId, { name }); toast('تم', 'ok', 1600); }
  else {
    const p = await store.createPlaylist(name);
    const tr = window.__plTrack; delete window.__plTrack;
    if (tr) await store.addToPlaylist(p.id, tr);
    toast(`✓ ${name}`, 'ok', 2200);
  }
  closeModal();
}
function confirmDelete(id) {
  const p = playlists.find((x) => x.id === id);
  openModal(`<h3>${t('pl.delQ', 'حذف القائمة؟')}</h3><p class="sub">${esc(p?.name || '')} — ${(p?.tracks || []).length} ${t('common.tracks', 'أغنية')}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-act="modal:close">${t('common.cancel')}</button>
    <button class="btn danger" data-act="modal:delp" data-id="${id}">${t('common.delete')}</button></div>`);
  $('#modal [data-act="modal:delp"]').onclick = async () => { await store.deletePlaylist(id); closeModal(); toast('حُذفت', 'ok', 1600); };
}
function confirmReset() {
  openModal(`<h3>${t('set.reset', 'مسح كل البيانات؟')}</h3><p class="sub">المفضّلة والقوائم والحفظ بلا إنترنت ستُحذف من هذا الجهاز نهائيًا.</p>
    <button class="btn danger block" id="yesReset">${t('set.resetYes', 'نعم، امسح كل شيء')}</button>
    <button class="btn ghost block" data-act="modal:close" style="margin-top:8px">${t('common.cancel')}</button>`);
  $('#yesReset').onclick = async () => { await store.clearAllData({ keepPrefs: true }); closeModal(); toast('تم المسح', 'ok'); location.reload(); };
}
async function copy(s) { try { await navigator.clipboard.writeText(s); toast(t('toast.copied', 'تم النسخ'), 'ok', 1500); } catch { toast(s); } }
async function share(tr) {
  const data = { title: `${tr.title} — ${tr.artist}`, text: `من نغم: ${tr.title} (${tr.artist})${tr.link ? ' — ' + tr.link : ''}`, url: tr.link || location.href };
  try { if (navigator.share) { await navigator.share(data); return; } } catch { return; }
  await copy(tr.link || `${tr.title} — ${tr.artist}`);
}
async function clearCache() {
  const keys = await store.idb.keys('cache').catch(() => []);
  for (const k of keys) await store.idb.del('cache', k).catch(() => {});
  homePromise = null;
  if ('caches' in window) { const cs = await caches.keys(); await Promise.all(cs.filter((c) => c.startsWith('nagham-shell')).map((c) => caches.delete(c))); }
  toast('تم تفريغ الكاش', 'ok', 2000);
  showSize();
}
function exportFile() {
  store.exportData().then((d) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }));
    a.download = `nagham-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('تم التصدير', 'ok');
  });
}
function importFile() {
  openModal(`<h3>${t('set.import', 'استيراد بيانات')}</h3><p class="sub">اختر ملف nagham-*.json صدّرتَه سابقًا.</p>
    <input type="file" id="impFile" accept="application/json,.json" class="file">
    <button class="btn primary block" id="impGo" style="margin-top:12px">${t('set.import')}</button>`);
  $('#impGo').onclick = async () => {
    const f = $('#impFile').files?.[0]; if (!f) return toast('اختر ملفًا أولًا', 'err');
    try { await store.importData(JSON.parse(await f.text())); closeModal(); toast('تم الاستيراد', 'ok'); setTimeout(() => location.reload(), 600); }
    catch { toast('ملف غير صالح', 'err', 3000); }
  };
}
async function showSize() {
  const info = await store.storageInfo().catch(() => null);
  const line = $('#sizeLine');
  if (line && info) line.textContent = `محفوظ: ${info.files} ملف · ${fmtBytes(info.bytes)}${info.usage ? ` · الكلي ${fmtBytes(info.usage)}` : ''} · ${info.favs} مفضّلة`;
}

/* -------------------------------- search flow -------------------------------- */
async function doSearch(force) {
  const inp = $('#searchInput'); if (inp) inp.value = query;
  const box = $('#searchBody');
  if (!query) { searching = false; box && (box.innerHTML = searchBody(api.TOPICS)); return; }
  searching = true; box && (box.innerHTML = searchBody());
  try {
    let res;
    if (searchTab === 'radio') { const r = await api.radioSearch({ q: query, limit: 30 }); res = { full: [], preview: [], radio: r }; }
    else if (searchTab === 'full') { res = { full: await api.audiusSearch(query, { limit: 30 }), preview: [], radio: [] }; }
    else if (searchTab === 'preview') { res = { full: [], preview: await api.itunesSearch(query, { limit: 30, country: cfg.get('store') }), radio: [] }; }
    else res = await api.searchAll(query, { country: cfg.get('store'), limit: 25 });
    if (searchTab === 'all' && cfg.get('defaultSource') === 'full') res.preview = [];
    if (searchTab === 'all' && cfg.get('defaultSource') === 'preview') res.full = [];
    searchResults = res; searching = false; searchedOnce = true;
    const rq = [query, ...(storeLS.get('recentq', []) || [])].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 10);
    storeLS.set('recentq', rq);
  } catch { searching = false; toast('تعذّر البحث — تحقّق من الاتصال', 'err', 2600); }
  if (route.name === 'search') { const b = $('#searchBody'); if (b) b.innerHTML = searchBody(); }
  void force;
}

/* -------------------------------- sheet open -------------------------------- */
export function openSheet() { if (!player.track) return; renderSheet(); $('#sheet').classList.add('open'); document.body.classList.toggle('playing', player.playing); }
export function closeSheet() { $('#sheet').classList.remove('open'); document.body.classList.remove('playing'); stopViz(); }

/* ------------------------------- time sync ------------------------------- */
function syncTime({ pos = 0, dur = 0, buffered = 0 } = {}) {
  const pct = dur ? clamp((pos / dur) * 100, 0, 100) : 0;
  const mp = $('#miniProgress i'); if (mp) mp.style.width = pct + '%';
  const sb = $('#sb'); if (sb) sb.style.width = pct + '%';
  const kn = $('#knob'); if (kn) kn.style.insetInlineStart = pct + '%';
  const cur = $('#cur'); if (cur) cur.textContent = fmtTime(pos);
  const dl = $('#dur'); if (dl && player.track && !player.track.live) dl.textContent = dur ? fmtTime(dur) : '';
  const bar = $('#seek .bar'); if (bar) bar.setAttribute('aria-valuenow', Math.round(pos));
  void buffered;
}

/* ------------------------------ seek & sliders ------------------------------ */
function wireSheet() {
  const bar = $('#seek .bar');
  if (bar) {
    const set = (clientX) => {
      const r = bar.getBoundingClientRect();
      let p = (clientX - r.left) / r.width;
      if (document.dir === 'rtl') p = 1 - p;
      const dur = player.maxTime();
      if (dur) player.seekTo(clamp(p, 0, 1) * dur);
    };
    let dragging = false;
    bar.addEventListener('pointerdown', (e) => { dragging = true; bar.classList.add('drag'); bar.setPointerCapture(e.pointerId); set(e.clientX); });
    bar.addEventListener('pointermove', (e) => { if (dragging) set(e.clientX); });
    bar.addEventListener('pointerup', (e) => { dragging = false; bar.classList.remove('drag'); try { bar.releasePointerCapture(e.pointerId); } catch {} });
    bar.addEventListener('keydown', (e) => {
      const s = cfg.get('tapSeek') || 10;
      if (e.key === 'ArrowRight') { e.preventDefault(); player.nudge(document.dir === 'rtl' ? -s : s); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); player.nudge(document.dir === 'rtl' ? s : -s); }
    });
  }
  const vol = $('input[data-act="tr:vol"]');
  vol?.addEventListener('input', (e) => player.setVolume(+e.target.value));
  /* نقرتان على الغلاف = تقديم/ترجيع */
  const cover = $('.big-art');
  let lastTap = 0;
  cover?.addEventListener('dblclick', (e) => {
    const r = cover.getBoundingClientRect();
    const right = e.clientX > r.left + r.width / 2;
    const fwd = document.dir === 'rtl' ? !right : right;
    player.nudge((fwd ? 1 : -1) * (cfg.get('tapSeek') || 10));
    flash(cover, fwd ? '➜' : '⬅');
    void lastTap;
  });
  cover?.addEventListener('click', () => { if (isTouch()) { /* لمسة واحدة: لا شيء — الإيماءة للسحب */ } });
  /* سحب للأسفل للإغلاق */
  const dragger = $('.dragger')?.parentElement?.querySelector('.sheet-top') || $('.sheet-top');
  let sy = null;
  dragger?.addEventListener('pointerdown', (e) => { sy = e.clientY; });
  dragger?.addEventListener('pointerup', (e) => { if (sy != null && e.clientY - sy > 60) closeSheet(); sy = null; });
}
function flash(host, glyph) {
  const n = document.createElement('span');
  n.className = 'flash'; n.textContent = glyph;
  host.appendChild(n);
  setTimeout(() => n.remove(), 620);
}

/* ------------------------------ visualizer ------------------------------ */
function startViz() {
  stopViz();
  const host = $('#viz'); if (!host) return;
  const bars = $$('#viz i');
  if (prefersReduced() || document.hidden) return;
  const step = () => {
    if (!$('#sheet')?.classList.contains('open')) return stopViz();
    if (document.hidden) { rafViz = requestAnimationFrame(step); return; }
    const real = player.levels();
    for (let i = 0; i < bars.length; i++) {
      let h;
      if (real) h = player.playing ? 8 + real[i % real.length] * 92 : 6;
      else {
        const t0 = (player.el?.currentTime || 0) * 2.2;
        h = player.playing ? 10 + (Math.sin(t0 + i * 0.55) * 0.5 + 0.5) * 55 * (0.6 + 0.4 * Math.abs(Math.sin(t0 * 0.7 + i))) : 6;
      }
      bars[i].style.height = clamp(h, 4, 100) + '%';
    }
    rafViz = requestAnimationFrame(step);
  };
  rafViz = requestAnimationFrame(step);
}
function stopViz() { if (rafViz) cancelAnimationFrame(rafViz); rafViz = null; }

/* ------------------------------ wake lock / install ------------------------------ */
let wl = null;
export const wakeWanted = () => wakeOn;
export async function reacquireWake() {
  if (!wakeOn) return;
  try { wl = await navigator.wakeLock?.request('screen'); } catch { wakeOn = false; }
}
export async function toggleWake() {
  try {
    if (wl) { await wl.release(); wl = null; wakeOn = false; }
    else { wl = await navigator.wakeLock?.request('screen'); wakeOn = !!wl; if (wl) wl.addEventListener?.('release', () => { /* أُطلق تلقائيًا */ }); }
    toast(wakeOn ? 'الشاشة تبقى عامدة 💡' : 'أُلغي إبقاء الشاشة', 'info', 1800);
  } catch { wakeOn = false; toast('المتصفح لا يسمح بإبقاء الشاشة هنا', 'err', 2600); }
  if (route.name === 'settings') render('settings');
}
export async function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'unknown' }));
    if (outcome === 'accepted') { toast('جارٍ التثبيت…', 'ok'); deferredPrompt = null; $('#installBtn').hidden = true; }
  } else modalBgInfo();
}
export const netOnline = () => { const c = $('#netChip'); if (c) c.hidden = navigator.onLine; };

/* ------------------------- shared helpers (used by app.js) ------------------------- */
export async function likeTrack(tr) {
  if (!tr) return;
  const on = await store.toggleLike(tr);
  on ? likes.add(tr.id) : likes.delete(tr.id);
  paintLikes(); renderMini();
  toast(on ? t('toast.liked', 'أُضيف للمفضّلة') : t('toast.unliked', 'أُزيل من المفضّلة'), 'ok', 1900);
}
export function newPlaylistModal() { modalNewPlaylist(); }
export function renderRail() {
  renderRailPlaylists();
  renderMini();
}
/** يحدّث مؤشرات الحفظ/الإعجاب داخل الصفحات المفتوحة */
function mark() {
  $$('[data-act="dl:save"]').forEach((b) => { const on = dlSet.has(b.dataset.id); b.setAttribute('aria-pressed', String(on)); b.style.color = on ? 'var(--ok)' : ''; });
  $$('[data-act="ctx:dl"]').forEach(() => {});
  paintLikes();
}

