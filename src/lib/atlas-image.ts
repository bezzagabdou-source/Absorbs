/**
 * NEXUS ATLAS — محرك التصميم v18 (ATLAS ART DIRECTION)
 * ---------------------------------------------------------------------------
 * What makes an image engine feel "Gemini-level" is not the model, it is the
 * *direction* given to the model. This module reads the user's raw idea —
 * Arabic, Darija, French, English, mixed, misspelled, or a single vague word —
 * recognises what they are actually asking for (poster? logo? food shot?
 * Casbah at dusk?), and returns a precise art-direction brief: composition,
 * shot, lighting, palette, materials, typography and negatives.
 *
 * Pure & dependency-free: it runs in the API route and in unit tests.
 */

export type SceneId =
  | "poster"
  | "logo"
  | "branding"
  | "product"
  | "food"
  | "portrait"
  | "fashion"
  | "landscape"
  | "architecture"
  | "interior"
  | "tech"
  | "science"
  | "religious"
  | "sport"
  | "animal"
  | "vehicle"
  | "kids"
  | "celebration"
  | "abstract"
  | "comic"
  | "generic";

export type ScenePlan = {
  scene: SceneId;
  label: string;
  /** what the engine must do — composition, shot, light, palette, materials */
  direction: string;
  /** extra negatives for this scene */
  avoid: string;
  /** matched keywords (useful for logs & the UI) */
  matched: string[];
  /** the request wants real lettering inside the picture */
  wantsText: boolean;
  /** the request is a design/branding deliverable (vector look, layout, mockup) */
  isDesign: boolean;
  /** detected Algerian / North-African cultural context */
  algerian: boolean;
};

type Rule = { id: SceneId; label: string; words: string[]; direction: string; avoid: string; design?: boolean };

