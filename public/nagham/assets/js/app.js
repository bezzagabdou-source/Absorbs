/* =====================================================================
   نغم — app.js · الإقلاع: التنقّل، الأزرار، خدمة Worker، التثبيت، الاختصارات
   ===================================================================== */
import { $, bus, cfg, applyThemeVars, setLang, toast, t, esc, debounce } from './core.js';
import * as ui from './ui.js';
import { player } from './player.js';

const NAV = [
  { name: 'home', ar: 'الرئيسية', en: 'Home', icon: '🏠' },
  { name: 'search', ar: 'بحث', en: 'Search', icon: '🔎' },
  { name: 'library', ar: 'المكتبة', en: 'Library', icon: '🎵' },
  { name: 'radio', ar: 'الإذاعة', en: 'Radio', icon: '📻' },
];
const KNOWN = ['home', 'search', 'library', 'radio', 'settings', 'playlist', 'list', 'genre', 'topic', 'artist'];

/* --------------------------------- router --------------------------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = raw.split('/');
  return { name: name || 'home', param: decodeURIComponent(rest.join('/') || '') };
}
export function go(name, param = '') {
  const next = `#/${name}${param ? '/' + encodeURIComponent(param) : ''}`;
  if (location.hash.split('?')[0] === next.split('?')[0]) ui.render(name, param);
  else location.hash = next;
}
function routeFromHash() {
  const { name, param } = parseHash();
  ui.render(KNOWN.includes(name) ? name : 'home', param);
}

/* ------------------------------- navigation ------------------------------- */
function buildNav() {
  const label = (n) => t('nav.' + n.name, n.ar);
  $('#railNav').innerHTML = NAV.map((n) => `<button class="nav-btn" data-nav="${n.name}"><span class="ico">${n.icon}</span><span>${esc(label(n))}</span></button>`).join('');
  $('#tabbar').innerHTML = NAV.map((n) => `<button data-nav="${n.name}"><span class="ico">${n.icon}</span><span>${esc(label(n))}</span></button>`).join('');
  const wire = (scope) => scope.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    go(b.dataset.nav);
    $('#rail').classList.remove('open');
  });
  wire($('#railNav')); wire($('#tabbar'));
  bus.on('lang', () => buildNav());
}

/* ------------------------------ install prompt ----------------------------- */
let deferred = null;
async function checkInstall() {
  const btn = $('#installBtn');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) { btn.hidden = true; return; }
  if (localStorage.getItem('nagham:dismissed-install')) { btn.hidden = true; return; }
  btn.hidden = !deferred;
  btn.textContent = t('app.install', 'ثبّت التطبيق');
}
window.addEventListener('beforeinstallprompt', async (e) => {
  e.preventDefault();
  deferred = e;
  ui.setDeferredPrompt(e);
  $('#installBtn').hidden = false;
});
$('#installBtn')?.addEventListener('click', () => ui.installApp());
window.addEventListener('appinstalled', () => {
  $('#installBtn').hidden = true;
  toast('🎉 ' + t('toast.installed', 'تم تثبيت نغم — شغّله من شاشتك الرئيسية'), 'ok', 4000);
});

/* --------------------------------- service worker -------------------------------- */
async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && navigator.serviceWorker.controller) {
          const n = toast('نسخة جديدة متاحة — حدّث', 'info', 8000);
          n?.style.setProperty('cursor', 'pointer');
          n?.addEventListener('click', () => location.reload());
        }
      });
    });
  } catch (e) { console.info('[sw] غير مسجّل:', e?.message || e); }
}

