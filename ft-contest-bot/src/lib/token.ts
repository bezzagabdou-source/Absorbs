/**
 * 🔑 مصدر واحد لتوكن البوت — مع سلسلة احتياط.
 *
 * المشكل الحقيقي اللي كان كيوقّف البوت: `TELEGRAM_BOT_TOKEN` موجود في Vercel
 * كمتغيّر بقيمة فارغة (sensitive)، فالكود كان كياخدو وينتهي — البوت كيبقى بلا
 * توكن حتى إذا كان `BOT_TOKEN` ولا `TELEGRAM_BOT_TOKEN_2` معمّرين. هنا كنقراو
 * كل الأسماء المحتملة وكنتجاهلو الفارغ، وكنرجّعو أول توكن صالح الشكل.
 *
 * القاعدة: `undefined`/`""`/مسافات = غير موجود. توكن صالح = `<أرقام>:<35+ حرف>`.
 */

/** أسماء متغيّرات التوكن الأساسي بالترتيب (الأول الصالح كيتستعمل) */
const PRIMARY_KEYS = ["TELEGRAM_BOT_TOKEN", "BOT_TOKEN", "TG_BOT_TOKEN", "BOT_API_TOKEN"] as const;

/** أسماء متغيّرات البوت الثاني */
const SECOND_KEYS = ["TELEGRAM_BOT_TOKEN_2", "BOT_TOKEN_2", "TG_BOT_TOKEN_2"] as const;

/** شكل توكن تيليغرام: 6-12 رقم، نقطتان، 30+ حرف */
const TOKEN_SHAPE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/** صالح؟ (شكل فقط — التحقّق النهائي كيديرو تيليغرام) */
export function looksLikeToken(value: unknown): boolean {
  return TOKEN_SHAPE.test(clean(value));
}

/** أول قيمة غير فارغة من قائمة أسماء */
function firstNonEmpty(keys: readonly string[]): string {
  for (const key of keys) {
    const value = clean(process.env[key]);
    if (value) return value;
  }
  return "";
}

/**
 * التوكن الأساسي. كياخد أول متغيّر غير فارغ (بغض النظر عن الشكل)، وإلا كيدير
 * احتياط على توكن البوت الثاني — حيت بوت واحد خدّام خير من بوت ميّت.
 */
export function resolveBotToken(): string {
  const primary = firstNonEmpty(PRIMARY_KEYS);
  if (primary) return primary;
  // احتياط: ما نخلّيوش البوت بلا توكن إذا كان غير الاسم التاني معمّر
  const second = firstNonEmpty(SECOND_KEYS);
  return second || "";
}

/** توكن البوت الثاني — صريح فقط، وما كيرجعش نفس توكن البوت الأول */
export function resolveSecondBotToken(): string {
  const second = firstNonEmpty(SECOND_KEYS);
  if (!second) return "";
  return second === resolveBotToken() ? "" : second;
}

/** معرّف البوت من التوكن (الجزء قبل النقطتين) */
export function tokenBotId(token = resolveBotToken()): number {
  return Number(clean(token).split(":")[0]) || 0;
}

/**
 * تشخيص بلا كشف التوكن: شنو موجود وشنو فارغ. كيبان في /api/health.
 * ⚠️ عمرنا ما كنرجّعو التوكن نفسو هنا.
 */
export function tokenDiagnostics(): { source: string; configured: boolean; masked: string; emptyNames: string[]; rejectedShape: string[] } {
  const all = [...PRIMARY_KEYS, ...SECOND_KEYS];
  const emptyNames: string[] = [];
  const rejectedShape: string[] = [];
  let source = "";
  let value = "";
  for (const key of all) {
    const raw = clean(process.env[key]);
    if (!raw) {
      emptyNames.push(key);
      continue;
    }
    if (!looksLikeToken(raw)) {
      rejectedShape.push(key);
      continue;
    }
    if (!source) {
      source = key;
      value = raw;
    }
  }
  const id = tokenBotId(value);
  return {
    source,
    configured: Boolean(value),
    // غير آخر 4 حروف — يكفي للتشخيص وما يكشفش السر
    masked: value ? `${id}:…${value.slice(-4)}` : "",
    emptyNames,
    rejectedShape,
  };
}
