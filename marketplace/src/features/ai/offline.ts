/**
 * Deterministic, offline knowledge base for the DZ Exchange assistant.
 *
 * It is the fallback that makes the assistant genuinely useful when no external
 * AI provider is configured (or when the provider is down): it answers listing
 * drafts, search guidance and anti-fraud questions from the marketplace's own
 * rules, in Arabic, French or English, without inventing inventory, prices or
 * guarantees. It never pretends to be a live model.
 */
import type { Locale } from "@/lib/i18n/config";

export type AssistMode = "listing" | "search" | "safety";

export type OfflineFacts = {
  /** Total active listings visible right now (public count only). */
  listingCount?: number;
  /** Category names in the requested locale, most populated first. */
  categories?: string[];
  /** Highest price found for the user's keywords, when a search already ran. */
  priceHint?: { min: number; max: number; sample: number } | null;
};

type Bag = {
  /** Listing draft title, when the facts allow one. */
  title?: string;
  /** Listing draft description. */
  description?: string;
  /** Search keywords. */
  keywords: string[];
  /** Practical advice paragraph. */
  advice: string;
};

const MAX_KEYWORDS = 8;

/** Words that carry no product meaning in any of the three supported languages. */
const stopWords = new Set([
  // French — grammar, comparison and money words carry no product meaning.
  "les", "des", "une", "pour", "avec", "dans", "sur", "pas", "est", "sont", "mon", "ton", "son", "mes", "tes", "ses",
  "acheter", "achete", "vends", "vendre", "vente", "cherche", "recherche", "veux", "voudrais", "besoin", "prix",
  "bonjour", "salut", "merci", "svp", "stp", "comment", "quoi", "quel", "quelle", "combien", "peut", "peux",
  "le", "la", "un", "et", "ou", "en", "au", "aux", "du", "de", "ce", "cet", "cette", "ces", "qui", "que",
  "je", "tu", "il", "elle", "nous", "vous", "ils", "me", "moi", "toi", "se", "sa", "leur", "leurs",
  "avant", "apres", "après", "pendant", "depuis", "chez", "vers", "sans", "sous", "entre", "très", "tres",
  "plus", "moins", "aussi", "bien", "tout", "tous", "toute", "toutes", "autre", "autres", "même", "meme",
  "da", "dzd", "dinar", "dinars", "argent", "budget", "max", "maximum", "min", "minimum", "environ",
  "das", "une", "mois", "annee", "année", "jour", "jours", "fois",
  // English
  "the", "and", "for", "with", "from", "that", "this", "you", "your", "are", "was", "were", "can", "could", "would",
  "please", "hello", "thanks", "thank", "want", "need", "looking", "buy", "sell", "selling", "search", "find",
  "how", "what", "which", "where", "when", "much", "many", "good", "best",
  "a", "an", "of", "to", "in", "on", "at", "is", "it", "my", "me", "we", "our", "they", "them", "his", "her",
  "before", "after", "under", "below", "less", "than", "up", "about", "around", "budget", "price", "money",
  "dzd", "da", "dinar", "dinars", "someone", "somebody", "stranger", "asks", "asking", "ask", "give", "pay",
  // Arabic — grammar, comparison, currency and budget words.
  "من", "في", "على", "عن", "الى", "إلى", "مع", "هذا", "هذه", "ذلك", "التي", "الذي", "كان", "كانت", "هل",
  "أريد", "اريد", "أبحث", "ابحث", "أبيع", "ابيع", "شراء", "بيع", "سعر", "كم", "كيف", "ماذا", "لماذا",
  "مرحبا", "السلام", "عليكم", "شكرا", "من فضلك", "أحتاج", "احتاج", "عندي", "لدي",
  "أقل", "اقل", "بأقل", "باقل", "أكثر", "اكثر", "تحت", "فوق", "حتى", "حوالي", "تقريبا", "تقريباً",
  "دج", "دينار", "دنانير", "الميزانية", "ميزانية", "الثمن", "بسعر", "بسعر", "مستعمل", "مستعملة",
  "شخص", "شخصا", "أجنبي", "اجنبي", "غريب", "يطلب", "طلب", "يدفع", "دفع", "قبل", "بعد", "عند", "معي",
]);

const digitWords: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

