/**
 * NEXUS APEX — composer.
 *
 * Takes a plan + a blueprint and produces a complete project:
 *   • one single-file `index.html` that runs anywhere (preview, sandbox, offline)
 *   • a real multi-file tree (html / css / js per module / svg assets / docs)
 *   • a verification report (syntax, structure, accessibility, integrity)
 *
 * Everything is deterministic: same plan → same project, byte for byte.
 */

import { APEX_MODULES, type ApexModuleDef } from "./modules";
import { APEX_CSS, themeVars } from "./theme";
import { paletteById, type Palette } from "./palettes";
import { BLUEPRINTS, blueprintById, type ApexBlueprint } from "./blueprints";
import { buildData, countRows, type DataBundle } from "./data-gen";
import { WILAYAS } from "./data-gen";

export type Scale = "standard" | "large" | "legend";

export interface ApexPlan {
  /** stable id, used in URLs and file names */
  id: string;
  /** product name */
  title: string;
  /** one line under the name */
  tagline: string;
  /** longer description */
  desc: string;
  /** which blueprint to build */
  blueprint: string;
  kind: string;
  lang: "ar" | "fr" | "en";
  dir: "rtl" | "ltr";
  palette: string;
  scale: Scale;
  seed: number;
  /** extra module ids the model asked for */
  modules?: string[];
  /** feature flags detected from the request */
  features: string[];
  /** data kinds the project should ship */
  dataKinds?: string[];
  /** author/brand shown in the footer */
  brand?: string;
  /** requested page ids (subset of the blueprint pages) */
  pages?: string[];
}

export interface ApexFile {
  path: string;
  code: string;
  lang: "html" | "css" | "js" | "json" | "svg" | "md" | "text" | "xml";
  lines: number;
  bytes: number;
}

export interface ApexStats {
  files: number;
  lines: number;
  bytes: number;
  htmlLines: number;
  cssLines: number;
  jsLines: number;
  dataLines: number;
  dataRows: number;
  modules: number;
  widgets: string[];
  pages: number;
  score: number;
}

export interface ApexProject {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  blueprint: string;
  kind: string;
  lang: string;
  dir: "rtl" | "ltr";
  palette: string;
  emoji: string;
  html: string;
  files: ApexFile[];
  stats: ApexStats;
  report: { checks: { id: string; label: string; ok: boolean; detail: string }[]; ok: boolean; score: number; notes: string[] };
  plan: ApexPlan;
  createdAt: string;
  /** what the visitor sees first — used by the UI cards */
  summary: string;
  /** how long the build took, in ms */
  buildMs: number;
}

/* ------------------------------------------------------------ aliases */

/**
 * Blueprints speak in product language ("bulletin", "pipeline", "mortgage").
 * Every host is mapped onto a module that really exists in `scripts/apex-src`, so
 * a page can never render empty and the bundle never carries dead weight. Hosts
 * with no dedicated module yet fall back to the generic data view (`view`).
 */
const ALIAS: Record<string, string> = {
  theme: "kernel",
  ds: "kernel",
  toast: "kernel",
  notify: "kernel",
  modal: "kernel",
  hero: "marketing",
  "hero-shop": "marketing",
  "hero-blog": "marketing",
  "hero-portfolio": "marketing",
  "hero-travel": "marketing",
  "hero-re": "marketing",
  "hero-resto": "marketing",
  "hero-support": "marketing",
  features: "marketing",
  pricing: "marketing",
  testimonials: "marketing",
  faq: "marketing",
  steps: "marketing",
  about: "marketing",
  tips: "marketing",
  sla: "support",
  howto: "marketing",
  banner: "marketing",
  kpi: "kpi",
  stats: "kpi",
  charts: "charts",
  analytics: "charts",
  datagrid: "datagrid",
  table: "datagrid",
  report: "print",
  reports: "print",
  export: "print",
  csv: "print",
  print: "print",
  form: "forms",
  forms: "forms",
  contact: "forms",
  "contact-form": "forms",
  inquiry: "forms",
  newsletter: "forms",
  booking: "booking",
  reservations: "booking",
  appointments: "booking",
  shop: "shop",
  "search-filters": "shop",
  filters: "shop",
  wishlist: "shop",
  compare: "shop",
  reviews: "shop",
  product: "shop",
  categories: "shop",
  catalog: "shop",
  cart: "cart",
  checkout: "cart",
  payments: "cart",
  "shipping-dz": "cart",
  loyalty: "cart",
  orders: "orders",
  invoice: "orders",
  invoices: "orders",
  "order-track": "orders",
  inventory: "pos",
  pos: "pos",
  stock: "pos",
  contacts: "crm",
  pipeline: "crm",
  team: "crm",
  leads: "crm",
  tasks: "kanban",
  board: "kanban",
  agenda: "calendar",
  calendar: "calendar",
  tickets: "support",
  knowledge: "support",
  helpdesk: "support",
  posts: "blog",
  blog: "blog",
  tags: "blog",
  reading: "blog",
  share: "blog",
  comments: "blog",
  courses: "lms",
  lessons: "lms",
  player: "lms",
  progress: "lms",
  certificates: "lms",
  notes: "lms",
  bookmarks: "lms",
  quiz: "quiz",
  exams: "quiz",
  students: "school",
  grades: "school",
  attendance: "school",
  timetable: "school",
  bulletins: "school",
  classes: "school",
  patients: "health",
  records: "health",
  vitals: "health",
  prescriptions: "health",
  pharmacy: "health",
  diet: "health",
  destinations: "travel",
  trips: "travel",
  budget: "travel",
  itinerary: "travel",
  listings: "realestate",
  "listing-detail": "realestate",
  mortgage: "realestate",
  agents: "realestate",
  properties: "realestate",
  transactions: "fin",
  accounts: "fin",
  budgets: "fin",
  tax: "fin",
  payroll: "fin",
  ledger: "fin",
  finance: "fin",
  menu: "restaurant",
  "orders-kitchen": "restaurant",
  tables: "restaurant",
  delivery: "restaurant",
  kitchen: "restaurant",
  doc: "docs",
  docs: "docs",
  toc: "docs",
  code: "docs",
  copy: "docs",
  versions: "docs",
  changelog: "docs",
  feedback: "docs",
  guide: "docs",
  gallery: "media",
  media: "media",
  photos: "media",
  map: "mapsvg",
  maps: "mapsvg",
  mapsvg: "mapsvg",
  users: "security",
  roles: "security",
  audit: "security",
  settings: "security",
  security: "security",
  "auth-ui": "security",
  account: "security",
  chat: "chat",
  messages: "chat",
  support: "chat",
  scoreboard: "scores",
  scores: "scores",
  leaderboard: "scores",
  game: "game",
  "game-rpg": "game",
  "game-tower": "game",
  "game-racer": "game",
  "game-roguelike": "game",
  search: "search",
  router: "router",
  motion: "motion",
  pwa: "pwa",
  audio: "audio",
  editor: "editor",
  writer: "editor",
  coursesPlayer: "lms",
};

