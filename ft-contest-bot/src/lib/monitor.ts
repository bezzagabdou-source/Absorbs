/**
 * 👁️ مراقب الذكاء الاصطناعي الخفي (AI Monitor) — يراقب كل عضو يدخل البوت:
 *   • يجمع صورته (صورة بروفايل) واسماه (@username) وبايو (bio) إن توفّر.
 *   • يفحصهم بمزوّد ذكاء اصطناعي (Gemini رؤية أولاً، ثم Groq/OpenRouter + محلّل الأسماء والبايو).
 *   • إلا وُجد دليل أن العضو امرأة، يسجّل تقريراً ويرسل للمالك عبر لوحة
 *     التحكم صفحة مخصصة (مراقب الذكاء الاصطناعي) مع زر «حضر».
 *
 * المراقبة خفية: العضو ما يحسّش بيها وما يتبعثّش ليه حتى رسالة.
 * كل العملية محفوظة في التخزين الموحّد (Redis / Postgres / ذاكرة).
 */

import { rawTg, sendMessage, banChatMember, getChatInfo, isMock } from "./telegram";
import { getStore } from "./store";
import { getSettings } from "./settings";
import { getJoinGroup, pushAdminLog, setBanned } from "./rewards";
import { adminChatIds, getUser, listRecentUsers } from "./users";
import type { Settings } from "./types";

export type MonitorStatus = "pending" | "banned" | "unbanned" | "dismissed";

export type MonitorReport = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
  /** صورة البروفايل كـ data URL (محفوظة إن توفّرت وصغيرة). */
  photo: string;
  gender: "female" | "male" | "unknown";
  confidence: number;
  evidence: string;
  provider: string;
  chatId: string;
  source: string;
  status: MonitorStatus;
  createdAt: number;
  decidedAt?: number;
};

const REPORTS_KEY = "monitor:reports";
const SEEN_KEY = (userId: string) => `monitor:seen:${userId}`;
const USER_KEY = (userId: string) => `monitor:user:${userId}`;
const REPORT_CAP = 200; // عدد التقارير المحفوظة (الأحدث أولاً)
const PHOTO_MAX = 200_000; // حد حجم الصورة المحفوظة (بايت)
const CLASSIFY_TIMEOUT_MS = 9_000;

/** المراقبة مفعّلة إلا أُطلِق MONITOR_DISABLED=1. */
export function monitorEnabled(): boolean {
  return process.env.MONITOR_DISABLED !== "1";
}

/** مزوّدون الذكاء الاصطناعي المتوفّرون للمراقب (أسماء فقط — لا مفاتيح). */
export function monitorConfigured(): { gemini: boolean; others: boolean } {
  const gemini = Boolean(
    envKey("GEMINI_API_KEY", "GEMINI_API_KEY_FALLBACK", "GEMINI_FALLBACK_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY")
  );
  const others = Boolean(envKey("GROQ_API_KEY") || envKey("OPENROUTER_API_KEY") || envKey("OPENAI_API_KEY"));
  return { gemini, others };
}

function envKey(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 8) return value.trim().split(/[,\s]+/)[0];
  }
  return "";
}

function envAllKeys(...names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const raw = process.env[name] || "";
    for (const part of raw.split(/[,;\s]+/)) {
      const k = part.trim();
      if (k.length > 8 && !out.includes(k)) out.push(k);
    }
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────────────── */
/* جمع صورة البروفايل وبيانات العضو                                           */
/* ───────────────────────────────────────────────────────────────────────── */

type ProfilePhotosResult = {
  photos?: { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }[][];
};

/** خذ أول صورة بروفايل (الأكبر) كـ data URL. في المحاكاة نرجّع null بلا شبكة. */
export async function fetchProfilePhoto(userId: string | number): Promise<string | null> {
  if (isMock()) return null;
  const uid = String(userId);
  const photos = await rawTg<ProfilePhotosResult>("getUserProfilePhotos", { user_id: uid, limit: 1 });
  if (!photos.ok || !photos.result?.photos?.length) return null;
  const first = photos.result.photos[0] || [];
  if (!first.length) return null;
  // أكبر حجم (آخر عنصر عادة الأكبر)
  const pick = [...first].sort((a, b) => (a.width * a.height) - (b.width * b.height)).at(-1);
  if (!pick) return null;
  const file = await rawTg<{ file_path?: string }>("getFile", { file_id: pick.file_id });
  const path = file.ok ? file.result?.file_path || "" : "";
  if (!path) return null;
  const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "").split(":").slice(0, 2).join(":");
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > PHOTO_MAX) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────────── */
/* تصنيف الجنس بالذكاء الاصطناعي + محلّل الأسماء والبايو الاحتياطي             */
/* ───────────────────────────────────────────────────────────────────────── */

