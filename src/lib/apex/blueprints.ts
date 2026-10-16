/**
 * NEXUS APEX — blueprints.
 *
 * A blueprint is a whole product shape: which widget modules it needs, which
 * pages it has, what the hero says, which datasets it ships, and which optional
 * modules its features can pull in. The composer turns a plan + blueprint into a
 * complete, working, multi-file project.
 */

export type ProjectKind =
  | "site"
  | "app"
  | "shop"
  | "game"
  | "edu"
  | "docs"
  | "health"
  | "travel"
  | "finance"
  | "realestate"
  | "restaurant"
  | "portfolio"
  | "blog"
  | "crm"
  | "support"
  | "admin"
  | "lms"
  | "clinic"
  | "landing";

export interface HostSpec {
  /** which widget module mounts here */
  apex: string;
  /** extra configuration passed to the module (dataset key, mode, …) */
  cfg?: Record<string, string | number | boolean>;
}

export interface PageSpec {
  id: string;
  title: string;
  icon: string;
  hosts: HostSpec[];
}

export interface SectionSpec {
  id: string;
  title: string;
  body: string;
  icon?: string;
  /** optional widget mounted inside the section */
  apex?: string;
}

export interface ApexBlueprint {
  id: string;
  label: string;
  kind: ProjectKind;
  /** required widget modules */
  modules: string[];
  /** feature → extra modules */
  features: Record<string, string[]>;
  dataKinds: string[];
  pages: PageSpec[];
  hero: { title: string; sub: string; cta: string; cta2?: string };
  sections: SectionSpec[];
  /** short pitch used by the model-facing spec */
  pitch: string;
  /** seed keywords that route a request to this blueprint */
  keywords: string[];
}

const KPI = (hosts: HostSpec[] = []): HostSpec[] => hosts;

