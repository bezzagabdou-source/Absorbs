/** Detects "make me a picture" requests in chat (Arabic, Algerian Darija, French, English) and infers aspect + style. */
import type { ImageAspect, ImageStyle } from "@/lib/image-types";

export interface ImageRequest {
  aspect: ImageAspect;
  style: ImageStyle;
}

const EDGE = "(?:^|[^\\w\\u0600-\\u06FF])";
const END = "(?![\\w\\u0600-\\u06FF])";

// verbs: MSA + Darija (دير/صوّر/عطيني/نبغي…) + FR + EN, optionally glued to "لي/لنا"
const VERB =
  "(?:ولّ?د|اصنع|أنشئ|انشئ|صمّ?م|ارسم|اعمل|سوّ?ي|صوّ?ر|دير|هات|جيب|عطيني|اعطني|أعطني|نبغي|نحب|نحتاج|ابغ[يى]|بغيت|أريد|اريد|أرغب|توليد|generate|create|make|draw|paint|render|génère|genere|crée|cree|dessine|fais|je veux|i want|give me)";
const NOUN = "(?:صور[ةه]?|صور|رسم[ةه]?|لوح[ةه]|image|images|picture|pictures|photo|photos|illustration|drawing|artwork|wallpaper|dessin|illustration)";

const INTENT = new RegExp(
  `${EDGE}${VERB}(?:لي|لنا)?\\s+(?:لي\\s+|لنا\\s+|me\\s+|moi\\s+)?(?:an?\\s+|une?\\s+|des\\s+|the\\s+|لي\\s+)?(?:\\S+\\s+)?${NOUN}${END}`,
  "i"
);
// "how do I make an image in photoshop?" is a question, not a request
const QUESTION = /^\s*(?:كيف|كيفاش|كيفية|طريقة|شرح|واش|ما\s|how|comment|what|why|pourquoi)/i;

const ASPECTS: [RegExp, ImageAspect][] = [
  [/9\s*[:x×]\s*16|طولي|عمودي|ستوري|story|reels?|ريلز|tiktok|تيك\s?توك|خلفية\s+(?:هاتف|الهاتف|موبايل|جوال)|phone wallpaper/i, "9:16"],
  [/16\s*[:x×]\s*9|عرضي|أفقي|افقي|landscape|بانورام|wallpaper|خلفية|youtube|يوتيوب|thumbnail|غلاف/i, "16:9"],
  [/3\s*[:x×]\s*4/, "3:4"],
  [/4\s*[:x×]\s*3/, "4:3"],
];

const STYLES: [RegExp, ImageStyle][] = [
  [/أنمي|انمي|anime|manga/i, "anime"],
  [/3\s?d|ثلاثي\s+الأبعاد|ثلاثية\s+الأبعاد|render/i, "render3d"],
  [/سينمائ|cinematic|film/i, "cinematic"],
  [/بورتريه|portrait|وجه|face/i, "portrait"],
  [/منتج|product/i, "product"],
  [/طعام|أكل|اكل|food|plat/i, "food"],
  [/عمارة|architecture|منزل|house|villa|فيلا/i, "architecture"],
  [/لوح[ةه]|رسم|painting|دهان|زيتي|كرتون|cartoon|illustration/i, "art"],
];

export function detectImageRequest(text: string): ImageRequest | null {
  const t = text.trim();
  if (t.length < 4 || t.length > 900 || QUESTION.test(t) || !INTENT.test(t)) return null;
  const aspect = ASPECTS.find(([re]) => re.test(t))?.[1] ?? "1:1";
  const style = STYLES.find(([re]) => re.test(t))?.[1] ?? "photo";
  return { aspect, style };
}
