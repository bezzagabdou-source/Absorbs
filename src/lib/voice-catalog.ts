/**
 * NEXUS ATLAS — دليل الأصوات (v18)
 * ---------------------------------------------------------------------------
 * The Gemini TTS voice family, mapped to real personas, genders, moods and
 * languages, plus the "style" prompt that makes a robotic reading sound like a
 * human phone call in Darija / Arabic / French / English.
 *
 * Pure module: imported by the TTS route (server) and by the call screen and
 * the control centre (client).
 */

export type VoiceGender = "m" | "f";
export type VoiceMood = "warm" | "energetic" | "calm" | "deep" | "playful" | "pro";

export type CatalogVoice = {
  /** exact Gemini prebuilt voice name */
  id: string;
  /** display name (Arabic-first) */
  name: { ar: string; fr: string; en: string };
  gender: VoiceGender;
  mood: VoiceMood;
  /** 1-5 — how natural it sounds for conversational Arabic */
  arabic: number;
  /** 1-5 */
  french: number;
  /** 1-5 */
  english: number;
  /** what it is best at */
  best: { ar: string; en: string };
  emoji: string;
  /** alternative engines that can play the same character */
  eleven?: string;
};

/** Every Gemini prebuilt voice, curated and characterised. */
export const VOICE_CATALOG: CatalogVoice[] = [
  {
    id: "Zephyr",
    name: { ar: "زفير — صوت شاب حيوي", fr: "Zephyr — vif", en: "Zephyr — bright" },
    gender: "f",
    mood: "energetic",
    arabic: 4,
    french: 5,
    english: 5,
    best: { ar: "مكالمات سريعة، تحفيز، شرح مباشر", en: "fast calls, coaching" },
    emoji: "⚡",
    eleven: "EXAVITQu4vr4xnSDxMaL",
  },
  {
    id: "Puck",
    name: { ar: "باك — صوت رجالي مرح", fr: "Puck — enjoué", en: "Puck — upbeat" },
    gender: "m",
    mood: "playful",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "دردشة، نكت، محتوى شبابي", en: "casual chat, humour" },
    emoji: "😄",
  },
  {
    id: "Charon",
    name: { ar: "شارون — صوت عميق هادئ", fr: "Charon — grave", en: "Charon — deep" },
    gender: "m",
    mood: "deep",
    arabic: 5,
    french: 4,
    english: 5,
    best: { ar: "سرد قصص، وثائقيات، قراءة نصوص", en: "storytelling, narration" },
    emoji: "🌑",
  },
  {
    id: "Kore",
    name: { ar: "كوري — صوت نسائي واضح", fr: "Kore — claire", en: "Kore — clear" },
    gender: "f",
    mood: "pro",
    arabic: 5,
    french: 5,
    english: 5,
    best: { ar: "شرح دراسي، أخبار، مكالمات رسمية", en: "teaching, news, formal" },
    emoji: "🎓",
  },
  {
    id: "Fenrir",
    name: { ar: "فنرير — صوت رجالي قوي", fr: "Fenrir — puissant", en: "Fenrir — powerful" },
    gender: "m",
    mood: "energetic",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "إعلانات، تحفيز رياضي", en: "ads, sport motivation" },
    emoji: "🔥",
  },
  {
    id: "Leda",
    name: { ar: "ليدا — صوت نسائي ناعم", fr: "Leda — douce", en: "Leda — soft" },
    gender: "f",
    mood: "calm",
    arabic: 4,
    french: 5,
    english: 5,
    best: { ar: "استرخاء، تأمل، مساج صوتي", en: "relaxation, meditation" },
    emoji: "🕊️",
  },
  {
    id: "Orus",
    name: { ar: "أوروس — صوت مذيع", fr: "Orus — annonceur", en: "Orus — announcer" },
    gender: "m",
    mood: "pro",
    arabic: 5,
    french: 4,
    english: 5,
    best: { ar: "تقديم برامج، مقابلات عمل", en: "broadcast, interviews" },
    emoji: "🎙️",
  },
  {
    id: "Aoede",
    name: { ar: "أيودي — صوت نسائي دافئ", fr: "Aoede — chaleureuse", en: "Aoede — warm" },
    gender: "f",
    mood: "warm",
    arabic: 5,
    french: 5,
    english: 5,
    best: { ar: "مكالمات ودّية، ترجمة فورية", en: "friendly calls, interpreting" },
    emoji: "💛",
  },
  {
    id: "Callirrhoe",
    name: { ar: "كاليروي — صوت هادئ رزين", fr: "Callirrhoe — posée", en: "Callirrhoe — easygoing" },
    gender: "f",
    mood: "calm",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "خدمة الزبائن، شروحات طويلة", en: "support, long explainers" },
    emoji: "🌿",
  },
  {
    id: "Autonoe",
    name: { ar: "أوتونوي — صوت نسائي واثق", fr: "Autonoe — assurée", en: "Autonoe — confident" },
    gender: "f",
    mood: "pro",
    arabic: 4,
    french: 5,
    english: 5,
    best: { ar: "عروض عمل، تقديم مشاريع", en: "business pitches" },
    emoji: "💼",
  },
  {
    id: "Enceladus",
    name: { ar: "إنسيلادوس — صوت رجالي رخيم", fr: "Enceladus — moelleux", en: "Enceladus — breathy" },
    gender: "m",
    mood: "warm",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "قصص قبل النوم، بودكاست", en: "bedtime stories, podcast" },
    emoji: "🌫️",
  },
  {
    id: "Iapetus",
    name: { ar: "إيابيتوس — صوت رجالي واضح", fr: "Iapetus — net", en: "Iapetus — clear" },
    gender: "m",
    mood: "pro",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "تعليمات تقنية، خطوات", en: "technical instructions" },
    emoji: "🛰️",
  },
  {
    id: "Umbriel",
    name: { ar: "أومبرييل — صوت منخفض متأمل", fr: "Umbriel — contemplatif", en: "Umbriel — mellow" },
    gender: "m",
    mood: "calm",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "تأمل، قراءة شعر", en: "meditation, poetry" },
    emoji: "🌘",
  },
  {
    id: "Algieba",
    name: { ar: "الجبة — صوت فخيم", fr: "Algieba — ample", en: "Algieba — smooth" },
    gender: "m",
    mood: "deep",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "وثائقيات تاريخية، خطب", en: "history documentaries" },
    emoji: "🏛️",
  },
  {
    id: "Despina",
    name: { ar: "ديسبينا — صوت نسائي لطيف", fr: "Despina — aimable", en: "Despina — pleasant" },
    gender: "f",
    mood: "warm",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "محتوى عائلي، وصفات", en: "family content, recipes" },
    emoji: "🍯",
  },
  {
    id: "Erinome",
    name: { ar: "إرينومي — صوت نسائي هادئ", fr: "Erinome — calme", en: "Erinome — gentle" },
    gender: "f",
    mood: "calm",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "دعم نفسي، طمأنة", en: "reassurance, care" },
    emoji: "🫧",
  },
  {
    id: "Algenib",
    name: { ar: "الجانب — صوت رجالي حاد", fr: "Algenib — incisif", en: "Algenib — gravelly" },
    gender: "m",
    mood: "energetic",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "تعليق رياضي، ألعاب", en: "sports, gaming" },
    emoji: "⚔️",
  },
  {
    id: "Rasalgethi",
    name: { ar: "رأس الجاثي — صوت راوٍ", fr: "Rasalgethi — conteur", en: "Rasalgethi — storyteller" },
    gender: "m",
    mood: "deep",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "حكايات، سير", en: "tales, biography" },
    emoji: "📜",
  },
  {
    id: "Laomedeia",
    name: { ar: "لاوميديا — صوت نسائي مرح", fr: "Laomedeia — pétillante", en: "Laomedeia — upbeat" },
    gender: "f",
    mood: "playful",
    arabic: 4,
    french: 5,
    english: 5,
    best: { ar: "سوشيال ميديا، ريلز", en: "social video, reels" },
    emoji: "🎀",
  },
  {
    id: "Achernar",
    name: { ar: "النهر — صوت نسائي نقي", fr: "Achernar — limpide", en: "Achernar — crisp" },
    gender: "f",
    mood: "pro",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "أخبار، تقارير", en: "news, reports" },
    emoji: "📰",
  },
  {
    id: "Alnilam",
    name: { ar: "النظام — صوت رجالي متزن", fr: "Alnilam — posé", en: "Alnilam — steady" },
    gender: "m",
    mood: "pro",
    arabic: 5,
    french: 4,
    english: 5,
    best: { ar: "اجتماعات، تقارير عمل", en: "meetings, work reports" },
    emoji: "🧭",
  },
  {
    id: "Schedar",
    name: { ar: "الصدر — صوت دافئ عميق", fr: "Schedar — chaleureux", en: "Schedar — warm-deep" },
    gender: "m",
    mood: "warm",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "مكالمات طويلة، مرافقة", en: "long calls, companionship" },
    emoji: "🔶",
  },
  {
    id: "Gacrux",
    name: { ar: "غاكروس — صوت نسائي ناضج", fr: "Gacrux — mûre", en: "Gacrux — mature" },
    gender: "f",
    mood: "deep",
    arabic: 4,
    french: 5,
    english: 5,
    best: { ar: "تحليل، نقد فني", en: "analysis, critique" },
    emoji: "🌹",
  },
  {
    id: "Pulcherrima",
    name: { ar: "بولخيريما — صوت أنيق", fr: "Pulcherrima — élégante", en: "Pulcherrima — elegant" },
    gender: "f",
    mood: "pro",
    arabic: 4,
    french: 5,
    english: 4,
    best: { ar: "موضة، علامات فاخرة", en: "fashion, luxury brands" },
    emoji: "✨",
  },
  {
    id: "Achird",
    name: { ar: "أشرد — صوت رجالي شاب", fr: "Achird — jeune", en: "Achird — youthful" },
    gender: "m",
    mood: "playful",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "محتوى شبابي، بث مباشر", en: "youth content, live" },
    emoji: "🛹",
  },
  {
    id: "Zubenelgenubi",
    name: { ar: "الزبانى — صوت متوازن", fr: "Zubenelgenubi — équilibré", en: "Zubenelgenubi — balanced" },
    gender: "m",
    mood: "pro",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "شرح عام، دروس", en: "general explainers" },
    emoji: "⚖️",
  },
  {
    id: "Vindemiatrix",
    name: { ar: "العذراء — صوت نسائي رقيق", fr: "Vindemiatrix — tendre", en: "Vindemiatrix — tender" },
    gender: "f",
    mood: "warm",
    arabic: 4,
    french: 5,
    english: 4,
    best: { ar: "محتوى أطفال، تعليم", en: "kids, teaching" },
    emoji: "🧸",
  },
  {
    id: "Sadachbia",
    name: { ar: "سعد الأخبية — صوت رخيم", fr: "Sadachbia — veloutée", en: "Sadachbia — velvety" },
    gender: "m",
    mood: "deep",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "إذاعة ليلية، خواطر", en: "night radio" },
    emoji: "🌃",
  },
  {
    id: "Sadaltager",
    name: { ar: "سعد الذابح — صوت حكيم", fr: "Sadaltager — sage", en: "Sadaltager — sage" },
    gender: "m",
    mood: "calm",
    arabic: 5,
    french: 4,
    english: 4,
    best: { ar: "حكم، نصائح حياة", en: "wisdom, life advice" },
    emoji: "🧠",
  },
  {
    id: "Sulafat",
    name: { ar: "السلاحف — صوت نسائي سلس", fr: "Sulafat — fluide", en: "Sulafat — fluid" },
    gender: "f",
    mood: "energetic",
    arabic: 4,
    french: 4,
    english: 5,
    best: { ar: "تسويق، عروض", en: "marketing, offers" },
    emoji: "🌊",
  },
];

