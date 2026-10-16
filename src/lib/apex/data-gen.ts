/**
 * NEXUS APEX — deterministic data factory.
 *
 * Every generated project ships with a *real* dataset: Algerian names, the 58
 * wilayas, product catalogues with DZD prices, real-estate listings, restaurant
 * menus, school subjects, clinic services, tourism spots, finance categories…
 * It is all seeded, so the same request always rebuilds the same project, and
 * the volume scales with the requested size (`standard` / `large` / `legend`).
 */

export interface DataBundle {
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ rng */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tiny helper bundle around a seeded PRNG. */
export class Rand {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed || 1);
  }
  next(): number {
    return this.r();
  }
  int(min: number, max: number): number {
    return Math.floor(this.r() * (max - min + 1)) + min;
  }
  float(min: number, max: number, digits = 2): number {
    const v = this.r() * (max - min) + min;
    return Number(v.toFixed(digits));
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.r() * arr.length)] as T;
  }
  picks<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(this.r() * copy.length), 1)[0] as T);
    return out;
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** weighted pick: [[value, weight], …] */
  weighted<T>(pairs: [T, number][]): T {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = this.r() * total;
    for (const [v, w] of pairs) {
      x -= w;
      if (x <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }
  date(daysBack: number, daysForward = 0): string {
    const now = Date.UTC(2026, 0, 15) - this.int(-daysForward, daysBack) * 86400000;
    return new Date(now).toISOString().slice(0, 10);
  }
  /** date + "HH:MM" */
  stamp(daysBack: number): string {
    return `${this.date(daysBack)} ${String(this.int(8, 20)).padStart(2, "0")}:${String(this.int(0, 59)).padStart(2, "0")}`;
  }
}

/* ------------------------------------------------------------- vocabulary */

export const WILAYAS: { code: number; ar: string; fr: string }[] = [
  { code: 1, ar: "أدرار", fr: "Adrar" }, { code: 2, ar: "الشلف", fr: "Chlef" }, { code: 3, ar: "الأغواط", fr: "Laghouat" },
  { code: 4, ar: "أم البواقي", fr: "Oum El Bouaghi" }, { code: 5, ar: "باتنة", fr: "Batna" }, { code: 6, ar: "بجاية", fr: "Béjaïa" },
  { code: 7, ar: "بسكرة", fr: "Biskra" }, { code: 8, ar: "بشار", fr: "Béchar" }, { code: 9, ar: "البليدة", fr: "Blida" },
  { code: 10, ar: "البويرة", fr: "Bouira" }, { code: 11, ar: "تمنراست", fr: "Tamanrasset" }, { code: 12, ar: "تبسة", fr: "Tébessa" },
  { code: 13, ar: "تلمسان", fr: "Tlemcen" }, { code: 14, ar: "تيارت", fr: "Tiaret" }, { code: 15, ar: "تيزي وزو", fr: "Tizi Ouzou" },
  { code: 16, ar: "الجزائر", fr: "Alger" }, { code: 17, ar: "الجلفة", fr: "Djelfa" }, { code: 18, ar: "جيجل", fr: "Jijel" },
  { code: 19, ar: "سطيف", fr: "Sétif" }, { code: 20, ar: "سعيدة", fr: "Saïda" }, { code: 21, ar: "سكيكدة", fr: "Skikda" },
  { code: 22, ar: "سيدي بلعباس", fr: "Sidi Bel Abbès" }, { code: 23, ar: "عنابة", fr: "Annaba" }, { code: 24, ar: "قالمة", fr: "Guelma" },
  { code: 25, ar: "قسنطينة", fr: "Constantine" }, { code: 26, ar: "المدية", fr: "Médéa" }, { code: 27, ar: "مستغانم", fr: "Mostaganem" },
  { code: 28, ar: "المسيلة", fr: "M'Sila" }, { code: 29, ar: "معسكر", fr: "Mascara" }, { code: 30, ar: "ورقلة", fr: "Ouargla" },
  { code: 31, ar: "وهران", fr: "Oran" }, { code: 32, ar: "البيض", fr: "El Bayadh" }, { code: 33, ar: "إليزي", fr: "Illizi" },
  { code: 34, ar: "برج بوعريريج", fr: "Bordj Bou Arreridj" }, { code: 35, ar: "بومرداس", fr: "Boumerdès" }, { code: 36, ar: "الطارف", fr: "El Tarf" },
  { code: 37, ar: "تندوف", fr: "Tindouf" }, { code: 38, ar: "تيسمسيلت", fr: "Tissemsilt" }, { code: 39, ar: "الوادي", fr: "El Oued" },
  { code: 40, ar: "خنشلة", fr: "Khenchela" }, { code: 41, ar: "سوق أهراس", fr: "Souk Ahras" }, { code: 42, ar: "تيبازة", fr: "Tipaza" },
  { code: 43, ar: "ميلة", fr: "Mila" }, { code: 44, ar: "عين الدفلى", fr: "Aïn Defla" }, { code: 45, ar: "النعامة", fr: "Naâma" },
  { code: 46, ar: "عين تموشنت", fr: "Aïn Témouchent" }, { code: 47, ar: "غرداية", fr: "Ghardaïa" }, { code: 48, ar: "غليزان", fr: "Relizane" },
  { code: 49, ar: "تيميمون", fr: "Timimoun" }, { code: 50, ar: "برج باجي مختار", fr: "Bordj Badji Mokhtar" }, { code: 51, ar: "أولاد جلال", fr: "Ouled Djellal" },
  { code: 52, ar: "بني عباس", fr: "Béni Abbès" }, { code: 53, ar: "عين صالح", fr: "In Salah" }, { code: 54, ar: "عين قزام", fr: "In Guezzam" },
  { code: 55, ar: "تقرت", fr: "Touggourt" }, { code: 56, ar: "جانت", fr: "Djanet" }, { code: 57, ar: "المغير", fr: "El M'Ghair" },
  { code: 58, ar: "المنيعة", fr: "El Meniaa" },
];

export const COMMUNES: string[] = [
  "باب الوادي", "حسين داي", "بئر مراد رايس", "الحراش", "الدار البيضاء", "سيدي امحمد", "القبة", "بولوغين",
  "الكاليتوس", "براقي", "بئر توتة", "زرالدة", "الشراقة", "عين البنيان", "شتوان", "المحمدية",
  "حيدرة", "الأبيار", "بن عكنون", "دالي إبراهيم", "اولاد فايت", "بئر خادم", "الرويبة", "الرغاية",
  "المرادية", "المدنية", "سيدي موسى", "باب الزوار", "حجوط", "قليعة", "الحرش", "دواودة",
];

export const MALE_NAMES: string[] = [
  "محمد", "أحمد", "عبد القادر", "يوسف", "إسلام", "أمين", "رياض", "بلال", "سفيان", "كريم",
  "ياسين", "نبيل", "زكرياء", "حمزة", "مهدي", "عادل", "سمير", "رشيد", "علي", "مراد",
  "توفيق", "حكيم", "لطفي", "فريد", "جمال", "عصام", "وليد", "منير", "إلياس", "خالد",
];

export const FEMALE_NAMES: string[] = [
  "أمينة", "ياسمين", "سارة", "نور الهدى", "لينة", "مريم", "هاجر", "فاطمة", "خديجة", "إيمان",
  "سلمى", "رانية", "أسماء", "شيماء", "نسرين", "بشرى", "نجاة", "وفاء", "هدى", "سمية",
  "ريحانة", "كريمة", "زينب", "لطيفة", "مباركة", "نادية", "صابرين", "فريدة", "حنان", "رجاء",
];

export const FAMILY_NAMES: string[] = [
  "بوزيد", "حمداني", "بن عمر", "مزياني", "شريفي", "بلقاسم", "زروقي", "عيساوي", "بن يحيى", "قندوز",
  "مرابط", "طالبي", "لعمامرة", "بن ناصر", "سعداني", "حديد", "بوعزة", "دحمون", "خليفي", "عمراني",
  "بن شعبان", "زيتوني", "مباركي", "صحراوي", "قاسمي", "بلحاج", "رحموني", "بوتفليقة", "معمري", "حمادي",
];

export const PRODUCT_CATALOG: { cat: string; items: [string, number][] }[] = [
  { cat: "إلكترونيات", items: [["هاتف ذكي 128GB", 42000], ["حاسوب محمول i5", 89000], ["سماعات لاسلكية", 6500], ["شاشة 24 بوصة", 27000], ["لوحة مفاتيح ميكانيكية", 9800], ["كاميرا ويب HD", 5400], ["شاحن سريع 65W", 3900], ["بطارية احتياطية 20000", 4700], ["مكبر صوت بلوتوث", 7800], ["طابعة ليزر", 34000]] },
  { cat: "منزل ومطبخ", items: [["طنجرة ضغط 7 لتر", 6400], ["خلاط كهربائي", 5200], ["مكواة بخار", 4300], ["فرن غاز 5 شعلات", 48000], ["ثلاجة 400 لتر", 92000], ["غسالة أوتوماتيكية", 64000], ["مقلاة هوائية", 18500], ["طقم أواني 12 قطعة", 12000], ["مصفاة مياه", 3100]] },
  { cat: "أزياء", items: [["قميص قطني رجالي", 3400], ["جلابة تقليدية", 8600], ["حجاب حرير", 2200], ["حذاء رياضي", 7900], ["جاكيت شتوي", 11500], ["قندورة مطرزة", 14800], ["عباءة عصرية", 6900], ["حقيبة يد جلدية", 9200]] },
  { cat: "بقالة", items: [["زيت زيتون 5 لتر", 4900], ["عسل جبلي 1 كغ", 6200], ["تمر دقلة نور 1 كغ", 1800], ["قمح صلب 5 كغ", 950], ["بن مطحون 500 غ", 1100], ["شاي أخضر 500 غ", 1450], ["زيت عافية 5 لتر", 3900], ["سميد 5 كغ", 780]] },
  { cat: "جمال وعناية", items: [["زيت أرغان", 3200], ["صابون حلبي", 1400], ["كريم مرطب", 2100], ["غاسول مغربي", 900], ["معطر جسدي", 1700], ["ماسك طين", 1300]] },
  { cat: "رياضة", items: [["دمبل 10 كغ", 6800], ["سجادة يوغا", 3400], ["دراجة هوائية", 38000], ["حبل قفز", 900], ["قفازات ملاكمة", 4200]] },
  { cat: "كتب ومكتبة", items: [["قاموس عربي-فرنسي", 2600], ["رواية جزائرية", 1850], ["دفتر 300 ورقة", 620], ["حاسبة علمية", 2400], ["طقم أقلام فاخر", 3300]] },
  { cat: "سيارات", items: [["زيت محرك 5 لتر", 5600], ["بطارية سيارة 70Ah", 14500], ["إطار 195/65", 12800], ["كاميرا خلفية", 6300], ["جهاز تشخيص OBD2", 4200]] },
];

export const SAAS_PRODUCTS: string[] = ["أساسي", "احترافي", "أعمال", "مؤسسات", "تعليمي", "مجاني", "سنوي", "شهري", "مدفوع سنوي", "تجريبي"];
export const POST_TOPICS: string[] = [
  "طرق تحسين أداء الواجهات العربية", "دليل شامل: كيف تنشر موقعك في ساعة", "أفضل 10 أدوات للتصميم الرقمي 2026",
  "أساسيات الأمان الرقمي للمؤسسات الصغيرة", "كيف تبني نظام تسجيل دخول آمن", "الذكاء الاصطناعي في السوق الجزائرية",
  "ماذا يحدث بالضبط عند فتح صفحة ويب؟", "تسريع المواقع بلا مكتبات خارجية", "دليل التجارة الإلكترونية القانوني في الجزائر",
  "لماذا RTL ليس مجرد قلب الصفحة", "البيانات المفتوحة ودورها في تطوير المدن", "رحلة منتج: من الفكرة إلى 100 مستخدم",
  "قياس الأداء: مؤشرات تهم فعلًا", "أنماط التصميم الحديثة ولماذا تبدو جميلة", "دليل المصادقة بكلمة سر لمرة واحدة",
  "كيف تخفض كلفة الاستضافة إلى الصفر", "نظام تصميم صغير يفوز على مكتبة ضخمة", "أتمتة الفواتير للمؤسسات الجزائرية",
];
export const SCHOOL_SUBJECTS: string[] = ["رياضيات", "فيزياء", "علوم طبيعية", "لغة عربية", "لغة فرنسية", "لغة إنجليزية", "تاريخ وجغرافيا", "فلسفة", "إعلام آلي", "تربية إسلامية", "اقتصاد", "هندسة كهربائية"];
export const CLASS_NAMES: string[] = ["1 ثانوي أ", "1 ثانوي ب", "2 ثانوي علوم", "2 ثانوي رياضيات", "3 ثانوي علمي", "3 ثانوي أدبي", "4 متوسط أ", "4 متوسط ب", "3 متوسط ج", "السنة الأولى جامعي"];
export const CLINIC_SERVICES: [string, number][] = [
  ["فتح ملف طبي", 2000], ["استشارة عامة", 3000], ["فحص قلب + ECG", 6500], ["تحليل دم شامل", 4200], ["تصوير صدري", 5500],
  ["متابعة حمل", 4500], ["تخطيط صدى القلب", 9500], ["حجامة طبية", 5000], ["تخطيط سكري", 2500], ["فحص عيون", 3800],
];
export const MEDICINES: string[] = ["باراسيتامول 500mg", "أموكسيسيلين 1g", "أوميبرازول 20mg", "ديكلوفيناك", "فيتامين D3", "حديد + فوليك", "ميتفورمين 850mg", "أملوديبين 5mg", "سيتيريزين", "محلول ملحي"];
export const MEDICAL_NOTES: string[] = ["متابعة عادية", "نقص فيتامين D", "ارتفاع ضغط خفيف", "حساسية موسمية", "يحتاج تحليل سكر", "تشخيص التهاب حاد", "ننصح بالراحة أسبوعًا"];
export const FIN_CATEGORIES: string[] = ["مبيعات", "اشتراكات", "استشارات", "تدريب", "مصاريف تشغيل", "إعلانات", "رواتب", "كراء", "نقل", "كهرباء وماء", "إنترنت", "ضرائب", "صيانة", "تسويق", "تأمين"];
export const PAY_METHODS: string[] = ["نقدًا", "بطاقة CIB", "تحويل بنكي", "BaridiMob", "شيك", "دفع عند التسليم"];
export const EXPENSE_LIST: [string, number][] = [["كراء المكتب", 85000], ["اشتراك الإنترنت", 6500], ["فاتورة الكهرباء", 14200], ["رواتب الفريق", 420000], ["إعلانات فيسبوك", 32000], ["صيانة سيارات", 18000], ["قرطاسية", 5200], ["تأمين", 24000], ["نقل وشحن", 16500]];
export const SUPPORT_SUBJECTS: string[] = ["مشكلة في تسجيل الدخول", "استرجاع كلمة السر", "فاتورة غير صحيحة", "تأخر في التوصيل", "الموقع بطيء", "طلب إرجاع منتج", "سؤال عن الضمان", "مشكلة في الدفع", "تحديث البيانات الشخصية", "خطأ 500 في اللوحة"];
export const TASK_TITLES: string[] = ["تحديث صفحة الأسعار", "مراجعة تصميم الصفحة الرئيسية", "تحسين سرعة التحميل", "كتابة 3 مقالات", "الاتصال بالموردين", "إعداد حملة تسويقية", "تصحيح تقرير المبيعات", "اختبار على الهاتف", "نشر نسخة جديدة", "مراجعة أمان الحسابات", "تدريب الفريق", "تحديث شروط الاستخدام"];
export const LISTING_TYPES: string[] = ["شقة F2", "شقة F3", "شقة F4", "فيلا", "منزل عربي", "استوديو", "محل تجاري", "أرض للبناء", "مكتب", "مستودع", "دوبلكس", "بنتهاوس"];
export const AMENITIES: string[] = ["مصعد", "مرآب", "حديقة", "أمن 24/7", "مسبح", "قريب من المترو", "مطل على البحر", "تدفئة مركزية", "مفروش", "سطح خاص", "مدرسة قريبة", "مسجد قريب"];
export const TOURIST_SPOTS: [string, string, string][] = [
  ["قصبة الجزائر", "الجزائر", "صنفتها اليونسكو تراثًا عالميًا: أزقة عثمانية ومشهد على الخليج."],
  ["تاسيلي ناجر", "إليزي", "أكبر متحف طبيعي مفتوح للفن الصخري في العالم، عمره أكثر من 12 ألف سنة."],
  ["غرداية ووادي ميزاب", "غرداية", "خمس قصور صحراوية بتخطيط عبقري ونظام سقي عمراني."],
  ["جميلة", "سطيف", "مدينة رومانية كاملة على ارتفاع 900 متر، فيها مسرح وسوق."],
  ["تيمقاد", "باتنة", "المدينة الرومانية النوميدية، أنشأها تراجان ومنحها اسمه."],
  ["جانت", "جانت", "أبواب الصحراء ومحمية الطاسيلي، ومنها تنطلق رحلات المهرجان."],
  ["تاغيت", "بشار", "قصور طينية قديمة ونقوش صخرية وكثبان موسيقية."],
  ["تيميمون", "تيميمون", "واحة حمراء وقصور سودانية الطراز وواحات نخيل ممتدة."],
  ["بجاية وطاسيلي", "بجاية", "خليج جبلي وشواطئ صغيرة وسلسلة جرجرة خلفها."],
  ["شلالات كفrida", "جيجل", "شلالات وغابات ومسارات مشي قرب البحر."],
  ["تلمسان", "تلمسان", "مدينة الأندلس الجزائرية بمآذنها ومساجدها الزيانية."],
  ["وادي شلف", "الشلف", "بساتين حمضيات واسعة وأنهار للتنزه العائلي."],
  ["تيديكلت", "أدرار", "قصور أدرار ونخيل ومنطقة تينركوك التاريخية."],
  ["تيبازة", "تيبازة", "أطلال رومانية على البحر ومتحف في مشهد خلاب."],
  ["القلعة الحمادية", "المسيلة", "أول مدينة إسلامية مغربية مخططة، عاصمة الحماديين."],
  ["وهران", "وهران", "المرسى الكبير وحصن سانتا كروز وساحة الأول من نوفمبر."],
  ["قسنطينة", "قسنطينة", "مدينة الجسور المعلقة والصخر جدّي وهضبة المنظر."],
  ["الأوراس", "باتنة", "قرى بلزمة وتاغوست وقمم تشبه السلاسل الجبلية."],
  ["شط ملغيغ", "الوادي", "أكبر تجمع مائي مالح في الجزائر ومنطقة نخيل رائعة."],
  ["الصحراء البيضاء", "تندوف", "تكوينات صخرية بيضاء ونادرة في قلب الصحراء."],
];
export const RESTAURANT_MENU: { cat: string; items: [string, number, string][] }[] = [
  { cat: "أطباق رئيسية", items: [["شخشوخة بسكرية", 1900, "🥘"], ["كسكس لحم", 2200, "🍲"], ["دولمة", 1800, "🥬"], ["رشتة بالدجاج", 1700, "🍜"], ["تاجين زيتون", 2100, "🫕"], ["دجاج مشوي", 2400, "🍗"], ["مثوم", 1600, "🧄"], ["ملوخية", 1750, "🥣"]] },
  { cat: "مقبلات", items: [["بوراك بالدجاج", 700, "🥟"], ["شربة فريك", 600, "🍜"], ["حريرة", 550, "🥣"], ["سلطة مشوية", 800, "🥗"], ["كمونية", 1200, "🥩"]] },
  { cat: "مشروبات", items: [["شاي أخضر بالنعناع", 300, "🍵"], ["قهوة عربية", 250, "☕"], ["عصير برتقال طازج", 600, "🧃"], ["ليمونادة", 500, "🥤"], ["ماء معدني", 150, "💧"]] },
  { cat: "حلويات", items: [["بقلاوة", 450, "🍯"], ["مقروط", 400, "🍩"], ["زلابية", 500, "🍮"], ["قلب اللوز", 350, "🍰"], ["كعك بالعسل", 380, "🍪"]] },
];
export const STAFF_ROLES: string[] = ["مدير", "طاهي", "طاهي مساعد", "نادل", "محاسب", "أمين مخزن", "عامل توصيل", "موظف استقبال"];
export const HOTEL_UNITS: string[] = ["غرفة فردية", "غرفة مزدوجة", "جناح", "شاليه", "بركة مسبح خصوصية", "قاعة اجتماعات"];
export const CONTENT_TAGS: string[] = ["تقنية", "تصميم", "أعمال", "تعليم", "صحة", "مالية", "سفر", "تسويق", "برمجة", "ذكاء اصطناعي", "جزائر", "تجارة"];
export const ACCESS_PLANS: { name: string; price: number; features: string[] }[] = [
  { name: "مجاني", price: 0, features: ["مشروعان", "تصدير HTML", "دعم بالبريد"] },
  { name: "احترافي", price: 2900, features: ["مشاريع غير محدودة", "تصدير ZIP", "نطاق مخصص", "دعم 24 ساعة", "بلا علامة مائية"] },
  { name: "أعمال", price: 7900, features: ["كل ما في الاحترافي", "5 أعضاء فريق", "تقارير متقدمة", "واجهة API", "مدير حساب"] },
  { name: "مؤسسات", price: 19900, features: ["كل ما سبق", "SSO و2FA", "استضافة داخلية", "اتفاقية مستوى خدمة", "تدريب الفريق"] },
];

/* ------------------------------------------------------------- helpers */

export function fullName(r: Rand, gender?: "m" | "f"): string {
  const g = gender ?? (r.chance(0.5) ? "m" : "f");
  return `${r.pick(g === "m" ? MALE_NAMES : FEMALE_NAMES)} ${r.pick(FAMILY_NAMES)}`;
}

export function phoneDZ(r: Rand): string {
  return `0${r.pick([5, 6, 7])}${r.int(10, 99)} ${r.int(10, 99)} ${r.int(10, 99)} ${r.int(10, 99)}`;
}

export function emailFor(name: string, i: number): string {
  const map: Record<string, string> = { "أ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "dj", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "ch", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ة": "a", "ء": "", " ": "." };
  const latin = [...name].map((c) => (map[c] ?? (/[a-zA-Z0-9.]/.test(c) ? c : ""))).join("").replace(/\.+/g, ".") || "user";
  return `${latin.toLowerCase()}${i % 7 === 0 ? i : ""}@${["gmail.com", "outlook.dz", "yahoo.fr", "nexus.dz", "proton.me"][i % 5]}`;
}

export function slugifyAr(text: string, seed: number): string {
  const base = text.trim().toLowerCase().replace(/[^\w\u0600-\u06FF]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "nexus"}-${(seed % 9973).toString(36)}`;
}

/* --------------------------------------------------------- generators */

export function genProducts(seed: number, count = 160) {
  const r = new Rand(seed + 11);
  const out = [];
  let n = 0;
  for (let i = 0; i < count; i++) {
    const group = PRODUCT_CATALOG[i % PRODUCT_CATALOG.length] as (typeof PRODUCT_CATALOG)[number];
    const [name, base] = group.items[Math.floor(i / PRODUCT_CATALOG.length) % group.items.length] as [string, number];
    const pct = r.int(-14, 22);
    const price = Math.round((base * (1 + pct / 100)) / 50) * 50;
    const stock = r.weighted([[0, 1], [r.int(1, 9), 3], [r.int(10, 60), 5], [r.int(61, 240), 3]]);
    out.push({
      id: ++n,
      sku: `${group.cat.slice(0, 2)}-${String(1000 + n)}`,
      name,
      category: group.cat,
      price,
      oldPrice: pct < 0 ? base : Math.round((base * 1.25) / 50) * 50,
      stock,
      rating: r.float(3.4, 5, 1),
      reviews: r.int(3, 780),
      sold: r.int(0, 1400),
      emoji: ["📦", "🎁", "🛍️", "✨", "🔥", "⭐", "💎"][n % 7],
      brand: ["نكسس", "صحراوي", "أطلس", "مرجان", "نسيم", "رواق"][n % 6],
      barcode: `613${r.int(100000, 999999)}${r.int(10, 99)}`,
      createdAt: r.date(900),
    });
  }
  return out;
}

export function genOrders(seed: number, count = 320) {
  const r = new Rand(seed + 23);
  const out = [];
  const stages = ["جديد", "قيد التحضير", "جاهز", "مرسل", "مُسلَّم", "ملغى", "مرتجع"];
  const status = ["مؤكد", "قيد المعالجة", "مشحون", "مكتمل", "ملغى"];
  for (let i = 0; i < count; i++) {
    const items = r.int(1, 5);
    const subtotal = r.int(1800, 96000);
    const shipping = subtotal > 12000 ? 0 : r.pick([400, 600, 700, 900]);
    out.push({
      id: 2400 + i,
      ref: `CMD-${2026 + (i % 2)}-${String(1000 + i)}`,
      customer: fullName(r),
      phone: phoneDZ(r),
      wilaya: r.pick(WILAYAS).ar,
      commune: r.pick(COMMUNES),
      items,
      subtotal,
      shipping,
      total: subtotal + shipping,
      tva: Math.round(subtotal * 0.19),
      status: r.pick(status),
      stage: r.weighted([[stages[0], 5], [stages[1], 4], [stages[2], 3], [stages[3], 3], [stages[4], 8], [stages[5], 2], [stages[6], 1]]),
      payment: r.pick(PAY_METHODS),
      carrier: r.pick(["Yalidine", "ZR Express", "Maystro", "Nordin Delivery", "استلام من المتجر"]),
      createdAt: r.stamp(420),
      updatedAt: r.stamp(9),
    });
  }
  return out;
}

export function genCustomers(seed: number, count = 260) {
  const r = new Rand(seed + 31);
  const out = [];
  for (let i = 0; i < count; i++) {
    const name = fullName(r);
    out.push({
      id: 1000 + i,
      name,
      email: emailFor(name, i),
      phone: phoneDZ(r),
      wilaya: r.pick(WILAYAS).ar,
      segment: r.pick(["جديد", "متكرر", "VIP", "خامل"]),
      spend: r.int(2400, 480000),
      orders: r.int(1, 64),
      lastSeen: r.date(120),
      joined: r.date(1500),
      points: r.int(0, 4200),
      note: r.chance(0.3) ? r.pick(["يفضل التوصيل للمكتب", "عميل تجاري", "يبحث عن خصم دائم", "يشتري بالجملة"]) : "",
    });
  }
  return out;
}

export function genTransactions(seed: number, count = 420) {
  const r = new Rand(seed + 47);
  const out = [];
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  for (let i = 0; i < count; i++) {
    const income = r.chance(0.62);
    const cat = income ? r.pick(FIN_CATEGORIES.slice(0, 5)) : r.pick(FIN_CATEGORIES.slice(5));
    const amount = income ? r.int(9000, 420000) : r.int(1500, 120000);
    out.push({
      id: i + 1,
      date: `2026-${r.pick(months)}-${String(r.int(1, 28)).padStart(2, "0")}`,
      label: cat,
      category: cat,
      kind: income ? "إيراد" : "مصروف",
      amount,
      signed: income ? amount : -amount,
      method: r.pick(PAY_METHODS),
      ref: `TRX-${String(100000 + i)}`,
      wilaya: r.pick(WILAYAS).ar,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function genExpenses(seed: number) {
  const r = new Rand(seed + 53);
  return EXPENSE_LIST.map(([label, amount], i) => ({
    id: i + 1,
    label,
    amount: Math.round((amount * r.float(0.86, 1.22)) / 100) * 100,
    month: "2026-01",
    type: "شهري",
    paid: r.chance(0.72),
  }));
}

export function genContacts(seed: number, count = 180) {
  const r = new Rand(seed + 61);
  const out = [];
  const companies = ["مؤسسة الأطلس", "شركة النورللإلكترونيات", "مجموعة الصحراء", "دار الكتاب", "مطاحن المتيجة", "نقل الساحل", "أشغال البناء الحديث", "مركز التكوين المهنئ", "صيدليات النخبة", "مطبعة الوفاء"];
  for (let i = 0; i < count; i++) {
    const name = fullName(r);
    out.push({
      id: 500 + i,
      name,
      company: r.pick(companies),
      role: r.pick(["مدير عام", "مدير مشتريات", "محاسب", "مسؤول تسويق", "مهندس", "طبيب", "أستاذ"]),
      email: emailFor(name, i),
      phone: phoneDZ(r),
      wilaya: r.pick(WILAYAS).ar,
      stage: r.weighted([["جديد", 6], ["تم الاتصال", 5], ["عرض مُرسل", 4], ["تفاوض", 3], ["عميل", 4], ["مفقود", 2]]),
      value: r.int(40000, 4200000),
      lastTouch: r.date(60),
      nextStep: r.pick(["اتصال متابعة", "إرسال عرض", "اجتماع مناقشة", "توقيع عقد", "زيارة ميدانية", "لا شيء"]),
      tags: r.picks(CONTENT_TAGS, r.int(1, 3)),
      notes: r.chance(0.5) ? r.pick(["يحتاج تفاصيل تقنية", "مهتم بالخصم السنوي", "يريد تجربة مجانية", "طلب زيارة للمقر"]) : "",
    });
  }
  return out;
}

export function genTasks(seed: number, count = 90) {
  const r = new Rand(seed + 71);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: 300 + i,
      title: r.pick(TASK_TITLES),
      project: r.pick(["المتجر الإلكتروني", "الموقع التعريفي", "تطبيق العملاء", "الحملة الشتوية", "التوسع للولايات", "الأتمتة المالية"]),
      assignee: fullName(r),
      lane: r.weighted([["قائمة الانتظار", 5], ["قيد التنفيذ", 4], ["مراجعة", 3], ["مكتمل", 5]]),
      priority: r.weighted([["عادية", 6], ["عالية", 4], ["عاجلة", 2], ["منخفضة", 3]]),
      points: r.pick([1, 2, 3, 5, 8]),
      due: r.date(-12, 40),
      created: r.date(90),
      done: r.chance(0.35),
      tags: r.picks(CONTENT_TAGS, r.int(0, 2)),
    });
  }
  return out;
}

export function genEvents(seed: number, count = 120) {
  const r = new Rand(seed + 83);
  const out = [];
  const kinds = ["اجتماع", "تدريب", "تسليم", "صيانة", "فحص طبي", "درس", "رحلة", "مناسبة", "مكالمة", "ورشة"];
  const titles = ["اجتماع فريق التطوير", "ورشة تصميم الأنظمة", "موعد مع العميل", "جلسة مراجعة الشهر", "تدريب الموظفين", "فحص دوري", "درس دعم", "تسليم مشروع", "صيانة دورية", "مناسبة العيد"];
  for (let i = 0; i < count; i++) {
    const day = r.int(1, 28);
    out.push({
      id: 700 + i,
      title: `${r.pick(titles)} #${i + 1}`,
      kind: r.pick(kinds),
      date: `2026-${String(r.int(1, 12)).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      start: `${String(r.int(7, 19)).padStart(2, "0")}:${r.pick(["00", "15", "30", "45"])}`,
      minutes: r.pick([30, 45, 60, 90, 120]),
      place: r.pick(["قاعة الاجتماعات", "عن بعد", "المكتب الرئيسي", "فرع وهران", "المركز الثقافي", "المقهى", "المزرعة"]),
      people: r.int(2, 40),
      owner: fullName(r),
      repeat: r.weighted([["", 8], ["أسبوعيًا", 3], ["شهريًا", 2]]),
      color: r.pick(["#6366f1", "#22d3ee", "#34d399", "#f59e0b", "#f472b6", "#a78bfa"]),
    });
  }
  return out;
}

export function genPosts(seed: number, count = 60) {
  const r = new Rand(seed + 97);
  const out = [];
  for (let i = 0; i < count; i++) {
    const topic = POST_TOPICS[i % POST_TOPICS.length] as string;
    const words = r.int(680, 2400);
    out.push({
      id: i + 1,
      slug: slugifyAr(topic, i + seed),
      title: topic,
      excerpt: `قراءة عملية في ${topic} مع أمثلة قابلة للتطبيق مباشرة، وأرقام من السوق المحلي.`,
      author: fullName(r),
      tags: r.picks(CONTENT_TAGS, r.int(2, 4)),
      minutes: Math.max(3, Math.round(words / 220)),
      words,
      views: r.int(120, 34000),
      likes: r.int(4, 980),
      comments: r.int(0, 84),
      date: r.date(700),
      cover: `linear-gradient(${r.int(0, 360)}deg,${r.pick(["#6366f1", "#22d3ee", "#f59e0b", "#34d399"])},${r.pick(["#a78bfa", "#f472b6", "#fb7185", "#60a5fa"])})`,
      body: `${topic} ليست فكرة نظرية، بل قرار يومي يواجه كل من يبني منتجًا في السوق الجزائري.\n\nفي هذا المقال نتناول ثلاث زوايا: ما الذي يشتغل فعلًا، وما الذي يبدو جميلًا لكنه يتعطل عند أول اختبار حقيقي، وكيف نقيس الفرق بينهما بأرقام لا بالانطباعات.\n\n## التجربة أولًا\nكل توصية هنا مبنية على تجربة على مشاريع حقيقية، لا على ترجمة حرفية لمقال أجنبي.\n\n## الأرقام لا تكذب\nمتوسط زمن تحميل الصفحة يؤثر على نسبة الرفض بمقدار يمكن قياسه، ومعالجة ذلك لا تحتاج ميزانية.\n\n## ابدأ صغيرًا\nابدأ بأصغر نسخة تعمل، ثم أضف طبقات. الأنظمة الكبيرة تُبنى بالتقسيم لا بالحماس.`,
    });
  }
  return out;
}

