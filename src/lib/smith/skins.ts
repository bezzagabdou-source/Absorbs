/**
 * NEXUS SMITH — skins: 8 palettes + 3 UI languages.
 *
 * Everything in this file is JSON-serialisable on purpose: the factory injects it
 * into the generated HTML as data (`window.__SMITH_THEMES__` / `__SMITH_STR__`),
 * so the runtime stays one generic engine and a game can be re-skinned or
 * re-translated without touching a single line of game code.
 */

export interface SmithTheme {
  id: string;
  name: { ar: string; fr: string; en: string };
  /** CSS background of the page behind the canvas */
  page: string;
  sky0: string; sky1: string; sky2: string;
  glow: string; star: string; starAlpha: number;
  hill0: string; hill1: string; hill2: string; mote: string;
  accent: string; aqua: string; gold: string; rose: string;
  hero0: string; hero1: string; brick0: string; brick1: string;
  btn0: string; btn1: string; btnText: string;
  text: string; dim: string; edge: string;
}

export const SMITH_THEMES: SmithTheme[] = [
  {
    id: "neon",
    name: { ar: "نيون", fr: "Néon", en: "Neon" },
    page: "linear-gradient(160deg,#070b1c,#131a3d 55%,#1d1247)",
    sky0: "#0b1030", sky1: "#182055", sky2: "#241a5e",
    glow: "rgba(124,92,255,0.45)", star: "#dfe6ff", starAlpha: 0.8,
    hill0: "#1b2352", hill1: "#161d43", hill2: "#111634", mote: "#8ab4ff",
    accent: "#7c5cff", aqua: "#37e0d0", gold: "#ffc857", rose: "#ff5f7a",
    hero0: "#a78bfa", hero1: "#4f6bff", brick0: "#3a2f6b", brick1: "#5b3f8f",
    btn0: "#8b5cf6", btn1: "#3f7bff", btnText: "#ffffff",
    text: "#f4f6ff", dim: "#9aa3c7", edge: "rgba(255,255,255,0.18)",
  },
  {
    id: "desert",
    name: { ar: "صحراء", fr: "Désert", en: "Desert" },
    page: "linear-gradient(160deg,#2b1608,#7a3f14 55%,#d98b3a)",
    sky0: "#3a1d0b", sky1: "#a45a22", sky2: "#e0a25c",
    glow: "rgba(255,196,92,0.5)", star: "#ffe9c2", starAlpha: 0.35,
    hill0: "#8c4d1d", hill1: "#6d3a15", hill2: "#4a270e", mote: "#ffd79a",
    accent: "#f59e0b", aqua: "#2dd4bf", gold: "#ffe08a", rose: "#ef4444",
    hero0: "#ffe6b0", hero1: "#e08a2c", brick0: "#8a5a2b", brick1: "#b5793a",
    btn0: "#f59e0b", btn1: "#d97706", btnText: "#2b1608",
    text: "#fff6e6", dim: "#e2c39a", edge: "rgba(255,240,214,0.22)",
  },
  {
    id: "ocean",
    name: { ar: "محيط", fr: "Océan", en: "Ocean" },
    page: "linear-gradient(160deg,#02121f,#06364f 55%,#0b6b7d)",
    sky0: "#031526", sky1: "#07465f", sky2: "#0a7b8c",
    glow: "rgba(56,232,255,0.4)", star: "#cdf6ff", starAlpha: 0.55,
    hill0: "#0a4f66", hill1: "#083d50", hill2: "#052c3b", mote: "#8ef0ff",
    accent: "#22d3ee", aqua: "#5eead4", gold: "#fcd34d", rose: "#fb7185",
    hero0: "#a5f3fc", hero1: "#0891b2", brick0: "#0e5f74", brick1: "#1587a1",
    btn0: "#22d3ee", btn1: "#0e7490", btnText: "#03222c",
    text: "#ecfeff", dim: "#93c9d6", edge: "rgba(207,250,254,0.2)",
  },
  {
    id: "cyber",
    name: { ar: "سايبر", fr: "Cyber", en: "Cyber" },
    page: "linear-gradient(160deg,#05030f,#1b0736 55%,#3b0a5c)",
    sky0: "#0a0418", sky1: "#26094a", sky2: "#4a0f70",
    glow: "rgba(255,0,153,0.4)", star: "#ffd9f2", starAlpha: 0.7,
    hill0: "#2b0b4d", hill1: "#210839", hill2: "#160527", mote: "#ff7ae0",
    accent: "#ff2fb3", aqua: "#00f0ff", gold: "#ffe600", rose: "#ff3b3b",
    hero0: "#00f0ff", hero1: "#ff2fb3", brick0: "#3d0f66", brick1: "#6d12a8",
    btn0: "#ff2fb3", btn1: "#7a00ff", btnText: "#ffffff",
    text: "#f8ecff", dim: "#b39ad1", edge: "rgba(255,120,230,0.25)",
  },
  {
    id: "gold",
    name: { ar: "ذهبي فاخر", fr: "Or", en: "Gold" },
    page: "linear-gradient(160deg,#14100a,#3a2c12 55%,#6b4f18)",
    sky0: "#1a1409", sky1: "#3d2f13", sky2: "#6a5220",
    glow: "rgba(255,205,92,0.45)", star: "#fff2cf", starAlpha: 0.6,
    hill0: "#5b451c", hill1: "#453415", hill2: "#2e230e", mote: "#ffd98a",
    accent: "#f0b429", aqua: "#7dd3fc", gold: "#ffe9a8", rose: "#f87171",
    hero0: "#fff0c2", hero1: "#d99b1c", brick0: "#7a5f22", brick1: "#a98534",
    btn0: "#f7c948", btn1: "#c98a10", btnText: "#2b1e05",
    text: "#fff9ea", dim: "#cbb389", edge: "rgba(255,232,170,0.24)",
  },
  {
    id: "candy",
    name: { ar: "حلوى", fr: "Bonbon", en: "Candy" },
    page: "linear-gradient(160deg,#ffd7e8,#ffe9d6 50%,#d6f5ff)",
    sky0: "#ffe3f1", sky1: "#ffd0e6", sky2: "#c9eaff",
    glow: "rgba(255,140,200,0.35)", star: "#ffffff", starAlpha: 0.5,
    hill0: "#ffc2dd", hill1: "#ffb3d1", hill2: "#f6a8c8", mote: "#ff8fc7",
    accent: "#ff5fa2", aqua: "#38bdf8", gold: "#fbbf24", rose: "#f43f5e",
    hero0: "#ffffff", hero1: "#ff7ab8", brick0: "#a78bfa", brick1: "#f472b6",
    btn0: "#ff5fa2", btn1: "#a855f7", btnText: "#ffffff",
    text: "#3b1030", dim: "#8a5c7a", edge: "rgba(59,16,48,0.16)",
  },
  {
    id: "night",
    name: { ar: "ليل", fr: "Nuit", en: "Night" },
    page: "linear-gradient(160deg,#04070f,#0a1224 55%,#121c33)",
    sky0: "#050a16", sky1: "#0b1428", sky2: "#131f3a",
    glow: "rgba(148,197,255,0.28)", star: "#ffffff", starAlpha: 0.95,
    hill0: "#101a30", hill1: "#0c1425", hill2: "#080e1b", mote: "#9cc6ff",
    accent: "#60a5fa", aqua: "#67e8f9", gold: "#fcd34d", rose: "#fb7185",
    hero0: "#cbd5ff", hero1: "#3b5bdb", brick0: "#253354", brick1: "#3a4d7a",
    btn0: "#3b82f6", btn1: "#1d4ed8", btnText: "#ffffff",
    text: "#eef2ff", dim: "#8fa0c4", edge: "rgba(255,255,255,0.14)",
  },
  {
    id: "retro",
    name: { ar: "ريترو", fr: "Rétro", en: "Retro" },
    page: "linear-gradient(160deg,#12060a,#3d0f1c 55%,#7a2130)",
    sky0: "#170a10", sky1: "#3d1220", sky2: "#7a2a30",
    glow: "rgba(255,120,60,0.35)", star: "#ffe3c2", starAlpha: 0.5,
    hill0: "#5e2028", hill1: "#471820", hill2: "#2f1015", mote: "#ffb27a",
    accent: "#ff7a45", aqua: "#8ce99a", gold: "#ffd43b", rose: "#ff6b6b",
    hero0: "#ffd8a8", hero1: "#e8590c", brick0: "#8c3a2a", brick1: "#b8543a",
    btn0: "#ff7a45", btn1: "#c2410c", btnText: "#2b0d05",
    text: "#fff4e6", dim: "#d3a58a", edge: "rgba(255,214,180,0.2)",
  },
];

