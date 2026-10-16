/**
 * NEXUS FORGE v20 — قاعدة أنماط الكود (pure, client-safe)
 * ---------------------------------------------------------------------------
 * A local knowledge base of implementation recipes that are known to work in a
 * single self-contained HTML file (no build step, no ES modules). For every
 * module the Forge picks the few recipes that match its spec and prints them
 * into the builder's prompt, so engines stop re-inventing — and breaking — the
 * same primitives: the game loop, IndexedDB persistence, the Web Audio synth,
 * RTL-safe layout, hash routing, accessible dialogs, CSV export…
 *
 * Every snippet here is real, copy-pasteable code. Nothing is generated at
 * runtime and nothing is claimed that is not in the file.
 */
import type { ForgeKind } from "@/lib/forge/types";

export type Pattern = {
  id: string;
  /** project kinds where this recipe matters most */
  kinds: ForgeKind[];
  /** lowercase keywords found in a module spec/title that select this recipe */
  tags: string[];
  title: string;
  /** "js" snippets parse standalone; "css" snippets go inside <style> */
  lang: "js" | "css";
  code: string;
};

export const PATTERNS: Pattern[] = [
  {
    id: "game-loop",
    kinds: ["game"],
    tags: ["canvas", "loop", "fps", "frame", "requestanimationframe", "لعبة", "حركة", "render"],
    lang: "js",
    title: "Fixed-timestep canvas loop (no drift, no double speed on 144Hz)",
    code: `const cvs = document.getElementById("game"), ctx = cvs.getContext("2d");
let last = performance.now(), acc = 0; const STEP = 1000 / 60;
function frame(now) {
  acc += Math.min(250, now - last); last = now;         // clamp: a hidden tab must not fast-forward
  while (acc >= STEP) { update(STEP / 1000); acc -= STEP; }
  render(ctx, acc / STEP);                              // alpha = interpolation factor
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
  },
  {
    id: "canvas-hidpi",
    kinds: ["game", "tool"],
    tags: ["canvas", "resize", "dpi", "retina", "وضوح", "شاشة"],
    lang: "js",
    title: "Sharp canvas on any DPI, resize-safe",
    code: `function fitCanvas(cvs) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cvs.getBoundingClientRect();
  cvs.width = Math.round(r.width * dpr); cvs.height = Math.round(r.height * dpr);
  const ctx = cvs.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);               // draw in CSS pixels from now on
  return { ctx, w: r.width, h: r.height };
}
new ResizeObserver(() => fitCanvas(cvs)).observe(cvs);`,
  },
  {
    id: "aabb-collision",
    kinds: ["game"],
    tags: ["collision", "enemy", "hit", "physics", "تصادم", "أعداء", "رصاص"],
    lang: "js",
    title: "AABB collision + swept resolution for platformers",
    code: `const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function resolve(e, solids) {
  e.x += e.vx;
  for (const s of solids) if (hit(e, s)) { e.vx > 0 ? e.x = s.x - e.w : e.x = s.x + s.w; e.vx = 0; }
  e.y += e.vy; e.grounded = false;
  for (const s of solids) if (hit(e, s)) { e.vy > 0 ? (e.y = s.y - e.h, e.grounded = true) : e.y = s.y + s.h; e.vy = 0; }
}`,
  },
  {
    id: "touch-keys",
    kinds: ["game", "app"],
    tags: ["touch", "keyboard", "mobile", "control", "لمس", "تحكم", "كيبورد", "أزرار"],
    lang: "js",
    title: "One input map for keyboard + touch (never two code paths)",
    code: `const input = { left: 0, right: 0, up: 0, down: 0, action: 0 };
const KEY = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
              ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "action" };
addEventListener("keydown", (e) => { const k = KEY[e.code]; if (k) { input[k] = 1; e.preventDefault(); } });
addEventListener("keyup",   (e) => { const k = KEY[e.code]; if (k) input[k] = 0; });
document.querySelectorAll("[data-pad]").forEach((b) => {
  const k = b.dataset.pad, on = (v) => (e) => { e.preventDefault(); input[k] = v; };
  b.addEventListener("pointerdown", on(1)); b.addEventListener("pointerup", on(0));
  b.addEventListener("pointercancel", on(0)); b.addEventListener("pointerleave", on(0));
});`,
  },
  {
    id: "web-audio-synth",
    kinds: ["game", "app"],
    tags: ["sound", "audio", "music", "sfx", "صوت", "موسيقى", "مؤثرات"],
    lang: "js",
    title: "Web Audio SFX + simple music with ONE lazily-created context",
    code: `let AC = null;