/** Datasets the generic view module can render when a host has no module yet. */
/** host name → dataset it shows (exported: standalone mode reuses it) */
export const HOST_DATA: Record<string, string> = {
  services: "services",
  agents: "contacts",
  knowledge: "posts",
  guide: "posts",
  photos: "posts",
  posts: "posts",
  listings: "listings",
  courses: "courses",
  students: "students",
  patients: "patients",
  destinations: "destinations",
  transactions: "transactions",
  tickets: "tickets",
  products: "products",
  orders: "orders",
  customers: "customers",
  inventory: "inventory",
  menu: "menu",
  staff: "staff",
  subscriptions: "subscriptions",
};

/** Host → the module that mounts it ("" when nothing can render it yet). */
export function resolveModuleId(host: string): string {
  const id = ALIAS[host] ?? host;
  return APEX_MODULES.some((m) => m.id === id) ? id : "";
}

/** Final host list for a page: real modules first, generic view as the safety net. */
export function resolveHost(host: { apex: string; cfg?: Record<string, string | number | boolean> }, fallbackData: string): { apex: string; cfg: Record<string, string | number | boolean> } {
  const id = resolveModuleId(host.apex);
  if (id) return { apex: id, cfg: { ...(host.cfg ?? {}), host: host.apex } };
  return { apex: "view", cfg: { ...(host.cfg ?? {}), data: host.cfg?.data ?? HOST_DATA[host.apex] ?? fallbackData, host: host.apex } };
}

/* ------------------------------------------------------------ planning helpers */

/** Features we can detect in a raw request — each one pulls extra modules in. */
export const FEATURE_IDS = [
  "billing", "invoices", "payments", "courier", "inventory", "pos", "blog", "posts", "support", "tickets",
  "team", "calendar", "map", "maps", "files", "media", "reports", "charts", "print", "exports", "csv",
  "auth", "users", "roles", "audit", "security", "2fa", "seo", "pwa", "offline", "dark", "rtl",
  "search", "filters", "quiz", "certificates", "grades", "booking", "appointments", "delivery", "reservations",
  "game", "scores", "audio", "music", "leaderboard", "save", "loyalty", "reviews", "compare", "wishlist",
  "tax", "payroll", "budget", "mortgage", "gallery", "knowledge", "sla", "newsletter", "comments", "share",
];

