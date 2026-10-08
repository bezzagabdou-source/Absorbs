/**
 * Nexus AI v11 — ARABIC VISION.
 *
 * Two problems solved:
 *  1. Image models are trained almost entirely on English and mangle Arabic prompts
 *     (wrong subject, nonsense glyphs). We translate the INTENT to a rich English prompt while
 *     keeping any Arabic that must literally appear in the picture as a protected, verbatim string.
 *  2. Arabic text INSIDE an uploaded picture (a bill, a homework sheet, a screenshot, a sign)
 *     needs an explicit reading contract, otherwise the model skims it.
 */

/** Any Arabic letter, including Arabic-Indic digits and presentation forms. */
const AR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const AR_WORD_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g;

export function hasArabic(text: string): boolean {
  return AR_RE.test(text);
}

/** Text the user explicitly wants written inside the image: "اكتب عليها ...", «...», "..." */
const QUOTED_RE = /[«"'\u201c\u201d\u2018\u2019](.{1,120}?)[»"'\u201c\u201d\u2018\u2019]/g;
const WRITE_CMD_RE =
  /(?:اكتب(?:\s+عليها| عليه| فيها)?|مكتوب(?:\s+عليها| فيها)?|يكون\s+مكتوب|نص|عنوان|كلمة|شعار|بعنوان|écris|write|text\s+says?)\s*[:：]?\s*[«"'\u201c\u2018]?([^\n«»"'\u201c\u201d\u2018\u2019]{1,120})/giu;

export type ArabicPromptPlan = {
  /** the prompt to send to the image engine */
  prompt: string;
  /** the original user idea, untouched */
  original: string;
  /** Arabic strings that must be rendered verbatim inside the picture */
  renderText: string[];
  /** the request was written in Arabic / Darija */
  arabic: boolean;
  /** the picture needs real Arabic typography (RTL, correct joining) */
  needsArabicTypography: boolean;
};

/**
 * Small, dependency-free Darija / Arabic -> English hints for the most common image subjects.
 * NOTE: JavaScript's `\b` is ASCII-only and never matches next to an Arabic letter, so every
 * entry uses an explicit letter-class boundary instead.
 */
/** Letters only — Arabic punctuation (، ؛ ؟ ٪) must NOT count as part of a word. */
const AR_L = "A-Za-z0-9\\u0620-\\u065F\\u0660-\\u0669\\u066E-\\u06D3\\u06D5\\u06E5-\\u06EF\\u06FA-\\u06FF\\u0750-\\u077F";
const aw = (src: string) => new RegExp(`(?<![${AR_L}])(?:${src})(?![${AR_L}])`, "iu");

const LEXICON: Array<[RegExp, string]> = [
  [aw("قط|قطة|قطط|مشة"), "cat"],
  [aw("كلب|كليب|كلاب"), "dog"],
  [aw("حصان|عود|خيل"), "horse"],
  [aw("أسد|اسد|سبع"), "lion"],
  [aw("طفل|طفلة|ولد|بنت|صغير"), "child"],
  [aw("رجل|راجل|شاب"), "man"],
  [aw("امرأة|مرا|سيدة|بنية"), "woman"],
  [aw("مدينة|بلاد|حومة"), "city"],
  [aw("الجزائر|جزائري|جزائرية|دزاير"), "Algeria, Algerian"],
  [aw("الصحراء|صحرا|صحراء"), "Sahara desert"],
  [aw("القصبة|قصبة"), "the Casbah of Algiers"],
  [aw("بحر|شط|شاطئ|البحر"), "sea, beach"],
  [aw("جبل|جبال"), "mountains"],
  [aw("سيارة|طوموبيل|كرهبة|سيارات"), "car"],
  [aw("بيت|دار|منزل"), "house"],
  [aw("مسجد|جامع"), "mosque"],
  [aw("سوق|السوق"), "traditional market"],
  [aw("أكل|ماكلة|طعام|ماكلا"), "food"],
  [aw("قهوة|قهوا"), "coffee"],
  [aw("كسكس|كسكسي|طعام تقليدي"), "couscous"],
  [aw("شاي|أتاي|اتاي"), "mint tea"],
  [aw("زهرة|زهور|ورد|نوار"), "flowers"],
  [aw("شجرة|شجر|أشجار"), "tree"],
  [aw("سماء|سما"), "sky"],
  [aw("ليل|الليل"), "night"],
  [aw("نهار|صباح|الصباح"), "daylight, morning"],
  [aw("غروب|مغيب|الغروب"), "sunset"],
  [aw("شروق|الشروق"), "sunrise"],
  [aw("مطر|شتا"), "rain"],
  [aw("ثلج|الثلج"), "snow"],
  [aw("شعار|لوغو"), "logo"],
  [aw("ملصق|أفيش|افيش|بوستر"), "poster"],
  [aw("واجهة|تصميم"), "design"],
  [aw("هاتف|تيليفون|فون|تليفون"), "smartphone"],
  [aw("حاسوب|بيسي|كمبيوتر"), "computer"],
  [aw("روبوت|آلي|الي"), "robot"],
  [aw("فضاء|نجوم|كوكب|الفضاء"), "space, stars, planet"],
  [aw("تنين"), "dragon"],
  [aw("بطل|محارب|مقاتل"), "warrior hero"],
  [aw("واقعي|واقعية|ريال"), "photorealistic"],
  [aw("كرتون|كرتوني"), "cartoon style"],
  [aw("أنمي|انمي|مانجا"), "anime style"],
  [aw("ثلاثي الأبعاد|ثري دي"), "3D render"],
  [aw("فخم|أسطوري|اسطوري|خرافي|فخمة"), "epic, luxurious, legendary"],
  [aw("جميل|جميلة|زوين|زوينة|شاب|شابة"), "beautiful"],
  [aw("كبير|كبيرة|ضخم|ضخمة"), "large, massive"],
  [aw("صغير|صغيرة"), "small"],
  [aw("أحمر|احمر|حمرا|حمراء"), "red"],
  [aw("أزرق|ازرق|زرقا|زرقاء"), "blue"],
  [aw("أخضر|اخضر|خضرا|خضراء"), "green"],
  [aw("أسود|اسود|كحل|سوداء"), "black"],
  [aw("أبيض|ابيض|بيضا|بيضاء"), "white"],
  [aw("ذهبي|دهبي|ذهبية"), "gold"],
];

function englishHints(text: string): string[] {
  const out = new Set<string>();
  for (const [re, en] of LEXICON) {
    if (re.test(text)) out.add(en);
  }
  return [...out];
}

function extractRenderText(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  QUOTED_RE.lastIndex = 0;
  while ((m = QUOTED_RE.exec(text))) {
    const v = m[1].trim();
    if (v.length >= 1 && v.length <= 120) out.add(v);
  }
  WRITE_CMD_RE.lastIndex = 0;
  while ((m = WRITE_CMD_RE.exec(text))) {
    const v = m[1].trim().replace(/[.,،؛;:!?]+$/u, "");
    if (v.length >= 1 && v.length <= 120) out.add(v);
  }
  return [...out].filter((s) => s.length > 0).slice(0, 4);
}

/**
 * Builds an image prompt that an English-trained diffusion model actually understands,
 * while protecting any Arabic that must appear verbatim in the picture.
 */
export function planArabicImage(idea: string): ArabicPromptPlan {
  const original = idea.trim();
  const arabic = hasArabic(original);
  const renderText = extractRenderText(original);
  const needsArabicTypography = renderText.some(hasArabic);

  if (!arabic) {
    return { prompt: original, original, renderText, arabic: false, needsArabicTypography };
  }

  const hints = englishHints(original);
  const parts: string[] = [];

  // keep the original so a multilingual engine (Gemini / FLUX) can still use it
  parts.push(original);
  if (hints.length) parts.push(`Subject and mood: ${hints.join(", ")}.`);

  if (needsArabicTypography) {
    const list = renderText.map((t) => `"${t}"`).join(" and ");
    parts.push(
      `IMPORTANT TYPOGRAPHY: render the Arabic text ${list} exactly as written, in correct right-to-left Arabic script with properly joined letters (naskh or modern Arabic sans), perfectly legible, no invented or mirrored glyphs, no Latin transliteration, correctly spelled, well kerned and centred in its layout block.`
    );
  } else if (arabic) {
    parts.push(
      "Do not draw any written text, letters or captions in the image unless explicitly requested."
    );
  }

  parts.push(
    "Respect Arabic / North-African cultural context when people, clothing, architecture or food appear (authentic, respectful, modern)."
  );

  return {
    prompt: parts.join(" "),
    original,
    renderText,
    arabic: true,
    needsArabicTypography,
  };
}

/** Appended to the negative prompt whenever Arabic glyphs must be rendered. */
export const ARABIC_NEGATIVE =
  "Avoid: broken or disconnected Arabic letters, mirrored or upside-down Arabic, fake Arabic-looking squiggles, Latin letters replacing Arabic, misspelled Arabic, overlapping glyphs, cut-off text.";

/**
 * Reading contract for pictures / PDFs that contain Arabic — attached to the system prompt
 * whenever the user uploads a file and writes in Arabic.
 */
export const ARABIC_VISION_SYSTEM = `
ARABIC VISION CONTRACT (v11)
- When an image or PDF is attached, READ IT COMPLETELY before answering: every Arabic line, handwritten or printed, every number, table cell, stamp, heading, footnote and small print.
- Arabic is read right-to-left: keep word order, hamza, shadda and diacritics exactly; never transliterate unless asked; never "guess" a word you cannot see — mark it [غير واضح].
- Mixed Arabic / French / English documents (very common in Algeria: bills, bank forms, school papers, prescriptions) must be transcribed in the original language of each line.
- Numbers: keep the original digits (١٢٣ or 123) and state the total / amount explicitly. Dates: give them as written AND in ISO form.
- Screenshots of code or an app: transcribe the code exactly, including Arabic strings inside it.
- Homework / exam pages: read the question first, answer in the language of the paper, show the steps.
- If the user asks "شنو هذا" / "ماذا ترى", describe the picture in their dialect, then give the single most useful thing they probably wanted (the amount, the answer, the error, the deadline).`;

/** System addon that makes the assistant generate pictures confidently from an Arabic request. */
export const ARABIC_IMAGE_SYSTEM = `
ARABIC IMAGE CONTRACT (v11)
- The user may describe a picture in Darija, Arabic, French or English. Understand the intent, never ask for a translation.
- When the user wants Arabic words printed inside the picture, repeat those words verbatim in the prompt and demand correct right-to-left joined Arabic typography.
- Default to a polished, modern, culturally-aware result; never produce a flat clip-art look.`;
