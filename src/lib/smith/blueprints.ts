/**
 * NEXUS SMITH — the blueprint catalogue.
 *
 * This is the "different idea" for making games: instead of asking a model to
 * write a whole game from scratch every time (slow, expensive, occasionally
 * broken), the player picks a BLUEPRINT — a real engine module that already
 * exists, is tested, and always runs — then tunes it: theme, difficulty, speed,
 * level count, power-ups, boss, grid size, timer…
 *
 * The factory assembles ONE self-contained HTML file in a few milliseconds,
 * with a deterministic seed, zero AI latency and zero chance of a broken build.
 * The AI is still welcome: it can rename the game, pick a palette and write the
 * hero's story — the engine does the engineering.
 */

export type BlueprintId =
  | "runner"
  | "breaker"
  | "snake"
  | "shooter"
  | "climber"
  | "maze"
  | "merge"
  | "memory";

export type L = { ar: string; fr: string; en: string };

export interface BlueprintDef {
  id: BlueprintId;
  emoji: string;
  /** lucide icon name — resolved in the UI so this file stays server-safe */
  icon: string;
  name: L;
  desc: L;
  /** how the player controls it, one line */
  controls: L;
  accent: string;
  /** which knobs are meaningful for this blueprint */
  knobs: SmithKnob[];
  /** default config deltas */
  defaults: Partial<SmithConfig>;
  /** target score for 1 star at level 1 */
  starTarget: number;
}

export type SmithKnob =
  | "difficulty"
  | "speed"
  | "levels"
  | "endless"
  | "powerups"
  | "boss"
  | "size"
  | "target"
  | "wrap"
  | "walls"
  | "portals"
  | "timed"
  | "autofire";

export type Difficulty = "easy" | "normal" | "hard" | "insane";
export type SmithLang = "ar" | "fr" | "en";

export interface SmithConfig {
  blueprint: BlueprintId;
  theme: string;
  difficulty: Difficulty;
  heroName: string;
  lang: SmithLang;
  seed: number;
  /** 0.7 … 1.6 player-chosen speed */
  speed: number;
  levels: number;
  size: number;
  target: number;
  sound: boolean;
  powerups: boolean;
  boss: boolean;
  endless: boolean;
  wrap: boolean;
  walls: boolean;
  portals: boolean;
  timed: boolean;
  mobile: boolean;
  autofire: boolean;
  /* filled by the factory */
  slug: string;
  title: string;
  blueprintLabel: string;
  difficultyLabel: string;
  speedMul: number;
}

export const DIFFICULTY_LABEL: Record<Difficulty, L> = {
  easy: { ar: "سهلة", fr: "Facile", en: "Easy" },
  normal: { ar: "متوسطة", fr: "Normale", en: "Normal" },
  hard: { ar: "صعبة", fr: "Difficile", en: "Hard" },
  insane: { ar: "جنونية", fr: "Extrême", en: "Insane" },
};