/** Arabic + Darija + French + English keyword tables (lowercase, no diacritics). */
const RULES: Rule[] = [
  {
    id: "logo",
    label: "شعار / لوغو",
    design: true,
    words: ["logo", "logotype", "شعار", "شعارات", "لوغو", "لوڨو", "logo", "emblème", "embleme", "marque", "icon", "أيقونة", "ايكونة", "badge", "شعار شركة"],
    direction:
      "Vector-style logo design on a clean flat background: one strong geometric mark with a clear silhouette readable at 16px, balanced negative space, maximum two colours from one harmonious palette, mathematically aligned curves, optional wordmark set in a clean modern typeface beneath or beside the mark, presented like a professional brand sheet with generous margins, absolutely no photo texture, no gradients mesh noise, no 3D bevel unless requested.",
    avoid: "photorealism, camera noise, complex illustration, more than three colours, thin fragile strokes, drop shadows, cluttered details, unreadable at small size",
  },
  {
    id: "poster",
    label: "ملصق / إعلان",
    design: true,
    words: ["poster", "affiche", "ملصق", "بوستر", "إعلان", "اعلان", "إشهار", "اشهار", "pub", "publicité", "publicite", "flyer", "منشور", "banner", "لافتة", "panneau", "billboard", "cover", "غلاف", "thumbnail", "صورة يوتيوب", "ستوري", "story", "invitation", "دعوة", "carte", "بطاقة"],
    direction:
      "Graphic design layout with a clear visual hierarchy: one dominant focal image, a strong headline area with real breathing room, a secondary information block, and consistent margins on a grid. Bold confident typography, high contrast between title and body, an accent colour used sparingly for emphasis, background simplified so the message wins, print-ready composition with no element touching the edges.",
    avoid: "wall of text, centred everything, random colours, low contrast, decorative elements fighting the headline, lorem ipsum gibberish, cut-off words",
  },
  {
    id: "branding",
    label: "هوية بصرية",
    design: true,
    words: ["branding", "identité visuelle", "identite visuelle", "هوية بصرية", "charte graphique", "brand kit", "mockup", "موكاب", "carte de visite", "بطاقة زيارة", "packaging", "تغليف", "emballage", "identité", "identité de marque", "marque complète"],
    direction:
      "Professional brand presentation: the identity shown on real mockups (business card, signage, packaging, screen) arranged in a clean grid, consistent colour palette applied everywhere, one type family with clear weights, soft studio lighting, subtle shadows, neutral background, everything aligned to the same visual system.",
    avoid: "inconsistent colours between mockups, random typefaces, skewed perspective, dirty background, floating unattached elements",
  },
  {
    id: "product",
    label: "صورة منتج",
    words: ["product", "produit", "منتج", "سلعة", "بضاعة", "ecommerce", "e-commerce", "تجارة إلكترونية", "boutique", "متجر", "shop", "packshot", "photo produit", "commercial shot", "ad photo"],
    direction:
      "Commercial product photograph: hero product centred or on a rule-of-thirds intersection, seamless studio backdrop or a tasteful lifestyle surface, large softbox key light with a subtle rim light to separate the edges, controlled reflections, true-to-life materials and colours, razor-sharp focus across the product, clean composition with space for a caption.",
    avoid: "harsh direct flash, muddy reflections, warped proportions, floating product without shadow, busy background, fingerprints or dust",
  },
  {
    id: "food",
    label: "طعام وأكل",
    words: ["food", "nourriture", "plat", "أكل", "طعام", "ماكلة", "مأكولات", "couscous", "كسكسي", "كسكس", "rechta", "رشتة", "chorba", "شربة", "harira", "حريرة", "baklawa", "بقلاوة", "قطايف", "قهوة", "café", "cafe", "coffee", "restaurant", "مطعم", "pizza", "برغر", "burger", "تاجين", "tajine", "dish", "recette", "وصفة"],
    direction:
      "Editorial food photograph: 100mm macro perspective at 45° or straight overhead, soft directional window light from the side, visible steam and moisture, realistic crumb and sauce textures, warm appetising colour grade, a few authentic props (linen, ceramic, wooden board, herbs) arranged loosely, shallow depth of field on the hero bite.",
    avoid: "plastic-looking food, grey unappetising tones, overhead flash, messy plate, fake garnish everywhere, cold blue cast",
  },
  {
    id: "portrait",
    label: "بورتريه",
    words: ["portrait", "face", "وجه", "بورتريه", "صورة شخصية", "شخص", "person", "personne", "رجل", "امرأة", "امراة", "بنت", "ولد", "شاب", "شيخ", "عجوز", "طفل", "طفلة", "headshot", "selfie", "سيلفي", "visage", "homme", "femme", "enfant", "personnage"],
    direction:
      "Photorealistic portrait: 85mm f/1.4 look, eyes tack-sharp with a natural catchlight, soft key light with gentle falloff, authentic skin texture (pores, fine hairs, natural tone variation — no plastic smoothing), believable anatomy of hands and teeth, expression that matches the mood, background softly out of focus but readable, respectful and dignified framing.",
    avoid: "extra or fused fingers, warped ears, dead eyes, over-smoothed plastic skin, uncanny symmetry, distorted teeth, wrong number of limbs",
  },
  {
    id: "fashion",
    label: "لباس وموضة",
    words: ["fashion", "mode", "ملابس", "لباس", "كاراكو", "karakou", "قندورة", "kandoura", "qandoura", "بلوزة", "ملحفة", "djellaba", "جلابة", "برنوس", "burnous", "حجاب", "hijab", "robe", "costume", "بدلة", "tenue", "outfit", "streetwear", "haute couture", "vêtement", "vetement", "habit"],
    direction:
      "Fashion editorial: full outfit clearly readable, fabric texture and drape rendered accurately (weave, embroidery thread, folds), model posed naturally with confident posture, lighting that sculpts the garment, culturally authentic and respectful styling, background complementary but never competing, colour palette harmonised with the outfit.",
    avoid: "melted fabric, impossible embroidery patterns, wrong anatomy under clothes, distorted hands, cluttered background, cultural caricature",
  },
  {
    id: "landscape",
    label: "طبيعة ومناظر",
    words: ["landscape", "nature", "طبيعة", "منظر", "جبل", "montagne", "بحر", "mer", "sea", "شاطئ", "plage", "beach", "صحراء", "sahara", "desert", "غابة", "forêt", "foret", "forest", "وادي", "oued", "واحة", "oasis", "سماء", "ciel", "sky", "غروب", "coucher de soleil", "sunset", "شروق", "sunrise", "نجوم", "étoiles", "etoiles", "stars", "ثلج", "neige", "snow", "بحيرة", "lac", "lake"],
    direction:
      "Landscape photograph: strong foreground interest leading the eye to the horizon, layered depth (foreground / midground / background), golden-hour or blue-hour light with real atmosphere, accurate sky and cloud structure, high dynamic range without HDR halos, straight horizon, scale given by a human or animal element where useful, rich natural colour grading.",
    avoid: "flat midday light, oversaturated HDR look, tilted horizon, empty featureless sky, plastic water, repeating texture artefacts",
  },
  {
    id: "architecture",
    label: "عمارة ومعالم",
    words: ["architecture", "عمارة", "معمار", "building", "bâtiment", "batiment", "casa", "casbah", "قصبة", "mosquée", "مسجد", "مساجد", "mosque", "monument", "معلم", "مقام الشهيد", "tour", "برج", "pont", "جسر", "bridge", "facade", "واجهة", "ville", "مدينة", "شارع", "rue", "street", "notre dame", "ketchaoua", "جامع", "منارة", "minaret"],
    direction:
      "Architectural photograph: verticals kept perfectly straight (tilt-shift look), accurate perspective and scale, structure filling the frame with clean geometry, light that reveals material (stone grain, tile glaze, concrete texture, carved plaster), sky balanced against the building, human figures allowed only for scale, symmetrical composition when the building is symmetrical.",
    avoid: "converging verticals, fisheye distortion, blown-out sky, warped ornaments, invented architectural elements, misplaced cultural details",
  },
  {
    id: "interior",
    label: "ديكور داخلي",
    words: ["interior", "intérieur", "interieur", "ديكور", "غرفة", "chambre", "room", "salon", "صالون", "cuisine", "مطبخ", "bureau", "مكتب", "office", "house", "منزل", "بيت", "appartement", "شقة", "decoration", "décoration", "ameublement", "أثاث", "meuble"],
    direction:
      "Interior design photograph: wide but undistorted view, natural light from real windows plus practical lamps, coherent material palette (wood, stone, textile, metal), styled but lived-in surfaces, correct perspective with vertical lines straight, depth created by layering furniture, warm inviting colour temperature.",
    avoid: "floating furniture, impossible geometry, mismatched styles, over-bright blown windows, distorted walls, empty sterile showroom look",
  },
  {
    id: "tech",
    label: "تقنية وبرمجة",
    words: ["code", "كود", "programming", "برمجة", "developer", "مطور", "app", "تطبيق", "application", "website", "موقع", "ui", "ux", "interface", "واجهة", "dashboard", "لوحة", "ai", "ذكاء اصطناعي", "robot", "روبوت", "server", "سيرفر", "data", "بيانات", "cyber", "أمن سيبراني", "phone", "هاتف", "laptop", "حاسوب", "ordinateur", "chip", "شريحة", "circuit"],
    direction:
      "Technology visual: clean modern composition, dark or light studio surface with a subtle colour-tinted rim light, accurate hardware detail (ports, screen bezels, keyboard), on-screen content plausible and legible at a glance, data visualisations with real hierarchy, cool precise colour grade with one accent hue, generous negative space for a headline.",
    avoid: "gibberish code with syntax errors visible, impossible interfaces, warped screens, random glowing lines with no meaning, fake holograms everywhere",
  },
  {
    id: "science",
    label: "علوم وتعليم",
    words: ["science", "علوم", "chemistry", "كيمياء", "physics", "فيزياء", "biology", "بيولوجيا", "math", "رياضيات", "lab", "laboratoire", "مخبر", "laboratory", "molecule", "جزيء", "atom", "ذرة", "space", "فضاء", "planet", "كوكب", "galaxy", "مجرة", "dna", "cell", "خلية", "experiment", "تجربة", "school", "مدرسة", "université", "جامعة", "teacher", "أستاذ", "درس", "lesson", "education", "تعليم"],
    direction:
      "Science & education visual: accurate and instructive depiction, clear focal subject with labelled-looking structure, laboratory or cosmic scale rendered believably, crisp macro or telescope perspective as appropriate, colour used to distinguish elements meaningfully, clean composition that could sit in a textbook or a documentary frame.",
    avoid: "cartoonish wrong anatomy of molecules or organs, random glowing blobs, inaccurate lab equipment, cluttered bench, mystical look for a scientific subject",
  },
  {
    id: "religious",
    label: "ديني وروحاني",
    words: ["mosque", "مسجد", "مساجد", "جامع", "الجامع", "القرآن", "قرآن", "quran", "koran", "ramadan", "رمضان", "eid", "عيد", "أضحى", "فطر", "prayer", "صلاة", "دعاء", "dua", "hajj", "حج", "kaaba", "الكعبة", "مكة", "مدينة", "medina", "منارة", "minaret", "islamic", "إسلامي", "geometric pattern", "زخرفة", "arabesque", "تسبيح", "سبحة", "misbaha", "lantern", "فانوس"],
    direction:
      "Respectful Islamic visual: authentic architectural or devotional subject, warm serene light (lantern glow, dawn or dusk), geometric and arabesque ornamentation drawn with correct symmetry and tessellation, calm dignified atmosphere, no depiction of sacred persons, calligraphy only when explicitly requested and then rendered with correct joined RTL letters.",
    avoid: "caricature, inaccurate religious symbols, mirrored or broken arabesque patterns, disrespectful framing, invented calligraphy, mixed religious iconography",
  },
  {
    id: "sport",
    label: "رياضة",
    words: ["sport", "رياضة", "football", "soccer", "كرة القدم", "كورة", "basket", "كرة السلة", "tennis", "running", "جري", "gym", "صالة رياضية", "muscle", "عضلات", "workout", "training", "تدريب", "match", "مباراة", "stadium", "ملعب", "team", "فريق", "athlete", "رياضي", "yoga", "يوغا", "swimming", "سباحة", "boxing", "ملاكمة", "karate", "judo", "الرياضة"],
    direction:
      "Sports photograph: peak-action moment frozen with a fast shutter, dynamic diagonal composition conveying motion, dramatic stadium or gym lighting with visible sweat and effort, accurate anatomy and muscle definition, correct equipment and uniforms, background separated by motion blur or shallow depth of field.",
    avoid: "static posed look for an action scene, distorted limbs, wrong sport equipment, floating athletes without ground contact, empty stadium when energy is asked for",
  },
  {
    id: "animal",
    label: "حيوانات",
    words: ["animal", "حيوان", "حيوانات", "cat", "قط", "قطة", "chat", "dog", "كلب", "chien", "horse", "حصان", "خيل", "cheval", "falcon", "صقر", "lion", "أسد", "camel", "جمل", "dromadaire", "bird", "طائر", "oiseau", "fish", "سمك", "poisson", "sheep", "خروف", "mouton", "cow", "بقرة", "fox", "ثعلب", "fennec", "فنك", "wolf", "ذئب"],
    direction:
      "Animal photograph: eyes sharp with a catchlight, fur or feather or scale texture rendered strand by strand, natural anatomy and proportions for the species, behaviour that is characteristic of the animal, habitat accurate to the species, telephoto compression with creamy bokeh, warm natural light.",
    avoid: "human-like expressions, wrong number of legs, plastic fur, hybrid species by accident, distorted eyes, floating animal without ground shadow",
  },
  {
    id: "vehicle",
    label: "سيارات ومركبات",
    words: ["car", "سيارة", "طوموبيل", "voiture", "truck", "شاحنة", "camion", "motorcycle", "دراجة نارية", "moto", "bus", "حافلة", "train", "قطار", "plane", "طائرة", "avion", "boat", "قارب", "bateau", "vehicle", "مركبة", "4x4", "engine", "محرك"],
    direction:
      "Automotive photograph: three-quarter or dynamic low angle showing the vehicle's character, paint with accurate reflections of the environment, wheels and glass rendered correctly, studio or location light with a long soft highlight along the body, background contextual but not distracting, correct proportions and stance.",
    avoid: "warped body panels, wrong wheel count, melted reflections, impossible perspective, cartoon proportions, blurred plates with gibberish",
  },
  {
    id: "kids",
    label: "أطفال وعائلة",
    words: ["child", "طفل", "أطفال", "اطفال", "kid", "enfant", "baby", "رضيع", "bébé", "bebe", "family", "عائلة", "famille", "mother", "أم", "mère", "mere", "father", "أب", "père", "pere", "school kids", "تلاميذ", "kids playing", "ألعاب أطفال", "cartoon kids", "رسوم أطفال"],
    direction:
      "Warm family or children visual: soft natural light, genuine joyful expression, safe and wholesome setting, bright but not over-saturated palette, clothing and props age-appropriate and culturally coherent, eye-level camera for intimacy, soft background separation.",
    avoid: "creepy adult features on a child, distorted hands, harsh shadows, unsafe situations, uncanny eyes, overly sexualised styling",
  },
  {
    id: "celebration",
    label: "أعراس واحتفالات",
    words: ["wedding", "عرس", "زواج", "mariage", "birthday", "عيد ميلاد", "anniversaire", "celebration", "احتفال", "fête", "fete", "party", "حفلة", "graduation", "تخرج", "diplôme", "diplome", "success", "نجاح", "new year", "رأس السنة", "confetti", "كونفيتي", "cake", "كيك", "gâteau", "gateau", "gift", "هدية", "cadeau"],
    direction:
      "Celebration visual: genuine emotion and movement, warm festive lighting with practical sources (candles, fairy lights, confetti catching light), rich but harmonious palette, layered composition with a clear hero moment, shallow depth of field to isolate the emotion, tasteful decorative detail.",
    avoid: "empty staged room, flat lighting, lifeless faces, chaotic clutter, random confetti covering the subject, over-saturated plastic look",
  },
  {
    id: "abstract",
    label: "تجريدي وخلفيات",
    words: ["abstract", "تجريدي", "background", "خلفية", "wallpaper", "خلفية سطح المكتب", "texture", "ملمس", "pattern", "نمط", "زخرفة", "gradient", "تدرج", "shapes", "أشكال", "geometric", "هندسي", "fluid", "سائل", "marble", "رخام", "wallpaper 4k", "خلفية هاتف"],
    direction:
      "Abstract design: purposeful composition with rhythm and balance, one dominant colour story with an accent, smooth clean gradients or accurate material texture, geometric precision or controlled organic flow, high resolution detail suitable as a background, generous space where a title could sit.",
    avoid: "random noise, muddy colours, visible banding in gradients, chaotic elements with no focal point, low resolution artefacts, watermarks",
  },
  {
    id: "comic",
    label: "قصص مصورة وأنمي",
    words: ["anime", "أنمي", "manga", "مانجا", "cartoon", "كرتون", "comic", "قصص مصورة", "illustration", "رسم", "dessin", "drawing", "sketch", "سكيتش", "character design", "تصميم شخصية", "pixel art", "بكسل", "chibi", "game art", "فن اللعبة"],
    direction:
      "Illustration / anime key visual: clean confident line art with varied line weight, expressive readable face, cel shading with soft gradients and a coherent light source, vivid harmonious palette, dynamic pose with clear silhouette, detailed painted background that supports the character, consistent style across the whole frame.",
    avoid: "muddy inconsistent linework, broken perspective, random colour spots, photorealistic textures mixed into a flat style, extra limbs, illegible face",
  },
];

