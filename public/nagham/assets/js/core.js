/* =====================================================================
   نغم — core.js · أدوات عامة + الترجمة + ناقل الأحداث
   ===================================================================== */

/* ---------------------------------- i18n --------------------------------- */
export const LANGS = { ar: 'العربية', en: 'English', fr: 'Français' };

const DICT = {
  ar: {
    'brand.sub': 'موسيقى بلا حدود', 'nav.home': 'الرئيسية', 'nav.search': 'بحث', 'nav.library': 'مكتبتك',
    'nav.radio': 'الإذاعة', 'nav.settings': 'الإعدادات', 'nav.playlists': 'قوائم التشغيل', 'app.install': 'ثبّت التطبيق',
  },
  en: {
    'brand.sub': 'Music without limits',
    'nav.home': 'Home', 'nav.search': 'Search', 'nav.library': 'Your Library',
    'nav.radio': 'Radio', 'nav.settings': 'Settings', 'nav.playlists': 'Playlists',
    'app.install': 'Install app', 'app.installed': 'Installed',
    'common.play': 'Play', 'common.pause': 'Pause', 'common.all': 'All', 'common.more': 'More',
    'common.close': 'Close', 'common.retry': 'Retry', 'common.cancel': 'Cancel', 'common.save': 'Save',
    'common.delete': 'Delete', 'common.create': 'Create', 'common.add': 'Add', 'common.share': 'Share',
    'common.loading': 'Loading…', 'common.clear': 'Clear', 'common.results': 'Results', 'common.apply': 'Apply',
    'common.off': 'Off', 'common.on': 'On', 'common.tracks': 'tracks', 'common.copy': 'Copy',
    'home.hero.title': 'Your sound, one tap away',
    'home.hero.sub': 'Free full tracks, hit previews and live radio — with lock-screen controls and offline mixes.',
    'home.hero.cta': 'Play trending', 'home.hero.cta2': 'Browse genres',
    'home.trending': 'Trending now', 'home.forYou': 'Picked for you', 'home.newAlbums': 'Fresh drops',
    'home.genres': 'Browse by genre', 'home.recent': 'Continue listening', 'home.plays': 'plays',
    'search.ph': 'Song, artist, Rai, Chaabi…', 'search.all': 'Everything', 'search.full': 'Full tracks',
    'search.preview': 'Hit previews', 'search.radio': 'Stations', 'search.recent': 'Recent searches',
    'search.topics': 'Popular topics', 'search.none': 'Nothing found. Try different words.',
    'search.for': 'Results for',
    'lib.likes': 'Liked', 'lib.playlists': 'Playlists', 'lib.downloads': 'Offline', 'lib.recent': 'Recently played',
    'lib.new': 'New playlist', 'lib.empty': 'Nothing here yet',
    'radio.title': 'Live radio', 'radio.sub': 'Free streaming stations — perfect for background listening.',
    'radio.live': 'LIVE', 'radio.fav': 'Favorite stations',
    'player.now': 'Now playing', 'player.queue': 'Queue', 'player.queueEmpty': 'Queue is empty',
    'player.nextUp': 'Next up', 'player.addQueue': 'Add to queue', 'player.playNext': 'Play next',
    'player.like': 'Like', 'player.download': 'Save offline', 'player.downloaded': 'Saved offline',
    'player.sleep': 'Sleep timer', 'player.speed': 'Speed', 'player.eq': 'Equalizer',
    'player.bg': 'Background play', 'player.upnext': 'Up next', 'player.preview30': '30s preview',
    'player.full': 'Full track', 'player.buffering': 'Buffering…', 'player.error': 'Playback failed — trying another source',
    'set.appearance': 'Appearance', 'set.theme': 'Theme', 'set.accent': 'Accent colour',
    'set.motion': 'Animations', 'set.audio': 'Sound', 'set.eqNote': 'The equalizer needs CORS-friendly sources.',
    'set.playback': 'Playback', 'set.content': 'Content', 'set.data': 'Storage & privacy', 'set.about': 'About',
    'set.lang': 'Language', 'set.store': 'Music store', 'set.autoPlay': 'Autoplay similar', 'set.tap': 'Double-tap seek',
    'set.normalize': 'Volume limiter', 'set.clear': 'Clear cache', 'set.export': 'Export my data',
    'set.import': 'Import data', 'set.cacheSize': 'Used space',
    'ctx.addToPlaylist': 'Add to playlist', 'ctx.remove': 'Remove from playlist',
    'toast.liked': 'Added to Liked Songs', 'toast.unliked': 'Removed from Liked Songs',
    'toast.added': 'Added', 'toast.copied': 'Copied to clipboard', 'toast.offline': 'You are offline',
    'toast.sleep': 'Sleep timer', 'toast.install': 'Install “نغم” from your browser menu to get the full-screen app',
  },
  fr: {
    'brand.sub': 'La musique sans limites',
    'nav.home': 'Accueil', 'nav.search': 'Recherche', 'nav.library': 'Bibliothèque',
    'nav.radio': 'Radio', 'nav.settings': 'Réglages', 'nav.playlists': 'Playlists',
    'app.install': 'Installer', 'app.installed': 'Installé',
    'common.play': 'Lecture', 'common.pause': 'Pause', 'common.all': 'Tout', 'common.more': 'Plus',
    'common.close': 'Fermer', 'common.retry': 'Réessayer', 'common.cancel': 'Annuler', 'common.save': 'Enregistrer',
    'common.delete': 'Supprimer', 'common.create': 'Créer', 'common.add': 'Ajouter', 'common.share': 'Partager',
    'common.loading': 'Chargement…', 'common.clear': 'Effacer', 'common.results': 'Résultats', 'common.apply': 'Appliquer',
    'common.off': 'Non', 'common.on': 'Oui', 'common.tracks': 'titres', 'common.copy': 'Copier',
    'home.hero.title': 'Votre son, en un tap',
    'home.hero.sub': 'Titres complets gratuits, extraits de tubes et radios en direct — commandes écran verrouillé et mix hors-ligne.',
    'home.hero.cta': 'Lancer les tendances', 'home.hero.cta2': 'Parcourir les genres',
    'home.trending': 'Tendances', 'home.forYou': 'Pour vous', 'home.newAlbums': 'Nouveautés',
    'home.genres': 'Par genre', 'home.recent': 'Reprendre l’écoute', 'home.plays': 'lectures',
    'search.ph': 'Titre, artiste, Rai, Chaâbi…', 'search.all': 'Tout', 'search.full': 'Titres complets',
    'search.preview': 'Extraits', 'search.radio': 'Stations', 'search.recent': 'Recherches récentes',
    'search.topics': 'Sujets populaires', 'search.none': 'Aucun résultat. Essayez-autres mots.',
    'search.for': 'Résultats pour',
    'lib.likes': 'Titres aimés', 'lib.playlists': 'Playlists', 'lib.downloads': 'Hors-ligne', 'lib.recent': 'Écoutés récemment',
    'lib.new': 'Nouvelle playlist', 'lib.empty': 'Rien ici pour le moment',
    'radio.title': 'Radio en direct', 'radio.sub': 'Stations gratuites — idéal en arrière-plan.',
    'radio.live': 'EN DIRECT', 'radio.fav': 'Stations favorites',
    'player.now': 'Lecture en cours', 'player.queue': 'File', 'player.queueEmpty': 'File vide',
    'player.nextUp': 'À suivre', 'player.addQueue': 'Ajouter à la file', 'player.playNext': 'Lire ensuite',
    'player.like': 'Aimer', 'player.download': 'Garder hors-ligne', 'player.downloaded': 'Enregistré',
    'player.sleep': 'Minuterie', 'player.speed': 'Vitesse', 'player.eq': 'Égaliseur',
    'player.bg': 'Lecture arrière-plan', 'player.upnext': 'Suite', 'player.preview30': 'Extrait 30 s',
    'player.full': 'Titre complet', 'player.buffering': 'Mise en mémoire…', 'player.error': 'Lecture impossible — autre source',
    'set.appearance': 'Apparence', 'set.theme': 'Thème', 'set.accent': 'Couleur',
    'set.motion': 'Animations', 'set.audio': 'Son', 'set.eqNote': 'L’égaliseur exige des sources compatibles CORS.',
    'set.playback': 'Lecture', 'set.content': 'Contenu', 'set.data': 'Stockage', 'set.about': 'À propos',
    'set.lang': 'Langue', 'set.store': 'Boutique musicale', 'set.autoPlay': 'Lecture auto similaire', 'set.tap': 'Double-tap = seek',
    'set.normalize': 'Limiteur de volume', 'set.clear': 'Vider le cache', 'set.export': 'Exporter mes données',
    'set.import': 'Importer', 'set.cacheSize': 'Espace utilisé',
    'ctx.addToPlaylist': 'Ajouter à une playlist', 'ctx.remove': 'Retirer de la playlist',
    'toast.liked': 'Ajouté aux titres aimés', 'toast.unliked': 'Retiré des titres aimés',
    'toast.added': 'Ajouté', 'toast.copied': 'Copié', 'toast.offline': 'Vous êtes hors-ligne',
    'toast.sleep': 'Minuterie', 'toast.install': 'Installez « نغم » depuis le menu du navigateur pour l’app plein écran',
  },
};

