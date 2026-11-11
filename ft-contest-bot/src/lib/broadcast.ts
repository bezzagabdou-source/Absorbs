import crypto from "node:crypto";
import { getStore } from "./store";
import { sendMessage, type TgResult } from "./telegram";

// Each job freezes the registered-ID set, including legacy users without a
// joined-ranking entry. IDs added after creation belong to the next broadcast.
// Claims are durable *before* Telegram is called: a killed/timed-out request
// is reported as uncertain instead of ever being sent twice.
type Job = { id: string; text: string; ids: string[]; createdAt: number };
const base = (id: string) => `broadcast:job:${id}`;
const LOCK = "broadcast:worker:lease"; // one sender across ALL jobs
const COOLDOWN = "broadcast:worker:cooldown";
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function validId(id: string) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) throw new Error("معرّف البث غير صالح");
  return id;
}
function persistentStore() {
  const store = getStore();
  // Memory and its delayed local file writes cannot protect against duplicates.
  if (store.backend === "memory") throw new Error("البث يتطلب تخزين Redis أو Postgres دائماً");
  return store;
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
    const ids = (await store.sMembers("users:ids")).filter((item) => /^\d{1,20}$/.test(item));
    const candidate: Job = { id, text, ids, createdAt: Date.now() };
    await store.setIfAbsent(key, candidate);
    job = await store.get<Job>(key);
  }
  if (!job || job.text !== text) throw new Error("معرّف البث مستخدم لرسالة أخرى");
  await store.set("broadcast:latest", id);
  return broadcastStatus(id);
}
export async function latestBroadcast() {
  const id = await persistentStore().get<string>("broadcast:latest");
  return id ? broadcastStatus(id) : null;
}
export async function broadcastStatus(id: string) {
  const store = persistentStore(), job = await jobById(id), key = base(id);
  const [attempted, sent, failed, excludedBanned, cursor, cooldown] = await Promise.all([
    store.sCard(key + ":attempted"), store.sCard(key + ":sent"), store.sCard(key + ":failed"),
    store.sCard(key + ":banned"), store.get<number>(key + ":cursor"), store.get<number>(COOLDOWN),
  ]);
  const unknown = Math.max(0, attempted - sent - failed - excludedBanned);
  return {
    jobId: id, scope: "all_registered_at_start", createdAt: job.createdAt, total: job.ids.length,
    attempted, sent, failed, excludedBanned, unknown, remaining: Math.max(0, job.ids.length - attempted),
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
    const end = Date.now() + Math.min(20000, Math.max(1000, options.maxMs || 18000));
    const maxItems = Math.min(100, Math.max(1, options.maxItems || 100));
    const send = options.send || ((user: string, text: string) => sendMessage(user, text, undefined, { parse_mode: undefined }));
    const wait = options.wait || pause;
    let count = 0;
    while (cursor < job.ids.length && count < maxItems && Date.now() < end) {
      const user = job.ids[cursor];
      if (!await store.sAdd(key + ":attempted", user)) { cursor++; continue; }
      count++;
      if (await store.sHas("users:banned", user)) {
        await store.sAdd(key + ":banned", user);
      } else {
        let result: TgResult;
        try { result = await send(user, job.text); }
        catch { result = { ok: false, uncertain: true }; }
        if (result.ok) await store.sAdd(key + ":sent", user);
        else if (result.error_code === 429 && !result.uncertain) {
          // Telegram explicitly rejected this attempt, so retrying it later is
          // safe. Save the global cooldown before releasing the claim.
          const seconds = Number(result.parameters?.retry_after);
          const delay = Math.min(3600000, Math.max(1000, (Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000));
          await store.set(COOLDOWN, Date.now() + delay);
          await store.sDel(key + ":attempted", user);
          break;
        } else if (!result.uncertain && !(Number(result.error_code) >= 500)) {
          await store.sAdd(key + ":failed", user);
        }
        // At most eight broadcasts/second, shared across all jobs. Other bot
        // traffic can still trigger Telegram's flood limit, handled above.
        await wait(125);
      }
      cursor++;
    }
    await store.set(key + ":cursor", cursor);
    return { ...await broadcastStatus(id), busy: false };
  } finally { await store.releaseLease(LOCK, token).catch(() => undefined); }
}