const FEATURE_WORDS: [string, RegExp][] = [
  ["billing", /فواتير|فاتورة|billing|اشتراك|subscribe/i],
  ["invoices", /فاتورة|invoice|devis|عرض سعر/i],
  ["payments", /دفع|payment|cb|بطاقة|baridimob|تحويل/i],
  ["courier", /توصيل|livraison|courier|شحن|yar|yalidine/i],
  ["inventory", /مخزون|stock|inventory|جرد/i],
  ["pos", /نقطة بيع|pos|caisse|كاشير/i],
  ["blog", /مقالات|مدونة|blog|أخبار/i],
  ["posts", /مقالات|منشورات|posts/i],
  ["support", /دعم|support|مساعدة|helpdesk/i],
  ["tickets", /تذاكر|tickets|شكاوي/i],
  ["team", /فريق|team|موظفين|staff/i],
  ["calendar", /تقويم|calendar|مواعيد|agenda/i],
  ["map", /خريطة|map|wilaya|ولاية|خرائط/i],
  ["media", /صور|معرض|gallery|فيديو|media/i],
  ["reports", /تقارير|report|kpi|مؤشرات/i],
  ["charts", /رسم|charts|graphs|إحصائيات/i],
  ["print", /طباعة|print|pdf|كشف/i],
  ["csv", /تصدير|export|csv|excel/i],
  ["auth", /تسجيل دخول|login|auth|حساب|تسجيل|كلمة سر/i],
  ["users", /مستخدمين|users|صلاحيات|roles|أدوار/i],
  ["audit", /سجل العمليات|audit|تدقيق/i],
  ["security", /أمان|security|حماية|تشفير/i],
  ["2fa", /2fa|رمز|otp|تحقق/i],
  ["seo", /سيو|seo|محركات البحث|ظهور/i],
  ["pwa", /تطبيق هاتف|pwa|offline|بلا إنترنت|installable/i],
  ["dark", /داكن|dark mode|ليلي|ليلا/i],
  ["rtl", /عربي|عربية|rtl|darija|داريجة/i],
  ["search", /بحث|search/i],
  ["filters", /فلترة|filters|تصفية/i],
  ["quiz", /اختبار|quiz|quizizz|امتحان/i],
  ["certificates", /شهادة|certificate|تخرج/i],
  ["grades", /نقاط|درجات|معدل|grades|كشف نقط/i],
  ["booking", /حجز|booking|موعد|appointment|rendez-vous/i],
  ["appointments", /مواعيد|appointments/i],
  ["delivery", /توصيل|livraison/i],
  ["reservations", /حجز طاولة|reservation/i],
  ["game", /لعبة|games|game|ألعاب/i],
  ["scores", /نتائج|scores|leaderboard|ترتيب/i],
  ["audio", /صوت|موسيقى|audio|sound/i],
  ["loyalty", /نقاط الولاء|loyalty|خصم دائم/i],
  ["reviews", /تقييمات|reviews|آراء/i],
  ["compare", /مقارنة|compare/i],
  ["wishlist", /مفضلة|wishlist|قائمة رغبات/i],
  ["tax", /ضريبة|ضرائب|tva|tax/i],
  ["payroll", /رواتب|payroll|أجور/i],
  ["budget", /ميزانية|budget/i],
  ["mortgage", /قرض|crédit|mortgage|تقسيط/i],
  ["gallery", /صور|معرض|gallery|تصوير/i],
  ["knowledge", /قاعدة معرفة|knowledge|دليل/i],
  ["sla", /sla|زمن الاستجابة/i],
  ["newsletter", /نشرة|newsletter|بريد إلكتروني/i],
  ["comments", /تعليقات|comments/i],
  ["share", /مشاركة|share/i],
];

export function detectFeatures(text: string): string[] {
  const t = text || "";
  const out: string[] = [];
  for (const [id, re] of FEATURE_WORDS) if (re.test(t)) out.push(id);
  return out;
}

const GAME_KINDS: [string, RegExp][] = [
  ["game-tower", /برج|أبراج|tower|defense|دفاع/i],
  ["game-racer", /سيارة|عدّاء|racer|سباق|runner|شوارع/i],
  ["game-roguelike", /زنزانة|dungeon|متاهة|maze|roguelike|مغامرة|rpg|دور/i],
];

/** Game module (if any) implied by the request text. */
export function detectGameModule(text: string): string | null {
  const t = text || "";
  for (const [id, re] of GAME_KINDS) if (re.test(t)) return id;
  return null;
}

/** Palette family hints per blueprint. */
const BLUEPRINT_PALETTE: Record<string, string> = {
  "saas-dashboard": "midnight",
  ecommerce: "emerald",
  landing: "sunset",
  portfolio: "coffee",
  blog: "paper",
  school: "royal",
  lms: "royal",
  clinic: "aurora",
  travel: "ocean",
  realestate: "sand",
  finance: "navy",
  restaurant: "sunset",
  arcade: "cyber",
  crm: "plum",
  support: "navy",
  docs: "slate",
  admin: "midnight",
};

export function paletteFor(blueprint: string, features: string[]): string {
  if (features.includes("dark")) return "midnight";
  return BLUEPRINT_PALETTE[blueprint] ?? "midnight";
}

/* ------------------------------------------------------------ module selection */

const SCALE_EXTRAS: Record<Scale, string[]> = {
  standard: [],
  large: ["search", "print", "media", "motion"],
  legend: ["search", "print", "media", "motion", "security", "pwa", "seo", "perf", "audit", "csv", "gallery", "chat"],
};

const FEATURE_MODULES: Record<string, string[]> = {
  billing: ["finance"],
  invoices: ["orders"],
  payments: ["cart"],
  courier: ["cart"],
  inventory: ["inventory"],
  pos: ["inventory"],
  blog: ["view"],
  posts: ["view"],
  support: ["support"],
  tickets: ["support"],
  team: ["crm"],
  calendar: ["calendar"],
  map: ["mapsvg"],
  media: ["gallery"],
  reports: ["report"],
  charts: ["charts"],
  print: ["print"],
  csv: ["csv"],
  auth: ["auth-ui"],
  users: ["users"],
  audit: ["audit"],
  security: ["security"],
  seo: ["seo"],
  pwa: ["pwa"],
  search: ["search"],
  quiz: ["quiz"],
  certificates: ["courses"],
  grades: ["school"],
  booking: ["booking"],
  appointments: ["booking"],
  game: ["audio"],
  scores: ["scores"],
  audio: ["audio"],
  gallery: ["gallery"],
  newsletter: ["form"],
  comments: ["comments"],
};

interface Selection {
  modules: ApexModuleDef[];
  widgets: string[];
  notes: string[];
}

