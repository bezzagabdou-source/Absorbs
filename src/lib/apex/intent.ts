/**
 * NEXUS APEX — build-intent detection.
 *
 * Before any model is called we ask one question: is the user asking for a whole
 * *product* (site, dashboard, shop, game, school system…) or a quick answer?
 * A yes routes the turn through the deterministic engine, which writes the whole
 * project offline — so the reply can never be a truncated snippet.
 */

/* Orders to build something. "اكتب" is here on purpose: with a product noun
   ("اكتب صفحة هبوط لمقهى") it *is* a build order, and without one ("اكتب كود
   صغير") the noun check below keeps it a normal answer. */
const BUILD_VERBS =
  /(اصنع|سوّ?ي|اعمل|نعمل|ندير|نصنع|نبني|نصمم|نسوّ?ي|أنشئ|انشئ|ابني|بني|بنى|طلّع|دير|صمّ?م|طور|حوّل|اكتب|برمج|generate|create|build|make|code me|développe|developpe|développe|construis|crée|cree|fais|fabrique|je veux|j['’]aimerais|j ai besoin|besoin d)/i;

const PRODUCT_NOUNS =
  /(موقع|ويب|صفحة هبوط|صفحة|لاندينغ|متجر|بوتيك|مغازة|تطبيق|أبليكاسيون|منصة|منصّة|لوحة تحكم|لوحة قيادة|داشبورد|dashboard|نظام|سيستام|app|application|marketplace|لعبة|ألعاب|game|jeu|مدونة|blog|مدرسة|ثانوية|عيادة|صيدلية|مطعم|قاعة|فندق|وكالة|شركة|مؤسسة|عقارات|سياحة|محاسبة|دعم|helpdesk|crm|erp|saas|e-?commerce|admin|بورتفوليو|portfolio|landing|site|boutique|magasin|plateforme|tableau de bord|école|ecole|clinique|pharmacie|restaurant|école|réservation|reservation)/i;

const DEEP_QUALIFIERS =
  /(ضخم|كبير|كاملة|كامل|كاملة جدا|احترافي|احترافية|مشروع|متكامل|حقيقي|production|enterprise|من الصفر|10 ?000|١٠٠٠٠|عشرة آلاف|أسطوري|complet|complète|professionnel|professionnelle|grand|massif)/i;

/* The user explicitly wants the CODE ITSELF in the chat: then the model writes the
   file (STANDALONE contract) instead of the engine building and explaining it. */
const CODE_IN_CHAT =
  /(?:أعطني|اعطني|عطيني|وريني|أرني|ارني|عرض|give me|show me|donne[- ]moi|montre[- ]moi)\s+(?:ال)?(?:كود|code|الملف|fichier)|(?:الكود|كود|code)\s+(?:كامل|كاملة|هنا|في الدردشة|في الشات|في المحادثة|كله)|(?:كامل|whole|entier)\s+(?:الكود|code|الملف)/i;

export interface BuildIntentResult {
  build: boolean;
  reason: string;
  /** 0-100: how sure we are this is a full-product request */
  confidence: number;
  /** true when the user asked to see the code itself in the answer */
  codeInChat?: boolean;
}

/**
 * Heuristic, dependency-free, and deliberately conservative: a short question
 * ("واش يعني SaaS؟") must NOT trigger a build, while "سوّي لي متجر إلكتروني
 * كامل بالعربية" must.
 */
export function apexBuildIntent(text: string): BuildIntentResult {
  const t = (text || "").trim();
  if (t.length < 8) return { build: false, reason: "too short", confidence: 0 };

  const verb = BUILD_VERBS.test(t);
  const noun = PRODUCT_NOUNS.test(t);
  const deep = DEEP_QUALIFIERS.test(t);
  const codeInChat = CODE_IN_CHAT.test(t);
  /* a question that merely *mentions* a product is not a build order */
  const question = /^\s*(واش|وش|كيفاش|كيف|علاش|لماذا|شنو|هل|what|how|why|pourquoi|comment)\b/i.test(t);

  let confidence = 0;
  if (verb) confidence += 45;
  if (noun) confidence += 35;
  if (deep) confidence += 18;
  /* "site web complet pour ma boutique" — a product + a "make it real" word is an
     order even with no verb in the sentence (very common in French and Darija) */
  if (noun && deep) confidence += 15;
  if (t.length > 60) confidence += 8;
  if (question && !verb) confidence -= 40;

  const build = !question || verb;
  return {
    /* "عطيني الكود كامل" is a build request that the *model* must answer:
       the engine has nothing to explain then, so the chat path skips it. */
    build: build && confidence >= 55 && !codeInChat,
    reason: [verb ? "verb" : noun && deep ? "combo" : "-", noun ? "noun" : "-", deep ? "deep" : "-", question ? "question" : "-", codeInChat ? "code" : "-"].join("/"),
    confidence: Math.max(0, Math.min(100, confidence)),
    codeInChat,
  };
}

/** Short addendum appended to the system prompt when the engine already built the project. */
export const APEX_BUILT_ADDON = `

[NEXUS APEX v18 — المشروع بُني بالفعل]
المحرّك الحتمي بنى المشروع الكامل (صفحات، بيانات، وحدات، تصميم، PWA) ورفعه على رابط مباشر داخل التطبيق.
قواعد صارمة لهذا الرد:
1. لا تكتب أي كود ولا أي ملف — الكود موجود كامل وجاهز، والكتابة هنا تُعتبر خطأ.
2. اشرح في 8 إلى 14 سطرًا فقط: ماذا بُني، الصفحات الرئيسية، أهم الميزات، وكيف يستعمله صاحب المشروع.
3. اذكر الأرقام الحقيقية (عدد الأسطر، الملفات، الوحدات، سجلات البيانات) كما وردت في بطاقة المشروع.
4. اختم بجملة واحدة تقول كيف يعدّله: الألوان متغيّرات CSS، البيانات ملف JSON، وكل وحدة ملف مستقل.
5. لغة الرد مثل لغة المستخدم (دارجة عربية، فصحى، أو فرنسية).`;

/** Addendum when the user wants the code in the answer itself (STANDALONE). */
export const APEX_COMPLETE_ADDON = `

[عقد الاكتمال — NEXUS v18]
إذا طلب المستخدم موقعًا أو تطبيقًا أو لعبة، فالمطلوب ملف كامل يعمل من أول فتح:
- اكتب الملف كاملًا من أول سطر إلى آخره: لا "…" ولا "باقي الكود"، ولا تعليق يوعد بإكمال لاحق.
- العناصر الأساسية: هيكل HTML كامل، تنسيق داخلي، جافاسكربت حقيقي، بيانات تجريبية عربية، RTL، وحفظ محلي.
- الألعاب: حلقة تحديث حقيقية، تصادم، نقاط، مستويات، صوت أو مؤثرات، تحكم لوحة مفاتيح ولمس.
- كل ما تكتبه يجب أن يبقى صالحًا لو نسخه المستخدم إلى ملف واحد وفتحه في المتصفح.`;