/* ------------------------------- global keys ------------------------------- */
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    /* لو العنصر المركَّز عليه قابل للنقر (صف/بطاقة) فليتولّ هو المسافة — لا نكسر تشغيله */
    const actionable = e.target && e.target.closest && e.target.closest('[data-act]');
    if (actionable && (e.key === ' ' || e.key === 'Enter' || e.key === 'l' || e.key === 'L')) return;
    const step = cfg.get('tapSeek') || 10;
    const rtl = document.dir === 'rtl';
    switch (e.key) {
      case ' ': e.preventDefault(); player.toggle(); break;
      case 'k': case 'K': player.toggle(); break;
      case 'ArrowRight': if (!e.shiftKey) { player.nudge(rtl ? -step : step); e.preventDefault(); } break;
      case 'ArrowLeft': if (!e.shiftKey) { player.nudge(rtl ? step : -step); e.preventDefault(); } break;
      case 'l': case 'L': { const tr = player.track; if (tr) { const b = $(`[data-act="like"][data-id="${CSS.escape(tr.id)}"]`); b ? b.click() : ui.likeTrack(tr); } break; }
      case 'f': case 'F': $('#sheet').classList.contains('open') ? ui.closeSheet() : ui.openSheet(); break;
      case 'q': case 'Q': ui.openDrawer('queue'); break;
      case '/': e.preventDefault(); $('#topSearch').focus(); break;
      case 'm': case 'M': player.toggleMute(); break;
      case 'n': case 'N': player.next(); break;
      case 'p': case 'P': player.prev(); break;
      case 'r': case 'R': player.cycleRepeat(); break;
      case 's': case 'S': player.toggleShuffle(); break;
      default: break;
    }
  });
}

/* ------------------------------ misc lifecycle ----------------------------- */
function bindLifecycle() {
  window.addEventListener('online', () => { ui.netOnline(); toast('عاد الاتصال ✓', 'ok', 1800); bus.emit('net'); });
  window.addEventListener('offline', () => { ui.netOnline(); toast(t('toast.offline', 'أنت غير متصل — القوائم المحفوظة تعمل'), 'info', 3200); bus.emit('net'); });
  window.addEventListener('pagehide', () => player.flushPosition());
  document.addEventListener('visibilitychange', () => { if (document.hidden) player.flushPosition(); });

  /* أول نقرة حقيقية تفعّل الصوت على iOS (سياسة التشغيل التلقائي) */
  const unlock = () => { try { player.el?.play?.().catch(() => {}); } catch {} };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });

  $('#mobileBrand')?.addEventListener('click', () => {
    const r = $('#rail');
    if (innerWidth > 900) go('home');
    else { r.classList.toggle('open'); $('#scrim').hidden = !r.classList.contains('open'); $('#scrim').classList.toggle('on', r.classList.contains('open')); }
  });
  $('#scrim')?.addEventListener('click', () => { $('#rail').classList.remove('open'); $('#scrim').classList.remove('on'); setTimeout(() => { $('#scrim').hidden = true; }, 250); ui.closeDrawer(); });
  $('#settingsBtn')?.addEventListener('click', () => go('settings'));
  $('#railSettings')?.addEventListener('click', () => go('settings'));
  $('#railNewPlaylist')?.addEventListener('click', () => { go('library'); setTimeout(() => ui.newPlaylistModal(), 260); });
  $('#themeBtn')?.addEventListener('click', () => {
    const order = ['dark', 'light', 'amoled'];
    cfg.set('theme', order[(order.indexOf(cfg.get('theme')) + 1) % order.length]);
  });
  $('#topSearch')?.addEventListener('focus', () => { if (parseHash().name !== 'search') go('search'); });

  /* إبقاء الشاشة يتجدّد بعد العودة للتبويب */
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.wakeWanted()) ui.reacquireWake(); });

  const onResize = debounce(() => { if ($('#sheet').classList.contains('open')) ui.renderSheet(); }, 200);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}

/* --------------------------------- boot --------------------------------- */
async function boot() {
  applyThemeVars();
  setLang(cfg.get('lang') || 'ar');
  buildNav();
  ui.init();
  player.init();
  await ui.refreshCollections();
  ui.renderRail();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
  registerSW();
  checkInstall();
  bindKeys();
  bindLifecycle();
  ui.netOnline();
  if (!cfg.get('bgShown')) { cfg.set('bgShown', true); setTimeout(() => toast('💡 ' + t('toast.install', 'ثبّت «نغم» من قائمة المتصفح لتسمع في الخلفية وتفتح التطبيق كشاشة كاملة'), 'info', 6500), 2200); }
  document.documentElement.dataset.booted = '1';
}
boot();
