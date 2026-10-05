/**
 * Browser side of MEGA PROJECTS: drives the plan → file-by-file loop without ever giving up,
 * keeps every finished file in IndexedDB (so closing the app / losing signal never loses work),
 * and packs the result into one ZIP.
 */
import {
  MEGA_MAX_FILE,
  MEGA_MAX_TOTAL,
  digestOf,
  extractFile,
  fileLooksComplete,
  type MegaPlan,
  type MegaPlanFile,
} from "@/lib/mega";
import { createZip, type ZipFile } from "@/lib/zip";

export type MegaStatus = "planning" | "building" | "done" | "stopped" | "error";

export type MegaJob = {
  id: string;
  prompt: string;
  plan: MegaPlan | null;
  /** finished files (text) — kept in the files store, mirrored here while running */
  files: Record<string, string>;
  failed: string[];
  skipped: string[];
  status: MegaStatus;
  note: string;
  updatedAt: number;
};

export type MegaLive = { path: string; chars: number; attempt: number };

/* ------------------------------ IndexedDB ------------------------------ */

const DB_NAME = "barq-mega";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("jobs")) db.createObjectStore("jobs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveJobMeta(job: MegaJob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const { files: _files, ...meta } = job;
  void _files;
  await tx(db, "jobs", "readwrite", (s) => s.put({ ...meta, updatedAt: Date.now() }));
  db.close();
}

async function saveFile(id: string, path: string, text: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await tx(db, "files", "readwrite", (s) => s.put(text, `${id}:${path}`));
  db.close();
}

/** The most recent saved project (with all its finished files), if any. */
export async function loadLatestJob(): Promise<MegaJob | null> {
  const db = await openDb();
  if (!db) return null;
  const all = (await tx(db, "jobs", "readonly", (s) => s.getAll())) as Omit<MegaJob, "files">[] | null;
  if (!all || all.length === 0) {
    db.close();
    return null;
  }
  const meta = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const files: Record<string, string> = {};
  const paths = meta.plan?.files.map((f) => f.path) ?? [];
  for (const p of paths) {
    const t = (await tx(db, "files", "readonly", (s) => s.get(`${meta.id}:${p}`))) as string | null;
    if (typeof t === "string") files[p] = t;
  }
  db.close();
  return { ...meta, files };
}

export async function deleteJob(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const all = (await tx(db, "jobs", "readonly", (s) => s.getAll())) as Omit<MegaJob, "files">[] | null;
  const meta = all?.find((j) => j.id === id);
  for (const f of meta?.plan?.files ?? []) await tx(db, "files", "readwrite", (s) => s.delete(`${id}:${f.path}`));
  await tx(db, "jobs", "readwrite", (s) => s.delete(id));
  db.close();
}

/* ------------------------------ helpers ------------------------------ */

export const newJob = (prompt: string): MegaJob => ({
  id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  prompt,
  plan: null,
  files: {},
  failed: [],
  skipped: [],
  status: "planning",
  note: "",
  updatedAt: Date.now(),
});

const enc = new TextEncoder();
export const bytesOf = (files: Record<string, string>): number =>
  Object.values(files).reduce((n, t) => n + enc.encode(t).length, 0);

class Fatal extends Error {}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });

async function waitOnline(signal: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || typeof window === "undefined" || navigator.onLine !== false) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      resolve();
    };
    window.addEventListener("online", done, { once: true });
    signal.addEventListener("abort", done, { once: true });
  });
}

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function errorCode(res: Response): Promise<string> {
  try {
    return ((await res.clone().json()) as { code?: string }).code ?? "";
  } catch {
    return "";
  }
}

/** Plans the project (retries on its own). Throws Fatal for quota / plan problems. */
async function planProject(authFetch: AuthFetch, job: MegaJob, signal: AbortSignal): Promise<MegaPlan> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (signal.aborted) throw new Error("aborted");
    await waitOnline(signal);
    try {
      const res = await authFetch("/api/ai/mega", {
        method: "POST",
        body: JSON.stringify({ phase: "plan", prompt: job.prompt }),
        signal,
      });
      if (res.ok) {
        const j = (await res.json()) as { plan?: MegaPlan };
        if (j.plan && j.plan.files.length > 0) return j.plan;
      } else {
        const code = await errorCode(res);
        if (code === "QUOTA") throw new Fatal("انتهت نقاطك لليوم.");
        if (code === "PRO_ONLY") throw new Fatal("المشاريع الضخمة لخطة Pro.");
        if (code === "UNAUTHENTICATED") throw new Fatal("سجّل الدخول من جديد.");
      }
    } catch (e) {
      if (e instanceof Fatal || (e as Error).name === "AbortError") throw e;
    }
    await sleep(2000 * attempt, signal);
  }
  throw new Fatal("تعذّر تخطيط المشروع الآن. أعد المحاولة بعد لحظات (لم تُخصم نقطة).");
}