const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
addEventListener("pointerdown", () => ac().resume(), { once: true });   // autoplay policy
function sfx(freq = 440, dur = 0.12, type = "square", gain = 0.16) {
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
}
function noise(dur = 0.2, gain = 0.12) {                            // impacts / explosions
  const c = ac(), b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = b; g.gain.value = gain; s.connect(g).connect(c.destination); s.start();
}`,
  },
  {
    id: "indexeddb-store",
    kinds: ["system", "app"],
    tags: ["indexeddb", "database", "قاعدة بيانات", "تخزين", "حفظ", "store", "db"],
    lang: "js",
    title: "Tiny promise wrapper over IndexedDB (stores auto-created)",
    code: `const DB = (() => {
  let p = null;
  const open = (name, stores, version = 1) => (p ||= new Promise((res, rej) => {
    const rq = indexedDB.open(name, version);
    rq.onupgradeneeded = () => stores.forEach((s) => {
      if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s, { keyPath: "id" });
    });
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  }));
  const tx = async (store, mode, fn) => {
    const db = await open(NX_DB, NX_STORES);
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
    });
  };
  return {
    put: (s, v) => tx(s, "readwrite", (o) => o.put(v)),
    all: (s) => tx(s, "readonly", (o) => o.getAll()),
    del: (s, id) => tx(s, "readwrite", (o) => o.delete(id)),
  };
})();`,
  },
  {
    id: "local-store",
    kinds: ["app", "tool", "system"],
    tags: ["localstorage", "save", "persist", "حفظ", "تخزين", "settings", "إعدادات"],
    lang: "js",
    title: "Versioned localStorage with quota + private-mode safety",
    code: `const KEY = "nx.state.v1";
function loadState(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(fallback), ...parsed };            // new fields keep their default
  } catch { return structuredClone(fallback); }
}
let saveT = 0;
function saveState(state) {                                          // debounced: never on every frame
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn("save failed", e && e.name); }          // QuotaExceededError / private mode
  }, 250);
}`,
  },
  {
    id: "crud-table",
    kinds: ["system"],
    tags: ["table", "crud", "add", "edit", "delete", "جدول", "إضافة", "تعديل", "حذف", "سجلات"],
    lang: "js",
    title: "CRUD table rendered from state (one render function, no innerHTML leaks)",
    code: `function renderRows(rows) {
  const tb = document.getElementById("rows"); tb.replaceChildren();  // clears without innerHTML = ""
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const cell of [r.name, r.qty, r.price]) {
      const td = document.createElement("td"); td.textContent = String(cell ?? ""); tr.append(td);
    }
    const td = document.createElement("td"), ed = document.createElement("button"), del = ed.cloneNode();
    ed.textContent = "تعديل"; del.textContent = "حذف";
    ed.onclick = () => openForm(r.id); del.onclick = () => removeRow(r.id);
    td.append(ed, del); tr.append(td); frag.append(tr);
  }
  tb.append(frag);
}`,
  },
  {
    id: "search-filter-page",
    kinds: ["system", "site", "app"],
    tags: ["search", "filter", "pagination", "بحث", "فلتر", "ترقيم", "صفحات", "تصفية"],
    lang: "js",
    title: "Search + multi-filter + pagination over one array",
    code: `const PAGE = 20;
function view(state) {
  const q = state.q.trim().toLowerCase();
  const rows = state.data.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || String(r.id).includes(q)) &&
    (!state.cat || r.cat === state.cat) &&
    (!state.from || r.date >= state.from) && (!state.to || r.date <= state.to));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(state.page, pages);
  return { rows: rows.slice((page - 1) * PAGE, page * PAGE), total: rows.length, page, pages };
}`,
  },
  {
    id: "csv-export",
    kinds: ["system", "tool"],
    tags: ["csv", "export", "download", "تصدير", "تنزيل", "json", "طباعة", "print"],
    lang: "js",
    title: "CSV/JSON export + printable invoice (no libraries)",
    code: `function download(name, text, mime = "text/plain;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const csvCell = (v) => /[",\\n]/.test(String(v ?? "")) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? "");