export function genCourses(seed: number, count = 40) {
  const r = new Rand(seed + 103);
  const out = [];
  for (let i = 0; i < count; i++) {
    const subject = SCHOOL_SUBJECTS[i % SCHOOL_SUBJECTS.length] as string;
    out.push({
      id: i + 1,
      title: `${subject} — مستوى ${r.pick(["مبتدئ", "متوسط", "متقدم"])}`,
      subject,
      teacher: fullName(r),
      classes: r.pick(CLASS_NAMES),
      hours: r.int(12, 64),
      lessons: r.int(8, 46),
      price: r.pick([0, 3000, 4500, 6000, 9000]),
      enrolled: r.int(6, 240),
      rating: r.float(4.1, 5, 1),
      start: r.date(-30, 45),
      mode: r.pick(["حضوري", "عن بعد", "مدمج"]),
      cover: `linear-gradient(135deg,${r.pick(["#6366f1", "#0ea5e9", "#f59e0b"])},${r.pick(["#a855f7", "#14b8a6", "#f472b6"])})`,
      syllabus: ["مقدمة وأهداف", "الأساسيات النظرية", "تمارين تطبيقية", "دراسة حالة", "مشروع نهائي", "تقييم وتصحيح"],
    });
  }
  return out;
}

export function genStudents(seed: number, count = 420) {
  const r = new Rand(seed + 107);
  const out = [];
  for (let i = 0; i < count; i++) {
    const name = fullName(r);
    const marks = Array.from({ length: 6 }, () => r.int(6, 20));
    const avg = Number((marks.reduce((s, m) => s + m, 0) / marks.length).toFixed(2));
    out.push({
      id: 202600 + i,
      name,
      gender: r.chance(0.5) ? "ذكر" : "أنثى",
      klass: r.pick(CLASS_NAMES),
      wilaya: r.pick(WILAYAS).ar,
      birth: `${2006 + (i % 6)}-0${r.int(1, 9)}-1${r.int(0, 9)}`,
      guardian: fullName(r),
      phone: phoneDZ(r),
      marks,
      average: avg,
      rank: 0,
      attendance: r.int(78, 100),
      fees: r.pick(["مدفوعة", "جزئية", "متأخرة"]),
      note: avg >= 16 ? "متفوق" : avg >= 12 ? "منتظم" : "يحتاج متابعة",
    });
  }
  const sorted = [...out].sort((a, b) => b.average - a.average);
  sorted.forEach((s, i) => (s.rank = i + 1));
  return out;
}