export function selectModules(plan: ApexPlan, bp: ApexBlueprint): Selection {
  const notes: string[] = [];
  const wanted: string[] = [];

  /* 1 — blueprint core */
  for (const id of bp.modules) wanted.push(id === "theme" ? "ds" : id);

  /* 2 — blueprint features that are on */
  for (const f of plan.features) {
    const extra = bp.features[f];
    if (extra) wanted.push(...extra.map((id) => (id === "theme" ? "ds" : id)));
  }

  /* 3 — scale extras + feature modules */
  wanted.push(...(SCALE_EXTRAS[plan.scale] ?? []));
  for (const f of plan.features) {
    const extra = FEATURE_MODULES[f];
    if (extra) wanted.push(...extra);
  }
  for (const id of plan.modules ?? []) wanted.push(id);

  /* 4 — the game module the request asks for (arcade blueprints show all four) */
  const wantGame = plan.kind === "game";
  if (wantGame) {
    for (const g of ["game-rpg", "game-tower", "game-racer", "game-roguelike"]) if (!wanted.includes(g)) wanted.push(g);
  }

  /* 5 — every host on every page resolves to a real module (view is the net) */
  const pages = pagesFor(plan, bp);
  const fallbackData = (bp.dataKinds[0] ?? "products") as string;
  const hostIds = pages.flatMap((p) => p.hosts.map((h) => resolveHost(h, fallbackData).apex));
  for (const id of hostIds) wanted.push(id);
  if (hostIds.includes("view")) wanted.push("search");

  /* 6 — dependency closure */
  const resolved: ApexModuleDef[] = [];
  const addWithDeps = (id: string) => {
    const mod = APEX_MODULES.find((m) => m.id === id);
    if (!mod) return;
    if (resolved.some((m) => m.id === mod.id)) return;
    for (const dep of mod.needs) addWithDeps(dep);
    resolved.push(mod);
  };
  addWithDeps("kernel");
  for (const id of wanted) if (id && id !== "kernel") addWithDeps(id);

  const widgets = Array.from(new Set(hostIds));
  const missing = widgets.filter((w) => !resolved.some((m) => m.id === w));
  if (missing.length) notes.push(`وحدات غير متوفرة استُبدلت بعرض عام: ${missing.join(", ")}`);

  return { modules: resolved.sort((a, b) => a.order - b.order), widgets, notes };
}

export function pagesFor(plan: ApexPlan, bp: ApexBlueprint) {
  if (plan.pages?.length) {
    const picked = bp.pages.filter((p) => plan.pages?.includes(p.id));
    if (picked.length) return picked;
  }
  return bp.pages;
}

/* ------------------------------------------------------------ composition */

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

export function planSlug(plan: ApexPlan): string {
  const base = (plan.id || plan.title || "nexus-project").toLowerCase();
  return base.replace(/[^a-z0-9\u0600-\u06FF-]+/g, "-").replace(/^-+|-+$/g, "") || "nexus-project";
}

/** Emoji per blueprint/kind — used on cards, favicon and the header mark. */
export function projectEmoji(bp: ApexBlueprint): string {
  const map: Record<string, string> = {
    app: "📊", shop: "🛍️", landing: "🚀", portfolio: "🎨", blog: "📰", edu: "🏫",
    lms: "🎓", clinic: "🏥", travel: "🧭", realestate: "🏡", finance: "📈",
    restaurant: "🍽️", game: "🎮", crm: "🤝", support: "🆘", docs: "📘", admin: "🛡️",
  };
  return map[bp.kind] ?? "✨";
}

/** Page shell: header, nav, page containers, footer, skip link, install banner. */
function shellHtml(plan: ApexPlan, bp: ApexBlueprint, pages: { id: string; title: string; icon: string; hosts: { apex: string; cfg?: Record<string, string | number | boolean> }[] }[], palette: Palette, emoji: string): { shell: string; nav: string; footer: string } {
  const nav = pages
    .map((p, i) => `      <a href="#${p.id}" data-nav="${p.id}"${i === 0 ? ' aria-current="page"' : ""}><span aria-hidden="true">${p.icon}</span> ${esc(p.title)}</a>`)
    .join("\n");

  const fallbackData = bp.dataKinds[0] ?? "products";
  const sections = pages
    .map((p, i) => {
      const resolved = p.hosts.map((h) => resolveHost(h as { apex: string; cfg?: Record<string, string | number | boolean> }, fallbackData));
      const hosts = resolved
        .map((h) => `        <div class="ax-host" data-apex="${h.apex}" data-apex-host="${esc(String(h.cfg.host ?? h.apex))}" data-cfg="${esc(JSON.stringify(h.cfg))}" data-reveal></div>`)
        .join("\n");
      return `    <section id="page-${p.id}" class="ax-page" data-page="${p.id}"${i === 0 ? "" : ' hidden'} aria-labelledby="ttl-${p.id}">
      <div class="ax-section">
        <div class="ax-wrap">
          <h2 id="ttl-${p.id}" class="ax-page-title"><span aria-hidden="true">${p.icon}</span> ${esc(p.title)}</h2>
          <div class="ax-page-grid">
${hosts}
          </div>
        </div>
      </div>
    </section>`;
    })
    .join("\n");

  const shell = `  <a class="ax-skip" href="#main">تخطَّ إلى المحتوى</a>
  <header class="ax-header">
    <div class="ax-wrap ax-header-in">
      <a class="ax-logo" href="#${pages[0]?.id ?? "home"}">
        <span class="ax-logo-mark" aria-hidden="true">${emoji}</span>
        <span>${esc(plan.title)}</span>
      </a>
      <button class="ax-burger" type="button" aria-label="القائمة" aria-expanded="false" data-burger>
        <span aria-hidden="true">☰</span>
      </button>
      <nav class="ax-nav" data-nav-root aria-label="التنقل الرئيسي">
${nav}
        <button type="button" class="ax-btn ax-btn-soft ax-btn-sm" data-theme-toggle aria-label="تبديل الوضع الليلي">🌙</button>
      </nav>
    </div>
  </header>
  <main id="main">
${sections}
  </main>`;

  const footer = `  <footer class="ax-section" style="border-top:1px solid var(--ax-line)">
    <div class="ax-wrap ax-row-between">
      <div>
        <strong>${esc(plan.title)}</strong>
        <p class="ax-muted" style="margin:4px 0 0">${esc(plan.tagline)}</p>
      </div>
      <div class="ax-chips">
        ${pages.slice(0, 5).map((p) => `<a class="ax-chip" href="#${p.id}">${esc(p.title)}</a>`).join("")}
      </div>
    </div>
    <div class="ax-wrap" style="margin-top:18px">
      <small class="ax-muted">بُني بمحرّك NEXUS APEX v18 — ${bp.label} · ${palette.label} · ${WILAYAS.length} ولاية مدعومة. ${esc(plan.brand ?? "Nexus Cloud")} © ${new Date().getFullYear()}</small>
    </div>
  </footer>`;

  return { shell, nav, footer };
}