function toCSV(rows, cols) {
  return "\\ufeff" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\\n");
}
function printInvoice(el) {                                          // prints only the invoice
  const w = window.open("", "_blank", "width=900,height=700");
  w.document.write("<!doctype html><meta charset='utf-8'><title>فاتورة</title>" +
    "<style>body{font-family:system-ui;direction:rtl;padding:24px}table{width:100%;border-collapse:collapse}" +
    "td,th{border-bottom:1px solid #ddd;padding:6px}</style>" + el.outerHTML);
  w.document.close(); w.focus(); w.print();
}`,
  },
  {
    id: "rtl-layout",
    kinds: ["site", "landing", "system", "app"],
    tags: ["rtl", "arabic", "عربي", "اتجاه", "layout", "تصميم", "css"],
    lang: "css",
    title: "RTL-safe CSS: logical properties everywhere",
    code: `html { direction: rtl; }
/* logical, never physical: they flip with the direction automatically */
.card { padding-block: 16px; padding-inline: 18px; margin-inline-end: 12px; border-start-start-radius: 14px; }
.row  { display: flex; gap: 12px; align-items: center; }
.row > .spacer { margin-inline-start: auto; }
/* Arabic type scale: bigger line-height, no hyphenation, tabular numbers for prices */
body { font-family: "Segoe UI", Tahoma, system-ui, sans-serif; line-height: 1.9; hyphens: none; }
.num, time, .price { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }`,
  },
  {
    id: "tokens-theme",
    kinds: ["site", "landing", "app", "system"],
    tags: ["theme", "dark", "night", "tokens", "وضع ليلي", "ثيم", "ألوان", "css variables"],
    lang: "css",
    title: "Design tokens + dark mode (CSS tokens first, then the 3 JS lines)",
    code: `:root { --bg:#0f1115; --surface:#171a21; --text:#f2f4f8; --muted:#9aa3b2;
        --accent:#d97757; --accent2:#e8946f; --line:rgba(255,255,255,.09); --r:16px; }
[data-theme="light"] { --bg:#faf7f3; --surface:#fff; --text:#221a13; --muted:#5d5147; --line:rgba(60,40,25,.12); }
body { background: var(--bg); color: var(--text); }
/* applied before first paint: an inline script in <head>, not DOMContentLoaded */
const setTheme = (t) => { document.documentElement.dataset.theme = t; localStorage.setItem("nx.theme", t); };
setTheme(localStorage.getItem("nx.theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));`,
  },
  {
    id: "scroll-reveal",
    kinds: ["site", "landing"],
    tags: ["animation", "scroll", "reveal", "حركة", "تأثير", "intersection"],
    lang: "js",
    title: "Scroll reveal with IntersectionObserver, reduced-motion safe",
    code: `const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduce) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  document.querySelectorAll("[data-reveal]").forEach((el, i) => {
    el.style.transitionDelay = (i % 6) * 60 + "ms"; io.observe(el);
  });
} else document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("in"));`,
  },
  {
    id: "svg-chart",
    kinds: ["system", "tool", "landing"],
    tags: ["chart", "graph", "stats", "رسوم", "إحصائيات", "svg", "بيانات"],
    lang: "js",
    title: "Dependency-free SVG charts built from data",
    code: `function barChart(el, data, { w = 560, h = 200, color = "var(--accent)" } = {}) {
  const max = Math.max(1, ...data.map((d) => d.v));
  const bw = w / data.length * 0.62, gap = w / data.length * 0.38;
  el.innerHTML = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + w + " " + (h + 22)); svg.setAttribute("width", "100%");
  data.forEach((d, i) => {
    const bh = (d.v / max) * h, x = i * (bw + gap) + gap / 2, y = h - bh;
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", bw);
    r.setAttribute("height", Math.max(2, bh)); r.setAttribute("rx", 5); r.setAttribute("fill", color);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", x + bw / 2); t.setAttribute("y", h + 16); t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "11"); t.setAttribute("fill", "var(--muted)"); t.textContent = d.k;
    svg.append(r, t);
  });
  el.append(svg);
}`,
  },
  {
    id: "form-validate",
    kinds: ["site", "landing", "app", "system"],
    tags: ["form", "validation", "نموذج", "اتصال", "تحقق", "input", "error"],
    lang: "js",
    title: "Inline validation with real messages (no alert, no fake submit)",
    code: `const RULES = {
  name:  (v) => v.trim().length >= 2 || "الاسم قصير",
  email: (v) => /^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/i.test(v.trim()) || "بريد غير صالح",
  phone: (v) => /^(?:\\+?213|0)(5|6|7)\\d{8}$/.test(v.replace(/[\\s-]/g, "")) || "رقم جزائري غير صالح",
  msg:   (v) => v.trim().length >= 10 || "اكتب 10 حروف على الأقل",
};
function validate(form) {
  let ok = true;
  for (const [name, rule] of Object.entries(RULES)) {
    const el = form.elements[name], box = form.querySelector('[data-err="' + name + '"]');
    if (!el) continue;
    const res = rule(el.value);
    if (res === true) { el.setAttribute("aria-invalid", "false"); if (box) box.textContent = ""; }
    else { ok = false; el.setAttribute("aria-invalid", "true"); if (box) box.textContent = res; }
  }
  return ok;
}`,
  },
  {
    id: "hash-router",
    kinds: ["app", "site", "system"],
    tags: ["router", "route", "page", "تنقل", "صفحات", "hash", "spa"],
    lang: "js",
    title: "Hash router with real history + 404 view",
    code: `const ROUTES = { "#/": home, "#/list": list, "#/about": about };
function go() {
  const h = location.hash || "#/";
  const view = ROUTES[h] || notFound;
  const out = document.getElementById("view");
  out.replaceChildren(); view(out, h);
  document.querySelectorAll("[data-nav]").forEach((a) =>
    a.setAttribute("aria-current", a.getAttribute("href") === h ? "page" : "false"));
}
addEventListener("hashchange", go); go();`,
  },
  {
    id: "dialog-a11y",
    kinds: ["app", "site", "system", "landing"],
    tags: ["modal", "dialog", "popup", "نافذة", "منبثقة", "focus", "a11y", "keyboard"],
    lang: "js",
    title: "Accessible modal: focus trap, Esc, restore focus, no scroll behind",
    code: `let lastFocus = null;
function openModal(id) {
  const m = document.getElementById(id); if (!m) return;
  lastFocus = document.activeElement;
  m.hidden = false; m.setAttribute("aria-modal", "true");
  document.body.style.overflow = "hidden";
  const f = m.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  (f[0] || m).focus();
  m.onkeydown = (e) => {
    if (e.key === "Escape") return closeModal(id);
    if (e.key !== "Tab" || !f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}
function closeModal(id) {
  const m = document.getElementById(id); if (!m) return;
  m.hidden = true; document.body.style.overflow = ""; lastFocus && lastFocus.focus();
}`,
  },
  {
    id: "drag-drop",
    kinds: ["app", "tool"],
    tags: ["drag", "drop", "sortable", "سحب", "إفلات", "ترتيب"],
    lang: "js",
    title: "Pointer-event drag & drop reorder (works on touch too)",
    code: `function sortable(list, onOrder) {
  let drag = null, ph = null;
  list.addEventListener("pointerdown", (e) => {
    const item = e.target.closest("[data-item]"); if (!item) return;
    drag = item; ph = document.createElement("li"); ph.className = "placeholder";
    item.setPointerCapture(e.pointerId); item.classList.add("dragging");
    list.insertBefore(ph, item);
  });
  list.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const next = [...list.querySelectorAll("[data-item]:not(.dragging)")]
      .find((el) => e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
    list.insertBefore(ph, next || null); list.insertBefore(drag, ph);
  });
  const end = () => {
    if (!drag) return;
    drag.classList.remove("dragging"); ph.remove(); ph = null; drag = null;
    onOrder([...list.querySelectorAll("[data-item]")].map((el) => el.dataset.item));
  };
  list.addEventListener("pointerup", end); list.addEventListener("pointercancel", end);
}`,
  },
  {
    id: "seed-data",
    kinds: ["site", "system", "app", "landing"],
    tags: ["data", "products", "seed", "60", "منتجات", "بيانات", "كتالوج", "قائمة"],
    lang: "js",
    title: "Deterministic seeded catalogue (big data, no repetition, no network)",
    code: `function mulberry(seed) {                                            // reproducible RNG
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry(20260101);
const NAMES = ["تمر دقلة نور", "زيت زيتون قبائلي", "عسل جبلي", "فخار جزائري", "زرابية بابار", "كسكسي", "حلوى القطايف", "صابون طبيعي"];
const CATS = ["غذاء", "حرف", "جمال", "بيت"];
const PRODUCTS = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: NAMES[i % NAMES.length] + " " + (Math.floor(i / NAMES.length) + 1),
  cat: CATS[Math.floor(rnd() * CATS.length)],
  price: 400 + Math.round(rnd() * 9600 / 50) * 50,                   // realistic DZD prices
  stock: Math.floor(rnd() * 40), rating: +(3 + rnd() * 2).toFixed(1),
}));`,
  },
  {
    id: "cart-checkout",
    kinds: ["site"],
    tags: ["cart", "checkout", "سلة", "شراء", "طلب", "payment", "مجموع"],
    lang: "js",
    title: "Cart state + totals with real maths (never a fake checkout)",
    code: `const cart = new Map();                                              // id -> qty
const add = (id, q = 1) => cart.set(id, (cart.get(id) || 0) + q);
const setQty = (id, q) => (q <= 0 ? cart.delete(id) : cart.set(id, q));
function totals() {
  let sub = 0, items = 0;
  for (const [id, q] of cart) { const p = PRODUCTS.find((x) => x.id === id); if (!p) continue;
    sub += p.price * q; items += q; }
  const ship = sub === 0 || sub >= 8000 ? 0 : 600;                   // free above 8 000 DZD
  const discount = sub >= 20000 ? Math.round(sub * 0.05) : 0;
  return { sub, items, ship, discount, total: sub + ship - discount };
}
const dzd = (n) => n.toLocaleString("ar-DZ") + " دج";`,
  },
  {
    id: "state-render",
    kinds: ["app", "system", "game"],
    tags: ["state", "store", "render", "حالة", "تحديث", "ui"],
    lang: "js",
    title: "One store, one render, no framework (predictable updates)",
    code: `const listeners = new Set();
const state = loadState(DEFAULTS);
function setState(patch) {
  Object.assign(state, typeof patch === "function" ? patch(state) : patch);
  saveState(state); listeners.forEach((fn) => fn(state));
}
function subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
subscribe(renderApp);                                                // the only DOM writer`,
  },
  {
    id: "perf-list",
    kinds: ["system", "app", "site"],
    tags: ["performance", "long list", "virtual", "أداء", "كثير", "قائمة طويلة"],
    lang: "js",
    title: "Windowed rendering for long lists (1 000+ rows stay smooth)",
    code: `function virtualList(box, rows, rowH, renderRow) {
  const spacer = document.createElement("div");
  spacer.style.height = rows.length * rowH + "px"; spacer.style.position = "relative";
  box.replaceChildren(spacer);
  const draw = () => {
    const top = box.scrollTop, h = box.clientHeight;
    const from = Math.max(0, Math.floor(top / rowH) - 4);
    const to = Math.min(rows.length, Math.ceil((top + h) / rowH) + 4);
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const el = renderRow(rows[i], i);
      el.style.position = "absolute"; el.style.top = i * rowH + "px";
      el.style.insetInlineStart = "0"; el.style.insetInlineEnd = "0"; el.style.height = rowH + "px";
      frag.append(el);
    }
    spacer.replaceChildren(frag);
  };
  box.addEventListener("scroll", () => requestAnimationFrame(draw), { passive: true }); draw();
}`,
  },
];

/** Lowercase ASCII+Arabic keyword scan of a module's own text. */
function haystack(o: { kind?: ForgeKind; spec?: string; title?: string; path?: string }): string {
  return `${o.title ?? ""} ${o.spec ?? ""} ${o.path ?? ""}`.toLowerCase();
}

/**
 * The recipes worth printing for one module: kind match first, then keyword
 * hits, then a small guaranteed core set. Bounded so prompts never explode.
 */
export function patternsFor(o: { kind: ForgeKind; spec?: string; title?: string; path?: string; max?: number }): Pattern[] {
  const hay = haystack(o);
  const max = o.max ?? 4;
  const scored = PATTERNS.map((p) => {
    let s = p.kinds.includes(o.kind) ? 2 : 0;
    for (const t of p.tags) if (hay.includes(t)) s += 3;
    return { p, s };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id));
  const picked = scored.slice(0, max).map((x) => x.p);
  if (picked.length < 2) {
    // every build benefits from these two, whatever the kind
    for (const id of ["state-render", "tokens-theme"]) {
      const p = PATTERNS.find((x) => x.id === id);
      if (p && !picked.includes(p)) picked.push(p);
    }
  }
  return picked.slice(0, max);
}

/** Prompt-ready block. Empty string when there is nothing to inject. */
export function patternBlock(pats: Pattern[], maxChars = 5200): string {
  if (!pats.length) return "";
  let out = "PROVEN RECIPES — reuse these structures verbatim where they fit (adapt names to the contract):";
  for (const p of pats) {
    const piece = `\n\n▸ ${p.title}${p.lang === "css" ? "  [CSS — goes inside <style>" + (p.id === "tokens-theme" ? ", except the last 3 lines" : "") + "]" : ""}\n${p.code}`;
    if (out.length + piece.length > maxChars) break;
    out += piece;
  }
  return out;
}

/** Total size of the knowledge base (real number, shown in the UI). */
export const PATTERN_COUNT = PATTERNS.length;
export const PATTERN_CHARS = PATTERNS.reduce((n, p) => n + p.code.length, 0);