let lang = 'ar';
export function setLang(l) {
  lang = LANGS[l] ? l : 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((n) => {
    const v = DICT[lang]?.[n.dataset.i18n] ?? (lang === 'ar' ? null : DICT.en[n.dataset.i18n]);
    if (v) n.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => {
    const v = DICT[lang]?.[n.dataset.i18nPh] ?? (lang === 'ar' ? null : DICT.en[n.dataset.i18nPh]);
    if (v) n.placeholder = v;
  });
  bus.emit('lang');
}
export function getLang() { return lang; }
/** t(key, fallbackArabic) — Arabic is the source of truth, EN/FR dictionaries overlay it. */
export function t(key, fallback) {
  const v = DICT[lang]?.[key];
  if (v) return v;
  return fallback ?? key;
}

/* --------------------------------- events -------------------------------- */
export const bus = {
  m: new Map(),
  on(ev, fn) { (this.m.get(ev) ?? this.m.set(ev, new Set()).get(ev)).add(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this.m.get(ev)?.delete(fn); },
  emit(ev, data) { this.m.get(ev)?.forEach((f) => { try { f(data); } catch (e) { console.warn('[bus]', ev, e); } }); },
};

/* --------------------------------- helpers -------------------------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

export function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function debounce(fn, ms = 260) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function initials(...parts) {
  const s = parts.filter(Boolean).join(' ').trim();
  if (!s) return '♪';
  const words = s.split(/\s+/).slice(0, 2);
  return words.map((w) => [...w][0]).join('');
}

/** deterministic gradient for missing artwork */
export function gradientFor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360, b = (a + 55 + (h % 60)) % 360;
  return `linear-gradient(135deg,hsl(${a} 72% 46%),hsl(${b} 78% 32%))`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ localStorage ------------------------------ */
export const ls = {
  get(k, d) { try { const v = localStorage.getItem('nagham:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nagham:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('nagham:' + k); } catch {} },
};

/* ----------------------------- settings object ---------------------------- */
const DEFAULTS = {
  lang: 'ar', theme: 'dark', accent: '#8b5cf6', accent2: '#22d3ee',
  motion: true, artworkGlow: true,
  store: 'DZ', defaultSource: 'auto', normalize: true, gapless: false,
  tapSeek: 10, autoplaySimilar: true, resume: true, crossOriginFx: false,
  radioCountry: 'DZ', volume: 1, rate: 1, sleepMin: 0,
  eqOn: false, eq: [0, 0, 0, 0, 0], eqPreset: 'flat',
  sizeCapMB: 400, hintBgShown: false,
};
let settings = { ...DEFAULTS, ...(ls.get('settings', {}) || {}) };
if (settings.lang === undefined) settings.lang = 'ar';

export const cfg = {
  all: () => ({ ...settings }),
  get: (k) => settings[k],
  set(k, v) {
    settings[k] = v; ls.set('settings', settings); bus.emit('cfg', { k, v });
    applyThemeVars();
  },
  patch(o) { Object.assign(settings, o); ls.set('settings', settings); applyThemeVars(); bus.emit('cfg', o); },
};

export function applyThemeVars() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme;
  r.dataset.motion = settings.motion ? 'on' : 'off';
  r.style.setProperty('--accent', settings.accent);
  r.style.setProperty('--accent-2', settings.accent2);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = settings.theme === 'light' ? '#f6f5fb' : settings.theme === 'amoled' ? '#000000' : '#0c0a1a';
}

/* -------------------------------- fetching -------------------------------- */
export async function fetchJSON(url, { timeout = 14000, headers, retries = 1, signal } = {}) {
  let lastErr;
  for (let a = 0; a <= retries; a++) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeout);
    if (signal) signal.addEventListener?.('abort', () => ac.abort(), { once: true });
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', ...(headers || {}) }, signal: ac.signal, mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (a < retries) await sleep(350 * (a + 1));
    } finally { clearTimeout(to); }
  }
  throw lastErr;
}

/** JSONP escape-hatch for APIs without CORS (iTunes Search supports `callback`). */
export function jsonp(url, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const name = `__nagham_${Math.random().toString(36).slice(2, 8)}`;
    const s = document.createElement('script');
    const timer = setTimeout(() => done(new Error('timeout')), timeout);
    function done(err) {
      clearTimeout(timer); delete window[name]; s.remove();
      err ? reject(err) : 0;
    }
    window[name] = (data) => { done(); resolve(data); };
    s.onerror = () => done(new Error('jsonp blocked'));
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + name;
    document.head.appendChild(s);
  });
}