export type ClassifyResult = {
  ok: boolean;
  gender: "female" | "male" | "unknown";
  confidence: number;
  evidence: string;
  provider: string;
  error?: string;
};

const CLASSIFY_PROMPT = `أنت مراقب آلي دقيق لدخول الأعضاء فبوت مسابقات مغربي/جزائري (جمهور عربي). مهمتك: تحديد هل صاحب الحساب امرأة (female) أم رجل (male) أم ما كاينش دليل كافٍ (unknown).

فحص بمستويات، سطّر كل واحدة على حدة:
1) صورة البروفايل: الوجه، الشعر، المكياج، الحجاب/النقاب، اللباس، الوضعية، الإطار، الفلاتر. صورة أنثى واضحة = دليل قوي. صورة رجل واضحة = دليل قوي. أنمي/شعار/منظر/بدون صورة = بلا دليل.
2) الاسم (الأول + العائلة): الأسماء المؤنثة العربية/الأمازيغية/الفرنسية (فاطمة، سارة، مريم، خديجة، نور، سلمى، شيماء، مروة، إكرام، نسرين، ياسمين، منال، إيمان، حنان، نادية، ليلى، زهراء، ملاك، لينا، رانيا، داليا، أسماء، حفصة، حبيبة، زينب، رقية، سميرة، كريمة، لطيفة، جميلة، نوال، فريدة، سميرة، أمينة، هدى، إلهام، سناء، وفاء، صفاء، رجاء، سعاد، خولة، أمال، نجلاء، بشرى، سهام، ثريا … / Fatima, Sara, Sarah, Mariam, Meriem, Khadija, Nour, Salma, Chaimae, Marwa, Ikram, Nisrine, Yasmine, Manal, Imane, Hanane, Nadia, Leila, Zahra, Malak, Lina, Rania, Dalia, Asmae, Hafsa, Habiba, Zineb, Soukaina, Oumaima, Hind, Houda, Ilham, Sanae, Wafa, Souad, Khawla, Amal, Najla, Bouchra, Souhaila, Rim, Rym, Chaima, Aya, Douae, Tasmime …).
3) @username: كلمات مؤنثة داخلة فيه (ex: sarah_99, girl, female, queen, princess, mama, bnt, bent).
4) البايو (bio): كلمات مثل «بنت، فتاة، أنثى، طالبة، مسلمة وافتخر، أميرة، ملكة، ممنوع الخاص، خاص مقفل، girl, female, woman, queen, princess, étudiante».
5) السياق: الحساب كيدخّل بنات فالإحالات (شغل «تيم بنات»)، صور نمطية فاشلة، إسم + صورة أنثى = احتمال كبير.

قواعد الحكم:
- دليل قوي (صورة أنثى واضحة أو اسم مؤنث + صورة/بايو مؤنث) → female و confidence بين 0.75 و 0.98.
- دليل واحد متوسط (اسم مؤنث فقط أو بايو مؤنث فقط) → female و confidence بين 0.6 و 0.75.
- دليل ضعيف ولا متضارب (اسم مذكر + صورة غامضة) → male و confidence أقل من 0.6، ولا unknown.
- ما تخمّنش من العمر ولا من الجنسية. ما تعتمدش على لون الجلد. ما تعتبرش الحجاب وحده دليل مطلق إلا مع دليل آخر.
- «نور»، «أمل»، «هدى» أسماء مشتركة: إلا ما كاينش دليل آخر → unknown.

أجبه فقط بـ JSON نقي بهذه الصيغة بالضبط، بلا أي علامات كود وبلا أي نص زائد:
{"gender":"female"|"male"|"unknown","confidence":رقم بين 0 و 1,"evidence":"سبب قصير جداً بالعربية (أقل من 12 كلمة)"}
إلا ما كفاش الدليل: {"gender":"unknown","confidence":0,"evidence":"لا دليل كافٍ"}.`;