export const THEME_MAP: Record<string, SmithTheme> = Object.fromEntries(
  SMITH_THEMES.map((t) => [t.id, t])
);

/* ── UI strings (ar / fr / en) ───────────────────────────────────────── */

export interface SmithStrings {
  game: string; play: string; pause: string; resume: string; menu: string;
  how: string; sound: string; muted: string; best: string; score: string;
  level: string; coins: string; lives: string; time: string; gameover: string;
  retry: string; newBest: string; loading: string; hint: string; howTitle: string;
  tapToClose: string; shareHint: string; paused: string; boss: string;
  phase2: string; wave: string; key: string; keys: string; steps: string;
  needKeys: string; height: string; bestTile: string; target: string;
  pairs: string; tapLaunch: string; by: string; subtitle: string;
  states: Record<string, string>;
  powers: Record<string, string>;
  help: Record<string, string[]>;
  helpDefault: string[];
}

const HELP_AR = {
  runner: [
    "اضغط مسافة / ↑ أو الشاشة للقفز — قفزة مزدوجة متاحة",
    "↓ للانحناء تحت الطيور",
    "اجمع العملات والقوى: درع ◈ · مغناطيس U · إبطاء ◷ · تسريع »",
    "كل 900 متر = مرحلة جديدة وسرعة أعلى",
  ],
  breaker: [
    "حرّك المضرب بالأسهم أو بإصبعك",
    "مسافة / ↑ لإطلاق الكرة",
    "القوى: عريض W · ثلاث كرات 3 · ليزر L · بطيء T · درع S",
    "اكسر كل الطوب للانتقال إلى المرحلة التالية",
  ],
  snake: [
    "الأسهم أو السحب لتغيير الاتجاه",
    "الذهب يعطي 60 نقطة و3 عملات",
    "البوابات الزرقاء تنقلك إلى الجهة الأخرى",
    "الجدران والطوب الأحمر يقتل — احترس منها من المرحلة 2",
  ],
  shooter: [
    "الأسهم / السحب للحركة — الإطلاق تلقائي",
    "التقط W لترقية السلاح حتى 3 فوهات",
    "+ يعيد الصحة · S يعطي درعًا · $ عملات",
    "زعيم كل 5 موجات: مرحلتان ورصاص مروحي",
  ],
  climber: [
    "يسار / يمين للحركة — القفز تلقائي على المنصات",
    "الأزرق = نابض يقذفك أعلى · الذهبي = نفّاث",
    "الأحمر وحش: يضررك ويقذفك في نفس الوقت",
    "المنصات البنية تنكسر بعد القفز عليها",
  ],
  maze: [
    "الأسهم أو النقر على المربع المجاور للتحرك",
    "اجمع كل المفاتيح الزرقاء ثم ادخل الباب الذهبي",
    "الرؤية محدودة حولك — استعمل ذاكرتك",
    "كل مرحلة متاهة جديدة أكبر وأصعب",
  ],
  merge: [
    "اسحب أو استعمل الأسهم لتحريك كل البلاطات",
    "بلاطتان متساويتان تندمجان وتتضاعف النقاط",
    "الهدف: الوصول إلى 2048 (أو الهدف المحدد)",
    "لا مكان ولا أرقام متجاورة = نهاية اللعبة",
  ],
  memory: [
    "اضغط بطاقتين: إن تطابقتا تبقيان مكشوفتين",
    "التطابق المتتالي يبني كومبو ويرفع النقاط",
    "في البداية تُكشف البطاقات لثوانٍ — احفظها",
    "الوقت محسوب: السرعة تعني نقاطًا أكثر",
  ],
};

