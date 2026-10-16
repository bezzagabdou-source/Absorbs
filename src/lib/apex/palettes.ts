/**
 * NEXUS APEX — palettes.
 *
 * Fourteen ready design-palettes. Each one is a full design system: surface ramp,
 * brand ramp, accents, semantic colors, chart series, radius scale and shadow
 * depth. The generator writes them into CSS variables, so a generated project
 * never looks like the default template.
 */

export interface Palette {
  id: PaletteId;
  label: string;
  mode: "dark" | "light";
  /** page background ramp */
  bg: string;
  bg2: string;
  card: string;
  line: string;
  text: string;
  dim: string;
  brand: string;
  brand2: string;
  accent: string;
  accent2: string;
  ok: string;
  warn: string;
  err: string;
  series: string[];
  radius: number;
  font: "system" | "serif" | "mono";
  /** what the palette is good for */
  use: string[];
}

export type PaletteId =
  | "midnight"
  | "obsidian"
  | "aurora"
  | "royal"
  | "cyber"
  | "emerald"
  | "sunset"
  | "sand"
  | "navy"
  | "plum"
  | "slate"
  | "coffee"
  | "ocean"
  | "paper";

const SANS = '"Segoe UI", system-ui, -apple-system, "Noto Sans Arabic", Arial, sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Georgia, "Noto Naskh Arabic", serif';
const MONO = 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, monospace';

export const FONT_STACKS: Record<Palette["font"], string> = { system: SANS, serif: SERIF, mono: MONO };

