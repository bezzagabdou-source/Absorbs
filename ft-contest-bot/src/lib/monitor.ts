/**
 * 👁️ مراقب الذكاء الاصطناعي الخفي (AI Monitor) — يراقب كل عضو يدخل البوت:
 *   • يجمع صورته (صورة بروفايل) واسماه (@username) وبايو (bio) إن توفّر.
 *   • يفحصهم بمزوّد ذكاء اصطناعي (Gemini رؤية أولاً، ثم Groq/OpenRouter).
 *   • إلا وُجد دليل أن العضو امرأة، يسجّل تقريراً ويرسل للمالك عبر لوحة
 *     التحكم صفحة مخصصة (مراقب الذكاء الاصطناعي) مع زر «حضر».
 *
 * المراقبة خفية: العضو ما يحسّش بيها وما يتبعثّش ليه حتى رسالة.
 * كل العملية محفوظة في التخزين الموحّد (Redis / Postgres / ذاكرة).
 */

import { rawTg, sendMessage, banChatMember, isMock, type TgUser } from "./telegram";
import { getStore } from "./store";
import { getSettings } from "./settings";
import { getJoinGroup, pushAdminLog, setBanned } from "./rewards";
import { adminChatIds } from "./users";
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
const CLASSIFY_TIMEOUT_MS = 12_000;

/** المراقبة مفعّلة إلا أُطلِق MONITOR_DISABLED=1. */
export function monitorEnabled(): boolean {
  return process.env.MONITOR_DISABLED !== "1";
}

/** مزوّدون الذكاء الاصطناعي المتوفّرون للمراقب (أسماء فقط — لا مفاتيح). */
export function monitorConfigured(): { gemini: boolean; others: boolean } {
  const gemini = Boolean(
    envKey("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY")
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

/* ───────────────────────────────────────────────────────────────────────── */
/* جمع صورة البروفايل                                                       */
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
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > PHOTO_MAX) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpeg";
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────────── */
/* تصنيف الجنس بالذكاء الاصطناعي                                            */
/* ───────────────────────────────────────────────────────────────────────── */

export type ClassifyResult = {
  ok: boolean;
  gender: "female" | "male" | "unknown";
  confidence: number;
  evidence: string;
  provider: string;
  error?: string;
};

const CLASSIFY_PROMPT = `أنت مراقب آلي لدخول الأعضاء. افحص صورة العضو وبياناته (الاسم، @username، البايو) وحدد هل هو امرأة (female) أم رجل (male).
أجبه فقط بـ JSON بهذه الصيغة بالضبط (بلا أي نص إضافي):
{"gender":"female"|"male"|"unknown","confidence":رقم بين 0 و 1,"evidence":"سبب قصير بالعربية"}
إلا كانت الصورة أو البيانات لا تكفي للحكم، أرجع {"gender":"unknown","confidence":0,"evidence":"لا دليل كافٍ"}.`;

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
  const text = [input.firstName, input.lastName, input.username, input.bio].filter(Boolean).join(" · ");
  const image = input.photo || "";
  const candidates: Candidate[] = [];
  const geminiKey = envKey("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");
  const gemModel = (process.env.MONITOR_GEMINI_MODEL || "gemini-2.5-flash").trim();
  if (geminiKey) {
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
    candidates.push({
      provider: "Groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: { authorization: `Bearer ${groqKey}` },
      body: {
        model: (process.env.MONITOR_GROQ_MODEL || "qwen/qwen3.8-27b").trim(),
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: CLASSIFY_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `العضو: ${text || "بدون اسم"}` },
              ...(dataUrl ? [{ type: "image_url", image_url: { url: dataUrl } }] : []),
            ],
          },
        ],
      },
    });
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
            content: [
              { type: "text", text: `العضو: ${text || "بدون اسم"}` },
              ...(dataUrl ? [{ type: "image_url", image_url: { url: dataUrl } }] : []),
            ],
          },
        ],
      },
    });
  }
  return candidates;
}