/** Normalises Arabic-Indic digits and collapses whitespace. */
export function normalizeText(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => digitWords[digit] ?? digit).replace(/\s+/g, " ").trim();
}

/** Splits a free-text prompt into meaningful keywords (deterministic, no model). */
/** Specification words Arabic sellers glue to their number: "128جيجا", "13برو". */
const SPEC_WORDS = "جيجا|جيجابايت|جيكا|جيغا|جيقا|جيقابايت|برو|ماكس|رام|بيكسل";
const digitBeforeSpec = new RegExp(`(\\d)(?=${SPEC_WORDS})`, "gu");

export function extractKeywords(prompt: string, limit = MAX_KEYWORDS): string[] {
  const budget = extractBudget(prompt);
  // Arabic words are routinely glued to their number ("ايفون13", "128جيجا"), which
  // hides both halves from search. Split them, but never break Latin model codes
  // such as "m2" or "s23" (shorter than four letters stay glued on purpose).
  const spaced = normalizeText(prompt)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/(\p{Script=Arabic})(\d)/gu, "$1 $2")
    .replace(digitBeforeSpec, "$1 ")
    .replace(/(\p{Script=Latin}{4,})(\d)/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of spaced.split(" ")) {
    const word = raw.replace(/^['-]+|['-]+$/g, "");
    if (word.length < 2 || stopWords.has(word) || seen.has(word)) continue;
    if (/^\d+$/.test(word)) {
      // Keep short model numbers and sizes (13, 128, 256…) but never the budget itself.
      if (word.length > 4 || Number(word) === budget) continue;
    }
    seen.add(word);
    words.push(word);
    if (words.length >= limit) break;
  }
  return words;
}