export const PALETTES: Palette[] = [
  {
    id: "midnight", label: "منتصف الليل", mode: "dark",
    bg: "#080b14", bg2: "#0e1220", card: "#141a2b", line: "#232c44", text: "#eef2fb", dim: "#9aa6c4",
    brand: "#6366f1", brand2: "#8b5cf6", accent: "#22d3ee", accent2: "#f472b6",
    ok: "#34d399", warn: "#fbbf24", err: "#fb7185",
    series: ["#6366f1", "#22d3ee", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#38bdf8"],
    radius: 16, font: "system", use: ["app", "dashboard", "saas", "admin"],
  },
  {
    id: "obsidian", label: "أوبسيديان", mode: "dark",
    bg: "#06070a", bg2: "#0b0d13", card: "#12151d", line: "#20242f", text: "#f4f6fa", dim: "#98a0b3",
    brand: "#f59e0b", brand2: "#f97316", accent: "#60a5fa", accent2: "#f43f5e",
    ok: "#22c55e", warn: "#eab308", err: "#ef4444",
    series: ["#f59e0b", "#60a5fa", "#22c55e", "#f43f5e", "#a78bfa", "#14b8a6", "#fb7185", "#84cc16"],
    radius: 12, font: "system", use: ["game", "media", "portfolio"],
  },
  {
    id: "aurora", label: "الشفق", mode: "dark",
    bg: "#06121a", bg2: "#0a1c2a", card: "#0f2536", line: "#1c3a52", text: "#ecfeff", dim: "#8fb3c9",
    brand: "#06b6d4", brand2: "#14b8a6", accent: "#a3e635", accent2: "#f0abfc",
    ok: "#4ade80", warn: "#facc15", err: "#f87171",
    series: ["#06b6d4", "#a3e635", "#14b8a6", "#f0abfc", "#facc15", "#38bdf8", "#4ade80", "#fb923c"],
    radius: 18, font: "system", use: ["clinic", "health", "travel", "weather"],
  },
  {
    id: "royal", label: "ملكي", mode: "dark",
    bg: "#0b0716", bg2: "#150d29", card: "#1e1438", line: "#33245c", text: "#f6f2ff", dim: "#a99ecb",
    brand: "#a855f7", brand2: "#d946ef", accent: "#facc15", accent2: "#38bdf8",
    ok: "#34d399", warn: "#fbbf24", err: "#fb7185",
    series: ["#a855f7", "#facc15", "#38bdf8", "#f472b6", "#34d399", "#fb923c", "#c084fc", "#22d3ee"],
    radius: 20, font: "serif", use: ["edu", "lms", "quiz", "docs"],
  },
  {
    id: "cyber", label: "سيبراني", mode: "dark",
    bg: "#04060a", bg2: "#071018", card: "#0c1a22", line: "#15323c", text: "#e6fffb", dim: "#7fa9b3",
    brand: "#10d9a0", brand2: "#22d3ee", accent: "#f0abfc", accent2: "#fde047",
    ok: "#10d9a0", warn: "#fde047", err: "#ff5d7a",
    series: ["#10d9a0", "#22d3ee", "#f0abfc", "#fde047", "#7c3aed", "#ff5d7a", "#84cc16", "#38bdf8"],
    radius: 8, font: "mono", use: ["game", "devtools", "ai", "crypto"],
  },
  {
    id: "emerald", label: "زمرد", mode: "light",
    bg: "#f5fbf7", bg2: "#e9f6ee", card: "#ffffff", line: "#cfe6d8", text: "#0b2318", dim: "#5d7d6c",
    brand: "#0f9d63", brand2: "#22c55e", accent: "#0ea5e9", accent2: "#f59e0b",
    ok: "#16a34a", warn: "#d97706", err: "#dc2626",
    series: ["#0f9d63", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#6366f1"],
    radius: 16, font: "system", use: ["shop", "boutique", "agri", "green"],
  },
  {
    id: "sunset", label: "الغروب", mode: "light",
    bg: "#fff9f4", bg2: "#fdeee2", card: "#ffffff", line: "#f6d9c4", text: "#2a1608", dim: "#8a6a52",
    brand: "#e2612f", brand2: "#f59e0b", accent: "#0ea5e9", accent2: "#db2777",
    ok: "#16a34a", warn: "#c2410c", err: "#dc2626",
    series: ["#e2612f", "#f59e0b", "#0ea5e9", "#db2777", "#16a34a", "#7c3aed", "#0891b2", "#ea580c"],
    radius: 18, font: "system", use: ["restaurant", "food", "shop", "clinic"],
  },
  {
    id: "sand", label: "رملي", mode: "light",
    bg: "#fbf7f0", bg2: "#f3ebdd", card: "#ffffff", line: "#e3d5bd", text: "#241d12", dim: "#7d6c52",
    brand: "#b4762b", brand2: "#d99a3d", accent: "#0f766e", accent2: "#b91c1c",
    ok: "#15803d", warn: "#b45309", err: "#b91c1c",
    series: ["#b4762b", "#0f766e", "#b91c1c", "#7c3aed", "#0891b2", "#ca8a04", "#4d7c0f", "#be185d"],
    radius: 14, font: "serif", use: ["realestate", "tourism", "hotel", "culture"],
  },
  {
    id: "navy", label: "كحلي", mode: "dark",
    bg: "#050a16", bg2: "#0a1226", card: "#101b34", line: "#1e2c4d", text: "#eaf1ff", dim: "#93a3c2",
    brand: "#3b82f6", brand2: "#60a5fa", accent: "#fbbf24", accent2: "#34d399",
    ok: "#22c55e", warn: "#f59e0b", err: "#ef4444",
    series: ["#3b82f6", "#fbbf24", "#34d399", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c", "#84cc16"],
    radius: 14, font: "system", use: ["finance", "bank", "b2b", "logistics"],
  },
  {
    id: "plum", label: "برقوقي", mode: "dark",
    bg: "#0e0713", bg2: "#180c22", card: "#221232", line: "#3a2153", text: "#f8eefe", dim: "#b39ccc",
    brand: "#ec4899", brand2: "#a855f7", accent: "#38bdf8", accent2: "#facc15",
    ok: "#4ade80", warn: "#fbbf24", err: "#f87171",
    series: ["#ec4899", "#a855f7", "#38bdf8", "#facc15", "#4ade80", "#fb923c", "#22d3ee", "#f43f5e"],
    radius: 22, font: "system", use: ["beauty", "fashion", "blog", "lifestyle"],
  },
  {
    id: "slate", label: "رمادي", mode: "light",
    bg: "#f7f8fa", bg2: "#eef1f5", card: "#ffffff", line: "#dbdfe7", text: "#141821", dim: "#6b7280",
    brand: "#334155", brand2: "#475569", accent: "#2563eb", accent2: "#0d9488",
    ok: "#059669", warn: "#d97706", err: "#dc2626",
    series: ["#334155", "#2563eb", "#0d9488", "#7c3aed", "#d97706", "#dc2626", "#0891b2", "#65a30d"],
    radius: 10, font: "system", use: ["docs", "legal", "corporate", "gov"],
  },
  {
    id: "coffee", label: "قهوة", mode: "light",
    bg: "#faf6f2", bg2: "#f1e8de", card: "#ffffff", line: "#e0d2c3", text: "#221a14", dim: "#7a6455",
    brand: "#7c4a2a", brand2: "#a56a3f", accent: "#0b7285", accent2: "#c2255c",
    ok: "#2f9e44", warn: "#e8590c", err: "#c92a2a",
    series: ["#7c4a2a", "#0b7285", "#c2255c", "#f08c00", "#2f9e44", "#6741d9", "#1098ad", "#e8590c"],
    radius: 12, font: "serif", use: ["cafe", "craft", "boutique", "portfolio"],
  },
  {
    id: "ocean", label: "محيط", mode: "dark",
    bg: "#04121b", bg2: "#071f2c", card: "#0b2b3c", line: "#144457", text: "#e8fbff", dim: "#8ab6c4",
    brand: "#0ea5e9", brand2: "#0284c7", accent: "#facc15", accent2: "#2dd4bf",
    ok: "#2dd4bf", warn: "#facc15", err: "#fb7185",
    series: ["#0ea5e9", "#2dd4bf", "#facc15", "#a78bfa", "#fb7185", "#34d399", "#f97316", "#38bdf8"],
    radius: 16, font: "system", use: ["travel", "logistics", "marine", "saas"],
  },
  {
    id: "paper", label: "ورقي", mode: "light",
    bg: "#ffffff", bg2: "#f6f6f4", card: "#ffffff", line: "#e4e4e0", text: "#111111", dim: "#666663",
    brand: "#111111", brand2: "#333333", accent: "#d97757", accent2: "#0b7285",
    ok: "#2f9e44", warn: "#e8590c", err: "#c92a2a",
    series: ["#111111", "#d97757", "#0b7285", "#6741d9", "#2f9e44", "#e8590c", "#1098ad", "#c2255c"],
    radius: 6, font: "serif", use: ["blog", "docs", "portfolio", "news"],
  },
];

export const PALETTE_IDS: PaletteId[] = PALETTES.map((p) => p.id);

export function paletteById(id: string | undefined | null): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Palette chooser hint — the author of the request usually says the mood, not the id. */
export function guessPalette(text: string, fallback: PaletteId = "midnight"): Palette {
  const t = (text || "").toLowerCase();
  const rules: [RegExp, PaletteId][] = [
    [/لعبة|game|arcade|action|مغامر|rpg|شوتر|زومبي/, "cyber"],
    [/لوحة تحكم|dashboard|saas|admin|تحليل|analytics|منصة/, "midnight"],
    [/متجر|shop|store|بيع|تسوق|منتج/, "emerald"],
    [/مطعم|restaurant|كافيه|cafe|طبخ|فطور|حلويات/, "sunset"],
    [/عيادة|clinic|طبيب|صحة|health|صيدلية|nutrition|رياضة/, "aurora"],
    [/عقار|realestate|شقق|فيلا|إيجار|بيع منزل/, "sand"],
    [/سفر|tourism|رحلة|فندق|hotel|جزائر|سياحة|travel/, "ocean"],
    [/مالية|finance|بنك|bank|محاسبة|فاتورة|ميزانية/, "navy"],
    [/مدرسة|school|تعليم|edu|جامعة|دروس|قسم|تلميذ/, "royal"],
    [/مدونة|blog|مقال|مقالات|أخبار|news|جريدة/, "paper"],
    [/وثائق|docs|توثيق|دليل|manual|help|api/, "slate"],
    [/معرض|portfolio|فن|تصوير|designer|مصمم/, "obsidian"],
    [/جمال|beauty|موضة|fashion|منتجات تجميل/, "plum"],
    [/قهوة|coffee|حرفة|craft|نحاس|تقليدي/, "coffee"],
    [/زراعة|agriculture|مزرعة|فلاح/, "emerald"],
    [/بورتفوليو|cv|سيرة|resume|شخصي|personal/, "coffee"],
    [/legal|قانون|محامي|عدالة|محكمة|gov/, "slate"],
    [/ai|ذكاء اصطناعي|crypto|بلوكشين|devtools/, "cyber"],
  ];
  for (const [re, id] of rules) if (re.test(t)) return paletteById(id);
  return paletteById(fallback);
}

/** Palette families that read well for a given project kind. */
export const PALETTE_HINTS: Record<string, PaletteId[]> = {
  site: ["paper", "coffee", "sand", "plum", "emerald"],
  app: ["midnight", "navy", "aurora", "slate"],
  dashboard: ["midnight", "navy", "cyber", "royal"],
  shop: ["emerald", "sunset", "plum", "coffee"],
  game: ["cyber", "obsidian", "plum", "midnight"],
  docs: ["slate", "paper", "royal"],
  edu: ["royal", "aurora", "paper"],
  health: ["aurora", "emerald", "paper"],
  travel: ["ocean", "sand", "aurora"],
  finance: ["navy", "midnight", "emerald"],
  restaurant: ["sunset", "coffee", "sand"],
};