const HELP_FR = {
  runner: [
    "Espace / ↑ ou toucher l'écran pour sauter — double saut possible",
    "↓ pour glisser sous les oiseaux",
    "Ramassez les pièces et bonus : bouclier ◈ · aimant U · ralenti ◷ · turbo »",
    "Chaque 900 m = nouveau niveau et vitesse accrue",
  ],
  breaker: [
    "Déplacez la raquette avec les flèches ou le doigt",
    "Espace / ↑ pour lancer la balle",
    "Bonus : large W · 3 balles · laser L · ralenti T · bouclier S",
    "Cassez toutes les briques pour passer au niveau suivant",
  ],
  snake: [
    "Flèches ou glissement pour tourner",
    "L'or vaut 60 points et 3 pièces",
    "Les portails bleus vous téléportent",
    "Murs et briques rouges = mort, dès le niveau 2",
  ],
  shooter: [
    "Flèches / glissement pour bouger — tir automatique",
    "Prenez W pour améliorer l'arme jusqu'à 3 canons",
    "+ soins · S bouclier · $ pièces",
    "Un boss toutes les 5 vagues, avec deux phases",
  ],
  climber: [
    "Gauche / droite pour bouger — le saut est automatique",
    "Bleu = ressort · doré = jetpack",
    "Rouge = monstre : il blesse mais propulse",
    "Les plateformes marron se cassent après un saut",
  ],
  maze: [
    "Flèches ou toucher une case voisine pour avancer",
    "Prenez toutes les clés bleues puis la porte dorée",
    "La visibilité est limitée — fiez-vous à votre mémoire",
    "Chaque niveau : un labyrinthe plus grand",
  ],
  merge: [
    "Glissez ou utilisez les flèches pour déplacer les tuiles",
    "Deux tuiles identiques fusionnent et doublent",
    "Objectif : atteindre 2048 (ou la cible choisie)",
    "Plus de place ni de fusion = partie terminée",
  ],
  memory: [
    "Retournez deux cartes : si elles sont identiques elles restent",
    "Les paires successives construisent un combo",
    "Les cartes sont montrées quelques secondes au départ",
    "Le temps compte : la vitesse rapporte des points",
  ],
};