export function genPatients(seed: number, count = 260) {
  const r = new Rand(seed + 113);
  const out = [];
  const blood = ["A+", "A-", "B+", "B-", "AB+", "O+", "O-"];
  for (let i = 0; i < count; i++) {
    const name = fullName(r);
    const weight = r.int(48, 112);
    const height = r.int(150, 192);
    out.push({
      id: 900 + i,
      name,
      age: r.int(1, 88),
      gender: r.chance(0.45) ? "ذكر" : "أنثى",
      phone: phoneDZ(r),
      blood: r.pick(blood),
      weight,
      height,
      bmi: Number((weight / Math.pow(height / 100, 2)).toFixed(1)),
      pressure: `${r.int(100, 145)}/${r.int(65, 95)}`,
      sugar: r.float(0.7, 1.9, 2),
      service: r.pick(CLINIC_SERVICES)[0],
      lastVisit: r.date(240),
      nextVisit: r.date(-40, 60),
      allergies: r.chance(0.28) ? r.pick(["حبوب اللقاح", "البنسلين", "المكسرات", "الغبار", "الأسبرين"]) : "لا يوجد",
      note: r.pick(MEDICAL_NOTES),
      insurance: r.pick(["CNAS", "CASNOS", "خاص", "بلا تأمين"]),
    });
  }
  return out;
}