function parseClassifyText(raw: string): { gender: ClassifyResult["gender"]; confidence: number; evidence: string } | null {
  let text = String(raw || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const gender = String(data.gender || "").toLowerCase();
    if (!["female", "male", "unknown"].includes(gender)) return null;
    const confidence = Number(data.confidence);
    if (!Number.isFinite(confidence)) return null;
    return { gender: gender as ClassifyResult["gender"], confidence: Math.max(0, Math.min(1, confidence)), evidence: String(data.evidence || "").slice(0, 300) };
  } catch {
    return null;
  }
}

const FEMALE_ARABIC_NAMES = new Set([
  "فاطمة", "فاطمه", "سارة", "ساره", "مريم", "خديجة", "خديجه", "عائشة", "عائشه", "نور",
  "آية", "اية", "أية", "سلمى", "شيماء", "مروة", "مروى", "إكرام", "اكرام", "نسرين",
  "ياسمين", "ياسمينة", "منال", "إيمان", "ايمان", "سعاد", "حنان", "نادية", "ناديه", "ليلى",
  "زهراء", "الزهراء", "ملاك", "لينا", "رانيا", "داليا", "أسماء", "اسماء", "حفصة", "حبيبة",
  "زينب", "رقية", "حليمة", "سميرة", "كريمة", "لطيفة", "جميلة", "نوال", "فريدة", "سمية",
  "وفاء", "سهام", "ابتسام", "إبتسام", "كلثوم", "هدى", "راضية", "آسيا", "اسيا", "صبرينة",
  "أحلام", "احلام", "فريال", "ريمة", "ريما", "ليديا", "كاميليا", "ندى", "صفاء", "دعاء",
  "رهف", "رغد", "جنى", "تسنيم", "سندس", "سلسبيل", "بشرى", "هاجر", "رحمة", "غفران",
  "تقوى", "يقين", "ماريا", "سيرين", "لجين", "ريتاج", "إيناس", "ايناس", "أنيسة", "انيسة",
  "ناريمان", "شروق", "عبير", "خلود", "أمل", "امل", "حورية", "زهرة", "وردة", "فتيحة",
  "يمينة", "زليخة", "نصيرة", "فضيلة", "عقيلة", "مليكة", "سليمة", "رشيدة", "نعيمة", "حسيبة",
  "وهيبة", "أمينة", "امينة", "أميرة", "اميرة", "خولة", "مرام", "إلهام", "الهام", "كوثر",
  "ساجدة", "إشراق", "اشراق", "نرمين", "سلمى", "يسرى", "يسرا", "رتاج", "سجى", "لمى",
]);

const FEMALE_LATIN_NAMES = new Set([
  "fatima", "fatma", "sara", "sarah", "meriem", "meryem", "mariam", "maryam", "khadija", "aicha",
  "aya", "salma", "selma", "chaima", "cheima", "marwa", "meroua", "ikram", "nesrine", "nisrine",
  "yasmine", "yasmina", "manel", "manal", "imen", "imane", "souad", "hanane", "hanan", "nadia",
  "leila", "laila", "zahra", "malak", "lina", "rania", "dalia", "asma", "asmaa", "hafsa",
  "habiba", "zainab", "zineb", "zaynab", "halima", "samira", "karima", "latifa", "jamila", "djamila",
  "nawal", "nawel", "farida", "soumia", "soumaya", "wafa", "wafaa", "siham", "sihem", "ibtissem",
  "ibtissam", "keltoum", "houda", "hoda", "radia", "assia", "sabrina", "ahlem", "ahlam", "feriel",
  "ryma", "rima", "lydia", "kamelia", "nada", "safa", "safaa", "doaa", "rahaf", "raghad",
  "jana", "tasnim", "sondos", "salsabil", "bouchra", "bushra", "hajar", "hadjer", "rahma", "ghofrane",
  "takwa", "yaqeen", "maria", "sirine", "cyrine", "lujain", "ritaj", "ritadj", "ines", "anissa",
  "narimane", "chourouk", "abir", "abeer", "khouloud", "amal", "amel", "houria", "zohra", "warda",
  "ouarda", "fatiha", "yamina", "zoubida", "nassira", "fadila", "akila", "malika", "salima", "rachida",
  "naima", "hassiba", "wahiba", "amina", "amira", "khaoula", "maram", "ilham", "kawthar", "kaouthar",
  "yousra", "yosra", "saja", "lama", "nourhene", "nourhane", "soulef", "chahinez", "melissa", "celia",
]);

