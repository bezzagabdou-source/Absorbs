import crypto from "node:crypto";
import { getStore } from "./store";
import { runWithBotToken, secondBotToken, sendMessage, type TgResult } from "./telegram";
import { getSettings } from "./settings";

// Each job freezes the registered-ID set, including legacy users without a
// joined-ranking entry. IDs added after creation belong to the next broadcast.
// Claims are durable *before* Telegram is called: a killed/timed-out request
// is reported as uncertain instead of ever being sent twice.
type Job = { id: string; text: string; ids: string[]; createdAt: number; retryOf?: string; skippedUnreachable?: number };
// 📭 ناس ثبت أن تيليغرام ما كيقبلش الإرسال ليهم (حاجبين البوت / ما بداوهش / حسابهم محذوف).
// كيتخطاو ف البث الجاي باش ما يبقاوش يحسبو كـ«فشل»، وكيرجعو أوتوماتيك ملي يبدا البوت من جديد.
export const UNREACHABLE_KEY = "users:unreachable";
const base = (id: string) => `broadcast:job:${id}`;
const LOCK = "broadcast:worker:lease"; // one sender across ALL jobs
const COOLDOWN = "broadcast:worker:cooldown";
const CHUNK = 5; // رسائل متوازية ف كل دفعة
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function validId(id: string) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) throw new Error("معرّف البث غير صالح");
  return id;
}
function persistentStore() {
  // 🧠 التخزين المؤقت (memory) كيبقا مسموح غير للعرض والتجربة المحلية؛
  //    في الإنتاج ديما Redis/Postgres → ما كاينش تكرار.
  return getStore();
}
async function jobById(id: string): Promise<Job> {
  const job = await persistentStore().get<Job>(base(validId(id)));
  if (!job || !Array.isArray(job.ids)) throw new Error("البث غير موجود");
  return job;
}
export async function createBroadcast(id: string, text: string) {
  validId(id);
  text = String(text || "").trim();
  if (!text || text.length > 4000) throw new Error("نص البث غير صالح");
  const store = persistentStore();
  const key = base(id);
  let job = await store.get<Job>(key);
  if (!job) {
    const [all, unreachable] = await Promise.all([
      store.sMembers("users:ids"),
      store.sMembers(UNREACHABLE_KEY).catch(() => [] as string[]),
    ]);
    const skip = new Set(unreachable);
    const valid = all.filter((item) => /^\d{1,20}$/.test(item));
    const ids = valid.filter((item) => !skip.has(item));
    const candidate: Job = { id, text, ids, createdAt: Date.now(), skippedUnreachable: valid.length - ids.length };
    await store.setIfAbsent(key, candidate);
    job = await store.get<Job>(key);
  }
  if (!job || job.text !== text) throw new Error("معرّف البث مستخدم لرسالة أخرى");
  await store.set("broadcast:latest", id);
  return broadcastStatus(id);
}
// Only a definite rejection may be retried. Uncertain deliveries are excluded.
// A deterministic ID prevents repeated clicks or lost responses from creating
// two separate retry jobs for the same source broadcast.
export async function retryFailedBroadcast(sourceId: string) {
  const store = persistentStore(), source = await jobById(sourceId), token = crypto.randomUUID();
  if (!await store.acquireLease(LOCK, token, 75000)) throw new Error("عملية بث أخرى قيد التنفيذ؛ حاول بعد انتهائها");
  try {
    const id = "retry_" + crypto.createHash("sha256").update(sourceId).digest("hex").slice(0, 40);
    let job = await store.get<Job>(base(id));
    if (!job) {
      if (!(await broadcastStatus(sourceId)).done) throw new Error("انتظر انتهاء البث قبل إعادة المحاولة");
      const [failed, sent] = await Promise.all([store.sMembers(base(sourceId) + ":failed"), store.sMembers(base(sourceId) + ":sent")]);
      const delivered = new Set(sent);
      const ids = failed.filter(user => !delivered.has(user));
      if (!ids.length) throw new Error("لا توجد رسائل مرفوضة لإعادة محاولتها");
      const candidate: Job = { id, text: source.text, ids, createdAt: Date.now(), retryOf: sourceId };
      await store.setIfAbsent(base(id), candidate);
      job = await store.get<Job>(base(id));
    }
    if (!job || job.retryOf !== sourceId) throw new Error("تعذّر تأكيد مهمة إعادة المحاولة");
    await store.set("broadcast:latest", id);
    return broadcastStatus(id);
  } finally { await store.releaseLease(LOCK, token).catch(() => undefined); }
}