export function genListings(seed: number, count = 220) {
  const r = new Rand(seed + 127);
  const out = [];
  for (let i = 0; i < count; i++) {
    const type = r.pick(LISTING_TYPES);
    const rooms = type.includes("F2") ? 2 : type.includes("F3") ? 3 : type.includes("F4") ? 4 : r.int(1, 6);
    const area = r.int(38, 420);
    const wilaya = r.pick(WILAYAS);
    const pricePerM2 = r.int(42000, 260000);
    const rent = r.chance(0.34);
    out.push({
      id: 10000 + i,
      ref: `IM-${wilaya.code}${String(1000 + i)}`,
      title: `${type} لل${rent ? "إيجار" : "بيع"} في ${wilaya.ar}`,
      type,
      deal: rent ? "إيجار" : "بيع",
      wilaya: wilaya.ar,
      commune: r.pick(COMMUNES),
      rooms,
      baths: r.int(1, 3),
      area,
      floor: r.int(0, 14),
      totalFloors: r.int(1, 16),
      price: rent ? r.int(18000, 160000) : Math.round((area * pricePerM2) / 1000) * 1000,
      pricePerM2,
      amenities: r.picks(AMENITIES, r.int(3, 6)),
      owner: fullName(r),
      phone: phoneDZ(r),
      photos: r.int(3, 14),
      rating: r.float(3.4, 5, 1),
      added: r.date(300),
      featured: r.chance(0.18),
      desc: `${type} بمساحة ${area} م² في ${wilaya.ar}، ${rooms} غرف و${r.int(1, 3)} حمام، قريبة من المدارس والنقل، جاهزة للمعاينة.`,
      coords: [r.float(27.5, 37, 4), r.float(-8.6, 9.5, 4)],
    });
  }
  return out;
}

