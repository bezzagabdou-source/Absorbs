/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEXUS MASTERY — rules (pure & isomorphic)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Levels, ranks, XP amounts and badge definitions.
 *
 *  This file has NO imports at all, on purpose: both the server (which writes
 *  the numbers) and the browser (which draws the dashboard) must agree on the
 *  same curve and the same badge list, and the client bundle must never drag in
 *  `pg` or drizzle. ./mastery.ts does the database work and re-exports these.
 */

/* ────────────────────────────── levels ────────────────────────────── */

/** XP needed to REACH a level. Gentle at first, then a real grind. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.round(120 * Math.pow(l - 1, 1.55) + (l - 1) * 60);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 200 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; need: number; pct: number; nextAt: number } {
  const level = levelFromXp(xp);
  const cur = xpForLevel(level);
  const nextAt = xpForLevel(level + 1);
  const need = Math.max(1, nextAt - cur);
  const into = Math.max(0, xp - cur);
  return { level, into, need, pct: Math.min(100, Math.round((into / need) * 100)), nextAt };
}

/** Ranks shown next to a name — a small ladder that keeps XP meaningful. */
export interface Rank {
  min: number;
  ar: string;
  fr: string;
  en: string;
  emoji: string;
}

export const RANKS: readonly Rank[] = [
  { min: 1, ar: "مبتدئ", fr: "Novice", en: "Novice", emoji: "🌱" },
  { min: 3, ar: "صانع", fr: "Fabricant", en: "Maker", emoji: "🔧" },
  { min: 6, ar: "محترف", fr: "Pro", en: "Pro", emoji: "⚡" },
  { min: 10, ar: "خبير", fr: "Expert", en: "Expert", emoji: "🎯" },
  { min: 15, ar: "أسطورة", fr: "Légende", en: "Legend", emoji: "👑" },
  { min: 25, ar: "تيتان", fr: "Titan", en: "Titan", emoji: "🔥" },
  { min: 40, ar: "خالد", fr: "Immortel", en: "Immortal", emoji: "🌟" },
];

export function rankFor(level: number): Rank {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.min) r = x;
  return r;
}

/* ────────────────────────────── XP actions ────────────────────────────── */

export type XpAction =
  | "smith_build"
  | "smith_publish"
  | "smith_play"
  | "smith_score"
  | "smith_like"
  | "ai_game"
  | "mind_read"
  | "tool_run"
  | "chat_deep"
  | "daily_first";

export const XP_AMOUNT: Record<XpAction, number> = {
  smith_build: 60,
  smith_publish: 45,
  smith_play: 6,
  smith_score: 25,
  smith_like: 8,
  ai_game: 120,
  mind_read: 4,
  tool_run: 12,
  chat_deep: 15,
  daily_first: 30,
};

export const XP_LABEL_AR: Record<XpAction, string> = {
  smith_build: "صنعت لعبة في المصنع",
  smith_publish: "نشرت لعبة في الساحة",
  smith_play: "لعبت لعبة",
  smith_score: "سجّلت نتيجة في الصدارة",
  smith_like: "أعجبتك لعبة",
  ai_game: "ولّدت لعبة بالذكاء الاصطناعي",
  mind_read: "استعملت قوة الفهم",
  tool_run: "شغّلت أداة",
  chat_deep: "محادثة عميقة",
  daily_first: "أول نشاط اليوم",
};

/* ────────────────────────────── badges ────────────────────────────── */

export interface BadgeCtx {
  xp: number;
  level: number;
  gamesBuilt: number;
  gamesPlayed: number;
  runsSubmitted: number;
  mindReads: number;
  bestScore: number;
  streak: number;
  longestStreak: number;
  /** distinct SMITH blueprints the user has built */
  blueprints: number;
  /** distinct languages MIND has read for this user */
  langs: number;
  published: number;
  likes: number;
}

/** Extra facts the badges need that do not live in mastery_profiles. */
export interface BadgeExtras {
  tools: number;
  nightRuns: boolean;
}

export type BadgeState = BadgeCtx & BadgeExtras;

export interface BadgeDef {
  id: string;
  emoji: string;
  name: { ar: string; fr: string; en: string };
  desc: { ar: string; fr: string; en: string };
  /** what the user must reach, for the progress ring */
  goal: number;
  value: (c: BadgeState) => number;
  done: (c: BadgeState) => boolean;
}