export const BLUEPRINTS: ApexBlueprint[] = [
  /* ------------------------------------------------------------------ SaaS */
  {
    id: "saas-dashboard",
    label: "منصّة/لوحة تحكم",
    kind: "app",
    modules: ["kernel", "router", "theme", "store", "charts", "datagrid", "forms", "search", "auth-ui", "notify", "settings", "perf"],
    features: {
      billing: ["billing", "invoice"],
      team: ["crm", "tasks"],
      tickets: ["support", "chat"],
      reports: ["report"],
      calendar: ["calendar"],
      map: ["mapsvg"],
      files: ["media"],
    },
    dataKinds: ["subscriptions", "customers", "transactions", "plans", "tasks", "tickets"],
    pages: [
      { id: "overview", title: "النظرة العامة", icon: "📊", hosts: [{ apex: "kpi" }, { apex: "charts", cfg: { mode: "revenue" } }, { apex: "datagrid", cfg: { data: "subscriptions" } }] },
      { id: "customers", title: "العملاء", icon: "👥", hosts: [{ apex: "datagrid", cfg: { data: "customers", editable: true } }] },
      { id: "billing", title: "الفوترة", icon: "💳", hosts: [{ apex: "billing" }, { apex: "invoice" }] },
      { id: "team", title: "الفريق", icon: "🧑‍💻", hosts: [{ apex: "crm" }, { apex: "tasks" }] },
      { id: "settings", title: "الإعدادات", icon: "⚙️", hosts: [{ apex: "settings" }, { apex: "auth-ui", cfg: { mode: "security" } }] },
    ],
    hero: { title: "منصة واحدة تدير كل عملك", sub: "بيانات حقيقية، تقارير فورية، وفريق متكامل — بلا تعقيد وبلا مكاتب خارجية.", cta: "ابدأ الآن", cta2: "شاهد العرض" },
    sections: [
      { id: "why", title: "لماذا هذه المنصة؟", body: "كل ما تحتاجه في مكان واحد: عملاء، فواتير، تقارير، مهام، ودعم.", apex: "features" },
      { id: "numbers", title: "أرقام تتكلم", body: "مؤشرات حية مبنية على بيانات المشروع نفسه.", apex: "kpi" },
      { id: "pricing", title: "خطط واضحة", body: "ابدأ مجانًا وكبّر عندما تكبر — بلا التزام.", apex: "pricing" },
    ],
    pitch: "لوحة تحكم كاملة: KPIs، رسوم بيانية، جداول قابلة للتعديل، فوترة، فريق، إعدادات.",
    keywords: ["لوحة تحكم", "dashboard", "saas", "admin", "تحليل", "analytics", "نظام إدارة", "systeme de gestion", "billing", "اشتراكات"],
  },
  /* ------------------------------------------------------------ ecommerce */
  {
    id: "ecommerce",
    label: "متجر إلكتروني",
    kind: "shop",
    modules: ["kernel", "router", "theme", "store", "shop", "cart", "checkout", "payments", "orders", "wishlist", "compare", "reviews", "search-filters", "search", "notify", "pwa"],
    features: {
      courier: ["shipping-dz"],
      inventory: ["inventory"],
      pos: ["pos"],
      blog: ["posts"],
      support: ["support"],
      loyalty: ["loyalty"],
    },
    dataKinds: ["products", "orders", "customers", "wilayas", "communes"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🏠", hosts: [{ apex: "hero-shop" }, { apex: "shop", cfg: { mode: "grid" } }, { apex: "features" }] },
      { id: "catalog", title: "المنتجات", icon: "🛍️", hosts: [{ apex: "search-filters" }, { apex: "shop", cfg: { mode: "catalog" } }] },
      { id: "product", title: "تفاصيل المنتج", icon: "🔍", hosts: [{ apex: "product" }, { apex: "reviews" }, { apex: "compare" }] },
      { id: "cart", title: "السلة", icon: "🧺", hosts: [{ apex: "cart" }, { apex: "shipping-dz" }] },
      { id: "checkout", title: "إتمام الطلب", icon: "✅", hosts: [{ apex: "checkout" }, { apex: "payments" }] },
      { id: "orders", title: "طلباتي", icon: "📦", hosts: [{ apex: "orders" }, { apex: "invoice" }] },
      { id: "account", title: "حسابي", icon: "👤", hosts: [{ apex: "auth-ui" }, { apex: "wishlist" }] },
      { id: "help", title: "المساعدة", icon: "💬", hosts: [{ apex: "faq" }, { apex: "support" }] },
    ],
    hero: { title: "كل ما تحتاجه… ويوصلك لبابك", sub: "توصيل إلى 58 ولاية، دفع عند التسليم أو بالبطاقة، وإرجاع مجاني داخل 7 أيام.", cta: "تسوّق الآن", cta2: "تتبع طلبك" },
    sections: [
      { id: "cats", title: "تصنيفات", body: "ابحث بالتصنيف أو بالولاية أو بالسعر.", apex: "categories" },
      { id: "why", title: "ليه تشري من عندنا؟", body: "أسعار مباشرة من المورد، ضمان حقيقي، ودعم بالعربية.", apex: "features" },
      { id: "reviews", title: "آراء العملاء", body: "تقييمات حقيقية من مشترين سابقين.", apex: "reviews" },
      { id: "ship", title: "التوصيل والدفع", body: "الجزائر: 400 دج للمكتب، 700 دج للمنزل، مجاني فوق 12000 دج.", apex: "shipping-dz" },
      { id: "faq", title: "أسئلة متكررة", body: "أجوبة سريعة على أكثر ما يُسأل.", apex: "faq" },
    ],
    pitch: "متجر إلكتروني كامل: كتالوج، سلة، كوبونات، توصيل 58 ولاية، دفع، طلبات، فواتير، تقييمات.",
    keywords: ["متجر", "shop", "store", "ecommerce", "بيع", "تسوق", "منتجات", "أزياء", "إلكترونيات", "بقالة", "بوتيك", "boutique", "سلة"],
  },
  /* -------------------------------------------------------------- landing */
  {
    id: "landing",
    label: "صفحة هبوط",
    kind: "landing",
    modules: ["kernel", "router", "theme", "motion", "notify", "seo"],
    features: { forms: ["forms"], proof: ["testimonials"], pricing: ["pricing"], faq: ["faq"], blog: ["posts"], support: ["support"], pwa: ["pwa"] },
    dataKinds: ["plans", "posts"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🚀", hosts: [{ apex: "hero" }, { apex: "features" }, { apex: "pricing" }, { apex: "testimonials" }, { apex: "faq" }, { apex: "contact" }] },
      { id: "pricing", title: "الأسعار", icon: "💰", hosts: [{ apex: "pricing" }, { apex: "faq" }] },
      { id: "contact", title: "اتصل بنا", icon: "✉️", hosts: [{ apex: "contact" }, { apex: "forms", cfg: { form: "contact" } }] },
    ],
    hero: { title: "فكرة واضحة… وتنفيذ أسرع", sub: "صفحة واحدة تقنع زائرك وتحوّله إلى عميل، بلا تعقيد وبلا ميزانية إعلانات.", cta: "اطلب عرضًا", cta2: "كيف نعمل" },
    sections: [
      { id: "problem", title: "المشكلة", body: "زوار كثر ومبيعات قليلة؟ السبب غالبًا رسالة غير واضحة ومسار طويل.", icon: "🎯" },
      { id: "how", title: "كيف نعمل", body: "ثلاث خطوات: نفهم، نبني، نقيس — ثم نحسّن بالأرقام.", apex: "steps" },
      { id: "pricing", title: "الأسعار", body: "شفافية كاملة، بلا تكاليف خفية.", apex: "pricing" },
      { id: "faq", title: "أسئلة متكررة", body: "كل ما يسأله العميل قبل أن يشتري.", apex: "faq" },
    ],
    pitch: "صفحة هبوط عالية التحويل: هيرو، مزايا، أسعار، آراء، أسئلة، نموذج تواصل.",
    keywords: ["landing", "صفحة هبوط", "صفحة تعريفية", "موقع تعريفي", "خدمات", "وكالة", "شركة", "تعريف"],
  },
  /* ------------------------------------------------------------ portfolio */
  {
    id: "portfolio",
    label: "موقع شخصي/بورتفوليو",
    kind: "portfolio",
    modules: ["kernel", "router", "theme", "motion", "gallery", "posts", "contact-form", "notify", "seo"],
    features: { blog: ["posts"], shop: ["shop"] },
    dataKinds: ["posts"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🌟", hosts: [{ apex: "hero-portfolio" }, { apex: "gallery", cfg: { mode: "work" } }, { apex: "features" }] },
      { id: "work", title: "أعمالي", icon: "🎨", hosts: [{ apex: "gallery", cfg: { mode: "all" } }] },
      { id: "about", title: "عني", icon: "🙋", hosts: [{ apex: "about" }, { apex: "skills" }] },
      { id: "blog", title: "مقالاتي", icon: "✍️", hosts: [{ apex: "posts" }] },
      { id: "contact", title: "تواصل", icon: "📮", hosts: [{ apex: "contact-form" }] },
    ],
    hero: { title: "أصمّم وأبني تجارب رقمية نظيفة", sub: "مصمّم ومطوّر واجهات — أعمال مختارة، وطريقة عمل واضحة.", cta: "شاهد أعمالي", cta2: "أرسل رسالة" },
    sections: [
      { id: "work", title: "أعمال مختارة", body: "مشاريع حقيقية مع وصف الدور والنتيجة.", apex: "gallery" },
      { id: "services", title: "الخدمات", body: "تصميم واجهات، تطوير واجهة أمامية، تحسين أداء.", apex: "features" },
      { id: "blog", title: "آخر المقالات", body: "أكتب عمّا أتعلّمه في العمل.", apex: "posts" },
      { id: "contact", title: "لنعمل معًا", body: "أجب عادة داخل 24 ساعة.", apex: "contact-form" },
    ],
    pitch: "موقع شخصي: معرض أعمال، سيرة، مهارات، مقالات، نموذج تواصل.",
    keywords: ["portfolio", "بورتفوليو", "سيرة ذاتية", "cv", "مصمم", "مطور", "فريلانسر", "شخصي", "أعمالي", "فنان", "مصور", "photographer"],
  },
  /* ----------------------------------------------------------------- blog */
  {
    id: "blog",
    label: "مدونة/مجلة",
    kind: "blog",
    modules: ["kernel", "router", "theme", "posts", "search", "toc", "share", "comments", "newsletter", "notify", "seo", "reading", "pwa"],
    features: { media: ["gallery"], shop: ["shop"], author: ["about"] },
    dataKinds: ["posts"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "📰", hosts: [{ apex: "hero-blog" }, { apex: "posts", cfg: { mode: "featured" } }] },
      { id: "all", title: "كل المقالات", icon: "🗂️", hosts: [{ apex: "search" }, { apex: "posts", cfg: { mode: "all" } }] },
      { id: "tags", title: "المواضيع", icon: "🏷️", hosts: [{ apex: "tags" }] },
      { id: "about", title: "من نحن", icon: "ℹ️", hosts: [{ apex: "about" }] },
      { id: "contact", title: "اتصل", icon: "📮", hosts: [{ apex: "contact-form" }] },
    ],
    hero: { title: "قراءات عميقة في ما يهم فعلًا", sub: "مقالات مبنية على تجربة ميدانية، بلا حشو وبلا عناوين مضللة.", cta: "ابدأ القراءة", cta2: "اشترك" },
    sections: [
      { id: "featured", title: "مقال مميز", body: "أفضل ما كتبناه هذا الشهر.", apex: "posts" },
      { id: "tags", title: "المواضيع", body: "تصفح حسب الموضوع.", apex: "tags" },
      { id: "news", title: "النشرة", body: "رسالة واحدة أسبوعيًا، بلا إزعاج.", apex: "newsletter" },
    ],
    pitch: "مدونة: مقالات، بحث، وسوم، فهرس، مشاركة، تعليقات، نشرة بريدية، RSS.",
    keywords: ["مدونة", "blog", "مجلة", "مقالات", "أخبار", "news", "جريدة", "مقال", "محتوى"],
  },
  /* ------------------------------------------------------------------ edu */
  {
    id: "school",
    label: "مدرسة/لوحة تعليمية",
    kind: "edu",
    modules: ["kernel", "router", "theme", "store", "students", "grades", "attendance", "timetable", "bulletins", "datagrid", "charts", "forms", "print", "notify"],
    features: { parents: ["chat"], fees: ["billing", "invoice"], map: ["mapsvg"], quiz: ["quiz"] },
    dataKinds: ["students", "courses", "events"],
    pages: [
      { id: "overview", title: "لوحة المدرسة", icon: "🏫", hosts: [{ apex: "kpi" }, { apex: "charts", cfg: { mode: "averages" } }, { apex: "attendance" }] },
      { id: "students", title: "التلاميذ", icon: "🎓", hosts: [{ apex: "students" }, { apex: "grades" }] },
      { id: "classes", title: "الأقسام", icon: "📚", hosts: [{ apex: "timetable" }, { apex: "courses" }] },
      { id: "bulletins", title: "الكشوف", icon: "📄", hosts: [{ apex: "bulletins" }, { apex: "print" }] },
      { id: "fees", title: "الرسوم", icon: "💳", hosts: [{ apex: "billing" }] },
    ],
    hero: { title: "إدارة مدرسية بلا ورق", sub: "تلاميذ، نقاط، غيابات، جداول، وكشوف جاهزة للطباعة — كل شيء في مكان واحد.", cta: "افتح اللوحة", cta2: "دليل الاستخدام" },
    sections: [
      { id: "feat", title: "ما تديره المنصة", body: "من التسجيل إلى الكشف النهائي، مع تقارير لكل قسم.", apex: "features" },
      { id: "stats", title: "أرقام المدرسة", body: "مؤشرات مباشرة من قاعدة بيانات التلاميذ.", apex: "kpi" },
    ],
    pitch: "منصة مدرسية: تلاميذ، معدلات، غيابات، جدول أسبوعي، كشوف قابلة للطباعة، رسوم.",
    keywords: ["مدرسة", "school", "تعليم", "تلاميذ", "أساتذة", "جامعة", "ثانوية", "متوسطة", "نقاط", "معدل", "كشف", "academy"],
  },
  /* ------------------------------------------------------------------ lms */
  {
    id: "lms",
    label: "منصة دورات (LMS)",
    kind: "lms",
    modules: ["kernel", "router", "theme", "store", "courses", "lessons", "player", "progress", "quiz", "certificates", "notes", "bookmarks", "search", "notify", "pwa"],
    features: { live: ["chat"], payments: ["billing", "checkout"], maps: ["mapsvg"] },
    dataKinds: ["courses", "students", "posts"],
    pages: [
      { id: "home", title: "الدورات", icon: "🎓", hosts: [{ apex: "hero" }, { apex: "courses" }] },
      { id: "course", title: "داخل الدورة", icon: "▶️", hosts: [{ apex: "lessons" }, { apex: "player" }, { apex: "notes" }, { apex: "quiz" }] },
      { id: "progress", title: "تقدمي", icon: "📈", hosts: [{ apex: "progress" }, { apex: "charts", cfg: { mode: "progress" } }] },
      { id: "cert", title: "شهاداتي", icon: "🏅", hosts: [{ apex: "certificates" }] },
      { id: "mentor", title: "المدرّب", icon: "💬", hosts: [{ apex: "chat" }] },
    ],
    hero: { title: "تعلّم بترتيب… وتابع تقدّمك بالأرقام", sub: "دروس مرتّبة، اختبارات فورية، ملاحظات، وشهادة قابلة للطباعة في النهاية.", cta: "ابدأ التعلّم", cta2: "تصفح الدورات" },
    sections: [
      { id: "how", title: "كيف تشتغل المنصة", body: "مسار واضح: درس ← تمرين ← اختبار ← شهادة.", apex: "steps" },
      { id: "courses", title: "دورات مميزة", body: "اختر ما يناسب مستواك.", apex: "courses" },
    ],
    pitch: "منصة دورات: دروس، مشغّل، تقدّم، اختبارات، ملاحظات، شهادات قابلة للطباعة.",
    keywords: ["منصة تعليمية", "دورات", "دورة", "دروس", "lms", "تعلم", "تعليمية", "e-learning", "تكوين", "كورس", "course", "formation", "تدريب", "شهادة", "أكاديمية", "quiz", "اختبارات"],
  },
  /* -------------------------------------------------------------- clinic */
  {
    id: "clinic",
    label: "عيادة",
    kind: "clinic",
    modules: ["kernel", "router", "theme", "store", "appointments", "patients", "vitals", "prescriptions", "records", "datagrid", "charts", "print", "notify", "calendar"],
    features: { lab: ["datagrid"], insurance: ["billing", "invoice"], pharmacy: ["pharmacy"] },
    dataKinds: ["patients", "services", "events", "transactions"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🏥", hosts: [{ apex: "hero" }, { apex: "services" }, { apex: "appointments" }] },
      { id: "patients", title: "المرضى", icon: "🧑‍⚕️", hosts: [{ apex: "patients" }, { apex: "records" }] },
      { id: "appointments", title: "المواعيد", icon: "📅", hosts: [{ apex: "appointments" }, { apex: "calendar" }] },
      { id: "vitals", title: "القياسات", icon: "🩺", hosts: [{ apex: "vitals" }, { apex: "charts", cfg: { mode: "vitals" } }] },
      { id: "rx", title: "الوصفات", icon: "💊", hosts: [{ apex: "prescriptions" }, { apex: "pharmacy" }] },
      { id: "billing", title: "الفواتير", icon: "💳", hosts: [{ apex: "billing" }, { apex: "invoice" }] },
    ],
    hero: { title: "عيادة منظّمة… ومرضى مرتاحون", sub: "مواعيد بلا تعارض، سجل طبي لكل مريض، قياسات ووصفات وتقارير جاهزة.", cta: "احجز موعدًا", cta2: "خدماتنا" },
    sections: [
      { id: "services", title: "الخدمات", body: "فحوصات واستشارات بأسعار واضحة.", apex: "services" },
      { id: "why", title: "لماذا نحن؟", body: "مواعيد دقيقة، سجل رقمي آمن، ومتابعة بعد الزيارة.", apex: "features" },
      { id: "book", title: "احجز", body: "اختر الخدمة والوقت المتاح مباشرة.", apex: "appointments" },
      { id: "faq", title: "أسئلة", body: "قبل زيارتك، هذه أهم الأجوبة.", apex: "faq" },
    ],
    pitch: "عيادة: خدمات، حجز مواعيد، سجل مرضى، قياسات ومؤشرات، وصفات، فواتير.",
    keywords: ["عيادة", "clinic", "طبيب", "صحة", "santé", "مرضى", "patients", "مواعيد", "rendez-vous", "صيدلية", "pharmacie", "pharmacy", "ordonnance", "cabinet médical", "médecin", "طب", "hospital", "مستشفى", "تحاليل"],
  },
  /* ---------------------------------------------------------------- travel */
  {
    id: "travel",
    label: "منصة سياحة",
    kind: "travel",
    modules: ["kernel", "router", "theme", "store", "destinations", "trips", "booking", "budget", "gallery", "mapsvg", "reviews", "search", "notify", "pwa"],
    features: { hotels: ["rooms"], payments: ["checkout"], local: ["restaurant"] },
    dataKinds: ["destinations", "trips", "transactions"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🌍", hosts: [{ apex: "hero-travel" }, { apex: "destinations" }, { apex: "gallery", cfg: { mode: "places" } }] },
      { id: "explore", title: "استكشف", icon: "🧭", hosts: [{ apex: "mapsvg" }, { apex: "destinations", cfg: { mode: "all" } }] },
      { id: "plan", title: "خطّط رحلتك", icon: "🗺️", hosts: [{ apex: "trips" }, { apex: "budget" }] },
      { id: "book", title: "احجز", icon: "🎫", hosts: [{ apex: "booking" }] },
      { id: "reviews", title: "آراء", icon: "⭐", hosts: [{ apex: "reviews" }] },
    ],
    hero: { title: "اكتشف الجزائر مدينة مدينة", sub: "من قصبة الجزائر إلى تاسيلي: مسارات، ميزانية تقديرية، وحجز فوري.", cta: "استكشف الآن", cta2: "خطّط رحلة" },
    sections: [
      { id: "spots", title: "أماكن لا تفوّتها", body: "مواقع مصنّفة وتراث عالمي على أراضينا.", apex: "destinations" },
      { id: "map", title: "على الخريطة", body: "كل الوجهات على الخريطة، مع أرقام حقيقية.", apex: "mapsvg" },
      { id: "plan", title: "خطّط بميزانية", body: "احسب كلفة رحلتك قبل أن تحجز.", apex: "budget" },
      { id: "faq", title: "أسئلة", body: "أفضل وقت للسفر، والوثائق المطلوبة.", apex: "faq" },
    ],
    pitch: "منصة سياحة: وجهات، خريطة، خطط رحلات، ميزانية، حجز، تقييمات، معرض صور.",
    keywords: ["سياحة", "سفر", "رحلة", "travel", "tourism", "فندق", "hotel", "صحراء", "طبيعة", "زيارة سياحية", "دليل سياحي", "استكشاف الجزائر", "وجهة"],
  },
  /* ------------------------------------------------------------- realestate */
  {
    id: "realestate",
    label: "عقارات",
    kind: "realestate",
    modules: ["kernel", "router", "theme", "store", "listings", "filters", "compare", "mortgage", "agents", "booking", "gallery", "mapsvg", "datagrid", "notify", "print"],
    features: { map: ["mapsvg"], street: ["gallery"], news: ["posts"] },
    dataKinds: ["listings", "contacts", "wilayas"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🏠", hosts: [{ apex: "hero-re" }, { apex: "filters" }, { apex: "listings", cfg: { mode: "featured" } }] },
      { id: "search", title: "بحث", icon: "🔎", hosts: [{ apex: "filters" }, { apex: "listings", cfg: { mode: "all" } }, { apex: "mapsvg" }] },
      { id: "detail", title: "تفاصيل العرض", icon: "📌", hosts: [{ apex: "listing-detail" }, { apex: "gallery" }, { apex: "compare" }] },
      { id: "mortgage", title: "حاسبة القرض", icon: "🧮", hosts: [{ apex: "mortgage" }] },
      { id: "agents", title: "الوكلاء", icon: "🤝", hosts: [{ apex: "agents" }, { apex: "booking" }] },
      { id: "contact", title: "اتصل", icon: "📮", hosts: [{ apex: "contact" }] },
    ],
    hero: { title: "بيتك القادم… في 58 ولاية", sub: "عروض بيع وإيجار محدّثة، مع حاسبة أقساط ومقارنة مباشرة بين العروض.", cta: "ابحث عن عقار", cta2: "احسب القرض" },
    sections: [
      { id: "feat", title: "عروض مميزة", body: "عقارات مختارة بعناية مع صور وتفاصيل كاملة.", apex: "listings" },
      { id: "calc", title: "حاسبة القرض", body: "اعرف القسط الشهري قبل الزيارة.", apex: "mortgage" },
      { id: "tips", title: "نصائح", body: "قبل أن تشتري: تحقق من الوثائق والسعر المرجعي.", apex: "tips" },
    ],
    pitch: "منصة عقارات: عروض، فلاتر متقدمة، تفاصيل، مقارنة، حاسبة قرض، وكلاء، مواعيد معاينة.",
    keywords: ["عقار", "عقارات", "realestate", "شقة", "فيلا", "إيجار", "بيع منزل", "أراضي", "كراء", "أملاك", "مكتب"],
  },
  /* --------------------------------------------------------------- finance */
  {
    id: "finance",
    label: "مالية ومحاسبة",
    kind: "finance",
    modules: ["kernel", "router", "theme", "store", "transactions", "budgets", "accounts", "invoices", "reports", "charts", "datagrid", "forms", "print", "csv", "notify"],
    features: { payroll: ["payroll"], tax: ["tax"], audit: ["audit"] },
    dataKinds: ["transactions", "expenses", "customers", "plans"],
    pages: [
      { id: "overview", title: "النظرة العامة", icon: "📈", hosts: [{ apex: "kpi" }, { apex: "charts", cfg: { mode: "cashflow" } }, { apex: "transactions" }] },
      { id: "transactions", title: "الحركات", icon: "💸", hosts: [{ apex: "transactions" }, { apex: "datagrid", cfg: { data: "transactions", editable: true } }] },
      { id: "budgets", title: "الميزانية", icon: "🎯", hosts: [{ apex: "budgets" }, { apex: "charts", cfg: { mode: "budget" } }] },
      { id: "invoices", title: "الفواتير", icon: "🧾", hosts: [{ apex: "invoices" }, { apex: "invoice" }] },
      { id: "reports", title: "التقارير", icon: "📊", hosts: [{ apex: "reports" }, { apex: "print" }] },
      { id: "tax", title: "الضرائب", icon: "🏛️", hosts: [{ apex: "tax" }] },
    ],
    hero: { title: "مالك واضح… قرارات أسرع", sub: "إيرادات ومصاريف وميزانية وفواتير، مع تقارير جاهزة للطباعة وTVA محسوبة.", cta: "افتح الدفتر", cta2: "جرّب بحساب تجريبي" },
    sections: [
      { id: "what", title: "ما الذي تراه فورًا؟", body: "السيولة اليوم، أفضل وأسوأ بنود، وتوقّع الشهر القادم.", apex: "kpi" },
      { id: "charts", title: "رسوم تُفهم بسرعة", body: "لا أرقام غامضة: كل رسم قابل للتصفية بالتاريخ والفئة.", apex: "charts" },
      { id: "feat", title: "إمكانات", body: "تصدير، طباعة، مطابقة بنكية مبدئية.", apex: "features" },
    ],
    pitch: "محاسبة: حركات، ميزانيات، فواتير مع TVA، تقارير، تصدير، طباعة، ضرائب.",
    keywords: ["مالية", "محاسبة", "finance", "accouning", "بنك", "فاتورة", "ميزانية", "مصاريف", "رواتب", "ضرائب", "tva", "دفتر"],
  },
  /* ------------------------------------------------------------ restaurant */
  {
    id: "restaurant",
    label: "مطعم",
    kind: "restaurant",
    modules: ["kernel", "router", "theme", "store", "menu", "orders-kitchen", "tables", "reservations", "delivery", "gallery", "reviews", "notify", "print"],
    features: { pos: ["pos"], shop: ["checkout"], blog: ["posts"] },
    dataKinds: ["menu", "staff", "orders", "wilayas"],
    pages: [
      { id: "home", title: "الرئيسية", icon: "🍽️", hosts: [{ apex: "hero-resto" }, { apex: "menu", cfg: { mode: "featured" } }, { apex: "reviews" }] },
      { id: "menu", title: "القائمة", icon: "📖", hosts: [{ apex: "menu", cfg: { mode: "all" } }] },
      { id: "order", title: "اطلب", icon: "🧺", hosts: [{ apex: "checkout" }, { apex: "delivery" }] },
      { id: "reserve", title: "حجز طاولة", icon: "📅", hosts: [{ apex: "tables" }, { apex: "reservations" }] },
      { id: "kitchen", title: "المطبخ", icon: "👨‍🍳", hosts: [{ apex: "orders-kitchen" }] },
      { id: "contact", title: "العنوان", icon: "📍", hosts: [{ apex: "contact" }, { apex: "mapsvg" }] },
    ],
    hero: { title: "طعام بيتي… بنكهة جزائرية", sub: "شخشوخة، كسكس، دولمة، وحريرة — حضّرناه اليوم ونجهّزه لك أو نوصلك للدار.", cta: "اطلب الآن", cta2: "شوف القائمة" },
    sections: [
      { id: "menu", title: "الأكثر طلبًا", body: "الأطباق التي يطلبها زبائننا كل يوم.", apex: "menu" },
      { id: "delivery", title: "التوصيل", body: "من 30 دقيقة داخل البلدية، ورسم واضح لكل بلدية.", apex: "delivery" },
      { id: "book", title: "احجز طاولة", body: "اختر اليوم والوقت وعدد الأشخاص.", apex: "tables" },
      { id: "reviews", title: "رأي الزبائن", body: "تقييمات حقيقية لأشهر أطباقنا.", apex: "reviews" },
    ],
    pitch: "مطعم: قائمة، سلة، توصيل بالبلديات، حجز طاولات، لوحة مطبخ، تقييمات، QR للطاولة.",
    keywords: ["مطعم", "restaurant", "مأكولات", "قهوة", "كافيه", "food", "بيتزا", "حلويات", "فطور", "شاورما", "كسكس", "مطبخ"],
  },
  /* ---------------------------------------------------------------- arcade */
  {
    id: "arcade",
    label: "لعبة",
    kind: "game",
    modules: ["kernel", "router", "theme", "store", "game-rpg", "game-tower", "game-racer", "game-roguelike", "audio", "motion", "scores", "settings"],
    features: { save: ["save"], leaderboard: ["scores"], shop: ["shop"] },
    dataKinds: ["tasks"],
    pages: [
      { id: "home", title: "العب", icon: "🎮", hosts: [{ apex: "game", cfg: { game: "rpg" } }] },
      { id: "games", title: "الألعاب", icon: "🕹️", hosts: [{ apex: "game", cfg: { game: "tower" } }, { apex: "game", cfg: { game: "racer" } }, { apex: "game", cfg: { game: "roguelike" } }] },
      { id: "scores", title: "النتائج", icon: "🏆", hosts: [{ apex: "scores" }] },
      { id: "howto", title: "كيف تلعب", icon: "❓", hosts: [{ apex: "howto" }] },
    ],
    hero: { title: "أربع ألعاب… بلا تحميل وبلا انتظار", sub: "بدون ملفات أو مكتبات: كل شيء يولَّد داخل المتصفح، مع صوت حقيقي وإنجازات محفوظة.", cta: "ابدأ اللعب", cta2: "شوف اللعبة الثانية" },
    sections: [
      { id: "games", title: "اختر لعبتك", body: "معركة أدوار، دفاع أبراج، عدّاء لا نهائي، أو زنزانة متولّدة.", apex: "game" },
      { id: "scores", title: "لوحة النتائج", body: "أفضل النتائج محفوظة في جهازك.", apex: "scores" },
      { id: "controls", title: "التحكم", body: "لوحة المفاتيح أو اللمس — كل شيء مدعوم.", apex: "howto" },
    ],
    pitch: "لعبة كاملة: حلقة تحديث، فيزياء، ذكاء أعداء، موسيقى ومؤثرات، حفظ نتائج، تحكم لمس ولوحة مفاتيح.",
    keywords: ["لعبة", "games", "game", "ألعاب", "arcade", "rpg", "برج", "دفاع", "متاهة", "عدّاء", "زومبي", "مغامرة", "شطرنج"],
  },
  /* ------------------------------------------------------------------- crm */
  {
    id: "crm",
    label: "إدارة علاقات العملاء",
    kind: "crm",
    modules: ["kernel", "router", "theme", "store", "contacts", "pipeline", "tasks", "calendar", "search", "datagrid", "charts", "notes", "notify", "print"],
    features: { support: ["support"], quotes: ["invoice", "billing"], mails: ["chat"] },
    dataKinds: ["contacts", "tasks", "events", "transactions"],
    pages: [
      { id: "overview", title: "النظرة العامة", icon: "📊", hosts: [{ apex: "kpi" }, { apex: "charts", cfg: { mode: "pipeline" } }, { apex: "tasks" }] },
      { id: "contacts", title: "جهات الاتصال", icon: "👤", hosts: [{ apex: "contacts" }, { apex: "datagrid", cfg: { data: "contacts", editable: true } }] },
      { id: "pipeline", title: "المسار", icon: "🧩", hosts: [{ apex: "pipeline" }] },
      { id: "agenda", title: "المهام والمواعيد", icon: "📅", hosts: [{ apex: "tasks" }, { apex: "calendar" }] },
      { id: "quotes", title: "العروض", icon: "🧾", hosts: [{ apex: "invoices" }, { apex: "invoice" }] },
    ],
    hero: { title: "كل عميل… في مكانه الصحيح", sub: "مسار بيع واضح، مهام متابعة، وعروض أسعار تُنشأ في ثوانٍ.", cta: "افتح الـ CRM", cta2: "أضف عميلًا" },
    sections: [
      { id: "pipe", title: "مسار البيع", body: "اسحب وأفلت الفرص بين المراحل، وشوف القيمة المحتملة.", apex: "pipeline" },
      { id: "stats", title: "أرقام الفريق", body: "عدد الفرص، نسبة الإغلاق، وقيمة المسار.", apex: "kpi" },
    ],
    pitch: "CRM: جهات اتصال، مسار بيع بالسحب، مهام ومواعيد، عروض أسعار، تقارير، طباعة.",
    keywords: ["crm", "عملاء", "جهات اتصال", "مبيعات", "فرص", "pipeline", "متابعة", "مؤسسة", "b2b", "بيع بالأجل"],
  },
  /* --------------------------------------------------------------- support */
  {
    id: "support",
    label: "مركز دعم",
    kind: "support",
    modules: ["kernel", "router", "theme", "store", "tickets", "chat", "faq", "knowledge", "search", "datagrid", "charts", "notify", "sla"],
    features: { bots: ["chat"], email: ["notify"], agents: ["crm"] },
    dataKinds: ["tickets", "posts", "contacts"],
    pages: [
      { id: "home", title: "مركز المساعدة", icon: "🆘", hosts: [{ apex: "hero-support" }, { apex: "faq" }, { apex: "knowledge" }] },
      { id: "tickets", title: "تذاكري", icon: "🎫", hosts: [{ apex: "tickets" }, { apex: "chat" }] },
      { id: "new", title: "تذكرة جديدة", icon: "➕", hosts: [{ apex: "forms", cfg: { form: "ticket" } }] },
      { id: "kb", title: "الدليل", icon: "📚", hosts: [{ apex: "search" }, { apex: "knowledge" }] },
      { id: "agents", title: "للفريق", icon: "🧑‍💼", hosts: [{ apex: "kpi" }, { apex: "datagrid", cfg: { data: "tickets", editable: true } }] },
    ],
    hero: { title: "مساعدة سريعة… بلا انتظار طويل", sub: "دليل قابل للبحث، تذاكر متتبَّعة، ودردشة مباشرة مع الفريق.", cta: "افتح تذكرة", cta2: "ابحث في الدليل" },
    sections: [
      { id: "kb", title: "الأكثر قراءة", body: "حلول جاهزة لأكثر المشاكل تكرارًا.", apex: "knowledge" },
      { id: "sla", title: "زمن الاستجابة", body: "نلتزم بأزمنة واضحة حسب الأولوية.", apex: "sla" },
      { id: "faq", title: "أسئلة متكررة", body: "أجوبة سريعة بلا تذاكر.", apex: "faq" },
    ],
    pitch: "مركز دعم: تذاكر، أولويات، SLA، دردشة، قاعدة معرفة، بحث، لوحة فريق.",
    keywords: ["دعم", "support", "helpdesk", "تذاكر", "مساعدة", "faq", "خدمة العملاء", "شكاوي", "tickets"],
  },
  /* ------------------------------------------------------------------- docs */
  {
    id: "docs",
    label: "توثيق/دليل",
    kind: "docs",
    modules: ["kernel", "router", "theme", "search", "toc", "code", "copy", "versions", "feedback", "notify", "seo"],
    features: { api: ["code"], examples: ["code"], blog: ["posts"] },
    dataKinds: ["posts"],
    pages: [
      { id: "start", title: "البداية", icon: "🚀", hosts: [{ apex: "doc" }, { apex: "toc" }] },
      { id: "guide", title: "الدليل", icon: "📘", hosts: [{ apex: "search" }, { apex: "doc", cfg: { mode: "guide" } }] },
      { id: "api", title: "واجهة API", icon: "🔌", hosts: [{ apex: "code" }, { apex: "doc", cfg: { mode: "api" } }] },
      { id: "changelog", title: "التغييرات", icon: "🧾", hosts: [{ apex: "changelog" }] },
    ],
    hero: { title: "كل ما تحتاجه للبدء في 5 دقائق", sub: "دليل مرتّب، أمثلة شغّالة، وواجهة API موثّقة بالتفصيل.", cta: "ابدأ الآن", cta2: "واجهة API" },
    sections: [
      { id: "quick", title: "بداية سريعة", body: "نسخة تعمل في ثلاث خطوات.", apex: "code" },
      { id: "ref", title: "المرجع", body: "كل الدوال والخيارات في جدول واحد.", apex: "doc" },
    ],
    pitch: "بوابة توثيق: بحث، فهرس جانبي، أمثلة كود قابلة للنسخ، واجهة API، سجل تغييرات.",
    keywords: ["docs", "توثيق", "دليل", "دوكيومنتيشن", "api", "مرجع", "manual", "documentation", "wiki"],
  },
  /* ---------------------------------------------------------------- admin */
  {
    id: "admin",
    label: "لوحة تحكم إدارية",
    kind: "admin",
    modules: ["kernel", "router", "theme", "store", "datagrid", "charts", "forms", "settings", "users", "audit", "notify", "print", "csv"],
    features: { imports: ["csv"], files: ["media"], flags: ["settings"] },
    dataKinds: ["customers", "transactions", "tasks", "tickets"],
    pages: [
      { id: "dash", title: "لوحة القيادة", icon: "📊", hosts: [{ apex: "kpi" }, { apex: "charts", cfg: { mode: "ops" } }] },
      { id: "data", title: "إدارة البيانات", icon: "🗄️", hosts: [{ apex: "datagrid", cfg: { data: "customers", editable: true, create: true } }] },
      { id: "users", title: "المستخدمون", icon: "🧑‍🤝‍🧑", hosts: [{ apex: "users" }] },
      { id: "audit", title: "السجل", icon: "🧾", hosts: [{ apex: "audit" }] },
      { id: "settings", title: "الإعدادات", icon: "⚙️", hosts: [{ apex: "settings" }] },
    ],
    hero: { title: "تحكّم كامل… بصلاحيات دقيقة", sub: "بيانات، مستخدمون، سجل عمليات، تقارير — كل شيء من مكان واحد.", cta: "افتح اللوحة", cta2: "المستخدمون" },
    sections: [
      { id: "sec", title: "أمان أولًا", body: "أدوار، صلاحيات، وسجل لكل عملية حساسة.", apex: "features" },
      { id: "ops", title: "عمليات اليوم", body: "ما يحتاج قرارًا الآن، لا كل شيء.", apex: "kpi" },
    ],
    pitch: "لوحة إدارية: جداول قابلة للتعديل، مستخدمون وأدوار، سجل تدقيق، إعدادات، تصدير CSV.",
    keywords: ["admin", "إدارة", "لوحة إدارية", "مستخدمون", "صلاحيات", "backoffice", "نظام إداري"],
  },
];

export const BLUEPRINT_IDS: string[] = BLUEPRINTS.map((b) => b.id);

export function blueprintById(id: string): ApexBlueprint {
  return BLUEPRINTS.find((b) => b.id === id) ?? BLUEPRINTS[0];
}

/** Score every blueprint against a request (used by the planner to pick + explain). */
export function scoreBlueprints(text: string, hint?: string): { blueprint: ApexBlueprint; score: number; hits: string[] }[] {
  const t = ` ${(text || "").toLowerCase()} ${(hint || "").toLowerCase()} `;
  return BLUEPRINTS.map((b) => {
    const hits: string[] = [];
    let score = 0;
    for (const kw of b.keywords) {
      const needle = kw.toLowerCase();
      const at = t.indexOf(needle);
      if (at >= 0) {
        /* specificity: longer keywords win, and a keyword near the start of the
           request matters more than one buried at the end */
        score += Math.min(9, needle.length);
        if (at < 26) score += 4;
        hits.push(kw);
      }
    }
    if (hint && b.id.includes(hint.toLowerCase())) score += 6;
    return { blueprint: b, score, hits };
  }).sort((a, b) => b.score - a.score);
}