export function genDestinations(seed: number, count = 20) {
  const r = new Rand(seed + 131);
  return TOURIST_SPOTS.slice(0, count).map(([name, wilaya, desc], i) => ({
    id: i + 1,
    name,
    wilaya,
    desc,
    days: r.int(1, 6),
    price: r.int(9000, 78000),
    rating: r.float(4.2, 5, 1),
    reviews: r.int(24, 3200),
    best: r.pick(["الربيع", "الخريف", "الشتاء", "الصيف"]),
    type: r.pick(["ثقافي", "صحراوي", "ساحلي", "جبلي", "تاريخي", "عائلي"]),
    activities: r.picks(["زيارة أثرية", "مشي جبلي", "رحلة جمالية", "تصوير", "تذوق أكل محلي", "تخييم", "سباحة", "تسوق حرفي", "زيارة متحف"], r.int(3, 5)),
    tips: [`أفضل وقت للزيارة: ${r.pick(["الفجر", "الصباح الباكر", "بعد الظهر", "المغرب"])}`, "خذ ماء كافٍ", "احترم المكان والتقاليد المحلية"][r.int(0, 2)],
    emoji: r.pick(["🏜️", "🏛️", "🌊", "⛰️", "🕌", "🌴", "🏞️"]),
  }));
}