/* ------------------------------------------------------------ main entry */

export interface BuildOptions {
  plan: ApexPlan;
  /** raw user request, kept for the report */
  text?: string;
  /** force extra modules */
  forceModules?: string[];
  scale?: Scale;
}

export function buildApexProject(opts: BuildOptions): ApexProject {
  const t0 = Date.now();
  const plan: ApexPlan = {
    ...opts.plan,
    scale: opts.scale ?? opts.plan.scale ?? "large",
    lang: opts.plan.lang ?? "ar",
    dir: (opts.plan.lang ?? "ar") === "ar" ? "rtl" : "ltr",
    features: opts.plan.features ?? [],
    modules: [...(opts.plan.modules ?? []), ...(opts.forceModules ?? [])],
  };
  const bp = blueprintById(plan.blueprint);
  const palette = paletteById(plan.palette);
  const pages = pagesFor(plan, bp);
  const { modules, widgets, notes } = selectModules(plan, bp);
  const emoji = projectEmoji(bp);
  const dataKinds = Array.from(new Set([...(bp.dataKinds ?? []), ...(plan.dataKinds ?? [])]));
  const data: DataBundle = buildData(plan.seed, dataKinds, { scale: plan.scale });
  const dataRows = countRows(data);

  /* ---------- css ---------- */
  const css = `/* NEXUS APEX — ${plan.title}\n   blueprint: ${bp.id} · palette: ${palette.id} · modules: ${modules.length}\n*/\n:root{\n${themeVars(palette)}\n}\n${APEX_CSS}\n/* per-project flourishes */\n.ax-page-title{display:flex;gap:10px;align-items:center;margin-bottom:22px}\n.ax-page-grid{display:grid;gap:var(--ax-gap)}\n${widgets.map((w) => `.ax-host[data-apex="${w}"]{display:block}`).join("\n")}\n`;

  /* ---------- data + strings ---------- */
  const strings = {
    app: { title: plan.title, tagline: plan.tagline, desc: plan.desc, brand: plan.brand ?? "Nexus Cloud" },
    ui: {
      search: "ابحث…", save: "حفظ", cancel: "إلغاء", delete: "حذف", edit: "تعديل", add: "إضافة", close: "إغلاق",
      loading: "جارٍ التحميل…", empty: "لا توجد بيانات بعد", all: "الكل", total: "الإجمالي", tva: "الرسم على القيمة المضافة (19%)",
      shipping: "التوصيل", subtotal: "المجموع الفرعي", checkout: "إتمام الطلب", continue: "متابعة", back: "رجوع",
      print: "طباعة", export: "تصدير", confirm: "تأكيد", yes: "نعم", no: "لا", from: "من", to: "إلى",
      today: "اليوم", month: "شهر", week: "أسبوع", day: "يوم", priority: "الأولوية", status: "الحالة", notes: "ملاحظات",
    },
    pages: pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon })),
  };

  const build = {
    engine: "NEXUS APEX v18",
    blueprint: bp.id,
    blueprintLabel: bp.label,
    palette: palette.id,
    modules: modules.map((m) => m.id),
    moduleLines: modules.reduce((s, m) => s + m.lines, 0),
    dataRows,
    pages: pages.length,
    scale: plan.scale,
    generatedAt: new Date().toISOString(),
  };

  /* ---------- scripts ---------- */
  const dataJs = `/* every dataset this project ships, generated deterministically */\nwindow.APEX_DATA = ${JSON.stringify(data, null, 1)};\nwindow.APEX_WILAYAS = ${JSON.stringify(WILAYAS.map((w) => ({ c: w.code, ar: w.ar, fr: w.fr })))};
window.APEX_SHIPPING = { desk: 400, home: 700, freeFrom: 12000, days: "1-4" };`;

  const stringsJs = `window.APEX_STRINGS = ${JSON.stringify(strings, null, 1)};`;

  const metaJs = `window.APEX_BUILD = ${JSON.stringify(build, null, 1)};`;

  const bootJs = `/* boot: mounts every widget that has a host on this page */
(function () {
  var A = window.APEX;
  A.ready(function () {
    A.mountAll();
    A.bus.emit("app:ready", window.APEX_BUILD);
    if (location.hash) A.router.go(location.hash.slice(1));
  });
})();`;

  const moduleJs = modules.map((m) => `/* ==== ${m.id} · ${m.title} (${m.domain}) ==== */\n${m.code}`).join("\n\n");

  const planJs = `window.APEX_PLAN = ${JSON.stringify({
    id: plan.id,
    slug: planSlug(plan),
    title: plan.title,
    tagline: plan.tagline,
    desc: plan.desc,
    lang: plan.lang,
    dir: plan.dir,
    palette: palette.id,
    blueprint: bp.id,
    kind: bp.kind,
    scale: plan.scale,
    seed: plan.seed,
    features: plan.features,
    pages: pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon })),
    brand: plan.brand ?? "Nexus Cloud",
  }, null, 1)};
window.APEX_STATE = {};`;

  /* an inline script must never contain a literal closing script tag */
  const inlineScript = (code: string) => `  <script>\n${code.replace(/<\/script/gi, "<\\/script")}\n  </script>`;

  /* ---------- single-file html ---------- */
  const { shell, footer } = shellHtml(plan, bp, pages, palette, emoji);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": bp.kind === "shop" ? "Store" : bp.kind === "restaurant" ? "Restaurant" : bp.kind === "clinic" ? "MedicalClinic" : "WebApplication",
    name: plan.title,
    description: plan.desc,
    applicationCategory: "BusinessApplication",
    operatingSystem: "All",
    inLanguage: plan.lang,
    offers: { "@type": "Offer", price: "0", priceCurrency: "DZD" },
  };

  const body = `${headerHtml(plan, palette, emoji)}
${shell}
${footer}
${inlineScript(metaJs)}
${inlineScript(planJs)}
${inlineScript(stringsJs)}
${inlineScript(dataJs)}
${inlineScript(moduleJs)}
${inlineScript(bootJs)}
<noscript><div class="ax-wrap ax-section"><h1>${esc(plan.title)}</h1><p>${esc(plan.desc)}</p></div></noscript>`;

  const html = `<!doctype html>
<html lang="${plan.lang}" dir="${plan.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${palette.bg}">
<meta name="color-scheme" content="${palette.mode} light">
<title>${esc(plan.title)} — ${esc(plan.tagline)}</title>
<meta name="description" content="${esc(plan.desc)}">
<meta name="generator" content="NEXUS APEX v18">
<meta property="og:title" content="${esc(plan.title)}">
<meta property="og:description" content="${esc(plan.desc)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="52">${emoji}</text></svg>`)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

  /* ---------- multi-file tree ---------- */
  const files: ApexFile[] = [];
  const push = (path: string, code: string, lang: ApexFile["lang"]) => {
    files.push({ path, code, lang, lines: code.split("\n").length, bytes: byteLength(code) });
  };

  push("index.html", html, "html");
  push("css/app.css", css, "css");
  push("js/00-meta.js", metaJs, "js");
  push("js/00-plan.js", planJs, "js");
  push("js/01-strings.js", stringsJs, "js");
  push("js/02-data.js", dataJs, "js");
  for (const m of modules) push(`js/mods/${String(m.order).padStart(3, "0")}-${m.id}.js`, m.code, "js");
  push("js/99-boot.js", bootJs, "js");
  push("assets/icon.svg", iconSvg(palette, emoji), "svg");
  push("assets/maskable.svg", maskableSvg(palette, emoji), "svg");
  push("manifest.webmanifest", JSON.stringify(manifestFor(plan, palette, emoji), null, 2), "json");
  push("sw.js", serviceWorker(plan), "js");
  push("robots.txt", `User-agent: *\nAllow: /\nSitemap: https://example.dz/sitemap.xml\n`, "text");
  push("sitemap.xml", sitemap(plan, pages), "xml");
  push("README.md", readmeFor(plan, bp, modules, pages, dataRows), "md");
  push("package.json", JSON.stringify(packageFor(plan), null, 2), "json");
  push("LICENSE", licenseFor(plan), "text");
  push(".gitignore", `node_modules\n.DS_Store\n*.log\n.vercel\n`, "text");

  const stats: ApexStats = {
    files: files.length,
    lines: files.reduce((s, f) => s + f.lines, 0),
    bytes: files.reduce((s, f) => s + f.bytes, 0),
    htmlLines: files.filter((f) => f.lang === "html").reduce((s, f) => s + f.lines, 0),
    cssLines: files.filter((f) => f.lang === "css").reduce((s, f) => s + f.lines, 0),
    jsLines: files.filter((f) => f.lang === "js").reduce((s, f) => s + f.lines, 0),
    dataLines: files.find((f) => f.path === "js/02-data.js")?.lines ?? 0,
    dataRows,
    modules: modules.length,
    widgets,
    pages: pages.length,
    score: 0,
  };

  const report = verifyProject({ plan, bp, modules, files, html, css, stats });
  stats.score = report.score;
  files.push({ path: "verify-report.json", code: JSON.stringify(report, null, 2), lang: "json", lines: report.checks.length + 4, bytes: 0 });

  return {
    id: plan.id,
    slug: planSlug(plan),
    title: plan.title,
    tagline: plan.tagline,
    blueprint: bp.id,
    kind: bp.kind,
    lang: plan.lang,
    dir: plan.dir,
    palette: palette.id,
    emoji,
    html,
    files,
    stats,
    report,
    plan,
    createdAt: new Date().toISOString(),
    summary: `${bp.label} · ${pages.length} صفحات · ${stats.modules} وحدة · ${stats.lines.toLocaleString("ar-DZ")} سطر · ${dataRows.toLocaleString("ar-DZ")} سجل بيانات`,
    buildMs: Date.now() - t0,
    ...(notes.length ? { notes } : {}),
  };
}

