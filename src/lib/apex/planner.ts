/**
 * NEXUS APEX — planner.
 *
 * Turns a plain request (Arabic, Darija, French or English) into an ApexPlan:
 * which blueprint, which palette, how big, which features, which modules.
 * It also explains *why* it chose that shape, so the UI can show the reasoning.
 */

import { scoreBlueprints, type ApexBlueprint } from "./blueprints";
import { detectFeatures, detectGameModule, paletteFor, type ApexPlan, type Scale } from "./compose";
import { seedFrom } from "./data-gen";

export interface PlanOptions {
  blueprint?: string;
  palette?: string;
  scale?: Scale;
  title?: string;
  brand?: string;
  lang?: "ar" | "fr" | "en";
  modules?: string[];
  pages?: string[];
}

export interface PlanResult {
  plan: ApexPlan;
  blueprint: ApexBlueprint;
  alternatives: { blueprint: string; label: string; score: number }[];
  reading: string;
}

const AR = /[\u0600-\u06FF]/;

export function detectLang(text: string): "ar" | "fr" | "en" {
  if (AR.test(text)) return "ar";
  if (/\b(le|la|les|un|une|des|pour|avec|site|boutique|magasin|ecole|clinique|reservation|devis)\b/i.test(text)) return "fr";
  return "en";
}

function detectScale(text: string): Scale {
  const t = text.toLowerCase();
  if (/ضخم|عملاق|كبير جدا|كبيرة جدا|legend|massive|huge|enterprise|10 ?000|١٠٠٠٠|عشرة آلاف/.test(t)) return "legend";
  if (/صغير|بسيط|مبسط|tiny|small|simple|mvp/.test(t)) return "standard";
  return "large";
}

/** Pulls a product name out of the request, if the user gave one. */
/** Trims a captured phrase into a clean product name (max 4 words, no trailing glue). */
function tidyName(raw: string): string | null {
  const cleaned = raw
    .replace(/\b(في|مع|على|من|إلى|و|أو|فيها|فيه|كامل|كاملة|ضخم|ضخمة|جدا|جداً)\b/g, " ")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/^(RPG|rpg|Rpg)\s+/, "")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 4);
  const out = words.join(" ").trim();
  return out.length >= 3 ? out : null;
}

function extractTitle(text: string): string | null {
  const quoted = text.match(/["“«]([^"”»]{2,40})["”»]/);
  if (quoted) return tidyName(quoted[1]) ?? quoted[1].trim();
  const named = text.match(/(?:اسمه|اسمها|سمّيه|باسم|بإسم|called|named)\s+([^\n،,.!?]{2,40})/i);
  if (named) return tidyName(named[1]) ?? named[1].trim();
  const site = text.match(/(?:موقع|متجر|منصة|تطبيق|لعبة|مدونة|مطعم|عيادة|مدرسة|شركة|مؤسسة|وكالة|قاعة|صيدلية|فندق)\s+(?:لـ|ل|ال)?([^\n،,.!?]{2,32})/);
  if (site) {
    const tidy = tidyName(site[1]);
    if (tidy) return tidy;
  }
  return null;
}

function titleFromBlueprint(bp: ApexBlueprint, text: string): { title: string; tagline: string; desc: string } {
  const brand = bp.label;
  const titles: Record<string, [string, string, string]> = {
    "saas-dashboard": ["منصة نكسس", "إدارة كاملة لعملك في لوحة واحدة", "لوحة تحكم تجمع العملاء والفوترة والتقارير والمهام في مكان واحد، ببيانات حقيقية وتقارير فورية."],
    ecommerce: ["متجر نكسس", "تسوّق بسهولة… وتوصيل لكل الولايات", "متجر إلكتروني كامل: كتالوج، سلة، كوبونات، دفع عند التسليم، تتبّع الطلبات، وفواتير جاهزة."],
    landing: ["صفحة نكسس", "رسالة واضحة… وتحويل أعلى", "صفحة هبوط مبنية لتقنع الزائر وتدفعه للتواصل، مع نموذج وأسعار وآراء وأسئلة متكررة."],
    portfolio: ["بورتفوليو نكسس", "أعمالي… وطريقتي في العمل", "موقع شخصي يعرض المشاريع والمهارات والمقالات مع نموذج تواصل مباشر."],
    blog: ["مدونة نكسس", "قراءات عميقة بلا حشو", "مدونة كاملة: مقالات، بحث، وسوم، فهرس، مشاركة، تعليقات، ونشرة بريدية."],
    school: ["مدرسة نكسس", "إدارة مدرسية بلا ورق", "تلاميذ، نقاط، غيابات، جدول أسبوعي، وكشوف جاهزة للطباعة مع تقارير لكل قسم."],
    lms: ["أكاديمية نكسس", "تعلّم بترتيب وتابع تقدّمك", "منصة دورات: دروس، اختبارات، ملاحظات، تقدّم، وشهادات قابلة للطباعة."],
    clinic: ["عيادة نكسس", "مواعيد منظّمة وسجل طبي كامل", "عيادة رقمية: خدمات، حجز مواعيد، سجل مرضى، قياسات، وصفات، وفواتير."],
    travel: ["سياحة نكسس", "اكتشف الجزائر مدينة مدينة", "منصة سياحية: وجهات، خريطة، خطط رحلات، ميزانية، حجز، وتقييمات حقيقية."],
    realestate: ["عقارات نكسس", "بيتك القادم في 58 ولاية", "عروض بيع وإيجار مع فلاتر ذكية، مقارنة، حاسبة قرض، ووكلاء للتواصل."],
    finance: ["مالية نكسس", "مالك واضح… قرارات أسرع", "دفتر مالي كامل: حركات، ميزانيات، فواتير مع TVA، تقارير، وضرائب."],
    restaurant: ["مطعم نكسس", "نكهة بيتية… وتوصيل سريع", "مطعم: قائمة، سلة، توصيل بالبلديات، حجز طاولات، ولوحة مطبخ مباشرة."],
    arcade: ["ألعاب نكسس", "أربع ألعاب… بلا تحميل", "مجموعة ألعاب كاملة بمحرّك داخلي: أدوار، دفاع أبراج، عدّاء، وزنزانة متولّدة."],
    crm: ["CRM نكسس", "كل عميل في مكانه الصحيح", "إدارة علاقات: جهات اتصال، مسار بيع بالسحب، مهام، مواعيد، وعروض أسعار."],
    support: ["مركز دعم نكسس", "مساعدة سريعة بلا انتظار", "مركز دعم: تذاكر، أولويات، زمن استجابة، قاعدة معرفة، وبحث فوري."],
    docs: ["توثيق نكسس", "ابدأ في 5 دقائق", "بوابة توثيق: بحث، فهرس، أمثلة كود قابلة للنسخ، ومرجع API."],
    admin: ["إدارة نكسس", "تحكّم كامل… وصلاحيات دقيقة", "لوحة إدارية: بيانات قابلة للتعديل، مستخدمون، سجل تدقيق، وتصدير."],
  };
  const [title, tagline, desc] = titles[bp.id] ?? [brand, bp.pitch, bp.pitch];
  const custom = extractTitle(text);
  return { title: custom || title, tagline, desc: custom ? `${desc} — ${custom}` : desc };
}

/** Suggests several blueprints for a request (used by the UI chips). */
export function suggestBlueprints(text: string, limit = 4): { id: string; label: string; score: number }[] {
  return scoreBlueprints(text)
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => ({ id: s.blueprint.id, label: s.blueprint.label, score: s.score }));
}