export function genMenu(seed: number) {
  const r = new Rand(seed + 137);
  const out: { id: number; name: string; cat: string; price: number; emoji: string; available: boolean; rating: number; sold: number }[] = [];
  let id = 0;
  for (const group of RESTAURANT_MENU) {
    for (const [name, price, emoji] of group.items) {
      out.push({ id: ++id, name, cat: group.cat, price: Math.round((price * r.float(0.92, 1.15)) / 10) * 10, emoji, available: r.chance(0.92), rating: r.float(4, 5, 1), sold: r.int(3, 640) });
    }
  }
  return out;
}

export function genStaff(seed: number, count = 18) {
  const r = new Rand(seed + 149);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: fullName(r),
    role: STAFF_ROLES[i % STAFF_ROLES.length] as string,
    phone: phoneDZ(r),
    salary: r.int(28000, 180000),
    shift: r.pick(["صباحي", "مسائي", "ليلي", "دوام كامل"]),
    start: r.date(1900),
    rating: r.float(3.6, 5, 1),
    tasks: r.int(1, 12),
  }));
}

export function genInventory(seed: number, count = 200) {
  const r = new Rand(seed + 151);
  const out = [];
  for (let i = 0; i < count; i++) {
    const group = PRODUCT_CATALOG[i % PRODUCT_CATALOG.length] as (typeof PRODUCT_CATALOG)[number];
    const [name, base] = group.items[Math.floor(i / PRODUCT_CATALOG.length) % group.items.length] as [string, number];
    const qty = r.weighted([[0, 2], [r.int(1, 12), 4], [r.int(13, 90), 5], [r.int(91, 500), 3]]);
    out.push({
      id: i + 1,
      sku: `ST-${1000 + i}`,
      name,
      category: group.cat,
      shelf: `${String.fromCharCode(65 + (i % 8))}-${String(1 + (i % 24)).padStart(2, "0")}`,
      qty,
      min: r.pick([3, 5, 8, 12, 20]),
      cost: Math.round((base * 0.62) / 50) * 50,
      price: Math.round(base / 50) * 50,
      supplier: r.pick(["مورد الجزائر الوسطى", "شرق للتوريد", "مجموعة الغرب", "الصحراء للتجارة", "وطنية للتوزيع"]),
      lastMove: r.date(90),
      perishable: r.chance(0.35),
    });
  }
  return out;
}