export const BLUEPRINTS: BlueprintDef[] = [
  {
    id: "runner",
    emoji: "🏃",
    icon: "PersonStanding",
    name: { ar: "العدّاء اللانهائي", fr: "Course infinie", en: "Endless runner" },
    desc: {
      ar: "اقفز فوق العوائق وانحنِ تحت الطيور واجمع القوى — السرعة تتصاعد كل 900 متر",
      fr: "Sautez les obstacles, glissez sous les oiseaux, la vitesse monte tous les 900 m",
      en: "Jump obstacles, slide under birds — speed ramps every 900 m",
    },
    controls: { ar: "مسافة = قفز · ↓ = انحناء", fr: "Espace = saut · ↓ = glissade", en: "Space = jump · ↓ = slide" },
    accent: "#7c5cff",
    knobs: ["difficulty", "speed", "powerups", "boss", "endless"],
    defaults: { powerups: true, endless: true },
    starTarget: 900,
  },
  {
    id: "breaker",
    emoji: "🧱",
    icon: "Blocks",
    name: { ar: "كاسر الطوب", fr: "Casse-briques", en: "Brick breaker" },
    desc: {
      ar: "مضرب وكرات وطوب متعدد الصلابة مع ليزر وثلاث كرات ومراحل متصاعدة",
      fr: "Raquette, briques à résistance, laser, multiballe et niveaux progressifs",
      en: "Paddle, multi-hit bricks, laser, multiball and rising levels",
    },
    controls: { ar: "← → للمضرب · مسافة للإطلاق", fr: "← → raquette · espace pour lancer", en: "← → paddle · space to launch" },
    accent: "#22d3ee",
    knobs: ["difficulty", "speed", "levels", "endless", "powerups"],
    defaults: { levels: 12, powerups: true },
    starTarget: 1200,
  },
  {
    id: "snake",
    emoji: "🐍",
    icon: "Waypoints",
    name: { ar: "الثعبان الذكي", fr: "Serpent", en: "Smart snake" },
    desc: {
      ar: "الثعبان الكلاسيكي بثلاثة أوضاع: جدران قاتلة، بوابات نقل، ولفّ حول الشاشة",
      fr: "Le classique en trois modes : murs mortels, portails, traversée d'écran",
      en: "The classic with three modes: killer walls, portals, screen wrap",
    },
    controls: { ar: "الأسهم أو السحب", fr: "Flèches ou glissement", en: "Arrows or swipe" },
    accent: "#4ade80",
    knobs: ["difficulty", "speed", "size", "wrap", "walls", "portals"],
    defaults: { size: 18, wrap: true, walls: true, portals: true },
    starTarget: 400,
  },
  {
    id: "shooter",
    emoji: "🚀",
    icon: "Rocket",
    name: { ar: "عاصفة الفضاء", fr: "Tempête spatiale", en: "Space storm" },
    desc: {
      ar: "موجات أعداء بخمسة سلوكيات مختلفة، ترقيات سلاح، وزعيم بمرحلتين كل 5 موجات",
      fr: "Vagues d'ennemis variés, armes améliorables, boss à deux phases toutes les 5 vagues",
      en: "Waves of varied enemies, weapon upgrades, a two-phase boss every 5 waves",
    },
    controls: { ar: "اسحب للتحرك — الإطلاق تلقائي", fr: "Glissez pour bouger — tir auto", en: "Drag to move — auto fire" },
    accent: "#f472b6",
    knobs: ["difficulty", "speed", "boss", "powerups", "autofire"],
    defaults: { boss: true, powerups: true, autofire: true },
    starTarget: 1500,
  },
  {
    id: "climber",
    emoji: "🪂",
    icon: "Mountain",
    name: { ar: "القفّاز العالي", fr: "Grand grimpeur", en: "Sky climber" },
    desc: {
      ar: "اصعد على المنصات: نوابض، منصات متحركة وأخرى تنكسر، وحوش ونفّاثات",
      fr: "Grimpez : ressorts, plateformes mobiles ou fragiles, monstres et jetpacks",
      en: "Climb: springs, moving or breaking platforms, monsters and jetpacks",
    },
    controls: { ar: "← → للحركة والقفز تلقائي", fr: "← → et le saut est auto", en: "← → and bouncing is automatic" },
    accent: "#fbbf24",
    knobs: ["difficulty", "speed", "powerups"],
    defaults: { powerups: true },
    starTarget: 800,
  },
  {
    id: "maze",
    emoji: "🌀",
    icon: "Compass",
    name: { ar: "متاهة الضباب", fr: "Labyrinthe brumeux", en: "Fog maze" },
    desc: {
      ar: "متاهة مولَّدة لكل مرحلة مع ضباب يحدّ الرؤية، مفاتيح وباب ذهبي",
      fr: "Labyrinthe généré par niveau, brouillard limitant la vue, clés et porte dorée",
      en: "A generated maze per level, fog of war, keys and a golden door",
    },
    controls: { ar: "الأسهم أو النقر على مربع مجاور", fr: "Flèches ou toucher une case", en: "Arrows or tap a neighbour tile" },
    accent: "#a78bfa",
    knobs: ["difficulty", "levels", "endless", "timed"],
    defaults: { levels: 10, timed: true },
    starTarget: 700,
  },
  {
    id: "merge",
    emoji: "🔢",
    icon: "Grid3x3",
    name: { ar: "دمج الأرقام", fr: "Fusion de chiffres", en: "Number merge" },
    desc: {
      ar: "2048 بحجم لوحة قابل للتغيير (3×3 إلى 6×6) وهدف تختاره أنت",
      fr: "Un 2048 avec grille réglable (3×3 à 6×6) et objectif au choix",
      en: "2048 with an adjustable grid (3×3 to 6×6) and a target you choose",
    },
    controls: { ar: "اسحب أو استعمل الأسهم", fr: "Glissez ou utilisez les flèches", en: "Swipe or use the arrows" },
    accent: "#fb923c",
    knobs: ["difficulty", "size", "target"],
    defaults: { size: 4, target: 2048 },
    starTarget: 1000,
  },
  {
    id: "memory",
    emoji: "🃏",
    icon: "Layers",
    name: { ar: "ذاكرة الأزواج", fr: "Paires mémoire", en: "Memory pairs" },
    desc: {
      ar: "بطاقات تُكشف لثوانٍ ثم تُخفى — أزواج، كومبو، ووقت يضغط عليك",
      fr: "Des cartes montrées quelques secondes — paires, combo et temps limité",
      en: "Cards shown for a few seconds — pairs, combos and a ticking clock",
    },
    controls: { ar: "اضغط بطاقتين", fr: "Touchez deux cartes", en: "Tap two cards" },
    accent: "#38bdf8",
    knobs: ["difficulty", "levels", "endless", "timed"],
    defaults: { levels: 10, timed: true },
    starTarget: 900,
  },
];

export const BLUEPRINT_MAP: Record<BlueprintId, BlueprintDef> = BLUEPRINTS.reduce(
  (acc, b) => {
    acc[b.id] = b;
    return acc;
  },
  {} as Record<BlueprintId, BlueprintDef>
);

export function isBlueprintId(v: unknown): v is BlueprintId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(BLUEPRINT_MAP, v);
}

/** Knob labels for the factory UI. */
export const KNOB_LABEL: Record<SmithKnob, L> = {
  difficulty: { ar: "الصعوبة", fr: "Difficulté", en: "Difficulty" },
  speed: { ar: "السرعة", fr: "Vitesse", en: "Speed" },
  levels: { ar: "عدد المراحل", fr: "Nombre de niveaux", en: "Levels" },
  endless: { ar: "وضع لانهائي", fr: "Mode infini", en: "Endless mode" },
  powerups: { ar: "القوى الخاصة", fr: "Bonus", en: "Power-ups" },
  boss: { ar: "زعماء", fr: "Boss", en: "Bosses" },
  size: { ar: "حجم اللوحة", fr: "Taille de la grille", en: "Board size" },
  target: { ar: "الهدف", fr: "Objectif", en: "Target" },
  wrap: { ar: "لفّ حول الشاشة", fr: "Traversée d'écran", en: "Screen wrap" },
  walls: { ar: "جدران قاتلة", fr: "Murs mortels", en: "Killer walls" },
  portals: { ar: "بوابات نقل", fr: "Portails", en: "Portals" },
  timed: { ar: "مؤقّت", fr: "Chronomètre", en: "Timer" },
  autofire: { ar: "إطلاق تلقائي", fr: "Tir automatique", en: "Auto fire" },
};