/** Reads an explicit budget such as "moins de 50000", "تحت 50000", "under 50000". */
export function extractBudget(prompt: string): number | null {
  const text = normalizeText(prompt).toLowerCase();
  const match = text.match(/(?:moins de|max|maximum|jusqu'?a|jusqu'à|تحت|أقل من|اقل من|حتى|بحد أقصى|under|below|less than|up to)\s*([\d][\d\s.,]{2,15})/);
  if (!match) return null;
  const amount = Number(match[1].replace(/[\s.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 && amount < 1e12 ? amount : null;
}

const conditionWords: Array<{ test: RegExp; label: Record<Locale, string> }> = [
  // Most specific first: "comme neuf" must win over "neuf".
  { test: /(comme neuf|comme neuve|كالجديد|كأنه جديد|كأنها جديدة|like new|as good as new)/i, label: { fr: "Comme neuf", ar: "كالجديد", en: "Like new" } },
  { test: /(tr[eè]s bon [eé]tat|حالة جيدة جدا|حالة جيدة جداً|very good)/i, label: { fr: "Très bon état", ar: "حالة جيدة جدًا", en: "Very good condition" } },
  { test: /(pour pi[eè]ces|معطل|للقطع|for parts|faulty|broken)/i, label: { fr: "Pour pièces", ar: "للقطع", en: "For parts" } },
  { test: /(neuf|neuve|scell[eé]|جديد|جديدة|brand new|new sealed)/i, label: { fr: "Neuf", ar: "جديد", en: "New" } },
  { test: /(bon [eé]tat|حالة جيدة|good condition)/i, label: { fr: "Bon état", ar: "حالة جيدة", en: "Good condition" } },
];

/** Detects a condition expressed by the seller and returns the localised label. */
export function detectCondition(prompt: string, locale: Locale): string | null {
  for (const entry of conditionWords) if (entry.test.test(prompt)) return entry.label[locale];
  return null;
}

/** Rejects facts we must not let a seller publish as-is. */
export function findUnsafeClaim(prompt: string): "contact" | "credential" | null {
  if (/(?:\+?213|0)[5-7]\d{8}\b/.test(prompt.replace(/[\s-]/g, ""))) return "contact";
  if (/(?:ccv|cvv|otp|mot de passe|كلمة المرور|رمز التحقق|rip|iban)\s*[:=]?\s*\d{3,}/i.test(prompt)) return "credential";
  return null;
}

const copy = {
  fr: {
    needFacts: "Ajoutez le produit, l'état et ce qui est inclus pour obtenir un brouillon honnête.",
    draftTitle: "Brouillon d'annonce",
    draftIntro: "À partir des seules informations que vous avez données :",
    missing: "À compléter avant publication : état exact, défauts connus, accessoires inclus, prix et lieu de remise.",
    searchAdvice:
      "Affinez avec la wilaya, un budget maximum et l'état. Ouvrez une annonce pour vérifier les photos réelles et l'ancienneté du vendeur avant tout contact.",
    searchEmpty: "Aucune annonce ne correspond encore à ces mots. Essayez un synonyme ou retirez un filtre.",
    safetyTitle: "Les règles qui protègent vraiment",
    safetyRules: [
      "Rencontrez-vous dans un lieu public et fréquenté, en journée.",
      "Inspectez l'article et testez-le avant de payer.",
      "Ne versez jamais d'acompte à un inconnu, même pour « réserver ».",
      "Ne partagez jamais un code OTP, un mot de passe ou un code bancaire.",
      "Gardez la conversation écrite dans la messagerie de la plateforme.",
      "Méfiez-vous d'un prix anormalement bas ou d'une pression au paiement immédiat.",
    ],
    reportHint: "En cas de doute, signalez l'annonce et n'envoyez pas d'argent.",
    contactBlocked: "Retirez le numéro de téléphone du brouillon : les coordonnées se partagent après accord, dans la messagerie.",
    credentialBlocked: "Ne publiez jamais un code bancaire, un OTP ou un mot de passe, même partiellement masqué.",
    categoriesIntro: "Catégories les plus actives en ce moment :",
  },
  ar: {
    needFacts: "أضف المنتج والحالة وما يشمله العرض للحصول على مسودة صادقة.",
    draftTitle: "مسودة الإعلان",
    draftIntro: "انطلاقاً من المعلومات التي ذكرتها فقط:",
    missing: "أكمل قبل النشر: الحالة الدقيقة، العيوب المعروفة، الملحقات، السعر ومكان التسليم.",
    searchAdvice:
      "ضيّق البحث بالولاية، بسقف سعر أقصى وبالحالة. افتح الإعلان للتحقق من الصور الحقيقية وسجل البائع قبل أي تواصل.",
    searchEmpty: "لا يوجد إعلان مطابق بعد. جرّب كلمة مرادفة أو أزل أحد الفلاتر.",
    safetyTitle: "قواعد تحميك فعلاً",
    safetyRules: [
      "التقِ في مكان عام مزدحم ونهاراً.",
      "افحص السلعة وجرّبها قبل الدفع.",
      "لا تدفع أي تسبيق لشخص لا تعرفه، حتى لو قال «حجز».",
      "لا تشارك أبداً رمز التحقق أو كلمة المرور أو الرمز البنكي.",
      "أبقِ المحادثة مكتوبة داخل رسائل المنصة.",
      "احذر السعر المنخفض بشكل غير طبيعي أو الاستعجال في الدفع.",
    ],
    reportHint: "عند الشك، بلّغ عن الإعلان ولا ترسل أي مال.",
    contactBlocked: "احذف رقم الهاتف من المسودة: تتبادل بيانات الاتصال بعد الاتفاق داخل المحادثة.",
    credentialBlocked: "لا تنشر أبداً رمزاً بنكياً أو رمز تحقق أو كلمة مرور، ولو جزئياً.",
    categoriesIntro: "أكثر الفئات نشاطاً حالياً:",
  },
  en: {
    needFacts: "Add the product, its condition and what is included to get an honest draft.",
    draftTitle: "Listing draft",
    draftIntro: "Built only from what you told us:",
    missing: "Complete before publishing: exact condition, known defects, included accessories, price and meeting point.",
    searchAdvice:
      "Narrow with a wilaya, a maximum budget and a condition. Open a listing to check real photos and the seller's history before contact.",
    searchEmpty: "No listing matches these words yet. Try a synonym or remove a filter.",
    safetyTitle: "Rules that actually protect you",
    safetyRules: [
      "Meet in a busy public place, in daylight.",
      "Inspect and test the item before paying.",
      "Never send an advance payment to a stranger, even to “reserve”.",
      "Never share an OTP, a password or a bank code.",
      "Keep the conversation written inside the platform messages.",
      "Be wary of an unusually low price or pressure to pay immediately.",
    ],
    reportHint: "If in doubt, report the listing and send no money.",
    contactBlocked: "Remove the phone number from the draft: contact details are shared after agreement, in messages.",
    credentialBlocked: "Never publish a bank code, OTP or password, even partially masked.",
    categoriesIntro: "Busiest categories right now:",
  },
} as const;

function budgetLine(locale: Locale, budget: number | null): string | null {
  if (!budget) return null;
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ", { maximumFractionDigits: 0 }).format(budget);
  if (locale === "ar") return `الميزانية المذكورة: حتى ${formatted} دج.`;
  if (locale === "en") return `Stated budget: up to ${formatted} DZD.`;
  return `Budget indiqué : jusqu'à ${formatted} DA.`;
}

/** Builds the offline answer. Pure function: same input, same output. */
export function offlineAnswer(mode: AssistMode, prompt: string, locale: Locale, facts: OfflineFacts = {}): Bag {
  const text = copy[locale];
  const keywords = extractKeywords(prompt);
  const budget = extractBudget(prompt);
  const unsafe = findUnsafeClaim(prompt);

  if (mode === "listing") {
    if (unsafe === "contact") return { keywords, advice: text.contactBlocked };
    if (unsafe === "credential") return { keywords, advice: text.credentialBlocked };
    const condition = detectCondition(prompt, locale);
    // Product words only: drop the condition words themselves so they do not repeat in the title.
    const productWords = extractKeywords(prompt).filter((word) => !/^(neuf|neuve|neufs|جديد|جديدة|comme|كالجديد|كأنه|bon|très|tres|حالة|جيدة|جدا|جدًا|etat|état|pi[eè]ces|للقطع)$/i.test(word));
    const subject = productWords.slice(0, 4).join(" ");
    // Only draft when the prompt actually names a product and its condition.
    if (productWords.length >= 1 && condition && subject.length >= 3) {
      const title = `${subject.charAt(0).toUpperCase()}${subject.slice(1)} · ${condition}`;
      const description = [
        `${subject}. ${locale === "ar" ? "الحالة" : locale === "en" ? "Condition" : "État"} : ${condition}.`,
        locale === "ar" ? "التفاصيل أدناه مبنية على ما ذكرته فقط؛ أضف ما يشمله العرض والعيوب إن وجدت." :
        locale === "en" ? "The details below use only what you provided; add what is included and any defect." :
        "Les détails ci-dessous reprennent uniquement vos informations ; ajoutez le contenu du lot et les défauts éventuels.",
        text.missing,
      ].join("\n");
      return {
        title: title.slice(0, 180),
        description: description.slice(0, 4000),
        keywords: productWords.concat(condition ? [condition] : []).slice(0, MAX_KEYWORDS),
        advice: `${text.draftIntro} ${text.missing}`,
      };
    }
    return { keywords, advice: text.needFacts };
  }

  if (mode === "safety") {
    const lines = [text.safetyTitle, ...text.safetyRules.map((rule) => `• ${rule}`), text.reportHint];
    return { keywords, advice: lines.join("\n").slice(0, 3000) };
  }

  // search
  const parts: string[] = [];
  parts.push(budgetLine(locale, budget) ?? "");
  if (facts.categories?.length) parts.push(`${text.categoriesIntro} ${facts.categories.slice(0, 4).join(" · ")}`);
  if (typeof facts.listingCount === "number") {
    parts.push(
      locale === "ar" ? `الإعلانات النشطة الآن: ${facts.listingCount}.` :
      locale === "en" ? `Active listings right now: ${facts.listingCount}.` :
      `Annonces actives en ce moment : ${facts.listingCount}.`,
    );
  }
  parts.push(facts.listingCount === 0 ? text.searchEmpty : text.searchAdvice);
  return { keywords, advice: parts.filter(Boolean).join("\n").slice(0, 3000) };
}

export function offlineBagToOutput(bag: Bag) {
  return {
    ...(bag.title && bag.description ? { title: bag.title, description: bag.description } : {}),
    keywords: bag.keywords.slice(0, MAX_KEYWORDS),
    advice: bag.advice,
  };
}

export type { Bag as OfflineBag };