const HELP_EN = {
  runner: [
    "Space / ↑ or tap the screen to jump — double jump available",
    "↓ to slide under birds",
    "Grab coins and powers: shield ◈ · magnet U · slow-mo ◷ · boost »",
    "Every 900 m is a new level and more speed",
  ],
  breaker: [
    "Move the paddle with the arrows or your finger",
    "Space / ↑ to launch the ball",
    "Power-ups: wide W · multiball 3 · laser L · slow T · shield S",
    "Clear every brick to reach the next level",
  ],
  snake: [
    "Arrows or swipe to turn",
    "Gold food is worth 60 points and 3 coins",
    "Blue portals teleport you across the board",
    "Walls and red bricks kill — from level 2",
  ],
  shooter: [
    "Arrows / drag to move — firing is automatic",
    "Pick up W to upgrade the weapon to 3 barrels",
    "+ heals · S shields · $ coins",
    "A boss every 5 waves, with two phases",
  ],
  climber: [
    "Left / right to move — bouncing is automatic",
    "Blue = spring · gold = jetpack",
    "Red = monster: it hurts but launches you",
    "Brown platforms break after one bounce",
  ],
  maze: [
    "Arrows or tap a neighbouring tile to move",
    "Collect every blue key then reach the gold door",
    "Visibility is limited — trust your memory",
    "Every level is a bigger, harder maze",
  ],
  merge: [
    "Swipe or use the arrows to slide every tile",
    "Two equal tiles merge and double your score",
    "Goal: reach 2048 (or the chosen target)",
    "No space and no merges left = game over",
  ],
  memory: [
    "Flip two cards: matching pairs stay revealed",
    "Consecutive matches build a combo",
    "All cards are shown for a few seconds at the start",
    "Time is counted: speed earns more points",
  ],
};

const POWERS = {
  ar: {
    shield: "درع", magnet: "مغناطيس", slow: "إبطاء", boost: "تسريع", wide: "مضرب عريض",
    multi: "ثلاث كرات", laser: "ليزر", heal: "صحة", weapon: "سلاح", jet: "نفّاث", coin: "عملات",
  },
  fr: {
    shield: "Bouclier", magnet: "Aimant", slow: "Ralenti", boost: "Turbo", wide: "Raquette large",
    multi: "Multiballe", laser: "Laser", heal: "Soin", weapon: "Arme", jet: "Jetpack", coin: "Pièces",
  },
  en: {
    shield: "Shield", magnet: "Magnet", slow: "Slow-mo", boost: "Boost", wide: "Wide paddle",
    multi: "Multiball", laser: "Laser", heal: "Heal", weapon: "Weapon", jet: "Jetpack", coin: "Coins",
  },
};