export const VOICE_IDS = VOICE_CATALOG.map((v) => v.id);

export function voiceById(id: unknown): CatalogVoice {
  return VOICE_CATALOG.find((v) => v.id === id) ?? VOICE_CATALOG[0];
}

/** Best voices for a language + gender + mood, in order. */
export function recommendVoices(o: { lang?: string; gender?: VoiceGender | "any"; mood?: VoiceMood | "any"; limit?: number } = {}): CatalogVoice[] {
  const lang = (o.lang ?? "ar").slice(0, 2).toLowerCase();
  const key = lang === "fr" ? "french" : lang === "en" ? "english" : "arabic";
  const scored = VOICE_CATALOG.map((v) => {
    let s = v[key] * 10;
    if (o.gender && o.gender !== "any" && v.gender === o.gender) s += 12;
    if (o.mood && o.mood !== "any" && v.mood === o.mood) s += 8;
    return { v, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, o.limit ?? 8).map((x) => x.v);
}

/** Voices that suit a given persona id (voice-call personas). */
export const PERSONA_VOICES: Record<string, { m: string; f: string }> = {
  friend: { m: "Schedar", f: "Aoede" },
  coach: { m: "Fenrir", f: "Zephyr" },
  teacher: { m: "Alnilam", f: "Kore" },
  storyteller: { m: "Charon", f: "Gacrux" },
  interpreter: { m: "Orus", f: "Aoede" },
  interviewer: { m: "Algieba", f: "Autonoe" },
};

/* ═══════════════════════════════════════════════════════════════════
 *  Style prompts — what turns TTS into a human phone call
 * ═══════════════════════════════════════════════════════════════════ */

const MOOD_LINE: Record<VoiceMood, string> = {
  warm: "warm, friendly and close, like a good friend talking to you",
  energetic: "bright, quick and enthusiastic, with real energy but never shouting",
  calm: "soft, slow-breathed and reassuring, almost intimate",
  deep: "low, resonant and narrative, like a documentary storyteller",
  playful: "light, smiling, with a bit of mischief in the rhythm",
  pro: "clear, composed and professional, like a trusted presenter",
};

const LANG_LINE: Record<string, string> = {
  ar: "natural spoken Algerian/Modern Standard Arabic, with the rhythm of real Maghrebi speech: short breath groups, light emphasis on the important word, no robotic spelling of letters",
  fr: "natural conversational French (a light Maghrebi-French ease is welcome), liaisons and rhythm like a real person",
  en: "natural conversational English, relaxed and clear",
};

export type TtsStyleOptions = {
  lang?: string;
  mood?: VoiceMood | string;
  /** 0.6 – 1.6 */
  rate?: number;
  /** extra instruction from the user ("whisper", "read slowly", "sound excited") */
  emotion?: string;
  /** short greeting/interjection realism */
  conversational?: boolean;
};

/** Builds the instruction prefixed to the text sent to the TTS model. */
export function ttsStylePrompt(o: TtsStyleOptions = {}): string {
  const lang = (o.lang ?? "ar").slice(0, 2).toLowerCase();
  const mood = (MOOD_LINE[o.mood as VoiceMood] ?? MOOD_LINE.warm) as string;
  const rate = Math.min(1.4, Math.max(0.75, o.rate ?? 1));
  const rateLine =
    rate >= 1.15
      ? "Speak slightly faster than normal, like someone in a lively conversation."
      : rate <= 0.9
        ? "Speak a little slower and clearer than normal."
        : "Speak at a natural conversational pace.";
  const convo =
    o.conversational === false
      ? ""
      : " Add tiny human touches where they fit: a short breath, a natural pause at commas, a slight rise at the end of a question. Never spell out punctuation, never say emoji names, never add words that are not in the text.";
  const emotion = (o.emotion ?? "").trim().slice(0, 90);
  return [
    `Speak like a real human on a phone call: ${mood}.`,
    LANG_LINE[lang] ?? LANG_LINE.ar,
    rateLine,
    emotion ? `Emotion to convey: ${emotion}.` : "",
    convo,
    "Read ONLY the text below, exactly as written, in the same language.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Emotion presets the user can pick in one tap. */
export const EMOTION_PRESETS: { id: string; ar: string; en: string; prompt: string }[] = [
  { id: "neutral", ar: "طبيعي", en: "Neutral", prompt: "" },
  { id: "warm", ar: "ودّي", en: "Warm", prompt: "warm and affectionate, smiling voice" },
  { id: "excited", ar: "متحمّس", en: "Excited", prompt: "excited and enthusiastic, a bit faster" },
  { id: "calm", ar: "هادئ", en: "Calm", prompt: "very calm, slow and soothing" },
  { id: "serious", ar: "جاد", en: "Serious", prompt: "serious, measured and authoritative" },
  { id: "whisper", ar: "همس", en: "Whisper", prompt: "a soft near-whisper, very quiet and intimate" },
  { id: "news", ar: "مذيع أخبار", en: "News anchor", prompt: "like a professional news anchor reading the headlines" },
  { id: "story", ar: "حكواتي", en: "Storyteller", prompt: "like a storyteller by a fire, with dramatic pauses" },
  { id: "sport", ar: "معلّق رياضي", en: "Sports commentator", prompt: "like an excited sports commentator in the last minute" },
  { id: "sad", ar: "حزين", en: "Sad", prompt: "sad, quiet and a little heavy-hearted" },
];

export function emotionPrompt(id: string): string {
  return EMOTION_PRESETS.find((e) => e.id === id)?.prompt ?? "";
}