/** يفحّص العضو ويرجّع النتيجة (أول مزوّد ناجح). ما يthrow. */
export async function classifyMember(input: {
  photo: string | null;
  firstName: string;
  lastName: string;
  username: string;
  bio: string;
}): Promise<ClassifyResult> {
  const candidates = buildClassifyCandidates(input);
  if (!candidates.length) {
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
        return { ok: true, ...parsed, provider: candidate.provider };
      }
    } catch {
      /* جرّب المزوّد التالي */
    }
  }
  return { ok: false, gender: "unknown", confidence: 0, evidence: "", provider: "", error: "تعذّر تصنيف العضو" };
}

/* ───────────────────────────────────────────────────────────────────────── */
/* حفظ التقارير                                                             */
/* ───────────────────────────────────────────────────────────────────────── */

async function readReports(): Promise<MonitorReport[]> {
  const store = getStore();
  const lines = await store.listAll(REPORTS_KEY, REPORT_CAP);
  const out: MonitorReport[] = [];
  for (const line of lines) {
    try {
      const report = JSON.parse(line) as MonitorReport;
      if (report && typeof report.userId === "string") out.push(report);
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

/** يضيف تقرير جديد (يحفظ الأحدث أولاً ويحذف الأقدم على الحد). */
async function addReport(report: MonitorReport): Promise<void> {
  const reports = await readReports();
  reports.unshift(report);
  await writeReports(reports);
  await getStore().set(USER_KEY(report.userId), report);
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

/** قائمة التقارير (الأحدث أولاً) + عدد المعلقين. */
export async function listReports(limit = 100): Promise<{ reports: MonitorReport[]; pending: number }> {
  const all = await readReports();
  const reports = all.slice(0, Math.max(1, Math.min(200, Math.floor(limit) || 100)));
  return { reports, pending: reports.filter((r) => r.status === "pending").length };
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
    `👤 ${report.firstName}${report.lastName ? " " + report.lastName : ""}${report.username ? " · @" + report.username : ""}\n` +
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
};

/**
 * يراقب عضو دخل البوت. ما يthrow أبداً (يفشل بهدوء ويكمّل البوت).
 * يُستدعى على دخول المجموعة، على طلب الانضمام، وعلى أول رسالة خاصة.
 */
export async function monitorUserJoin(input: MonitorInput): Promise<MonitorReport | null> {
  try {
    if (!monitorEnabled()) return null;
    const userId = String(input.userId || "");
    if (!/^\d{1,20}$/.test(userId)) return null;

    const store = getStore();
    const seen = await store.get<{ at: number }>(SEEN_KEY(userId));
    const cooldownMs = (Number(process.env.MONITOR_COOLDOWN_HOURS) || 24) * 3600_000;
    if (seen?.at && Date.now() - seen.at < cooldownMs) return null;
    // نحصّنو قبل الفحص باش ما يتكررش الفحص على كل دخول.
    await store.set(SEEN_KEY(userId), { at: Date.now() });

    const photo = await fetchProfilePhoto(userId);
    const result = await classifyMember({
      photo,
      firstName: input.firstName || "",
      lastName: input.lastName || "",
      username: input.username || "",
      bio: input.bio || "",
    });

    const threshold = Number(process.env.MONITOR_MIN_CONFIDENCE) || 0.6;
    if (!result.ok || result.gender !== "female" || result.confidence < threshold) return null;

    const settings = await getSettings();
    const report: MonitorReport = {
      id: userId,
      userId,
      firstName: input.firstName || "",
      lastName: input.lastName || "",
      username: input.username || "",
      bio: input.bio || "",
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
  if (report) await notifyOwners(report, settings).catch(() => undefined);
  return { ok: true };
}

/** فك حظر العضو. */
export async function unbanMonitorUser(userId: string, settings: Settings): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId || "").trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: "معرّف المستخدم غير صالح" };
  await setBanned(id, false);
  await setReportStatus(id, "unbanned");
  await pushAdminLog({ at: Date.now(), op: "monitor_unban", detail: `فك حظر ${id} من صفحة المراقب`, via: "panel" }).catch(() => undefined);
  return { ok: true };
}

/** إخفاء تقرير (يبقى محفوظاً في السجل). */
export async function dismissReport(userId: string): Promise<{ ok: boolean; error?: string }> {
  const id = String(userId || "").trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: "معرّف المستخدم غير صالح" };
  await setReportStatus(id, "dismissed");
  return { ok: true };
}
