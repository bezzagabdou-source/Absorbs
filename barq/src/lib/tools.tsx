import {
  ShoppingBag,
  Share2,
  Languages,
  FileText,
  Briefcase,
  Mail,
  GraduationCap,
  Lightbulb,
  MessageCircle,
  Wand2,
  Search,
  Bug,
  BookOpen,
  Repeat,
  ShieldCheck,
  FlaskConical,
  Gamepad2,
  Palette,
  Smartphone,
  LayoutTemplate,
  PenTool,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";

export type L = Record<Locale, string>;

export type ToolField = {
  key: string;
  type: "text" | "textarea" | "select";
  required?: boolean;
  label: L;
  placeholder?: L;
  options?: { value: string; label: L }[];
  /** textarea height / monospace for code inputs */
  rows?: number;
  mono?: boolean;
};

export type ToolDef = {
  id: string;
  icon: LucideIcon;
  accent: "violet" | "cyan" | "emerald" | "amber" | "rose" | "sky";
  name: L;
  desc: L;
  fields: ToolField[];
  /** Pro-only tool (v6) — gated on the server too */
  pro?: boolean;
  /** "game" results get a live preview + download */
  kind?: "text" | "game";
};

const toneOptions = [
  {
    value: "professional",
    label: { ar: "احترافي", fr: "Professionnel", en: "Professional" },
  },
  {
    value: "friendly",
    label: { ar: "ودود", fr: "Amical", en: "Friendly" },
  },
  {
    value: "energetic",
    label: { ar: "حماسي", fr: "Énergique", en: "Energetic" },
  },
];

export const TOOLS: ToolDef[] = [
  {
    id: "product-desc",
    icon: ShoppingBag,
    accent: "violet",
    name: {
      ar: "وصف منتجات يبيع",
      fr: "Descriptions produits",
      en: "Product descriptions",
    },
    desc: {
      ar: "وصف تسويقي مقنع لمنتجاتك مع السعر والتوصيل",
      fr: "Descriptions marketing convaincantes pour vos produits",
      en: "Persuasive marketing descriptions for your products",
    },
    fields: [
      {
        key: "product",
        type: "text",
        required: true,
        label: { ar: "اسم المنتج", fr: "Nom du produit", en: "Product name" },
        placeholder: {
          ar: "مثال: ساعة ذكية X9 Pro",
          fr: "Ex : Montre connectée X9 Pro",
          en: "E.g. X9 Pro smart watch",
        },
      },
      {
        key: "features",
        type: "textarea",
        label: {
          ar: "المميزات والمواصفات",
          fr: "Caractéristiques",
          en: "Features & specs",
        },
        placeholder: {
          ar: "بطارية 10 أيام، شاشة AMOLED، مقاومة للماء…",
          fr: "Batterie 10 jours, écran AMOLED, étanche…",
          en: "10-day battery, AMOLED screen, waterproof…",
        },
      },
      {
        key: "platform",
        type: "select",
        required: true,
        label: { ar: "منصة النشر", fr: "Plateforme", en: "Platform" },
        options: [
          { value: "facebook", label: { ar: "فيسبوك / ماركت بليس", fr: "Facebook / Marketplace", en: "Facebook / Marketplace" } },
          { value: "instagram", label: { ar: "إنستغرام", fr: "Instagram", en: "Instagram" } },
          { value: "store", label: { ar: "متجر إلكتروني", fr: "Boutique en ligne", en: "Online store" } },
          { value: "tiktok", label: { ar: "تيك توك", fr: "TikTok", en: "TikTok" } },
        ],
      },
      {
        key: "tone",
        type: "select",
        required: true,
        label: { ar: "النبرة", fr: "Ton", en: "Tone" },
        options: toneOptions,
      },
    ],
  },
  {
    id: "social-post",
    icon: Share2,
    accent: "sky",
    name: { ar: "منشورات سوشيال ميديا", fr: "Posts réseaux sociaux", en: "Social media posts" },
    desc: {
      ar: "منشورات جذابة مع هاشتاغات و CTA",
      fr: "Des posts accrocheurs avec hashtags et CTA",
      en: "Catchy posts with hashtags and CTAs",
    },
    fields: [
      {
        key: "topic",
        type: "text",
        required: true,
        label: { ar: "موضوع المنشور", fr: "Sujet du post", en: "Post topic" },
        placeholder: {
          ar: "مثال: تخفيضات 30% على العطور نهاية الأسبوع",
          fr: "Ex : -30% sur les parfums ce week-end",
          en: "E.g. 30% off perfumes this weekend",
        },
      },
      {
        key: "platform",
        type: "select",
        required: true,
        label: { ar: "المنصة", fr: "Plateforme", en: "Platform" },
        options: [
          { value: "facebook", label: { ar: "فيسبوك", fr: "Facebook", en: "Facebook" } },
          { value: "instagram", label: { ar: "إنستغرام", fr: "Instagram", en: "Instagram" } },
          { value: "tiktok", label: { ar: "تيك توك", fr: "TikTok", en: "TikTok" } },
          { value: "linkedin", label: { ar: "لينكدإن", fr: "LinkedIn", en: "LinkedIn" } },
        ],
      },
      {
        key: "goal",
        type: "select",
        required: true,
        label: { ar: "الهدف", fr: "Objectif", en: "Goal" },
        options: [
          { value: "sales", label: { ar: "زيادة المبيعات", fr: "Augmenter les ventes", en: "Boost sales" } },
          { value: "engagement", label: { ar: "تفاعل ومتابعين", fr: "Engagement", en: "Engagement" } },
          { value: "announcement", label: { ar: "إعلان / خبر", fr: "Annonce", en: "Announcement" } },
        ],
      },
    ],
  },
  {
    id: "translator",
    icon: Languages,
    accent: "cyan",
    name: { ar: "مترجم الدارجة الذكي", fr: "Traducteur darija", en: "Darija translator" },
    desc: {
      ar: "ترجمة بين الدارجة والفصحى والفرنسية والإنجليزية",
      fr: "Traduction entre darija, arabe, français et anglais",
      en: "Translate between Darija, Arabic, French and English",
    },
    fields: [
      {
        key: "text",
        type: "textarea",
        required: true,
        label: { ar: "النص", fr: "Texte", en: "Text" },
        placeholder: {
          ar: "الصق النص هنا…",
          fr: "Collez le texte ici…",
          en: "Paste the text here…",
        },
      },
      {
        key: "direction",
        type: "select",
        required: true,
        label: { ar: "اتجاه الترجمة", fr: "Direction", en: "Direction" },
        options: [
          { value: "dz-ar", label: { ar: "دارجة ← فصحى", fr: "Darija → Arabe", en: "Darija → Arabic" } },
          { value: "ar-dz", label: { ar: "فصحى ← دارجة", fr: "Arabe → Darija", en: "Arabic → Darija" } },
          { value: "dz-fr", label: { ar: "دارجة ← فرنسية", fr: "Darija → Français", en: "Darija → French" } },
          { value: "fr-dz", label: { ar: "فرنسية ← دارجة", fr: "Français → Darija", en: "French → Darija" } },
          { value: "dz-en", label: { ar: "دارجة ← إنجليزية", fr: "Darija → Anglais", en: "Darija → English" } },
          { value: "en-dz", label: { ar: "إنجليزية ← دارجة", fr: "Anglais → Darija", en: "English → Darija" } },
        ],
      },
    ],
  },
  {
    id: "summarizer",
    icon: FileText,
    accent: "emerald",
    name: { ar: "ملخص النصوص", fr: "Résumé de textes", en: "Text summarizer" },
    desc: {
      ar: "لخّص المقالات والدروس والوثائق في ثوانٍ",
      fr: "Résumez articles, cours et documents en secondes",
      en: "Summarize articles, lessons and documents in seconds",
    },
    fields: [
      {
        key: "text",
        type: "textarea",
        required: true,
        label: { ar: "النص الطويل", fr: "Texte long", en: "Long text" },
        placeholder: {
          ar: "الصق المقال أو الدرس هنا…",
          fr: "Collez l'article ou le cours ici…",
          en: "Paste the article or lesson here…",
        },
      },
      {
        key: "style",
        type: "select",
        required: true,
        label: { ar: "شكل الملخص", fr: "Format", en: "Format" },
        options: [
          { value: "short", label: { ar: "فقرة قصيرة", fr: "Paragraphe court", en: "Short paragraph" } },
          { value: "bullets", label: { ar: "نقاط رئيسية", fr: "Points clés", en: "Bullet points" } },
          { value: "detailed", label: { ar: "ملخص مفصّل", fr: "Résumé détaillé", en: "Detailed summary" } },
        ],
      },
    ],
  },
  {
    id: "cv-builder",
    icon: Briefcase,
    accent: "amber",
    name: { ar: "منشئ السيرة الذاتية", fr: "Créateur de CV", en: "CV builder" },
    desc: {
      ar: "محتوى CV احترافي جاهز للنسخ",
      fr: "Contenu de CV professionnel prêt à copier",
      en: "Professional CV content ready to copy",
    },
    fields: [
      {
        key: "fullName",
        type: "text",
        required: true,
        label: { ar: "الاسم الكامل", fr: "Nom complet", en: "Full name" },
      },
      {
        key: "targetJob",
        type: "text",
        required: true,
        label: { ar: "الوظيفة المستهدفة", fr: "Poste visé", en: "Target job" },
        placeholder: {
          ar: "مثال: بائع في متجر / محاسب / مطور ويب",
          fr: "Ex : vendeur / comptable / développeur web",
          en: "E.g. salesman / accountant / web developer",
        },
      },
      {
        key: "experience",
        type: "textarea",
        label: { ar: "الخبرات السابقة", fr: "Expériences", en: "Experience" },
        placeholder: {
          ar: "سنتين بائع في محل ملابس، 6 أشهر كاشير…",
          fr: "2 ans vendeur, 6 mois caissier…",
          en: "2 years salesman, 6 months cashier…",
        },
      },
      {
        key: "skills",
        type: "textarea",
        required: true,
        label: { ar: "المهارات والدراسة", fr: "Compétences & études", en: "Skills & education" },
        placeholder: {
          ar: "باكالوريا 2023، إجادة الفرنسية، الحاسوب…",
          fr: "BAC 2023, français courant, informatique…",
          en: "BAC 2023, fluent French, computer skills…",
        },
      },
    ],
  },
  {
    id: "email-writer",
    icon: Mail,
    accent: "rose",
    name: { ar: "كاتب الإيميلات المهنية", fr: "Rédacteur d'e-mails", en: "E-mail writer" },
    desc: {
      ar: "إيميلات رسمية مقنعة بالفرنسية أو الإنجليزية",
      fr: "E-mails formels convaincants en français ou anglais",
      en: "Persuasive formal e-mails in French or English",
    },
    fields: [
      {
        key: "purpose",
        type: "text",
        required: true,
        label: { ar: "الغرض من الإيميل", fr: "Objet de l'e-mail", en: "E-mail purpose" },
        placeholder: {
          ar: "مثال: طلب وظيفة، اعتذار، استفسار عن خدمة…",
          fr: "Ex : candidature, excuse, demande d'info…",
          en: "E.g. job application, apology, inquiry…",
        },
      },
      {
        key: "recipient",
        type: "text",
        label: { ar: "المرسل إليه", fr: "Destinataire", en: "Recipient" },
        placeholder: {
          ar: "مثال: مدير الموارد البشرية في شركة X",
          fr: "Ex : RH de l'entreprise X",
          en: "E.g. HR manager at company X",
        },
      },
      {
        key: "details",
        type: "textarea",
        label: { ar: "تفاصيل إضافية", fr: "Détails", en: "Details" },
      },
    ],
  },
  {
    id: "bac-assistant",
    icon: GraduationCap,
    accent: "violet",
    name: { ar: "مساعد الباك والدراسة", fr: "Assistant BAC", en: "Study assistant" },
    desc: {
      ar: "شروحات وتمارين لكل الشعب والمواد",
      fr: "Cours et exercices pour toutes les filières",
      en: "Lessons and exercises for all streams",
    },
    fields: [
      {
        key: "subject",
        type: "text",
        required: true,
        label: { ar: "المادة", fr: "Matière", en: "Subject" },
        placeholder: {
          ar: "مثال: رياضيات، فيزياء، علوم طبيعية…",
          fr: "Ex : maths, physique, SVT…",
          en: "E.g. math, physics, biology…",
        },
      },
      {
        key: "stream",
        type: "select",
        required: true,
        label: { ar: "الشعبة", fr: "Filière", en: "Stream" },
        options: [
          { value: "science", label: { ar: "علوم تجريبية", fr: "Sciences expérimentales", en: "Experimental sciences" } },
          { value: "math", label: { ar: "رياضيات", fr: "Mathématiques", en: "Mathematics" } },
          { value: "tech", label: { ar: "تقني رياضي", fr: "Technique math", en: "Technical math" } },
          { value: "eco", label: { ar: "تسيير واقتصاد", fr: "Gestion & économie", en: "Management & economics" } },
          { value: "lit", label: { ar: "آداب وفلسفة", fr: "Lettres & philosophie", en: "Literature & philosophy" } },
          { value: "lang", label: { ar: "لغات أجنبية", fr: "Langues étrangères", en: "Foreign languages" } },
          { value: "other", label: { ar: "أخرى / متوسط", fr: "Autre / collège", en: "Other / middle school" } },
        ],
      },
      {
        key: "topic",
        type: "text",
        required: true,
        label: { ar: "الدرس أو الموضوع", fr: "Leçon / sujet", en: "Lesson / topic" },
        placeholder: {
          ar: "مثال: الدوال الأسية، الحركة الدائرية…",
          fr: "Ex : fonctions exponentielles…",
          en: "E.g. exponential functions…",
        },
      },
      {
        key: "mode",
        type: "select",
        required: true,
        label: { ar: "ماذا تريد؟", fr: "Que voulez-vous ?", en: "What do you need?" },
        options: [
          { value: "explain", label: { ar: "شرح مبسّط للدرس", fr: "Explication simple", en: "Simple explanation" } },
          { value: "exercises", label: { ar: "تمارين محلولة", fr: "Exercices corrigés", en: "Solved exercises" } },
          { value: "quiz", label: { ar: "اختبار قصير", fr: "Quiz rapide", en: "Quick quiz" } },
          { value: "summary", label: { ar: "ملخص للمراجعة", fr: "Fiche de révision", en: "Revision sheet" } },
        ],
      },
    ],
  },
  {
    id: "business-ideas",
    icon: Lightbulb,
    accent: "amber",
    name: { ar: "مولد أفكار المشاريع", fr: "Idées de business", en: "Business ideas" },
    desc: {
      ar: "أفكار مشاريع واقعية حسب رأس مالك",
      fr: "Idées de projets réalistes selon votre budget",
      en: "Realistic project ideas for your budget",
    },
    fields: [
      {
        key: "budget",
        type: "text",
        required: true,
        label: { ar: "رأس المال (دج)", fr: "Budget (DA)", en: "Budget (DZD)" },
        placeholder: { ar: "مثال: 50 ألف، 30 مليون سنتيم…", fr: "Ex : 50 000, 3 millions…", en: "E.g. 50,000, 3,000,000…" },
      },
      {
        key: "interests",
        type: "textarea",
        label: { ar: "اهتماماتك (اختياري)", fr: "Centres d'intérêt", en: "Interests (optional)" },
        placeholder: {
          ar: "مثال: الطبخ، التكنولوجيا، الموضة…",
          fr: "Ex : cuisine, tech, mode…",
          en: "E.g. cooking, tech, fashion…",
        },
      },
    ],
  },
  {
    id: "customer-reply",
    icon: MessageCircle,
    accent: "cyan",
    name: { ar: "ردود الزبائن الجاهزة", fr: "Réponses clients", en: "Customer replies" },
    desc: {
      ar: "ردود احترافية على رسائل زبائنك",
      fr: "Réponses professionnelles aux messages clients",
      en: "Professional replies to customer messages",
    },
    fields: [
      {
        key: "message",
        type: "textarea",
        required: true,
        label: { ar: "رسالة الزبون", fr: "Message du client", en: "Customer message" },
        placeholder: {
          ar: "مثال: السلعة وصلتني معيبة، واش ندير؟",
          fr: "Ex : produit défectueux, que faire ?",
          en: "E.g. the product arrived defective…",
        },
      },
      {
        key: "context",
        type: "text",
        label: { ar: "نوع متجرك / منتجك", fr: "Votre boutique / produit", en: "Your store / product" },
        placeholder: {
          ar: "مثال: متجر عطور أونلاين",
          fr: "Ex : boutique de parfums en ligne",
          en: "E.g. online perfume store",
        },
      },
    ],
  },
  {
    id: "rewriter",
    icon: Wand2,
    accent: "rose",
    name: { ar: "تحسين وإعادة صياغة", fr: "Réécriture de textes", en: "Text rewriter" },
    desc: {
      ar: "حسّن أي نص: أقوى، أبسط، أو أكثر احترافية",
      fr: "Améliorez tout texte : plus fort, simple ou pro",
      en: "Improve any text: stronger, simpler, more pro",
    },
    fields: [
      {
        key: "text",
        type: "textarea",
        required: true,
        label: { ar: "النص", fr: "Texte", en: "Text" },
      },
      {
        key: "style",
        type: "select",
        required: true,
        label: { ar: "الأسلوب المطلوب", fr: "Style souhaité", en: "Desired style" },
        options: [
          { value: "stronger", label: { ar: "أقوى وأكثر إقناعًا", fr: "Plus percutant", en: "Stronger & persuasive" } },
          { value: "simpler", label: { ar: "أبسط وأوضح", fr: "Plus simple", en: "Simpler & clearer" } },
          { value: "formal", label: { ar: "أكثر احترافية ورسمية", fr: "Plus formel", en: "More formal" } },
          { value: "shorter", label: { ar: "أقصر", fr: "Plus court", en: "Shorter" } },
          { value: "longer", label: { ar: "أطول وأكثر تفصيلًا", fr: "Plus détaillé", en: "Longer & detailed" } },
        ],
      },
    ],
  },
];


/** v6 Pro tools — code analysis + game creation. Not listed on public SEO pages. */
export const PRO_TOOLS: ToolDef[] = [
  {
    id: "code-review",
    icon: Search,
    accent: "emerald",
    pro: true,
    name: { ar: "مراجعة الكود", fr: "Revue de code", en: "Code review" },
    desc: { ar: "مراجعة احترافية: أخطاء، أداء، وكود محسّن جاهز", fr: "Revue pro : bugs, performance et code amélioré", en: "Pro review: bugs, performance and an improved version" },
    fields: [
      {
        key: "language",
        type: "text",
        label: { ar: "لغة البرمجة (اختياري)", fr: "Langage (optionnel)", en: "Language (optional)" },
        placeholder: { ar: "مثال: JavaScript، Python، PHP…", fr: "Ex : JavaScript, Python, PHP…", en: "E.g. JavaScript, Python, PHP…" },
      },
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
      {
        key: "focus",
        type: "text",
        label: { ar: "تركيز المراجعة (اختياري)", fr: "Focus (optionnel)", en: "Review focus (optional)" },
        placeholder: { ar: "مثال: الأداء، الأمان، قابلية القراءة", fr: "Ex : performance, sécurité", en: "E.g. performance, security, readability" },
      },
    ],
  },
  {
    id: "bug-fixer",
    icon: Bug,
    accent: "emerald",
    pro: true,
    name: { ar: "مصلح الأخطاء", fr: "Correcteur de bugs", en: "Bug fixer" },
    desc: { ar: "ألصق الكود والخطأ ونجيبلك السبب والحل", fr: "Collez le code et l'erreur, on trouve la cause", en: "Paste code + error, get the root cause and fix" },
    fields: [
      {
        key: "language",
        type: "text",
        label: { ar: "لغة البرمجة (اختياري)", fr: "Langage (optionnel)", en: "Language (optional)" },
        placeholder: { ar: "مثال: JavaScript، Python، PHP…", fr: "Ex : JavaScript, Python, PHP…", en: "E.g. JavaScript, Python, PHP…" },
      },
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
      {
        key: "error",
        type: "textarea",
        rows: 3,
        label: { ar: "رسالة الخطأ / المشكل", fr: "Message d'erreur / problème", en: "Error message / problem" },
        placeholder: { ar: "ماذا يحدث بدل المتوقع؟", fr: "Que se passe-t-il au lieu du résultat attendu ?", en: "What happens instead of what you expect?" },
      },
    ],
  },
  {
    id: "code-explainer",
    icon: BookOpen,
    accent: "emerald",
    pro: true,
    name: { ar: "شرح الكود", fr: "Explication de code", en: "Code explainer" },
    desc: { ar: "افهم أي كود سطرًا بسطر بمستواك", fr: "Comprenez n'importe quel code, ligne par ligne", en: "Understand any code, step by step at your level" },
    fields: [
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
      {
        key: "level",
        type: "select",
        required: true,
        label: { ar: "مستواك", fr: "Votre niveau", en: "Your level" },
        options: [
          { value: "beginner", label: { ar: "مبتدئ", fr: "Débutant", en: "Beginner" } },
          { value: "intermediate", label: { ar: "متوسط", fr: "Intermédiaire", en: "Intermediate" } },
          { value: "expert", label: { ar: "خبير", fr: "Expert", en: "Expert" } },
        ],
      },
    ],
  },
  {
    id: "code-converter",
    icon: Repeat,
    accent: "emerald",
    pro: true,
    name: { ar: "محوّل لغات البرمجة", fr: "Convertisseur de code", en: "Code converter" },
    desc: { ar: "حوّل الكود من لغة لأخرى بأسلوبها الصحيح", fr: "Portez le code vers un autre langage, de façon idiomatique", en: "Port code to another language, idiomatically" },
    fields: [
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
      {
        key: "target",
        type: "text",
        required: true,
        label: { ar: "اللغة / الإطار المطلوب", fr: "Langage / framework cible", en: "Target language / framework" },
        placeholder: { ar: "مثال: Python، TypeScript، Go", fr: "Ex : Python, TypeScript, Go", en: "E.g. Python, TypeScript, Go" },
      },
    ],
  },
  {
    id: "security-audit",
    icon: ShieldCheck,
    accent: "emerald",
    pro: true,
    name: { ar: "فحص أمان الكود", fr: "Audit de sécurité", en: "Security audit" },
    desc: { ar: "اكتشف الثغرات في كودك وصلّحها قبل ما تنشره", fr: "Repérez les failles de votre code avant de publier", en: "Find vulnerabilities in your own code before shipping" },
    fields: [
      {
        key: "language",
        type: "text",
        label: { ar: "لغة البرمجة (اختياري)", fr: "Langage (optionnel)", en: "Language (optional)" },
        placeholder: { ar: "مثال: JavaScript، Python، PHP…", fr: "Ex : JavaScript, Python, PHP…", en: "E.g. JavaScript, Python, PHP…" },
      },
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
    ],
  },
  {
    id: "test-writer",
    icon: FlaskConical,
    accent: "emerald",
    pro: true,
    name: { ar: "كاتب الاختبارات", fr: "Générateur de tests", en: "Test writer" },
    desc: { ar: "اختبارات جاهزة للتشغيل لأي دالة أو ملف", fr: "Des tests prêts à lancer pour votre code", en: "Ready-to-run tests for any function or file" },
    fields: [
      {
        key: "code",
        type: "textarea",
        required: true,
        mono: true,
        rows: 10,
        label: { ar: "الكود", fr: "Code", en: "Code" },
        placeholder: { ar: "ألصق الكود هنا…", fr: "Collez le code ici…", en: "Paste your code here…" },
      },
      {
        key: "framework",
        type: "text",
        label: { ar: "إطار الاختبار (اختياري)", fr: "Framework de test (optionnel)", en: "Test framework (optional)" },
        placeholder: { ar: "مثال: Jest، pytest، PHPUnit", fr: "Ex : Jest, pytest, PHPUnit", en: "E.g. Jest, pytest, PHPUnit" },
      },
    ],
  },
  {
    id: "game-builder",
    icon: Gamepad2,
    accent: "emerald",
    pro: true,
    kind: "game",
    name: { ar: "صانع الألعاب", fr: "Créateur de jeux", en: "Game builder" },
    desc: { ar: "اوصف فكرتك ونصنعولك لعبة كاملة تلعبها مباشرة", fr: "Décrivez votre idée : un jeu complet jouable tout de suite", en: "Describe your idea — get a full playable game, instantly" },
    fields: [
      {
        key: "idea",
        type: "textarea",
        required: true,
        rows: 3,
        label: { ar: "فكرة اللعبة", fr: "Idée du jeu", en: "Game idea" },
        placeholder: { ar: "مثال: لعبة سيارة تتفادى العوائق في طرقات الجزائر", fr: "Ex : une voiture qui évite les obstacles", en: "E.g. a car dodging obstacles on a desert road" },
      },
      {
        key: "genre",
        type: "select",
        required: true,
        label: { ar: "النوع", fr: "Genre", en: "Genre" },
        options: [
          { value: "arcade", label: { ar: "أركيد", fr: "Arcade", en: "Arcade" } },
          { value: "platformer", label: { ar: "منصّات", fr: "Plateforme", en: "Platformer" } },
          { value: "shooter", label: { ar: "إطلاق نار", fr: "Shooter", en: "Shooter" } },
          { value: "puzzle", label: { ar: "ألغاز", fr: "Puzzle", en: "Puzzle" } },
          { value: "racing", label: { ar: "سباق / جري", fr: "Course / runner", en: "Racing / runner" } },
          { value: "memory", label: { ar: "ذاكرة", fr: "Mémoire", en: "Memory" } },
          { value: "quiz", label: { ar: "أسئلة وأجوبة", fr: "Quiz", en: "Quiz" } },
          { value: "snake", label: { ar: "ثعبان / شبكة", fr: "Snake / grille", en: "Snake / grid" } },
        ],
      },
      {
        key: "difficulty",
        type: "select",
        label: { ar: "الصعوبة", fr: "Difficulté", en: "Difficulty" },
        options: [
          { value: "easy", label: { ar: "سهلة", fr: "Facile", en: "Easy" } },
          { value: "medium", label: { ar: "متوسطة", fr: "Moyenne", en: "Medium" } },
          { value: "hard", label: { ar: "صعبة", fr: "Difficile", en: "Hard" } },
        ],
      },
      {
        key: "features",
        type: "textarea",
        rows: 3,
        label: { ar: "ميزات إضافية (اختياري)", fr: "Options (optionnel)", en: "Extra features (optional)" },
        placeholder: { ar: "مثال: مستويات، أعداء أقوياء، نقاط خاصة", fr: "Ex : niveaux, boss, bonus", en: "E.g. levels, bosses, power-ups" },
      },
    ],
  },
  {
    id: "wallpaper-designer",
    icon: Palette,
    accent: "violet",
    pro: true,
    kind: "game",
    name: { ar: "مصمم الخلفيات", fr: "Créateur de fonds d'écran", en: "Wallpaper designer" },
    desc: { ar: "خلفيات متحركة فخمة لهاتفك وحاسوبك", fr: "Fonds d'écran animés haut de gamme", en: "Premium animated wallpapers" },
    fields: [
      {
        key: "idea",
        type: "textarea",
        required: true,
        rows: 3,
        label: { ar: "وصف الفكرة", fr: "Description", en: "Your idea" },
        placeholder: { ar: "مثال: سماء ليلية فوق الصحراء مع نجوم تتلألأ", fr: "Décrivez votre idée", en: "Describe what you want" },
      },
      {
        key: "style",
        type: "text",
        label: { ar: "الأسلوب والمزاج (اختياري)", fr: "Style (optionnel)", en: "Style & mood (optional)" },
        placeholder: { ar: "مثال: هادئ، سينمائي، حالم", fr: "Ex : minimal, sombre, luxe", en: "E.g. minimal, dark, luxury" },
      },
      {
        key: "colors",
        type: "text",
        label: { ar: "الألوان (اختياري)", fr: "Couleurs (optionnel)", en: "Colors (optional)" },
        placeholder: { ar: "مثال: أخضر زمردي وذهبي", fr: "Ex : vert émeraude et or", en: "E.g. emerald and gold" },
      },
    ],
  },
  {
    id: "ui-designer",
    icon: Smartphone,
    accent: "cyan",
    pro: true,
    kind: "game",
    name: { ar: "مصمم الواجهات", fr: "Designer d'interfaces", en: "UI designer" },
    desc: { ar: "واجهات تطبيقات عصرية جاهزة للمعاينة", fr: "Écrans d'app modernes, prévisualisés", en: "Modern app screens with live preview" },
    fields: [
      {
        key: "idea",
        type: "textarea",
        required: true,
        rows: 3,
        label: { ar: "وصف الفكرة", fr: "Description", en: "Your idea" },
        placeholder: { ar: "مثال: شاشة تطبيق توصيل طعام في الجزائر", fr: "Décrivez votre idée", en: "Describe what you want" },
      },
      {
        key: "style",
        type: "text",
        label: { ar: "الأسلوب والمزاج (اختياري)", fr: "Style (optionnel)", en: "Style & mood (optional)" },
        placeholder: { ar: "مثال: عصري، زجاجي، دافئ", fr: "Ex : minimal, sombre, luxe", en: "E.g. minimal, dark, luxury" },
      },
      {
        key: "colors",
        type: "text",
        label: { ar: "الألوان (اختياري)", fr: "Couleurs (optionnel)", en: "Colors (optional)" },
        placeholder: { ar: "مثال: أخضر زمردي وذهبي", fr: "Ex : vert émeraude et or", en: "E.g. emerald and gold" },
      },
    ],
  },
  {
    id: "landing-builder",
    icon: LayoutTemplate,
    accent: "amber",
    pro: true,
    kind: "game",
    name: { ar: "صانع صفحات الهبوط", fr: "Créateur de landing pages", en: "Landing page builder" },
    desc: { ar: "صفحة هبوط كاملة تبيع منتجك", fr: "Une landing page complète qui vend", en: "A full landing page that sells" },
    fields: [
      {
        key: "idea",
        type: "textarea",
        required: true,
        rows: 3,
        label: { ar: "وصف الفكرة", fr: "Description", en: "Your idea" },
        placeholder: { ar: "مثال: متجر ملابس رياضية بالدفع عند الاستلام", fr: "Décrivez votre idée", en: "Describe what you want" },
      },
      {
        key: "style",
        type: "text",
        label: { ar: "الأسلوب والمزاج (اختياري)", fr: "Style (optionnel)", en: "Style & mood (optional)" },
        placeholder: { ar: "مثال: جريء، نظيف، فاخر", fr: "Ex : minimal, sombre, luxe", en: "E.g. minimal, dark, luxury" },
      },
      {
        key: "colors",
        type: "text",
        label: { ar: "الألوان (اختياري)", fr: "Couleurs (optionnel)", en: "Colors (optional)" },
        placeholder: { ar: "مثال: أخضر زمردي وذهبي", fr: "Ex : vert émeraude et or", en: "E.g. emerald and gold" },
      },
    ],
  },
  {
    id: "logo-designer",
    icon: PenTool,
    accent: "rose",
    pro: true,
    kind: "game",
    name: { ar: "مصمم الشعارات", fr: "Designer de logos", en: "Logo designer" },
    desc: { ar: "شعار احترافي مع لوحة ألوان وعرض كامل", fr: "Logo pro avec palette et présentation", en: "Pro logo with palette and presentation" },
    fields: [
      {
        key: "idea",
        type: "textarea",
        required: true,
        rows: 3,
        label: { ar: "وصف الفكرة", fr: "Description", en: "Your idea" },
        placeholder: { ar: "مثال: مقهى عصري اسمه «دزاير بيت»", fr: "Décrivez votre idée", en: "Describe what you want" },
      },
      {
        key: "style",
        type: "text",
        label: { ar: "الأسلوب والمزاج (اختياري)", fr: "Style (optionnel)", en: "Style & mood (optional)" },
        placeholder: { ar: "مثال: بسيط، هندسي، عربي معاصر", fr: "Ex : minimal, sombre, luxe", en: "E.g. minimal, dark, luxury" },
      },
      {
        key: "colors",
        type: "text",
        label: { ar: "الألوان (اختياري)", fr: "Couleurs (optionnel)", en: "Colors (optional)" },
        placeholder: { ar: "مثال: أخضر زمردي وذهبي", fr: "Ex : vert émeraude et or", en: "E.g. emerald and gold" },
      },
    ],
  },
];

export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id) ?? PRO_TOOLS.find((t) => t.id === id);
}

export function loc(l: L, locale: Locale): string {
  return l[locale] ?? l.ar;
}
