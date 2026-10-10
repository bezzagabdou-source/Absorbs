/**
 * Nexus AI v14 — OFFLINE DARIJA/ARABIC → ENGLISH for image prompts.
 *
 * Why this exists: generateImage() translated the prompt with `toEnglishIdea()`,
 * which needs a Gemini key. Without one, the raw Arabic string was handed to
 * Flux/Pollinations, which cannot read Arabic — so the user got a random picture.
 *
 * This module is a deterministic translator: no key, no network, no latency.
 * It is used as a guaranteed fallback and as a repair pass when the LLM output
 * still contains Arabic.
 */

/* ------------------------------------------------------------------ *
 * normalisation
 * ------------------------------------------------------------------ */
const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeAr(s: string): string {
  return s
    .replace(DIACRITICS, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627") // آأإٱ -> ا
    .replace(/\u0649/g, "\u064A") // ى -> ي
    .replace(/\u0629/g, "\u0647") // ة -> ه
    .replace(/\u0624/g, "\u0648") // ؤ -> و
    .replace(/\u0626/g, "\u064A") // ئ -> ي
    .replace(/[\u060C\u061B\u061F]/g, " ") // ، ؛ ؟
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Arabic letter class that deliberately EXCLUDES Arabic punctuation. */
const AL = "\\u0621-\\u063A\\u0641-\\u064A\\u0660-\\u0669";
const WORD = `[^${AL}A-Za-z0-9]`;

/* ------------------------------------------------------------------ *
 * dictionary — longest phrases first, matched greedily
 * ------------------------------------------------------------------ */
type Entry = [ar: string, en: string];

const PHRASES: Entry[] = [
  // ---------- Algeria / places ----------
  ["مدينه الجزائر", "the city of Algiers, Algeria"],
  ["الجزائر العاصمه", "Algiers, the capital of Algeria"],
  ["جامع الجزائر", "the Great Mosque of Algiers (Djamaa el Djazair)"],
  ["مقام الشهيد", "the Maqam Echahid martyrs memorial in Algiers"],
  ["البريد المركزي", "the Grande Poste building in Algiers"],
  ["حي القصبه", "the Casbah of Algiers, old white terraced houses"],
  ["القصبه", "the Casbah of Algiers"],
  ["الصحراء الكبرى", "the Sahara desert"],
  ["الصحراء الجزائريه", "the Algerian Sahara, orange dunes"],
  ["جبال جرجره", "the Djurdjura mountains of Kabylia"],
  ["البحر الابيض المتوسط", "the Mediterranean Sea"],
  ["ساحل البحر", "the sea coast"],
  ["وهران", "Oran, Algeria"],
  ["قسنطينه", "Constantine, Algeria, city of suspended bridges"],
  ["تمنراست", "Tamanrasset, Algerian desert"],
  ["غرداي", "Ghardaia, M'zab valley"],
  ["تيمقاد", "Timgad Roman ruins, Algeria"],
  ["جميله", "Djemila Roman ruins"],
  ["الجزائر", "Algeria"],
  ["المغرب", "Morocco"],
  ["تونس", "Tunisia"],
  ["مكه", "Mecca, the Kaaba"],
  ["المدينه المنوره", "Medina, the Prophet's Mosque"],
  ["القدس", "Jerusalem, the Dome of the Rock"],
  ["دبي", "Dubai skyline"],
  ["باريس", "Paris"],
  ["طوكيو", "Tokyo"],
  ["نيويورك", "New York City"],
  ["اسطنبول", "Istanbul"],

  // ---------- people ----------
  ["رجل عجوز", "an old man"],
  ["امراه عجوز", "an old woman"],
  ["شيخ كبير", "an elderly bearded man"],
  ["رجل جزائري", "an Algerian man"],
  ["امراه جزائريه", "an Algerian woman"],
  ["بنت صغيره", "a little girl"],
  ["ولد صغير", "a little boy"],
  ["طفل صغير", "a small child"],
  ["شاب جزائري", "a young Algerian man"],
  ["لاعب كره", "a football player"],
  ["لاعب كره القدم", "a football player"],
  ["حارس مرمى", "a goalkeeper"],
  ["رائد فضاء", "an astronaut"],
  ["رجل اعمال", "a businessman"],
  ["محارب", "a warrior"],
  ["فارس", "a knight on horseback"],
  ["ملك", "a king"],
  ["ملكه", "a queen"],
  ["طبيب", "a doctor"],
  ["معلم", "a teacher"],
  ["طالب", "a student"],
  ["جندي", "a soldier"],
  ["صياد", "a fisherman"],
  ["فلاح", "a farmer"],
  ["راعي", "a shepherd"],
  ["عائله", "a family"],
  ["مجموعه ناس", "a group of people"],
  ["رجل", "a man"],
  ["امراه", "a woman"],
  ["مرا", "a woman"],
  ["طفل", "a child"],
  ["اطفال", "children"],
  ["بنت", "a girl"],
  ["ولد", "a boy"],
  ["شاب", "a young man"],
  ["انسان", "a person"],
  ["وجه", "a face"],
  ["بورتريه", "a portrait"],
  ["صوره شخصيه", "a portrait photograph"],

  // ---------- clothing ----------
  ["لباس تقليدي", "traditional Algerian clothing"],
  ["قشابيه", "a traditional Algerian wool kachabia cloak"],
  ["برنوس", "a traditional North African burnous cloak"],
  ["كاراكو", "a Karakou, embroidered Algerian velvet jacket"],
  ["حايك", "a haik, white traditional Algerian veil"],
  ["جلابه", "a djellaba"],
  ["عمامه", "a turban"],
  ["حجاب", "a hijab"],
  ["بدله", "a suit"],
  ["فستان", "a dress"],
  ["قميص", "a shirt"],

  // ---------- animals ----------
  ["حصان عربي", "an Arabian horse"],
  ["فنك الصحراء", "a fennec fox"],
  ["قط صغير", "a kitten"],
  ["كلب صغير", "a puppy"],
  ["طائر", "a bird"],
  ["نسر", "an eagle"],
  ["صقر", "a falcon"],
  ["اسد", "a lion"],
  ["نمر", "a tiger"],
  ["ذئب", "a wolf"],
  ["جمل", "a camel"],
  ["ناقه", "a camel"],
  ["حصان", "a horse"],
  ["قط", "a cat"],
  ["مشه", "a cat"],
  ["كلب", "a dog"],
  ["سمكه", "a fish"],
  ["فراشه", "a butterfly"],
  ["تنين", "a dragon"],
  ["غزال", "a gazelle"],
  ["خروف", "a sheep"],
  ["بقره", "a cow"],
  ["دجاجه", "a chicken"],

  // ---------- nature ----------
  ["غروب الشمس", "a sunset"],
  ["شروق الشمس", "a sunrise"],
  ["السماء الزرقاء", "a blue sky"],
  ["سماء ليليه", "a night sky"],
  ["النجوم", "stars"],
  ["درب التبانه", "the Milky Way"],
  ["القمر", "the moon"],
  ["الشمس", "the sun"],
  ["البحر", "the sea"],
  ["المحيط", "the ocean"],
  ["الشاطئ", "the beach"],
  ["الجبل", "a mountain"],
  ["جبال", "mountains"],
  ["الغابه", "a forest"],
  ["شجره", "a tree"],
  ["اشجار", "trees"],
  ["نخله", "a palm tree"],
  ["نخيل", "palm trees"],
  ["ورده", "a rose"],
  ["ورد", "flowers"],
  ["زهور", "flowers"],
  ["صحراء", "a desert"],
  ["كثبان رمليه", "sand dunes"],
  ["رمل", "sand"],
  ["ثلج", "snow"],
  ["مطر", "rain"],
  ["ضباب", "fog"],
  ["سحاب", "clouds"],
  ["غيوم", "clouds"],
  ["نهر", "a river"],
  ["شلال", "a waterfall"],
  ["بحيره", "a lake"],
  ["واحه", "an oasis"],
  ["حديقه", "a garden"],
  ["سماء", "the sky"],
  ["برق", "lightning"],
  ["نار", "fire"],
  ["دخان", "smoke"],

  // ---------- objects / places ----------
  ["سياره رياضيه", "a sports car"],
  ["سياره قديمه", "a classic vintage car"],
  ["مدينه مستقبليه", "a futuristic city"],
  ["ناطحات سحاب", "skyscrapers"],
  ["مدينه قديمه", "an old town"],
  ["بيت قديم", "an old house"],
  ["مسجد", "a mosque"],
  ["مئذنه", "a minaret"],
  ["قصر", "a palace"],
  ["قلعه", "a castle"],
  ["جسر", "a bridge"],
  ["طريق", "a road"],
  ["شارع", "a street"],
  ["سوق", "a market"],
  ["مقهى", "a cafe"],
  ["مطعم", "a restaurant"],
  ["مكتب", "an office"],
  ["غرفه", "a room"],
  ["مطبخ", "a kitchen"],
  ["مدرسه", "a school"],
  ["مستشفى", "a hospital"],
  ["ملعب", "a stadium"],
  ["سياره", "a car"],
  ["طياره", "an airplane"],
  ["سفينه", "a ship"],
  ["قارب", "a boat"],
  ["دراجه", "a bicycle"],
  ["قطار", "a train"],
  ["صاروخ", "a rocket"],
  ["روبوت", "a robot"],
  ["حاسوب", "a computer"],
  ["هاتف", "a smartphone"],
  ["كتاب", "a book"],
  ["ساعه", "a watch"],
  ["باب", "a door"],
  ["نافذه", "a window"],
  ["كرسي", "a chair"],
  ["طاوله", "a table"],
  ["شموع", "candles"],
  ["فانوس", "a lantern"],

  // ---------- food ----------
  ["كسكس", "couscous, Algerian dish"],
  ["كسكسي", "couscous, Algerian dish"],
  ["شوربه", "a bowl of soup"],
  ["حريره", "harira soup"],
  ["قهوه", "a cup of coffee"],
  ["اتاي", "mint tea in a glass"],
  ["شاي", "tea"],
  ["خبز", "bread"],
  ["حلويات", "pastries"],
  ["كعك", "cake"],
  ["بيتزا", "a pizza"],
  ["فواكه", "fruit"],
  ["تمر", "dates"],
  ["عسل", "honey"],
  ["طعام", "food"],

  // ---------- design / business ----------
  ["شعار شركه", "a company logo"],
  ["بطاقه عمل", "a business card"],
  ["ملصق اعلاني", "an advertising poster"],
  ["غلاف كتاب", "a book cover"],
  ["واجهه تطبيق", "a mobile app UI screen"],
  ["واجهه موقع", "a website landing page design"],
  ["شعار", "a logo"],
  ["ملصق", "a poster"],
  ["لافته", "a banner"],
  ["ايقونه", "an icon"],
  ["رسم بياني", "an infographic chart"],
  ["خريطه", "a map"],

  // ---------- styles ----------
  ["رسم كرتوني", "cartoon illustration style"],
  ["رسم بالقلم الرصاص", "pencil sketch"],
  ["رسم زيتي", "oil painting"],
  ["رسم مائي", "watercolour painting"],
  ["فن رقمي", "digital art"],
  ["خط عربي", "Arabic calligraphy"],
  ["زخرفه اسلاميه", "Islamic geometric ornament"],
  ["فن اسلامي", "Islamic art"],
  ["طراز اندلسي", "Andalusian Moorish style"],
  ["واقعي جدا", "hyper realistic"],
  ["واقعي", "photorealistic"],
  ["صوره حقيقيه", "a realistic photograph"],
  ["ثلاثي الابعاد", "3D render"],
  ["انمي", "anime style"],
  ["مانغا", "manga style"],
  ["بكسل", "pixel art"],
  ["مينيمال", "minimalist"],
  ["بسيط", "minimalist, simple"],
  ["كلاسيكي", "classical"],
  ["عصري", "modern"],
  ["حديث", "modern"],
  ["قديم", "old, vintage"],
  ["فخم", "luxurious"],
  ["فاخر", "luxurious, premium"],
  ["اسطوري", "epic, legendary"],
  ["خيالي", "fantasy"],
  ["سريالي", "surreal"],
  ["مرعب", "scary, horror"],
  ["مضحك", "funny"],
  ["لطيف", "cute"],
  ["جميل جدا", "very beautiful"],
  ["جميل", "beautiful"],
  ["رائع", "stunning"],
  ["قوي", "powerful"],
  ["هادئ", "calm, peaceful"],
  ["حزين", "sad, melancholic"],
  ["سعيد", "happy, joyful"],
  ["غامق", "dark"],
  ["مظلم", "dark, moody"],
  ["مضيء", "bright"],
  ["ملون", "colourful"],
  ["نيون", "neon"],
  ["سايبربانك", "cyberpunk"],
  ["مستقبلي", "futuristic"],

  // ---------- camera ----------
  ["لقطه قريبه", "close-up shot"],
  ["لقطه واسعه", "wide shot"],
  ["من الاعلى", "top-down view"],
  ["من بعيد", "distant view"],
  ["عين الطائر", "bird's eye view"],
  ["دقه عاليه", "high resolution, 4k"],
  ["خلفيه", "background"],
  ["اضاءه", "lighting"],
  ["ظل", "shadow"],
  ["انعكاس", "reflection"],

  // ---------- colours ----------
  ["احمر", "red"],
  ["ازرق", "blue"],
  ["اخضر", "green"],
  ["اصفر", "yellow"],
  ["ابيض", "white"],
  ["اسود", "black"],
  ["برتقالي", "orange"],
  ["بنفسجي", "purple"],
  ["وردي", "pink"],
  ["ذهبي", "golden"],
  ["فضي", "silver"],
  ["بني", "brown"],
  ["رمادي", "grey"],
  ["تركوازي", "turquoise"],

  // ---------- time / weather ----------
  ["في الليل", "at night"],
  ["في النهار", "during the day"],
  ["الصباح", "in the morning"],
  ["المساء", "in the evening"],
  ["الشتاء", "winter"],
  ["الصيف", "summer"],
  ["الربيع", "spring"],
  ["الخريف", "autumn"],
  ["رمضان", "Ramadan atmosphere, lanterns and crescent moon"],
  ["العيد", "Eid celebration"],
  ["عرس", "a wedding"],
  ["حفله", "a party"],


  // ---------- v14: gap-fill found by the self test ----------
  ["رسم رقمي", "digital art"],
  ["رسم ثلاثي الابعاد", "3D render"],
  ["وقت الغروب", "at sunset"],
  ["وقت الشروق", "at sunrise"],
  ["وقت", "at the time of"],
  ["الشروق", "sunrise"],
  ["الغروب", "sunset"],
  ["جزايري", "Algerian"],
  ["جزائري", "Algerian"],
  ["مغربي", "Moroccan"],
  ["تونسي", "Tunisian"],
  ["عربي", "Arab"],
  ["امازيغي", "Amazigh, Berber"],
  ["قبايلي", "Kabyle"],
  ["صحراوي", "Saharan"],
  ["لابس", "wearing"],
  ["يلبس", "wearing"],
  ["تلبس", "wearing"],
  ["حامل", "holding"],
  ["واقعيه", "photorealistic"],
  ["حقيقيه", "realistic"],
  ["جميله", "beautiful"],
  ["كبيره", "large"],
  ["صغيره", "small"],
  ["قديمه", "old, vintage"],
  ["حديثه", "modern"],
  ["فخمه", "luxurious"],
  ["ملونه", "colourful"],
  ["هادئه", "calm"],
  ["جدا", "very"],
  ["بزاف", "very"],
  ["شويه", "slightly"],
  ["كبير", "large"],
  ["صغير", "small"],
  ["طويل", "tall"],
  ["قصير", "short"],
  ["عريض", "wide"],
  ["رفيع", "thin"],
  ["نظيف", "clean"],
  ["تصميم", "a design"],
  ["رسمه", "a drawing"],
  ["رسم", "a drawing"],
  ["لوحه", "a painting"],
  ["صوره فوتوغرافيه", "a photograph"],
  ["خلفيه شاشه", "a wallpaper"],
  ["مدينه", "a city"],
  ["قريه", "a village"],
  ["بلاد", "a country"],
  ["مكان", "a place"],
  ["منظر", "a landscape view"],
  ["منظر طبيعي", "a natural landscape"],
  ["مطعم فخم", "an upscale restaurant"],
  ["محل", "a shop"],
  ["دكان", "a small shop"],
  ["داخل البيت", "an interior of a house"],
  ["غرفه نوم", "a bedroom"],
  ["صالون", "a living room"],
  ["عين", "an eye"],
  ["يد", "a hand"],
  ["شعر", "hair"],
  ["ابتسامه", "a smile"],
  ["لحيه", "a beard"],
  ["نظارات", "glasses"],
  ["قبعه", "a hat"],
  ["حذاء", "shoes"],
  ["كره", "a ball"],
  ["كره القدم", "football"],
  ["موسيقى", "music"],
  ["جيتار", "a guitar"],
  ["بيانو", "a piano"],
  ["طبل", "a drum"],
  ["علم", "a flag"],
  ["علم الجزائر", "the Algerian flag"],
  ["نجمه", "a star"],
  ["هلال", "a crescent moon"],
  ["ذهب", "gold"],
  ["فضه", "silver"],
  ["زجاج", "glass"],
  ["خشب", "wood"],
  ["حديد", "metal"],
  ["حجر", "stone"],
  // ---------- verbs / relations ----------
  ["يجري", "running"],
  ["يمشي", "walking"],
  ["يطير", "flying"],
  ["يسبح", "swimming"],
  ["يضحك", "laughing"],
  ["يبكي", "crying"],
  ["جالس", "sitting"],
  ["واقف", "standing"],
  ["نائم", "sleeping"],
  ["يقرا", "reading"],
  ["يكتب", "writing"],
  ["يلعب", "playing"],
  ["يشرب", "drinking"],
  ["ياكل", "eating"],
  ["يحمل", "holding"],
  ["فوق", "on top of"],
  ["تحت", "under"],
  ["بجنب", "next to"],
  ["قدام", "in front of"],
  ["داخل", "inside"],
  ["وسط", "in the middle of"],
  ["امام", "in front of"],
  ["خلف", "behind"],
  ["مع", "with"],
  ["بدون", "without"],
  ["و", "and"],
  ["في", "in"],
  ["على", "on"],
  ["من", "from"],
  ["الى", "to"],
  ["بـ", "with"],
];

/** Darija words that mean "make me a picture of" — dropped, not translated. */
const COMMANDS = [
  "صور لي", "صورلي", "صور ليا", "اصنع لي", "اصنعلي", "اعمل لي", "اعمللي",
  "دير لي", "ديرلي", "رسم لي", "ارسم لي", "ارسملي", "بغيت صوره", "بغيت",
  "عايز", "اريد", "ممكن", "من فضلك", "عفاك", "صوره ل", "صوره", "تصميم ل",
  "generate", "create", "make me", "draw me", "a picture of", "an image of",
];

const NUMBERS: Record<string, string> = {
  واحد: "one", جوج: "two", زوج: "two", اثنين: "two", تلاته: "three", ثلاثه: "three",
  ربعه: "four", اربعه: "four", خمسه: "five", سته: "six", سبعه: "seven",
  تمنيه: "eight", ثمانيه: "eight", تسعه: "nine", عشره: "ten",
};

/* ------------------------------------------------------------------ *
 * compiled matcher (built once)
 * ------------------------------------------------------------------ */
interface Rule {
  re: RegExp;
  en: string;
}

const RULES: Rule[] = (() => {
  const all: Entry[] = [
    ...PHRASES,
    ...Object.entries(NUMBERS).map(([a, e]) => [a, e] as Entry),
  ];
  // longest Arabic key first so "مدينه الجزائر" beats "الجزائر"
  all.sort((a, b) => b[0].length - a[0].length);
  return all.map(([ar, en]) => {
    const body = normalizeAr(ar).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // optional definite article + optional conjunction prefix
    // Arabic glues particles to the noun: و(and) ف(in) ل(for) ب(with) ك(like),
    // each optionally followed by the definite article ال. Without this, a word
    // like "فالقصبة" never matched "القصبة" and stayed untranslated.
    return {
      re: new RegExp(`(^|${WORD})(?:[\\u0648\\u0641\\u0644\\u0628\\u0643])?(?:ال)?${body}(?=$|${WORD})`, "g"),
      en,
    };
  });
})();

const CMD_RE = new RegExp(
  `(^|${WORD})(?:${COMMANDS.map((c) => normalizeAr(c).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|${WORD})`,
  "gi"
);

export function hasArabicChars(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

export interface TranslationResult {
  /** best-effort English prompt */
  en: string;
  /** 0..1 — share of Arabic words that were recognised */
  coverage: number;
  /** Arabic words we could not translate (kept verbatim) */
  unknown: string[];
}

/**
 * Deterministic Darija/Arabic → English for image prompts.
 * Never throws, never calls the network.
 */
export function translateArabicPrompt(input: string): TranslationResult {
  const raw = (input ?? "").slice(0, 1200);
  if (!hasArabicChars(raw)) return { en: raw.trim(), coverage: 1, unknown: [] };

  let s = " " + normalizeAr(raw) + " ";
  s = s.replace(CMD_RE, " ");

  const arWordsBefore = (s.match(new RegExp(`[${AL}]{2,}`, "g")) ?? []).length;

  for (const r of RULES) {
    r.re.lastIndex = 0;
    s = s.replace(r.re, (_m, pre: string) => `${pre}${r.en} `);
  }

  const leftovers = s.match(new RegExp(`[${AL}]{2,}`, "g")) ?? [];
  const unknown = Array.from(new Set(leftovers));

  // drop the Arabic we could not translate: a Latin-only prompt beats a mixed one,
  // because the diffusion model silently ignores glyphs it cannot tokenise anyway.
  let en = s.replace(new RegExp(`[${AL}]+`, "g"), " ");

  en = en
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/(^|\s)(a|an|the)\s+(a|an|the)\s+/g, "$1$2 ")
    .trim();

  const coverage =
    arWordsBefore === 0 ? 1 : Math.max(0, 1 - leftovers.length / arWordsBefore);

  return { en, coverage, unknown };
}

/**
 * The entry point used by image-gen: guarantees a usable English prompt.
 * `llm` is whatever the (optional) model translation produced.
 */
export function ensureEnglishPrompt(original: string, llm?: string): string {
  const fromLlm = (llm ?? "").trim();
  // the LLM answer is good only if it exists and carries no Arabic left-overs
  if (fromLlm.length > 3 && !hasArabicChars(fromLlm)) return fromLlm;

  const offline = translateArabicPrompt(original);
  if (offline.en.length > 2) {
    // if the LLM produced a partly-Arabic string, keep its Latin part as extra detail
    const latin = fromLlm.replace(/[\u0600-\u06FF]+/g, " ").replace(/\s+/g, " ").trim();
    return latin.length > offline.en.length ? latin : offline.en;
  }
  return fromLlm || original;
}