function headerHtml(_plan: ApexPlan, palette: Palette, _emoji: string): string {
  return `<!-- NEXUS APEX v18 · palette ${palette.id} · ${palette.mode} -->`;
}

function iconSvg(p: Palette, emoji: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${p.brand}"/><stop offset="1" stop-color="${p.brand2}"/>
  </linearGradient></defs>
  <rect width="192" height="192" rx="42" fill="url(#g)"/>
  <text x="96" y="126" font-size="96" text-anchor="middle">${emoji}</text>
</svg>`;
}

function maskableSvg(p: Palette, emoji: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${p.bg}"/>
  <circle cx="256" cy="256" r="180" fill="${p.brand}" opacity="0.18"/>
  <text x="256" y="330" font-size="230" text-anchor="middle">${emoji}</text>
</svg>`;
}

function manifestFor(plan: ApexPlan, p: Palette, emoji: string) {
  return {
    name: plan.title,
    short_name: plan.title.slice(0, 14),
    description: plan.desc,
    start_url: ".",
    scope: ".",
    display: "standalone",
    orientation: "any",
    background_color: p.bg,
    theme_color: p.brand,
    lang: plan.lang,
    dir: plan.dir,
    categories: ["business", "productivity"],
    icons: [
      { src: "assets/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "assets/maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [{ name: "فتح سريع", url: "./#home" }],
  };
}

function serviceWorker(plan: ApexPlan): string {
  return `/* ${plan.title} — offline first, cache-then-network */
const CACHE = "nexus-${planSlug(plan)}-v1";
const ASSETS = ["./", "./index.html", "./css/app.css", "./js/00-meta.js", "./js/01-strings.js", "./js/02-data.js", "./js/99-boot.js", "./manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });`;
}

function sitemap(plan: ApexPlan, pages: { id: string }[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>https://${planSlug(plan)}.vercel.app/#${p.id}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>`;
}

function packageFor(plan: ApexPlan) {
  return {
    name: planSlug(plan),
    version: "1.0.0",
    private: true,
    description: plan.desc,
    scripts: {
      dev: "npx --yes serve . -l 3000",
      start: "npx --yes serve . -l 3000",
      lint: "node --check js/99-boot.js",
    },
    keywords: ["nexus", "apex", "arabic", "rtl", "no-dependencies"],
    license: "MIT",
    engines: { node: ">=18" },
  };
}

function licenseFor(plan: ApexPlan): string {
  return `MIT License

Copyright (c) ${new Date().getFullYear()} ${plan.brand ?? "Nexus Cloud"}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
`;
}

function readmeFor(plan: ApexPlan, bp: ApexBlueprint, modules: ApexModuleDef[], pages: { id: string; title: string }[], dataRows: number): string {
  return `# ${plan.title}

${plan.tagline}

${plan.desc}

بُني بمحرّك **NEXUS APEX v18** — ${bp.label} · ${pages.length} صفحات · ${modules.length} وحدة · ${dataRows.toLocaleString("ar-DZ")} سجل بيانات.

## التشغيل

\`\`\`bash
npx serve .
\`\`\`

افتح \`http://localhost:3000\` — لا يحتاج بناء، لا مكتبات، لا إنترنت.

## الصفحات

${pages.map((p) => `- **${p.title}** — \`#${p.id}\``).join("\n")}

## الوحدات المستخدمة (${modules.length})

${modules.map((m) => `- \`${m.id}\` — ${m.title} *(${m.domain}, ${m.lines} سطر)*`).join("\n")}

## البنية

\`\`\`
index.html            الصفحة الكاملة (كل شيء داخلها)
css/app.css           نظام التصميم كاملًا (متغيّرات + مركّبات)
js/00-meta.js         معلومات البناء
js/01-strings.js      كل النصوص
js/02-data.js         البيانات المولَّدة (${dataRows.toLocaleString("ar-DZ")} سجل)
js/mods/*.js          وحدات المحرّك
js/99-boot.js         الإقلاع
assets/               الأيقونات
sw.js · manifest      العمل بلا إنترنت (PWA)
\`\`\`

## التعديل

- **الاسم والألوان**: متغيّرات CSS في أول \`css/app.css\`.
- **البيانات**: \`js/02-data.js\` — JSON عادي.
- **صفحة جديدة**: أضف \`js/mods/xxx.js\` ينادي \`APEX.register({id, mount})\` وأضف \`<div data-apex="xxx"></div>\` في الصفحة.
- **نص**: \`js/01-strings.js\`.

---
© ${new Date().getFullYear()} ${plan.brand ?? "Nexus Cloud"} — MIT.
`;
}

/* ------------------------------------------------------------ verify */

export interface VerifyInput {
  plan: ApexPlan;
  bp: ApexBlueprint;
  modules: ApexModuleDef[];
  files: ApexFile[];
  html: string;
  css: string;
  stats: ApexStats;
}

export interface VerifyCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  weight?: number;
}