export function planFromText(text: string, opts: PlanOptions = {}): PlanResult {
  const raw = (text || "").trim();
  const lang = opts.lang ?? detectLang(raw);
  const ranked = scoreBlueprints(raw, opts.blueprint);
  const bp = opts.blueprint ? (ranked.find((r) => r.blueprint.id === opts.blueprint)?.blueprint ?? ranked[0].blueprint) : ranked[0].blueprint;
  const features = detectFeatures(raw);
  const gameModule = detectGameModule(raw);
  const scale = opts.scale ?? detectScale(raw);
  const named = titleFromBlueprint(bp, raw);
  const seed = seedFrom(`${raw}|${bp.id}|${scale}`);
  const slugSeed = (seed % 9973).toString(36);

  const modules = [...(opts.modules ?? [])];
  if (bp.kind === "game" && gameModule) modules.push(gameModule);
  for (const f of features) if (f === "pwa" || f === "security" || f === "chat" || f === "csv" || f === "audit") modules.push(f === "chat" ? "chat" : f);

  const plan: ApexPlan = {
    id: `nx-${bp.id}-${slugSeed}`,
    title: opts.title ?? named.title,
    tagline: named.tagline,
    desc: named.desc,
    blueprint: bp.id,
    kind: bp.kind,
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    palette: opts.palette ?? paletteFor(bp.id, features),
    scale,
    seed,
    modules: Array.from(new Set(modules)),
    features,
    brand: opts.brand,
    pages: opts.pages,
  };

  const reading = [
    `النوع: ${bp.label}`,
    `اللغة: ${lang === "ar" ? "عربية/RTL" : lang}`,
    `الحجم: ${scale === "legend" ? "أسطوري (6k+ سطر)" : scale === "large" ? "كبير (3k+)" : "قياسي"}`,
    features.length ? `ميزات مكتشفة: ${features.slice(0, 8).join(" · ")}` : "ميزات إضافية: لا شيء صريح",
    `مصدر القرار: ${ranked[0].hits.length ? `كلمات مفتاحية (${ranked[0].hits.slice(0, 5).join(", ")})` : "الصيغة الافتراضية"}`,
  ].join("\n");

  return {
    plan,
    blueprint: bp,
    alternatives: ranked.slice(0, 5).map((r) => ({ blueprint: r.blueprint.id, label: r.blueprint.label, score: r.score })),
    reading,
  };
}

export { detectFeatures, detectGameModule, paletteFor };