/** fetch JSON, and if CORS blocks it, retry as JSONP. */
export async function fetchJSONOrJsonp(url, opts) {
  try { return await fetchJSON(url, opts); }
  catch (e) {
    if (e instanceof TypeError || /timeout|network|Failed/i.test(String(e.message))) {
      try { return await jsonp(url, opts); } catch { throw e; }
    }
    throw e;
  }
}

/* --------------------------------- toasts --------------------------------- */
let toastId = 0;
export function toast(msg, kind = '', ms = 3200) {
  const box = $('#toasts'); if (!box) return;
  const n = document.createElement('div');
  n.className = `toast ${kind}`;
  const ic = kind === 'ok' ? '✓' : kind === 'err' ? '!' : kind === 'info' ? '♪' : '•';
  n.innerHTML = `<span class="ic">${ic}</span><span>${esc(msg)}</span>`;
  box.appendChild(n);
  const id = ++toastId;
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 320); }, ms);
  n.addEventListener('click', () => { n.remove(); void id; });
  return n;
}

/* ------------------------- dominant colour from artwork ------------------- */
const colorCache = new Map();
export async function dominantColor(url) {
  if (!url) return null;
  if (colorCache.has(url)) return colorCache.get(url);
  const out = new Promise((resolve) => {
    if (/^(?:blob|data):/.test(url)) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const done = (v) => { colorCache.set(url, v); if (v) bus.emit('hue', v); resolve(v); };
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        const s = 32; c.width = s; c.height = s;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, s, s);
        const d = g.getImageData(0, 0, s, s).data;
        let r = 0, gg = 0, b = 0, n = 0, best = null, bestSat = -1;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          r += R; gg += G; b += B; n++;
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = mx ? (mx - mn) / mx : 0;
          if (sat > bestSat && mx > 40) { bestSat = sat; best = [R, G, B]; }
        }
        const c1 = best || [r / n, gg / n, b / n];
        done(`rgb(${c1.map((x) => Math.round(clamp(x * 1.15, 24, 255))).join(',')})`);
      } catch { done(null); }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
  return out;
}

export const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isTouch = () => matchMedia('(hover: none)').matches;
export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return ['🌙', t('greet.night', 'سهرة هادئة'), 'greet.night'];
  if (h < 12) return ['☀️', t('greet.morning', 'صباح النغم'), 'greet.morning'];
  if (h < 18) return ['🌤️', t('greet.afternoon', 'مساء الخير'), 'greet.afternoon'];
  return ['🌆', t('greet.evening', 'مساء النغم'), 'greet.evening'];
}