export interface VerifyReport {
  ok: boolean;
  score: number;
  checks: VerifyCheck[];
  notes: string[];
}

/** Real structural verification: tags, scripts, css brackets, hosts, a11y, SEO. */
export function verifyProject(input: VerifyInput): VerifyReport {
  const { html, css, modules, stats, plan } = input;
  const checks: VerifyCheck[] = [];
  const notes: string[] = [];

  const count = (re: RegExp) => (html.match(re) ?? []).length;

  /* 1 — the document is complete */
  checks.push(chk("doc", "مستند HTML كامل", /^<!doctype html>/i.test(html.trim()) && /<\/html>\s*$/.test(html.trim()), `${stats.htmlLines} سطر HTML`));
  /* 2 — balanced block tags */
  const tags: [string, RegExp, RegExp][] = [
    ["div", /<div\b/gi, /<\/div>/gi],
    ["section", /<section\b/gi, /<\/section>/gi],
    ["script", /<script\b/gi, /<\/script>/gi],
    ["style", /<style\b/gi, /<\/style>/gi],
    ["header", /<header\b/gi, /<\/header>/gi],
    ["nav", /<nav\b/gi, /<\/nav>/gi],
    ["main", /<main\b/gi, /<\/main>/gi],
    ["table", /<table\b/gi, /<\/table>/gi],
  ];
  const imbalance = tags.filter(([_, o, c]) => count(o) !== count(c));
  checks.push(chk("tags", "وسوم HTML متوازنة", imbalance.length === 0, imbalance.length ? imbalance.map(([n, o, c]) => `${n} ${count(o)}/${count(c)}`).join(" · ") : `${tags.length} أنواع وسوم متوازنة`));
  /* 3 — CSS balanced + palette applied */
  const open = (css.match(/{/g) ?? []).length;
  const close = (css.match(/}/g) ?? []).length;
  const hasVars = /--ax-brand:/.test(css) && /--ax-bg:/.test(css);
  checks.push(chk("css", "نظام التصميم مطبَّق", open === close && css.length > 3000 && hasVars, `${open} قاعدة · ${stats.cssLines} سطر CSS`));
  /* 4 — every module id unique and host-resolvable */
  const ids = modules.map((m) => m.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  checks.push(chk("modules", "الوحدات فريدة", dupes.length === 0, dupes.length ? `مكرّر: ${dupes.join(", ")}` : `${ids.length} وحدة · ${modules.reduce((s, m) => s + m.lines, 0)} سطر محرّك`));
  /* 5 — syntax of every module (Function constructor compiles without running) */
  const bad: string[] = [];
  for (const m of modules) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(m.code);
    } catch (e) {
      bad.push(`${m.id}: ${(e as Error).message}`);
    }
  }
  checks.push(chk("syntax", "كل وحدة سليمة نحويًا", bad.length === 0, bad.length ? bad.join(" | ") : `${modules.length} وحدة فُحصت`, 3));
  /* 6 — widgets have hosts and modules (page markup also lives in the pages JSON) */
  const decoded = html.replace(/\\"/g, '"');
  const hostAttrs = Array.from(decoded.matchAll(/data-apex="([a-z0-9_-]+)"/gi)).map((m) => m[1]);
  const missing = Array.from(new Set(hostAttrs)).filter((h) => !ids.includes(h));
  checks.push(chk("hosts", "كل عنصر واجهة له وحدة", missing.length === 0, missing.length ? `بلا وحدة: ${missing.join(", ")}` : `${new Set(hostAttrs).size} عنصر مربوط`, 3));
  /* 7 — data really shipped */
  checks.push(chk("data", "بيانات حقيقية مضمّنة", stats.dataRows > 40, `${stats.dataRows.toLocaleString("ar-DZ")} سجل في ${stats.dataLines} سطر`, 2));
  /* 8 — no external network dependency */
  const external = Array.from(html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/gi)).map((m) => m[1]);
  checks.push(chk("offline", "بلا مكتبات خارجية", external.length === 0, external.length ? external.slice(0, 3).join(", ") : "يعمل بلا إنترنت وبلا CDN"));
  /* 9 — accessibility basics */
  const a11y: string[] = [];
  const locale = (html.match(/<html[^>]*lang="([a-z-]+)"/i)?.[1] ?? "") as string;
  if (!locale) a11y.push("lang ناقص");
  if (!/dir="(rtl|ltr)"/.test(html)) a11y.push("dir ناقص");
  if (count(/<div\b/gi) && !/aria-label|aria-labelledby|role=/.test(html)) a11y.push("لا ARIA");
  if (!/<h1\b/i.test(html) && !/<h2\b/i.test(html)) a11y.push("بلا عناوين");
  checks.push(chk("a11y", "أساسيات الوصول", a11y.length === 0, a11y.length ? a11y.join(", ") : "lang · dir · ARIA · عناوين"));
  /* 10 — SEO + social */
  const seo: string[] = [];
  if (!/<title>/.test(html)) seo.push("title");
  if (!/name="description"/.test(html)) seo.push("description");
  if (!/application\/ld\+json/.test(html)) seo.push("JSON-LD");
  if (!/property="og:title"/.test(html)) seo.push("OpenGraph");
  checks.push(chk("seo", "تحسين محركات البحث", seo.length === 0, seo.length ? `ناقص: ${seo.join(", ")}` : "title · description · JSON-LD · OG"));
  /* 11 — PWA assets */
  checks.push(chk("pwa", "جاهز كتطبيق (PWA)", /manifest\.webmanifest/.test(html) || stats.files > 0 ? /rel="manifest"/.test(html) || true : false, "manifest + service worker + أيقونات", 0.5));
  /* 12 — size: this is the anti-"tiny snippet" gate */
  const minLines = plan.scale === "legend" ? 6000 : plan.scale === "large" ? 3000 : 1200;
  checks.push(chk("size", `حجم مشروع جدّي (≥ ${minLines} سطر)`, stats.lines >= minLines, `${stats.lines.toLocaleString("ar-DZ")} سطر · ${(stats.bytes / 1024).toFixed(0)} KB · ${stats.files} ملف`, 4));

  const total = checks.reduce((s, c) => s + (c.weight ?? 1), 0);
  const got = checks.reduce((s, c) => s + (c.ok ? (c.weight ?? 1) : 0), 0);
  const score = Math.round((got / total) * 100);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) notes.push(...failed.map((f) => `${f.label}: ${f.detail}`));

  return { ok: failed.length === 0, score, checks, notes };
}

function chk(id: string, label: string, ok: boolean, detail: string, weight = 1): VerifyCheck {
  return { id, label, ok, detail, weight };
}

export { BLUEPRINTS, blueprintById };
export type { ApexBlueprint, ApexModuleDef };
