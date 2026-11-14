import { sendMessage } from "./telegram";
import { getStore } from "./store";
import { allUserIds } from "./users";
import { bannedIds } from "./rewards";

/* ══════════════════════════════════════════════════════════════════════════
   بثّ حقيقي لجميع المستخدمين — كل من بدأ البوت منذ إنشائه
   • شغال على دفعات (chunks) باش ما يطيحش في اللامبادا (timeout)
   • كيتقدّم في progress مخزّن → إلا توقف الطلب كيتكمّل من بلاصتو
   • احترام سقف تيليغرام (~25 رسالة/ثانية) + إعادة محاولة على 429
   ══════════════════════════════════════════════════════════════════════════ */

const JOB_KEY = "broadcast:job";
const HISTORY_KEY = "broadcast:history";

export type BcJob = {
  id: string;
  text: string;
  total: number;
  cursor: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
  startedAt: number;
  updatedAt: number;
  finished: boolean;
  stopped: boolean;
  targets: string[];
  lastError: string;
  lockedAt: number;
  lockedCursor?: number;
};

/** سقف الوقت ديال كل دفعة (request) — تحت timeout ديال فيرسيل */
const TICK_MS = Math.max(4_000, Number(process.env.BROADCAST_TICK_MS || 22_000) || 22_000);
/** عدد الرسائل المتوازية في الدفعة */
const BATCH = 8;
/** استراحة بين الدفعات (حماية من الطوفان) */
const GAP_MS = 320;
const MAX_RETRY = 2;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function short(s: unknown, n = 180) {
  return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

export async function loadJob(): Promise<BcJob | null> {
  try {
    return await getStore().get<BcJob>(JOB_KEY);
  } catch {
    return null;
  }
}

async function saveJob(job: BcJob) {
  try {
    await getStore().set(JOB_KEY, job);
  } catch {
    /* ما نطيحوش البوت على حساب التخزين */
  }
}

function blank(partial: Partial<BcJob> = {}): BcJob {
  return {
    id: `bc_${Date.now().toString(36)}`,
    text: "",
    total: 0,
    cursor: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    finished: false,
    stopped: false,
    targets: [],
    lastError: "",
    lockedAt: 0,
    lockedCursor: 0,
    ...partial,
  };
}

/** ملخّص صالح للوحة (بلا لائحة IDs الطويلة) */
export function view(job: BcJob | null) {
  if (!job) return null;
  const done = Math.min(job.cursor, job.total);
  return {
    id: job.id,
    total: job.total,
    cursor: done,
    remaining: Math.max(0, job.total - done),
    pct: job.total ? Math.round((done / job.total) * 100) : job.finished ? 100 : 0,
    sent: job.sent,
    failed: job.failed,
    blocked: job.blocked,
    skipped: job.skipped,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finished: Boolean(job.finished),
    stopped: Boolean(job.stopped),
    running: !job.finished && !job.stopped,
    lastError: short(job.lastError, 120),
    preview: short(job.text, 90),
  };
}

export function summary(job: BcJob | null): string {
  if (!job) return "ماكا حتى بثّ";
  const v = view(job)!;
  const tail = job.finished ? "مكمّل ✓" : job.stopped ? "موقّف" : `كمّل دابا (${v.pct}%) — press متابعة`;
  return `بثّ لجميع المستخدمين: ${v.sent} وصل · ${v.failed} فشل · ${v.blocked} ما كيقراش · ${v.skipped} محظور · من ${v.total} — ${tail}`;
}

/** بدء بثّ جديد لجميع من بدأ البوت (كل المستخدمين منذ الإنشاء) */
export async function startBroadcast(text: string): Promise<BcJob> {
  const t = String(text || "").trim();
  if (!t) throw new Error("النص مطلوب للبثّ");
  const [ids, banned] = await Promise.all([allUserIds(), bannedIds().catch(() => [] as string[])]);
  const banSet = new Set(banned.map(String));
  const targets = ids.filter((id) => !banSet.has(id));
  const job = blank({
    text: t,
    total: targets.length,
    targets,
    skipped: Math.max(0, ids.length - targets.length),
  });
  await saveJob(job);
  if (!targets.length) {
    job.finished = true;
    await saveJob(job);
    return job;
  }
  return tickBroadcast(TICK_MS, job);
}

/** تنفيذ دفعة من البثّ (كتكمل من بلاصت اللي وقّف) */
export async function tickBroadcast(budgetMs = TICK_MS, seeded?: BcJob): Promise<BcJob> {
  let job = seeded || (await loadJob());
  if (!job) throw new Error("ماكا حتى بثّ شغّال — بدا واحد جديد");
  if (job.finished || job.stopped) return job;

  // 🔒 إلا كاين شي خدام على نفس البثّ دابا (نقرة مضاعفة / طلبين) → ما نكرّروش
  const inProcess = (globalThis as { __ftBcTick?: boolean }).__ftBcTick;
  const lockedRecently = Date.now() - (job.lockedAt || 0) < 30_000;
  if (!seeded && inProcess) return job;
  if (!seeded && lockedRecently && job.cursor === job.lockedCursor) return job;

  job.lockedAt = Date.now();
  job.lockedCursor = job.cursor;
  await saveJob(job);
  (globalThis as { __ftBcTick?: boolean }).__ftBcTick = true;
  try {
    await pump(job, budgetMs);
  } finally {
    (globalThis as { __ftBcTick?: boolean }).__ftBcTick = false;
    const fresh = await loadJob();
    if (fresh) {
      fresh.lockedAt = 0;
      await saveJob(fresh);
    }
  }
  return (await loadJob()) || job;
}

async function pump(job: BcJob, budgetMs: number) {
  const ids = job.targets || [];
  const deadline = Date.now() + Math.max(3_000, budgetMs);

  while (job.cursor < ids.length) {
    // 🔄 ناخدو آخر حالة من المخزن (باش الطلبات المتوازية ما يكرروش نفس الواحد)
    const fresh = await loadJob();
    if (fresh && (fresh.finished || fresh.stopped)) {
      Object.assign(job, fresh);
      return;
    }
    if (fresh && fresh.cursor > job.cursor) job.cursor = fresh.cursor;
    const batch = ids.slice(job.cursor, job.cursor + BATCH);
    const results = await Promise.all(
      batch.map(async (id) => {
        for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
          try {
            const r = await sendMessage(id, job!.text);
            if (r.ok) return "ok" as const;
            const d = String(r.description || "");
            if (/blocked the bot|user is deactivated|bot was blocked|kicked/i.test(d)) return "blocked" as const;
            if (/too many|retry after|429/i.test(d)) {
              const wait = Math.min(6_000, 1_200 * (attempt + 1));
              await sleep(wait);
              continue;
            }
            job!.lastError = short(d, 160);
            return "fail" as const;
          } catch (e) {
            job!.lastError = short((e as Error)?.message || e, 160);
            if (attempt < MAX_RETRY) {
              await sleep(700);
              continue;
            }
            return "fail" as const;
          }
        }
        return "fail" as const;
      }),
    );
    for (const s of results) {
      if (s === "ok") job.sent++;
      else if (s === "blocked") job.blocked++;
      else job.failed++;
    }
    job.cursor += batch.length;
    job.updatedAt = Date.now();
    await saveJob(job);
    if (Date.now() >= deadline) return;
    await sleep(GAP_MS);
  }

  job.finished = true;
  job.updatedAt = Date.now();
  await saveJob(job);
  await pushHistory(job);
}

export async function stopBroadcast(): Promise<BcJob | null> {
  const job = await loadJob();
  if (!job) return null;
  job.stopped = true;
  job.updatedAt = Date.now();
  await saveJob(job);
  await pushHistory(job);
  return job;
}

async function pushHistory(job: BcJob) {
  try {
    const v = view(job)!;
    await getStore().listPush(HISTORY_KEY, [
      JSON.stringify({
        at: job.updatedAt,
        id: job.id,
        total: v.total,
        sent: v.sent,
        failed: v.failed,
        blocked: v.blocked,
        preview: v.preview,
        finished: job.finished,
        stopped: job.stopped,
      }),
    ]);
  } catch {
    /* تاريخ فقط — ما مهمش */
  }
}

export async function broadcastHistory(limit = 12) {
  try {
    const raw = await getStore().listAll(HISTORY_KEY, 500);
    return raw
      .slice(-limit)
      .reverse()
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as {
      at: number;
      id: string;
      total: number;
      sent: number;
      failed: number;
      blocked: number;
      preview: string;
      finished: boolean;
      stopped: boolean;
    }[];
  } catch {
    return [];
  }
}