export function genServices(seed: number, count = 12) {
  const r = new Rand(seed + 157);
  return CLINIC_SERVICES.slice(0, count).map(([name, price], i) => ({
    id: i + 1,
    name,
    price,
    minutes: r.pick([15, 20, 30, 45, 60]),
    staff: fullName(r),
    room: `قاعة ${i + 1}`,
    rating: r.float(4, 5, 1),
    booked: r.int(0, 90),
  }));
}

export function genSupport(seed: number, count = 140) {
  const r = new Rand(seed + 163);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: 5000 + i,
      ticket: `TCK-${9000 + i}`,
      subject: r.pick(SUPPORT_SUBJECTS),
      customer: fullName(r),
      email: "",
      priority: r.weighted([["منخفضة", 4], ["عادية", 6], ["عالية", 3], ["عاجلة", 2]]),
      status: r.weighted([["مفتوح", 5], ["قيد المعالجة", 4], ["بانتظار العميل", 3], ["محلول", 6], ["مغلق", 3]]),
      channel: r.pick(["دردشة", "بريد", "هاتف", "فيسبوك", "واتساب"]),
      agent: fullName(r),
      createdAt: r.stamp(120),
      firstReply: r.int(3, 320),
      resolution: r.chance(0.72) ? r.int(20, 2200) : 0,
      satisfaction: r.chance(0.8) ? r.int(2, 5) : 0,
      messages: r.int(2, 14),
    });
  }
  return out.map((t) => ({ ...t, email: emailFor(t.customer, t.id) }));
}