// An account reached through the other configured FT bot may be absent from
// this bot's private chats. Try the second bot ONLY after the first explicitly
// says chat not found. Never bypass a user's block or retry an unknown result.
export async function sendWithSecondaryOnMissingChat(
  primary: () => Promise<TgResult>, secondary?: () => Promise<TgResult>, wait = pause,
): Promise<TgResult> {
  const first = await primary();
  if (secondary && !first.ok && !first.uncertain && first.error_code === 400 && /chat not found/i.test(first.description || "")) {
    await wait(125);
    return secondary();
  }
  return first;
}
async function sendBroadcastMessage(user: string, text: string): Promise<TgResult> {
  const send = () => sendMessage(user, text, undefined, { parse_mode: undefined, __ctx: "bulk" });
  const first = await send(), second = secondBotToken();
  if (!second || first.ok || first.uncertain || first.error_code !== 400 || !/chat not found/i.test(first.description || "")) return first;
  const primary = (await getSettings()).botToken;
  return sendWithSecondaryOnMissingChat(async () => first, second !== primary ? () => runWithBotToken(second, send) : undefined);
}
function failureCategory(result: TgResult): "blocked" | "notStarted" | "deactivated" | "other" {
  const description = String(result.description || "").toLowerCase();
  if (/deactivated|deleted user/.test(description)) return "deactivated";
  if (/blocked|bot was kicked/.test(description)) return "blocked";
  if (/chat not found|can't initiate|have no rights to send/.test(description)) return "notStarted";
  return "other";
}
function invalidBot(result: TgResult) {
  return result.error_code === 401 || result.error_code === 404 || result.description === "لا يوجد توكن للبوت";
}
export async function latestBroadcast() {
  const id = await persistentStore().get<string>("broadcast:latest");
  return id ? broadcastStatus(id) : null;
}
export async function broadcastStatus(id: string) {
  const store = persistentStore(), job = await jobById(id), key = base(id);
  const [attempted, sent, failed, excludedBanned, cursor, cooldown, blocked, notStarted, deactivated, network, problem] = await Promise.all([
    store.sCard(key + ":attempted"), store.sCard(key + ":sent"), store.sCard(key + ":failed"),
    store.sCard(key + ":banned"), store.get<number>(key + ":cursor"), store.get<number>(COOLDOWN),
    store.sCard(key + ":reason:blocked"), store.sCard(key + ":reason:notStarted"),
    store.sCard(key + ":reason:deactivated"), store.sCard(key + ":reason:network"), store.get<string>(key + ":problem"),
  ]);
  const unknown = Math.max(0, attempted - sent - failed - excludedBanned);
  return {
    jobId: id, scope: job.retryOf ? "failed_only_retry" : "all_registered_at_start", retryOf: job.retryOf || null,
    createdAt: job.createdAt, total: job.ids.length, skippedUnreachable: job.skippedUnreachable || 0,
    attempted, sent, failed, excludedBanned, unknown, remaining: Math.max(0, job.ids.length - attempted),
    failureReasons: { blocked, notStarted, deactivated, network, other: Math.max(0, failed - blocked - notStarted - deactivated - network) },
    problem: Number(cooldown || 0) > Date.now() ? problem : null,
    done: Number(cursor || 0) >= job.ids.length,
    retryAfterMs: Math.max(0, Number(cooldown || 0) - Date.now()),
  };
}

type ProcessOptions = {
  send?: (id: string, text: string) => Promise<TgResult>;
  wait?: (ms: number) => Promise<void>;
  maxItems?: number;
  maxMs?: number;
};
export async function processBroadcast(id: string, options: ProcessOptions = {}) {
  const store = persistentStore(), job = await jobById(id), key = base(id), token = crypto.randomUUID();
  // Longer than the 60s Vercel route maximum: an expired lease cannot overlap
  // a live invocation. Never rely on a serverless task continuing after return.
  if (!await store.acquireLease(LOCK, token, 75000)) return { ...await broadcastStatus(id), busy: true };
  let cursor = Number(await store.get<number>(key + ":cursor") || 0);
  try {
    const cooldown = Number(await store.get<number>(COOLDOWN) || 0);
    if (cooldown > Date.now()) return { ...await broadcastStatus(id), busy: false };
    // A previous configuration problem is no longer active after its cooldown.
    if (await store.get<string>(key + ":problem")) await store.set(key + ":problem", null);
    const end = Date.now() + Math.min(20000, Math.max(1000, options.maxMs || 18000));
    const maxItems = Math.min(300, Math.max(1, options.maxItems || 300));
    const send = options.send || sendBroadcastMessage;
    const wait = options.wait || pause;
    let count = 0;
    while (cursor < job.ids.length && count < maxItems && Date.now() < end) {
      // ⚡ نرسلو لـ CHUNK أشخاص فنفس الوقت (كان واحد بواحد = بطيء)؛ كل واحد كيتحجز قبل الإرسال كيما قبل
      type Slot = { user: string; index: number; outcome: "ok" | "banned" | "failed" | "retry"; result?: TgResult };
      const slots: Slot[] = [];
      let probe = cursor;
      while (probe < job.ids.length && slots.length < CHUNK && count + slots.length < maxItems) {
        const user = job.ids[probe];
        const index = probe++;
        if (!await store.sAdd(key + ":attempted", user)) continue; // محجوز من قبل
        slots.push({ user, index, outcome: "ok" });
      }
      if (!slots.length) { cursor = probe; continue; }
      count += slots.length;

      await Promise.all(slots.map(async (slot) => {
        if (await store.sHas("users:banned", slot.user)) { slot.outcome = "banned"; return; }
        let result: TgResult;
        try { result = await send(slot.user, job.text); }
        catch { result = { ok: false, uncertain: true }; }
        slot.result = result;
      }));

      let systemic: { index: number } | null = null;
      for (const slot of slots) {
        const user = slot.user, result = slot.result;
        if (slot.outcome === "banned") { await store.sAdd(key + ":banned", user); continue; }
        if (!result) continue;
        if (result.ok) { await store.sAdd(key + ":sent", user); await store.sDel(UNREACHABLE_KEY, user).catch(() => undefined); continue; }
        if (!result.uncertain && invalidBot(result)) {
          // A broken token is systemic, not hundreds of independent failures.
          await store.set(key + ":problem", "توكن البوت مرفوض أو غير مهيأ؛ تحقّق من إعدادات البوت.");
          await store.set(COOLDOWN, Date.now() + 60000);
          slot.outcome = "retry";
        } else if (result.retryable && !result.uncertain) {
          // DNS/connect failures are known to occur before the request is sent.
          const tries = await store.incr(key + ":network-retries:" + user);
          if (tries <= 3) {
            await store.set(key + ":problem", "انقطع الاتصال قبل الإرسال؛ ستُعاد المحاولة تلقائياً.");
            await store.set(COOLDOWN, Date.now() + Math.min(30000, 1000 * 2 ** tries));
            slot.outcome = "retry";
          } else {
            await store.sAdd(key + ":failed", user);
            await store.sAdd(key + ":reason:network", user);
          }
        } else if (result.error_code === 429 && !result.uncertain) {
          // Telegram explicitly rejected this attempt, so retrying it later is safe.
          const seconds = Number(result.parameters?.retry_after);
          const delay = Math.min(3600000, Math.max(1000, (Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000));
          await store.set(COOLDOWN, Date.now() + delay);
          slot.outcome = "retry";
        } else if (!result.uncertain && !(Number(result.error_code) >= 500)) {
          await store.sAdd(key + ":failed", user);
          const category = failureCategory(result);
          if (category !== "other") {
            await store.sAdd(key + ":reason:" + category, user);
            // 📭 ما نعاودوش نحاولو معاه ف البثوث الجاية
            await store.sAdd(UNREACHABLE_KEY, user).catch(() => undefined);
          }
        }
        if (slot.outcome === "retry" && (!systemic || slot.index < systemic.index)) systemic = { index: slot.index };
      }

      // المستخدمين اللي لازم يتعاودو نحرّرو الحجز ديالهم، والمؤشّر يرجع لأول واحد فيهم
      for (const slot of slots) if (slot.outcome === "retry") await store.sDel(key + ":attempted", slot.user);
      if (systemic) { cursor = (systemic as { index: number }).index; break; }
      cursor = probe;
      // Telegram: ~30 رسالة/ثانية عالمياً. هاد الإيقاع (CHUNK كل ~150ms) كيبقى تحت الحد.
      await wait(150);
    }
    await store.set(key + ":cursor", cursor);
    return { ...await broadcastStatus(id), busy: false };
  } finally { await store.releaseLease(LOCK, token).catch(() => undefined); }
}