const STATES = {
  ar: { LOADING: "تحميل", MENU: "القائمة", PLAYING: "اللعب", PAUSED: "إيقاف مؤقت", GAMEOVER: "انتهت" },
  fr: { LOADING: "Chargement", MENU: "Menu", PLAYING: "En jeu", PAUSED: "Pause", GAMEOVER: "Terminé" },
  en: { LOADING: "Loading", MENU: "Menu", PLAYING: "Playing", PAUSED: "Paused", GAMEOVER: "Game over" },
};

export const SMITH_STRINGS: Record<"ar" | "fr" | "en", SmithStrings> = {
  ar: {
    game: "لعبة Nexus", play: "العب الآن", pause: "إيقاف", resume: "متابعة", menu: "القائمة",
    how: "كيف ألعب؟", sound: "الصوت", muted: "صامت", best: "أفضل نتيجة", score: "النقاط",
    level: "المرحلة", coins: "العملات", lives: "الأرواح", time: "الوقت", gameover: "انتهت اللعبة",
    retry: "إعادة اللعب", newBest: "رقم قياسي جديد!", loading: "جارٍ التحميل…",
    hint: "مسافة / ↑ قفز · ↓ انحناء · P إيقاف · M صوت", howTitle: "كيف تلعب",
    tapToClose: "اضغط في أي مكان للإغلاق",
    shareHint: "نتيجتك تُحفظ تلقائيًا في لوحة الصدارة",
    paused: "إيقاف مؤقت", boss: "زعيم", phase2: "المرحلة الثانية!", wave: "موجة",
    key: "مفتاح", keys: "المفاتيح", steps: "الخطوات", needKeys: "باقي مفاتيح:",
    height: "الارتفاع", bestTile: "أعلى بلاطة", target: "الهدف", pairs: "الأزواج",
    tapLaunch: "اضغط للإطلاق", by: "من صنع", subtitle: "%1 · صعوبة %2",
    states: STATES.ar, powers: POWERS.ar, help: HELP_AR,
    helpDefault: ["استعمل الأسهم أو اللمس", "اجمع النقاط ولا تصطدم"],
  },
  fr: {
    game: "Jeu Nexus", play: "Jouer", pause: "Pause", resume: "Reprendre", menu: "Menu",
    how: "Comment jouer ?", sound: "Son", muted: "Muet", best: "Record", score: "Score",
    level: "Niveau", coins: "Pièces", lives: "Vies", time: "Temps", gameover: "Partie terminée",
    retry: "Rejouer", newBest: "Nouveau record !", loading: "Chargement…",
    hint: "Espace / ↑ sauter · ↓ glisser · P pause · M son", howTitle: "Comment jouer",
    tapToClose: "Touchez pour fermer",
    shareHint: "Votre score est enregistré dans le classement",
    paused: "Pause", boss: "Boss", phase2: "Phase 2 !", wave: "Vague",
    key: "Clé", keys: "Clés", steps: "Pas", needKeys: "clés restantes :",
    height: "Hauteur", bestTile: "Meilleure tuile", target: "Objectif", pairs: "Paires",
    tapLaunch: "Touchez pour lancer", by: "par", subtitle: "%1 · difficulté %2",
    states: STATES.fr, powers: POWERS.fr, help: HELP_FR,
    helpDefault: ["Utilisez les flèches ou le tactile", "Marquez des points sans collision"],
  },
  en: {
    game: "Nexus Game", play: "Play", pause: "Pause", resume: "Resume", menu: "Menu",
    how: "How to play", sound: "Sound", muted: "Muted", best: "Best", score: "Score",
    level: "Level", coins: "Coins", lives: "Lives", time: "Time", gameover: "Game over",
    retry: "Play again", newBest: "New record!", loading: "Loading…",
    hint: "Space / ↑ jump · ↓ slide · P pause · M mute", howTitle: "How to play",
    tapToClose: "Tap anywhere to close",
    shareHint: "Your score is saved to the leaderboard",
    paused: "Paused", boss: "Boss", phase2: "Phase 2!", wave: "Wave",
    key: "Key", keys: "Keys", steps: "Steps", needKeys: "keys left:",
    height: "Height", bestTile: "Best tile", target: "Target", pairs: "Pairs",
    tapLaunch: "Tap to launch", by: "by", subtitle: "%1 · %2 difficulty",
    states: STATES.en, powers: POWERS.en, help: HELP_EN,
    helpDefault: ["Use the arrows or touch controls", "Score points without crashing"],
  },
};