const FEMALE_BIO_PATTERNS = [
  /(?:^|\s)(?:طالبة|أختكم|اختكم|بنت|فتاة|انثى|أنثى|حساب بنات|ممنوع الخاص|خاص بلوك|لا اقبل خاص|مسلمة وافتخر|اميرة|أميرة|ملكة)(?:\s|$)/i,
  /\b(?:girl|female|woman|queen|princess|étudiante|femme|fille)\b/i,
];

/** تصنيف احتياطي بالاسم والبايو عند تعذّر مزوّدي الشبكة أو غياب الصورة. */
export function heuristicClassify(input: {
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
}): ClassifyResult | null {
  const fullName = `${input.firstName || ""} ${input.lastName || ""}`.trim();
  const tokens = fullName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const t of tokens) {
    if (FEMALE_ARABIC_NAMES.has(t)) {
      return { ok: true, gender: "female", confidence: 0.88, evidence: `اسم مؤنث واضح (${t})`, provider: "تحليل الأسماء الذكي" };
    }
    if (FEMALE_LATIN_NAMES.has(t)) {
      return { ok: true, gender: "female", confidence: 0.86, evidence: `اسم مؤنث (${t})`, provider: "تحليل الأسماء الذكي" };
    }
  }

  const cleanUser = String(input.username || "").replace(/^@/, "").toLowerCase().replace(/[0-9_.-]+/g, " ").trim();
  for (const part of cleanUser.split(/\s+/).filter((w) => w.length >= 3)) {
    if (FEMALE_LATIN_NAMES.has(part)) {
      return { ok: true, gender: "female", confidence: 0.82, evidence: `معرّف يحتوي اسماً مؤنثاً (@${input.username.replace(/^@/, "")})`, provider: "تحليل الأسماء الذكي" };
    }
  }

  const bioText = `${fullName} ${input.bio || ""}`;
  for (const re of FEMALE_BIO_PATTERNS) {
    const m = re.exec(bioText);
    if (m) {
      return { ok: true, gender: "female", confidence: 0.84, evidence: `دلالة مؤنثة في الملف الشخصي (${m[0].trim()})`, provider: "تحليل الأسماء الذكي" };
    }
  }

  return null;
}

type Candidate = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  gemini?: boolean;
};

