/**
 * Background runner for MEGA projects.
 *
 * The loop lives at module level, NOT inside a React component, so leaving the Studio page
 * (or any route change inside the app) never stops or loses a build. The UI just subscribes.
 * Every finished file is also saved in IndexedDB; after a full reload the build is resumed
 * automatically by <BackgroundJobs/>.
 */
import { loadLatestJob, deleteJob, runMega, saveJobMeta, type MegaJob, type MegaLive } from "@/lib/mega-client";

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type MegaState = {
  job: MegaJob | null;
  live: Record<string, MegaLive>;
  running: boolean;
  loaded: boolean;
};

export const MEGA_SERVER_STATE: MegaState = { job: null, live: {}, running: false, loaded: false };

let state: MegaState = MEGA_SERVER_STATE;
const subs = new Set<() => void>();
let controller: AbortController | null = null;
let loading: Promise<void> | null = null;
let wake: { release: () => Promise<void> } | null = null;

function set(patch: Partial<MegaState>): void {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}

export function megaSubscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export const megaGet = (): MegaState => state;

async function takeWake(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release: () => Promise<void> }> } };
    wake = (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    wake = null;
  }
}

/** Reads the saved project once (never replaces a build that is already running). */
export function megaInit(): Promise<void> {
  if (state.loaded || state.running) return Promise.resolve();
  loading ??= loadLatestJob()
    .then((j) => {
      if (state.running) return;
      if (j && (j.status === "building" || j.status === "planning")) {
        set({ job: { ...j, status: "stopped", note: j.plan ? "مشروع محفوظ — يكمل تلقائياً…" : "مشروع محفوظ — اضغط «متابعة»." }, loaded: true });
      } else set({ job: j, loaded: true });
    })
    .catch(() => set({ loaded: true }));
  return loading;
}

/** True when a saved project was cut in the middle and can continue by itself. */
export function megaCanAutoResume(): boolean {
  const j = state.job;
  return !state.running && !!j && !!j.plan && j.status === "stopped" && j.note.includes("يكمل تلقائياً");
}

export async function megaStart(authFetch: AuthFetch, job: MegaJob): Promise<void> {
  if (controller) return;
  const c = new AbortController();
  controller = c;
  set({ job, live: {}, running: true, loaded: true });
  await takeWake();
  try {
    await runMega({
      authFetch,
      job,
      signal: c.signal,
      onUpdate: (j) => set({ job: j }),
      onLive: (live) => set({ live }),
      concurrency: 3,
    });
  } finally {
    controller = null;
    set({ running: false, live: {} });
    void wake?.release().catch(() => undefined);
    wake = null;
  }
}

export function megaStop(): void {
  controller?.abort();
}

export async function megaDiscard(): Promise<void> {
  if (state.running || !state.job) return;
  await deleteJob(state.job.id);
  set({ job: null });
}

/** Lets the Studio page show a project that was just stopped / edited without a reload. */
export async function megaPersist(job: MegaJob): Promise<void> {
  await saveJobMeta(job);
  set({ job });
}