/** Algerian / North-African cultural anchors that must stay authentic. */
const ALGERIAN_WORDS = [
  "algeria", "algérie", "algerie", "algerian", "algérien", "الجزائر", "جزائري", "جزائرية", "الجزائرية",
  "casbah", "قصبة", "algiers", "الجزائر العاصمة", "oran", "وهران", "constantine", "قسنطينة", "annaba", "عنابة",
  "sahara", "الصحراء", "tamanrasset", "تمنراست", "ghardaia", "غرداية", "tlemcen", "تلمسان", "bejaia", "بجاية",
  "kabylie", "القبائل", "chaoui", "شاوي", "mozabite", "ميزاب", "tuareg", "طوارق", "couscous", "كسكسي",
  "karakou", "كاراكو", "blousa", "بلوزة", "burnous", "برنوس", "chach", "الشاش", "karakou oranais",
  "مقام الشهيد", "maquam", "ketchaoua", "كتشاوة", "الأمير عبد القادر", "جامع الجزائر", "الجامع الأعظم",
  "dz", "دج", "الدينار", "wilaya", "ولاية",
];

const TEXT_WORDS = [
  "text", "كتب", "اكتب", "كتابة", "كلمة", "عبارة", "titre", "title", "عنوان", "caption", "slogan",
  "شعار مكتوب", "wordmark", "lettering", "calligraphy", "خط عربي", "كتابة عربية", "write", "written",
  "says", "يقول", "بخط", "بالخط", "باسم", "name of", "اسم",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF\u0750-\u077F\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detects the scene, cultural context and typography need of a raw idea. */
export function planScene(raw: string): ScenePlan {
  const text = norm(raw);
  const matched: string[] = [];
  const scores = new Map<SceneId, number>();

  for (const r of RULES) {
    let s = 0;
    for (const w of r.words) {
      const nw = norm(w);
      if (!nw) continue;
      if (text.includes(nw)) {
        // a whole-word match is stronger than a substring
        const word = new RegExp(`(^|\\s)${nw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(\\s|$)`);
        s += word.test(text) ? 2.4 : 1.4;
        matched.push(w);
      }
    }
    if (s) scores.set(r.id, (scores.get(r.id) ?? 0) + s);
  }

  let best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  // a religious subject wins over "architecture" when both match (مسجد = a mosque, not a building shot)
  if (best && best[0] === "architecture" && (scores.get("religious") ?? 0) >= 1.4) {
    best = ["religious", scores.get("religious") as number];
  }
  const rule = best && best[1] >= 1.4 ? RULES.find((r) => r.id === best[0]) : undefined;
  const wantsText = TEXT_WORDS.some((w) => text.includes(norm(w))) || /["«»]/.test(raw);
  const algerian = ALGERIAN_WORDS.some((w) => text.includes(norm(w)));

  const scene: SceneId = rule?.id ?? "generic";
  const label = rule?.label ?? "صورة عامة";

  const direction = [
    rule?.direction ??
      "Intentional studio-quality image: clear focal subject, professional lighting with a motivated source, harmonious palette, believable materials and micro-texture, clean composition with breathing room, mood that matches the subject.",
    algerian
      ? "Authentic Algerian / North-African context: correct local architecture, clothing, skin tones, light and colours — modern and dignified, never a tourist cliché or a caricature."
      : "",
    wantsText
      ? "Typography is part of the artwork: allocate a clear layout block for the text, keep it large, perfectly legible, correctly kerned, high contrast against its background, and never overlap the main subject's face or focal point."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    scene,
    label,
    direction,
    avoid: rule?.avoid ?? "blur, distortion, extra limbs, garbled text, watermark, low resolution, flat lighting",
    matched: Array.from(new Set(matched)).slice(0, 12),
    wantsText,
    isDesign: !!rule?.design,
    algerian,
  };
}

/**
 * Suggests the best aspect ratio + style id for a scene when the user did not
 * pick one. Returns null when the user's explicit choice should win.
 */
export function suggestFraming(plan: ScenePlan, askedAspect?: string | null): { aspect: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | null; note: string } {
  if (askedAspect) return { aspect: null, note: "" };
  const map: Partial<Record<SceneId, "1:1" | "16:9" | "9:16" | "4:3" | "3:4">> = {
    poster: "3:4",
    logo: "1:1",
    branding: "16:9",
    product: "1:1",
    food: "4:3",
    portrait: "3:4",
    fashion: "3:4",
    landscape: "16:9",
    architecture: "16:9",
    interior: "16:9",
    tech: "16:9",
    science: "16:9",
    religious: "3:4",
    sport: "16:9",
    animal: "4:3",
    vehicle: "16:9",
    kids: "4:3",
    celebration: "3:4",
    abstract: "16:9",
    comic: "3:4",
  };
  const aspect = map[plan.scene] ?? null;
  return { aspect, note: aspect ? `Framing chosen for a ${plan.label}: ${aspect}.` : "" };
}

/** Extra negatives specific to the Algerian / Arabic context. */
export const ATLAS_IMAGE_NEGATIVE =
  "Avoid: garbled or invented Arabic letters, mirrored RTL script, Latin transliteration of Arabic words, cultural clichés (generic desert with a camel for any Arab subject), inaccurate traditional dress, distorted hands and faces, watermark, signature, stock-photo look, dull flat lighting.";