export const BADGES: BadgeDef[] = [
  { id: "first_smith", emoji: "⚡", name: { ar: "أول لعبة", fr: "Premier jeu", en: "First game" }, desc: { ar: "اصنع أول لعبة في المصنع", fr: "Fabriquez votre premier jeu", en: "Build your first game" }, goal: 1, value: (c) => c.gamesBuilt, done: (c) => c.gamesBuilt >= 1 },
  { id: "builder_5", emoji: "🛠️", name: { ar: "صانع", fr: "Fabricant", en: "Builder" }, desc: { ar: "اصنع 5 ألعاب", fr: "Fabriquez 5 jeux", en: "Build 5 games" }, goal: 5, value: (c) => c.gamesBuilt, done: (c) => c.gamesBuilt >= 5 },
  { id: "builder_25", emoji: "🏭", name: { ar: "مصنع كامل", fr: "Usine", en: "Factory" }, desc: { ar: "اصنع 25 لعبة", fr: "Fabriquez 25 jeux", en: "Build 25 games" }, goal: 25, value: (c) => c.gamesBuilt, done: (c) => c.gamesBuilt >= 25 },
  { id: "all_blueprints", emoji: "🎛️", name: { ar: "كل القوالب", fr: "Tous les modules", en: "Every blueprint" }, desc: { ar: "اصنع لعبة من كل قالب (8)", fr: "Un jeu de chaque module (8)", en: "One game of each blueprint (8)" }, goal: 8, value: (c) => c.blueprints, done: (c) => c.blueprints >= 8 },
  { id: "publisher", emoji: "📣", name: { ar: "ناشر", fr: "Éditeur", en: "Publisher" }, desc: { ar: "انشر لعبة في الساحة", fr: "Publiez un jeu dans l'arène", en: "Publish a game to the arena" }, goal: 1, value: (c) => c.published, done: (c) => c.published >= 1 },
  { id: "popular", emoji: "❤️", name: { ar: "محبوب", fr: "Populaire", en: "Popular" }, desc: { ar: "اجمع 10 إعجابات", fr: "Obtenez 10 likes", en: "Collect 10 likes" }, goal: 10, value: (c) => c.likes, done: (c) => c.likes >= 10 },
  { id: "player", emoji: "🎮", name: { ar: "لاعب", fr: "Joueur", en: "Player" }, desc: { ar: "العب 20 مرة", fr: "Jouez 20 parties", en: "Play 20 runs" }, goal: 20, value: (c) => c.gamesPlayed, done: (c) => c.gamesPlayed >= 20 },
  { id: "scorer", emoji: "📈", name: { ar: "منافس", fr: "Compétiteur", en: "Competitor" }, desc: { ar: "سجّل 10 نتائج", fr: "Postez 10 scores", en: "Submit 10 scores" }, goal: 10, value: (c) => c.runsSubmitted, done: (c) => c.runsSubmitted >= 10 },
  { id: "score_1k", emoji: "🥉", name: { ar: "ألف نقطة", fr: "1000 points", en: "1k points" }, desc: { ar: "تجاوز 1000 نقطة في لعبة", fr: "Dépassez 1000 points", en: "Beat 1000 points" }, goal: 1000, value: (c) => c.bestScore, done: (c) => c.bestScore >= 1000 },
  { id: "score_5k", emoji: "🥈", name: { ar: "خمسة آلاف", fr: "5000 points", en: "5k points" }, desc: { ar: "تجاوز 5000 نقطة", fr: "Dépassez 5000 points", en: "Beat 5000 points" }, goal: 5000, value: (c) => c.bestScore, done: (c) => c.bestScore >= 5000 },
  { id: "score_20k", emoji: "🥇", name: { ar: "عشرون ألفًا", fr: "20 000 points", en: "20k points" }, desc: { ar: "تجاوز 20000 نقطة", fr: "Dépassez 20 000 points", en: "Beat 20 000 points" }, goal: 20000, value: (c) => c.bestScore, done: (c) => c.bestScore >= 20000 },
  { id: "level_5", emoji: "🚀", name: { ar: "المستوى 5", fr: "Niveau 5", en: "Level 5" }, desc: { ar: "ابلغ المستوى الخامس", fr: "Atteignez le niveau 5", en: "Reach level 5" }, goal: 5, value: (c) => c.level, done: (c) => c.level >= 5 },
  { id: "level_10", emoji: "💎", name: { ar: "المستوى 10", fr: "Niveau 10", en: "Level 10" }, desc: { ar: "ابلغ المستوى العاشر", fr: "Atteignez le niveau 10", en: "Reach level 10" }, goal: 10, value: (c) => c.level, done: (c) => c.level >= 10 },
  { id: "level_25", emoji: "👑", name: { ar: "المستوى 25", fr: "Niveau 25", en: "Level 25" }, desc: { ar: "ابلغ المستوى 25", fr: "Atteignez le niveau 25", en: "Reach level 25" }, goal: 25, value: (c) => c.level, done: (c) => c.level >= 25 },
  { id: "xp_5k", emoji: "✨", name: { ar: "5 آلاف XP", fr: "5 000 XP", en: "5k XP" }, desc: { ar: "اجمع 5000 نقطة خبرة", fr: "Cumulez 5 000 XP", en: "Collect 5 000 XP" }, goal: 5000, value: (c) => c.xp, done: (c) => c.xp >= 5000 },
  { id: "xp_50k", emoji: "🌌", name: { ar: "50 ألف XP", fr: "50 000 XP", en: "50k XP" }, desc: { ar: "اجمع 50000 نقطة خبرة", fr: "Cumulez 50 000 XP", en: "Collect 50 000 XP" }, goal: 50000, value: (c) => c.xp, done: (c) => c.xp >= 50000 },
  { id: "streak_3", emoji: "🔥", name: { ar: "3 أيام", fr: "3 jours", en: "3-day streak" }, desc: { ar: "ادخل 3 أيام متتالية", fr: "3 jours d'affilée", en: "Play 3 days in a row" }, goal: 3, value: (c) => c.longestStreak, done: (c) => c.longestStreak >= 3 },
  { id: "streak_7", emoji: "🗓️", name: { ar: "أسبوع كامل", fr: "Une semaine", en: "Full week" }, desc: { ar: "7 أيام متتالية", fr: "7 jours d'affilée", en: "7 days in a row" }, goal: 7, value: (c) => c.longestStreak, done: (c) => c.longestStreak >= 7 },
  { id: "streak_30", emoji: "🏆", name: { ar: "شهر من الحديد", fr: "Un mois de fer", en: "Iron month" }, desc: { ar: "30 يومًا متتاليًا", fr: "30 jours d'affilée", en: "30 days in a row" }, goal: 30, value: (c) => c.longestStreak, done: (c) => c.longestStreak >= 30 },
  { id: "mind_10", emoji: "🧠", name: { ar: "قارئ الأفكار", fr: "Lecteur d'esprit", en: "Mind reader" }, desc: { ar: "استعمل قوة الفهم 10 مرات", fr: "Utilisez MIND 10 fois", en: "Use MIND 10 times" }, goal: 10, value: (c) => c.mindReads, done: (c) => c.mindReads >= 10 },
  { id: "polyglot", emoji: "🌍", name: { ar: "مترجم", fr: "Polyglotte", en: "Polyglot" }, desc: { ar: "اكتب بـ3 لغات مختلفة", fr: "Écrivez dans 3 langues", en: "Write in 3 languages" }, goal: 3, value: (c) => c.langs, done: (c) => c.langs >= 3 },
  { id: "toolsmith", emoji: "🧰", name: { ar: "صانع الأدوات", fr: "Outilleur", en: "Toolsmith" }, desc: { ar: "شغّل 30 أداة", fr: "Lancez 30 outils", en: "Run 30 tools" }, goal: 30, value: (c) => c.tools, done: (c) => c.tools >= 30 },
  { id: "night_owl", emoji: "🌙", name: { ar: "بومة الليل", fr: "Noctambule", en: "Night owl" }, desc: { ar: "العب بعد منتصف الليل", fr: "Jouez après minuit", en: "Play after midnight" }, goal: 1, value: (c) => (c.nightRuns ? 1 : 0), done: (c) => !!c.nightRuns },
  { id: "marathon", emoji: "🏅", name: { ar: "ماراثون", fr: "Marathon", en: "Marathon" }, desc: { ar: "100 لعبة ملعوبة", fr: "100 parties jouées", en: "100 runs played" }, goal: 100, value: (c) => c.gamesPlayed, done: (c) => c.gamesPlayed >= 100 },
];

export const BADGE_MAP: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