/** يبني المرشّحين للتصنيف: جيميني أولاً (رؤية)، ثم Groq، ثم OpenRouter. */
export function buildClassifyCandidates(input: {
  photo: string | null;
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
}): Candidate[] {
  const text = [input.firstName, input.lastName, input.username ? `@${input.username.replace(/^@/, "")}` : "", input.bio]
    .filter(Boolean)
    .join(" · ");
  const image = input.photo || "";
  const candidates: Candidate[] = [];
  const geminiKeys = envAllKeys("GEMINI_API_KEY", "GEMINI_API_KEY_FALLBACK", "GEMINI_FALLBACK_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");
  const gemModel = (process.env.MONITOR_GEMINI_MODEL || "gemini-2.5-flash").trim();
  for (const geminiKey of geminiKeys.slice(0, 2)) {
    candidates.push({
      provider: "Google Gemini",
      gemini: true,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemModel)}:generateContent`,
      headers: { "x-goog-api-key": geminiKey },
      body: {
        systemInstruction: { parts: [{ text: CLASSIFY_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: `العضو: ${text || "بدون اسم"}` },
              ...(image ? [{ inlineData: { mimeType: image.slice(5, image.indexOf(";")), data: image.slice(image.indexOf(",") + 1) } }] : []),
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 200 },
      },
    });
  }

  const dataUrl = image;
  const groqKey = envKey("GROQ_API_KEY");
  if (groqKey) {
    const groqModel = (process.env.MONITOR_GROQ_MODEL || "qwen/qwen3.8-27b").trim();
    candidates.push({
      provider: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: { authorization: `Bearer ${groqKey}` },
      body: {
        model: groqModel,
        temperature: 0,
        max_tokens: 300,
        ...(groqModel.startsWith("qwen/") ? { reasoning_effort: "none" } : {}),
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          {
            role: "user",
            content: dataUrl
              ? [
                  { type: "text", text: `العضو: ${text || "بدون اسم"}` },
                  { type: "image_url", image_url: { url: dataUrl } },
                ]
              : `العضو: ${text || "بدون اسم"}`,
          },
        ],
      },
    });
    if (dataUrl) {
      candidates.push({
        provider: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { authorization: `Bearer ${groqKey}` },
        body: {
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          temperature: 0,
          max_tokens: 250,
          messages: [
            { role: "system", content: CLASSIFY_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: `العضو: ${text || "بدون اسم"}` },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        },
      });
    }
    if (text) {
      candidates.push({
        provider: "Groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { authorization: `Bearer ${groqKey}` },
        body: {
          model: "llama-3.3-70b-versatile",
          temperature: 0,
          max_tokens: 220,
          messages: [
            { role: "system", content: CLASSIFY_PROMPT },
            { role: "user", content: `العضو: ${text}` },
          ],
        },
      });
    }
  }

  const routerKey = envKey("OPENROUTER_API_KEY");
  if (routerKey) {
    candidates.push({
      provider: "OpenRouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      headers: { authorization: `Bearer ${routerKey}` },
      body: {
        model: (process.env.MONITOR_OPENROUTER_MODEL || "openrouter/free").trim(),
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          {
            role: "user",
            content: dataUrl
              ? [
                  { type: "text", text: `العضو: ${text || "بدون اسم"}` },
                  { type: "image_url", image_url: { url: dataUrl } },
                ]
              : `العضو: ${text || "بدون اسم"}`,
          },
        ],
      },
    });
  }
  return candidates;
}

/** يفحّص العضو ويرجّع النتيجة (أول مزوّد ناجح، مع احتياط ذكي بالاسم والبايو). ما يthrow. */
export async function classifyMember(input: {
  photo: string | null;
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
}): Promise<ClassifyResult> {
  const candidates = buildClassifyCandidates(input);
  if (!candidates.length) {
    const fallback = heuristicClassify(input);
    if (fallback) return fallback;
    return { ok: false, gender: "unknown", confidence: 0, evidence: "", provider: "", error: "لا توجد مفاتيح ذكاء اصطناعي للمراقب" };
  }
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...candidate.headers },
        body: JSON.stringify(candidate.body),
        cache: "no-store",
        signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
      };
      let raw = "";
      if (candidate.gemini) {
        const parts = data.candidates?.[0]?.content?.parts || [];
        raw = parts.filter((p) => p.thought !== true).map((p) => p.text || "").join("");
      } else {
        const content = data.choices?.[0]?.message?.content;
        raw = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p.text || "").join("") : "";
      }
      const parsed = parseClassifyText(raw);
      if (parsed) {
        if (parsed.gender === "unknown") {
          const heuristic = heuristicClassify(input);
          if (heuristic) return heuristic;
        }
        return { ok: true, ...parsed, provider: candidate.provider };
      }
    } catch {
      /* جرّب المزوّد التالي */
    }
  }
  const fallback = heuristicClassify(input);
  if (fallback) return fallback;
  return { ok: false, gender: "unknown", confidence: 0, evidence: "", provider: "", error: "تعذّر تصنيف العضو" };
}

/* ───────────────────────────────────────────────────────────────────────── */
/* حفظ التقارير                                                             */
/* ───────────────────────────────────────────────────────────────────────── */

async function readReports(): Promise<MonitorReport[]> {
  const store = getStore();
  const lines = await store.listAll(REPORTS_KEY, REPORT_CAP);
  const out: MonitorReport[] = [];
  const seenIds = new Set<string>();
  for (const line of lines) {
    try {
      const report = JSON.parse(line) as MonitorReport;
      if (report && typeof report.userId === "string" && !seenIds.has(report.userId)) {
        seenIds.add(report.userId);
        out.push(report);
      }
    } catch {
      /* تجاهل سطر تالف */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

async function writeReports(reports: MonitorReport[]): Promise<void> {
  const store = getStore();
  await store.delList(REPORTS_KEY);
  if (reports.length) await store.listPush(REPORTS_KEY, reports.slice(0, REPORT_CAP).map((r) => JSON.stringify(r)));
}

/** يضيف أو يحدّث تقرير عضو (يحفظ الأحدث أولاً بدون تكرار لنفس العضو). */
async function addReport(report: MonitorReport): Promise<void> {
  const reports = await readReports();
  const prev = reports.find((r) => r.userId === report.userId);
  if (prev && prev.status === "banned") {
    report.status = "banned";
    report.decidedAt = prev.decidedAt;
  }
  const filtered = reports.filter((r) => r.userId !== report.userId);
  filtered.unshift(report);
  await writeReports(filtered);
  await getStore().set(USER_KEY(report.userId), report);
  // 🚺 مصنَّفة أنثى → أي إحالة دخلات بيها ما تتحسبش لصاحب الرابط (رجوع تلقائي)
  if (report.gender === "female") {
    const { revokeCreditsFor } = await import("./referralGuard");
    await revokeCreditsFor(report.userId).catch(() => undefined);
  }
}

/** أحدث تقرير للعضو (أو null). */
export async function latestReportFor(userId: string): Promise<MonitorReport | null> {
  const stored = await getStore().get<MonitorReport>(USER_KEY(userId));
  if (stored && stored.userId === String(userId)) return stored;
  const reports = await readReports();
  const hit = reports.find((r) => r.userId === String(userId));
  return hit ?? null;
}

/** يعدّل حالة تقرير (وحدّث الأحدث للعضو). */
export async function setReportStatus(userId: string, status: MonitorStatus): Promise<MonitorReport | null> {
  const reports = await readReports();
  let updated: MonitorReport | null = null;
  for (const report of reports) {
    if (report.userId === String(userId)) {
      report.status = status;
      report.decidedAt = Date.now();
      updated = report;
    }
  }
  if (updated) {
    await writeReports(reports);
    await getStore().set(USER_KEY(userId), updated);
  }
  return updated;
}

/** قائمة التقارير (الأحدث أولاً) + عدد المعلقين والإحصائيات. */
export async function listReports(limit = 100): Promise<{
  reports: MonitorReport[];
  pending: number;
  stats: { total: number; pending: number; banned: number; dismissed: number };
}> {
  const all = await readReports();
  const reports = all.slice(0, Math.max(1, Math.min(200, Math.floor(limit) || 100)));
  const pending = all.filter((r) => r.status === "pending").length;
  const banned = all.filter((r) => r.status === "banned").length;
  const dismissed = all.filter((r) => r.status === "dismissed").length;
  return {
    reports,
    pending,
    stats: { total: all.length, pending, banned, dismissed },
  };
}

/* ───────────────────────────────────────────────────────────────────────── */
/* إشعار المالك                                                             */
/* ───────────────────────────────────────────────────────────────────────── */

async function notifyOwners(report: MonitorReport, settings: Settings): Promise<void> {
  const ids = await adminChatIds(settings);
  if (!ids.length) return;
  const panel = (process.env.PANEL_URL || "").replace(/\/+$/, "");
  const link = panel ? `\n🔗 ${panel}` : "";
  const text =
    `⚠️ مراقب الذكاء الاصطناعي: عضو امرأة دخلت البوت\n` +
    `👤 ${report.firstName}${report.lastName ? " " + report.lastName : ""}${report.username ? " · @" + report.username.replace(/^@/, "") : ""}\n` +
    `🆔 ${report.userId}${report.bio ? "\n📝 " + report.bio.slice(0, 120) : ""}\n` +
    `🔍 دليل المراقب: ${report.evidence || "لا نص"} (ثقة ${Math.round(report.confidence * 100)}%)\n` +
    `📅 ${new Date(report.createdAt).toLocaleString("ar-DZ")}${link}`;
  for (const id of ids) {
    await sendMessage(id, text).catch(() => undefined);
  }
  await pushAdminLog({ at: Date.now(), op: "monitor_alert", detail: `${report.userId} · ${report.firstName || "عضو"} · ${report.gender}`, via: "ai" }).catch(() => undefined);
}

/* ───────────────────────────────────────────────────────────────────────── */
/* تنفيذ المراقبة على دخول عضو                                              */
/* ───────────────────────────────────────────────────────────────────────── */

export type MonitorInput = {
  userId: number | string;
  firstName?: string;
  lastName?: string;
  username?: string;
  bio?: string;
  chatId?: number | string;
  source: string;
  force?: boolean;
};

async function enrichUserProfile(
  userId: string,
  input: { firstName?: string; lastName?: string; username?: string; bio?: string },
): Promise<{ firstName: string; lastName: string; username: string; bio: string }> {
  let firstName = (input.firstName || "").trim();
  let lastName = (input.lastName || "").trim();
  let username = (input.username || "").trim().replace(/^@/, "");
  let bio = (input.bio || "").trim();

  if (!firstName || !username) {
    const stored = await getUser(userId).catch(() => null);
    if (stored) {
      if (!firstName) firstName = stored.firstName || "";
      if (!username) username = (stored.username || "").replace(/^@/, "");
    }
  }
  if (!isMock() && (!bio || !firstName)) {
    const info = await getChatInfo(userId).catch(() => null);
    const res = (info?.ok && info.result ? info.result : {}) as {
      first_name?: string;
      last_name?: string;
      username?: string;
      bio?: string;
    };
    if (!firstName && res.first_name) firstName = res.first_name;
    if (!lastName && res.last_name) lastName = res.last_name;
    if (!username && res.username) username = res.username.replace(/^@/, "");
    if (!bio && typeof res.bio === "string") bio = res.bio;
  }
  return { firstName, lastName, username, bio };
}

/**
 * يراقب عضو دخل البوت. ما يthrow أبداً (يفشل بهدوء ويكمّل البوت).
 * يُستدعى على دخول المجموعة، على طلب الانضمام، وعلى الرسائل الخاصة.
 */
export async function monitorUserJoin(input: MonitorInput): Promise<MonitorReport | null> {
  try {
    if (!monitorEnabled()) return null;
    const userId = String(input.userId || "").trim();
    if (!/^\d{1,20}$/.test(userId)) return null;

    const store = getStore();
    if (!input.force) {
      const seen = await store.get<{ at: number }>(SEEN_KEY(userId));
      const cooldownMs = (Number(process.env.MONITOR_COOLDOWN_HOURS) || 24) * 3600_000;
      if (seen?.at && Date.now() - seen.at < cooldownMs) return null;
    }
    // نحصّنو قبل الفحص باش ما يتكررش الفحص على كل دخول.
    await store.set(SEEN_KEY(userId), { at: Date.now() });

    const [photo, profile] = await Promise.all([
      fetchProfilePhoto(userId),
      enrichUserProfile(userId, input),
    ]);

    const result = await classifyMember({
      photo,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      bio: profile.bio,
    });

    const threshold = Number(process.env.MONITOR_MIN_CONFIDENCE) || 0.6;
    if (!result.ok || result.gender !== "female" || result.confidence < threshold) return null;

    const settings = await getSettings();
    const report: MonitorReport = {
      id: userId,
      userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      bio: profile.bio,
      photo: photo || "",
      gender: result.gender,
      confidence: result.confidence,
      evidence: result.evidence,
      provider: result.provider,
      chatId: String(input.chatId || ""),
      source: input.source,
      status: "pending",
      createdAt: Date.now(),
    };
    await addReport(report);
    await notifyOwners(report, settings);
    return report;
  } catch (error) {
    console.error("[monitor] failed for", input.userId, error);
    return null;
  }
}

/** فحص مباشر لعضو بمعرّفه من لوحة التحكم وإرجاع النتيجة الكاملة للمالك. */
export async function scanUserById(userIdRaw: string): Promise<{
  ok: boolean;
  userId?: string;
  firstName?: string;
  username?: string;
  bio?: string;
  hasPhoto?: boolean;
  result?: ClassifyResult;
  flagged?: boolean;
  report?: MonitorReport | null;
  error?: string;
}> {
  const userId = String(userIdRaw || "").trim();
  if (!/^\d{1,20}$/.test(userId)) {
    return { ok: false, error: "معرّف المستخدم غير صالح" };
  }
  const [photo, profile] = await Promise.all([
    fetchProfilePhoto(userId),
    enrichUserProfile(userId, {}),
  ]);
  const result = await classifyMember({
    photo,
    firstName: profile.firstName,
    lastName: profile.lastName,
    username: profile.username,
    bio: profile.bio,
  });
  await getStore().set(SEEN_KEY(userId), { at: Date.now() }).catch(() => undefined);
  const threshold = Number(process.env.MONITOR_MIN_CONFIDENCE) || 0.6;
  let report: MonitorReport | null = null;
  if (result.ok && result.gender === "female" && result.confidence >= threshold) {
    const settings = await getSettings();
    report = {
      id: userId,
      userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      username: profile.username,
      bio: profile.bio,
      photo: photo || "",
      gender: result.gender,
      confidence: result.confidence,
      evidence: result.evidence,
      provider: result.provider,
      chatId: userId,
      source: "manual_scan",
      status: "pending",
      createdAt: Date.now(),
    };
    await addReport(report);
    await notifyOwners(report, settings).catch(() => undefined);
  }
  return {
    ok: true,
    userId,
    firstName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "عضو",
    username: profile.username,
    bio: profile.bio,
    hasPhoto: Boolean(photo),
    result,
    flagged: Boolean(report),
    report,
  };
}

/** فحص دفعة من آخر الأعضاء المسجّلين في البوت من لوحة التحكم. */
export async function scanRecentUsers(limit = 15): Promise<{
  ok: boolean;
  scanned: number;
  flagged: number;
  pending: number;
  reports: MonitorReport[];
}> {
  const cap = Math.max(1, Math.min(25, Math.floor(Number(limit) || 15)));
  const recent = await listRecentUsers(cap * 2).catch(() => []);
  const targets = recent.slice(0, cap);
  let scanned = 0;
  let flagged = 0;
  const deadline = Date.now() + 20_000;
  for (let i = 0; i < targets.length; i += 4) {
    if (Date.now() > deadline) break;
    const batch = targets.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (u) => {
        scanned++;
        return monitorUserJoin({
          userId: u.id,
          firstName: u.firstName,
          username: u.username,
          chatId: u.id,
          source: "batch_scan",
          force: true,
        });
      }),
    );
    flagged += results.filter(Boolean).length;
  }
  const { reports, pending } = await listReports(100);
  return { ok: true, scanned, flagged, pending, reports };
}

/* ───────────────────────────────────────────────────────────────────────── */
/* أوامر الإدارة من اللوحة: حضر / فك الحظر / إخفاء                          */
/* ───────────────────────────────────────────────────────────────────────── */

/** يطرد العضو من المجموعة المربوطة إن كانت (بشكل مؤبد). */
async function kickFromLinkedGroup(userId: string): Promise<void> {
  try {
    const group = await getJoinGroup();
    if (!group?.chatId) return;
    const res = await banChatMember(group.chatId, userId, 0);
    if (!res.ok) console.warn("[monitor] kick failed:", res.description);
  } catch (error) {
    console.warn("[monitor] kick error:", error);
  }
}

/** حضر العضو (يحظره في البوت ويطرد من المجموعة المربوطة إن وجدت). */
export async function banMonitorUser(userId: string, settings: Settings): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId || "").trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: "معرّف المستخدم غير صالح" };
  await setBanned(id, true);
  const report = await setReportStatus(id, "banned");
  await kickFromLinkedGroup(id);
  await pushAdminLog({ at: Date.now(), op: "monitor_ban", detail: `حظر ${id} من صفحة المراقب`, via: "panel" }).catch(() => undefined);
  void settings;
  void report;
  return { ok: true };
}

/** فك حظر العضو. */
export async function unbanMonitorUser(userId: string, settings: Settings): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId || "").trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: "معرّف المستخدم غير صالح" };
  await setBanned(id, false);
  await setReportStatus(id, "unbanned");
  await pushAdminLog({ at: Date.now(), op: "monitor_unban", detail: `فك حظر ${id} من صفحة المراقب`, via: "panel" }).catch(() => undefined);
  void settings;
  return { ok: true };
}

/** إخفاء تقرير (يبقى محفوظاً في السجل). */
export async function dismissReport(userId: string): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId || "").trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: "معرّف المستخدم غير صالح" };
  await setReportStatus(id, "dismissed");
  return { ok: true };
}