/** Generates ONE file. Streams so the UI shows live progress; retries without end-user action. */
async function generateFile(
  authFetch: AuthFetch,
  job: MegaJob,
  f: MegaPlanFile,
  signal: AbortSignal,
  onLive: (l: MegaLive | null, f: MegaPlanFile) => void
): Promise<string | null> {
  const plan = job.plan as MegaPlan;
  const MAX_ATTEMPTS = 5;
  let best = ""; // longest complete-looking attempt so far, used if later attempts do worse
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) return null;
    await waitOnline(signal);
    const needTexts = f.needs.filter((n) => job.files[n] !== undefined).map((n) => ({ path: n, text: job.files[n].slice(0, 40_000) }));
    let digest = "";
    for (const p of Object.keys(job.files)) {
      if (p === f.path) continue;
      const line = digestOf(p, job.files[p]);
      if (digest.length + line.length > 30_000) break;
      digest += line + "\n";
    }
    try {
      const res = await authFetch("/api/ai/mega", {
        method: "POST",
        body: JSON.stringify({
          phase: "file",
          prompt: job.prompt,
          title: plan.title,
          contract: plan.contract,
          plan: plan.files.map((x) => ({ path: x.path, desc: x.desc, kb: x.kb })),
          path: f.path,
          desc: f.desc,
          kb: f.kb,
          digest,
          needTexts,
        }),
        signal,
      });
      if (!res.ok || !res.body) {
        const code = await errorCode(res);
        if (code === "PRO_ONLY") throw new Fatal("المشاريع الضخمة لخطة Pro.");
        if (code === "UNAUTHENTICATED") throw new Fatal("سجّل الدخول من جديد.");
        if (res.status === 429) {
          await sleep(Number(res.headers.get("Retry-After") ?? 15) * 1000 + 500, signal);
          attempt--; // rate limits don't burn an attempt
          continue;
        }
        throw new Error(`http ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        onLive({ path: f.path, chars: acc.length, attempt }, f);
      }
      acc += dec.decode();
      const text = extractFile(acc);
      const lenient = attempt === MAX_ATTEMPTS; // last try: accept whatever is usable
      if (text.length > MEGA_MAX_FILE) return text.slice(0, MEGA_MAX_FILE);
      // code files must reach at least half of their target size (the architect's minimums are strict);
      // attempts 3+ settle for a third so one stubborn file never blocks the whole project
      const sized = /\.(js|css|html)$/.test(f.path) && f.kb >= 12;
      const minChars = sized ? Math.round(f.kb * 1024 * (attempt >= 3 ? 0.33 : 0.5)) : 0;
      if (fileLooksComplete(f.path, text) && text.length > best.length) best = text;
      if (lenient) {
        const pick = best.length >= text.length ? best : text;
        if (pick.trim().length >= 8) return pick;
      } else if (fileLooksComplete(f.path, text) && text.length >= minChars) return text;
    } catch (e) {
      if (e instanceof Fatal || (e as Error).name === "AbortError") throw e;
    }
    onLive({ path: f.path, chars: 0, attempt: attempt + 1 }, f);
    await sleep(1200 * attempt, signal);
  }
  return best.trim().length >= 8 ? best : null;
}

/* ------------------------------ the loop ------------------------------ */

export async function runMega(o: {
  authFetch: AuthFetch;
  job: MegaJob;
  signal: AbortSignal;
  onUpdate: (job: MegaJob) => void;
  onLive: (live: Record<string, MegaLive>) => void;
  concurrency?: number;
}): Promise<MegaJob> {
  const { authFetch, signal } = o;
  const job = o.job;
  const live: Record<string, MegaLive> = {};
  const push = () => o.onUpdate({ ...job, files: { ...job.files } });
  const setLive = (l: MegaLive | null, f: MegaPlanFile) => {
    if (l) live[f.path] = l;
    else delete live[f.path];
    o.onLive({ ...live });
  };

  try {
    if (!job.plan) {
      job.status = "planning";
      job.note = "المهندس المعماري يخطّط الملفات…";
      push();
      job.plan = await planProject(authFetch, job, signal);
      await saveJobMeta(job);
    }
    const plan = job.plan as MegaPlan;
    job.status = "building";
    job.note = "";
    push();

    const pending = plan.files.filter((f) => job.files[f.path] === undefined && !job.failed.includes(f.path) && !job.skipped.includes(f.path));
    const running = new Set<string>();
    let total = bytesOf(job.files);
    const state: { fatal: Fatal | null } = { fatal: null };
    const concurrency = Math.max(1, Math.min(o.concurrency ?? 3, 4));

    const settled = (p: string) => job.files[p] !== undefined || job.failed.includes(p) || job.skipped.includes(p) || !plan.files.some((x) => x.path === p);

    const worker = async () => {
      for (;;) {
        if (signal.aborted || state.fatal) return;
        if (pending.length === 0) return;
        // next file whose dependencies are finished (fallback: the first one, so a cycle can never freeze the loop)
        let idx = pending.findIndex((f) => f.needs.every(settled));
        if (idx < 0 && running.size === 0) idx = 0;
        if (idx < 0) {
          await sleep(400, signal);
          continue;
        }
        const f = pending.splice(idx, 1)[0];
        if (total >= MEGA_MAX_TOTAL) {
          job.skipped.push(f.path);
          continue;
        }
        running.add(f.path);
        job.note = `يكتب: ${f.path}`;
        try {
          const text = await generateFile(authFetch, job, f, signal, setLive);
          if (signal.aborted) {
            pending.unshift(f);
            return;
          }
          if (text === null) {
            job.failed.push(f.path);
          } else {
            job.files[f.path] = text;
            total += enc.encode(text).length;
            await saveFile(job.id, f.path, text);
          }
        } catch (e) {
          if (e instanceof Fatal) {
            state.fatal = e;
            pending.unshift(f);
          } else if ((e as Error).name === "AbortError") {
            pending.unshift(f);
            return;
          } else {
            job.failed.push(f.path);
          }
        } finally {
          running.delete(f.path);
          setLive(null, f);
          await saveJobMeta(job);
          push();
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));

    if (state.fatal) throw state.fatal;
    if (signal.aborted) {
      job.status = "stopped";
      job.note = "تم الإيقاف — يمكنك المتابعة من نفس النقطة.";
    } else {
      job.status = "done";
      job.note =
        job.failed.length > 0
          ? `اكتمل مع ${job.failed.length} ملف تعذّر — اضغط «أعد المحاولة» لإكمالها.`
          : job.skipped.length > 0
            ? "وصل المشروع إلى حد 5MB فتوقف البناء عنده."
            : "اكتمل المشروع.";
    }
  } catch (e) {
    if (e instanceof Fatal) {
      job.status = "error";
      job.note = e.message;
    } else if (signal.aborted || (e as Error).name === "AbortError") {
      job.status = "stopped";
      job.note = "تم الإيقاف — يمكنك المتابعة من نفس النقطة.";
    } else {
      job.status = "error";
      job.note = "انقطع الاتصال. اضغط «متابعة» لإكمال البناء من آخر ملف.";
    }
  }
  o.onLive({});
  await saveJobMeta(job);
  push();
  return job;
}

/** Re-queues the files that failed so «retry» regenerates only those. */
export function requeueFailed(job: MegaJob): MegaJob {
  return { ...job, failed: [], skipped: [], status: "building", note: "" };
}

/* ------------------------------ output ------------------------------ */

export function buildZip(job: MegaJob): Blob {
  const files: ZipFile[] = Object.entries(job.files).map(([path, data]) => ({ path, data }));
  const lines = [
    `# ${job.plan?.title ?? "Barq project"}`,
    "",
    "Generated by Barq AI (برق) — mega project mode.",
    "",
    "## Run",
    "Unzip, then open `index.html` in any browser (no install, no build step), or upload the folder to any static host.",
    "",
    `Files: ${files.length}${job.plan ? ` of ${job.plan.files.length} planned` : ""}`,
  ];
  if (job.failed.length > 0) lines.push("", "## Files that could not be generated", ...job.failed.map((p) => `- ${p}`));
  if (job.skipped.length > 0) lines.push("", "## Skipped (5 MB limit reached)", ...job.skipped.map((p) => `- ${p}`));
  if (job.prompt) lines.push("", "## Original request", job.prompt);
  files.push({ path: "README.md", data: lines.join("\n") + "\n" });
  return createZip(files);
}

const norm = (p: string) => p.replace(/^(\.\/|\/)+/, "").split(/[?#]/)[0];

/** One self-contained page for quick preview: local css / js are inlined into index.html. */
export function inlinePreview(files: Record<string, string>): string | null {
  const index = files["index.html"];
  if (!index) return null;
  let out = index.replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
    const href = /\bhref=["']([^"']+)["']/i.exec(tag)?.[1];
    const css = href ? files[norm(href)] : undefined;
    return css !== undefined ? `<style>\n${css}\n</style>` : tag;
  });
  out = out.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, _a: string, src: string) => {
    const js = files[norm(src)];
    return js !== undefined ? `<script>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>` : tag;
  });
  return out;
}