export function genSubscriptions(seed: number, count = 90) {
  const r = new Rand(seed + 167);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    customer: fullName(r),
    plan: r.pick(SAAS_PRODUCTS),
    mrr: r.pick([0, 1200, 2900, 4900, 7900, 19900]),
    seats: r.int(1, 240),
    status: r.weighted([["نشط", 8], ["تجريبي", 3], ["متأخر", 2], ["ملغى", 2]]),
    started: r.date(1200),
    renews: r.date(-5, 90),
    usage: r.int(4, 99),
    country: r.pick(["الجزائر", "تونس", "المغرب", "فرنسا", "الإمارات", "كندا"]),
  }));
}

/* -------------------------------------------------------------- public */

const VOLUME: Record<string, number> = {
  standard: 0.55,
  large: 1,
  legend: 1.9,
};

export interface BuildDataOptions {
  scale?: "standard" | "large" | "legend";
}

/** Builds every dataset the requested kinds ask for. Volume follows the scale. */
export function buildData(seed: number, kinds: string[], opts: BuildDataOptions = {}): DataBundle {
  const k = VOLUME[opts.scale ?? "large"] ?? 1;
  const n = (base: number) => Math.max(12, Math.round(base * k));
  const b: DataBundle = {};
  const want = (kind: string) => kinds.indexOf(kind) >= 0;
  if (want("products")) b.products = genProducts(seed, n(160));
  if (want("orders")) b.orders = genOrders(seed, n(320));
  if (want("customers")) b.customers = genCustomers(seed, n(260));
  if (want("transactions")) b.transactions = genTransactions(seed, n(420));
  if (want("expenses")) b.expenses = genExpenses(seed);
  if (want("contacts")) b.contacts = genContacts(seed, n(180));
  if (want("tasks")) b.tasks = genTasks(seed, n(90));
  if (want("events")) b.events = genEvents(seed, n(120));
  if (want("posts")) b.posts = genPosts(seed, n(60));
  if (want("courses")) b.courses = genCourses(seed, n(40));
  if (want("students")) b.students = genStudents(seed, n(420));
  if (want("patients")) b.patients = genPatients(seed, n(260));
  if (want("listings")) b.listings = genListings(seed, n(220));
  if (want("destinations")) b.destinations = genDestinations(seed, 20);
  if (want("menu")) b.menu = genMenu(seed);
  if (want("staff")) b.staff = genStaff(seed, n(18));
  if (want("inventory")) b.inventory = genInventory(seed, n(200));
  if (want("services")) b.services = genServices(seed, 12);
  if (want("tickets")) b.tickets = genSupport(seed, n(140));
  if (want("subscriptions")) b.subscriptions = genSubscriptions(seed, n(90));
  if (want("plans")) b.plans = ACCESS_PLANS;
  if (want("wilayas")) b.wilayas = WILAYAS;
  if (want("communes")) b.communes = COMMUNES;
  return b;
}

/** How many rows a bundle holds (shown in the generated README + stats). */
export function countRows(bundle: DataBundle): number {
  return Object.values(bundle).reduce<number>((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
}
