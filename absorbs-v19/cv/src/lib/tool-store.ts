/**
 * Background runner for Studio tools (game builder, landing page, UI designer…).
 *
 * The request loop lives at module level, so leaving the page never cancels it and the
 * result is still there when you come back. A finished HTML build is saved to the gallery
 * (/api/projects) by itself.
 */
import { extractHtml } from "@/lib/attachments";
import { fencesFromFiles, parseFenceFiles } from "@/lib/game-bundle";

type AuthFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ToolRunState = {
  values: Record<string, string>;
  outLang: string;
  streaming: boolean;
  result: string;
  ran: boolean;
  error: "quota" | "nokey" | "busy" | "generic" | "pro" | null;
  errDetail: string;
  part: number;
  note: string;
  modelUsed: string;
  saved: boolean;
};

export const EMPTY_TOOL_STATE: ToolRunState = {
  values: {},
  outLang: "auto",
  streaming: false,
  result: "",
  ran: false,
  error: null,
  errDetail: "",
  part: 0,
  note: "",
  modelUsed: "",
  saved: false,
};

const states = new Map<string, ToolRunState>();
const titles = new Map<string, string>();
const subs = new Set<() => void>();

export const toolGet = (id: string): ToolRunState => states.get(id) ?? EMPTY_TOOL_STATE;
export function toolSubscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function toolPatch(id: string, patch: Partial<ToolRunState>): void {
  states.set(id, { ...toolGet(id), ...patch });
  subs.forEach((f) => f());
}

/** Tools that are generating right now (for the floating badge). */
export function toolsRunning(): { id: string; title: string; chars: number }[] {
  const out: { id: string; title: string; chars: number }[] = [];
  states.forEach((s, id) => {
    if (s.streaming) out.push({ id, title: titles.get(id) ?? id, chars: s.result.length });
  });
  return out;
}

/** Cheap snapshot string so useSyncExternalStore can watch the running list. */
export const toolsSignature = (): string => toolsRunning().map((t) => `${t.id}:${Math.floor(t.chars / 2000)}`).join("|");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True when a code answer stops before its closing fence / </html>. */
export function cutOff(text: string): boolean {
  if ((text.match(/```/g) ?? []).length % 2 === 1) return true;
  const m = text.match(/```html[\s\S]*?(```|$)/i);
  return !!m && !/<\/html>/i.test(m[0]);
}

type WakeLockish = { release: () => Promise<void> };
const wakes = new Map<string, WakeLockish>();

/** What the builder is doing right now, shown under the progress bar. */
const PHASES = [
  "يكتب المحرّك والفيزياء…",
  "يضيف الأعداء والمستويات…",
  "يلمّع الحركات والأصوات…",
  "يفحص الأخطاء سطراً بسطر…",
  "يجهّز المعاينة…",
];

async function pump(id: string, r: Response, base: string): Promise<string> {
  const reader = r.body?.getReader();
  if (!reader) return base;
  const decoder = new TextDecoder();
  let acc = base;
  let last = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      const now = Date.now();
      if (now - last > 120) {
        last = now;
        toolPatch(id, { result: acc, note: PHASES[Math.min(PHASES.length - 1, Math.floor(acc.length / 18000))] });
      }
    }
  } catch {
    /* connection cut: keep what we have, the loop continues from it */
  }
  acc += decoder.decode();
  toolPatch(id, { result: acc });
  return acc;
}

/** Parse ```path fences and keep ONLY the last version of each file, in order. */
export function mergeBuildFiles(text: string): string {
  const files = parseFenceFiles(text);
  return files.length ? fencesFromFiles(files) : text;
}

async function finish(
  id: string,
  authFetch: AuthFetch,
  toolId: string,
  start: string,
  req: { inputs: Record<string, string>; outLang: string; locale: string }
): Promise<string> {
  let acc = start;
  let fails = 0;
  toolPatch(id, { note: "" });
  for (let i = 0; i < 24 && cutOff(acc); i++) {
    toolPatch(id, { part: i + 2 });
    try {
      const r = await authFetch("/api/ai/tool", {
        method: "POST",
        body: JSON.stringify({ tool: toolId, inputs: req.inputs, outLang: req.outLang, locale: req.locale, continueFrom: acc }),
      });
      if (!r.ok) {
        toolPatch(id, { note: `HTTP ${r.status}` });
        if (++fails > 4) break;
        await sleep(2500);
        i--;
        continue;
      }
      const next = await pump(id, r, acc);
      if (next.length - acc.length < 40) {
        if (++fails > 4) break;
        await sleep(2500);
        i--;
        continue;
      }
      fails = 0;
      acc = next;
    } catch {
      if (++fails > 4) break;
      await sleep(2500);
      i--;
    }
  }
  acc = mergeBuildFiles(acc);
  toolPatch(id, { part: 0, result: acc });
  return acc;
}

async function autosave(id: string, authFetch: AuthFetch, title: string): Promise<void> {
  const s = toolGet(id);
  if (s.saved) return;
  const html = extractHtml(s.result);
  if (!html || html.length < 1500 || html.length > 880_000) return;
  try {
    const r = await authFetch("/api/projects", { method: "POST", body: JSON.stringify({ title: title.slice(0, 80), html }) });
    if (r.ok) toolPatch(id, { saved: true });
  } catch {
    /* the result is still on screen, the person can save it by hand */
  }
}

export type ToolRunOpts = {
  authFetch: AuthFetch;
  toolId: string;
  isGame: boolean;
  title: string;
  locale: string;
  applyHeaders: (r: Response) => void;
  /** persist the finished build in the Studio gallery */
  save: boolean;
};

export async function toolRun(id: string, o: ToolRunOpts): Promise<void> {
  const cur = toolGet(id);
  if (cur.streaming) return;
  titles.set(id, o.title);
  const req = { inputs: cur.values, outLang: cur.outLang, locale: o.locale };
  toolPatch(id, { streaming: true, result: "", ran: true, error: null, errDetail: "", modelUsed: "", saved: false, part: 0, note: "" });
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockish> } };
    const w = await nav.wakeLock?.request("screen");
    if (w) wakes.set(id, w);
  } catch {
    /* not supported */
  }
  try {
    const res = await o.authFetch("/api/ai/tool", {
      method: "POST",
      body: JSON.stringify({ tool: o.toolId, inputs: req.inputs, outLang: req.outLang, locale: req.locale }),
    });
    if (!res.ok) {
      let code = "";
      let detail = "";
      try {
        const j = (await res.json()) as { code?: string; detail?: string };
        code = j.code ?? "";
        detail = j.detail ?? "";
      } catch {
        /* ignore */
      }
      toolPatch(id, {
        errDetail: detail,
        error: code === "QUOTA" ? "quota" : code === "PRO_ONLY" ? "pro" : code === "NO_KEY" ? "nokey" : "busy",
        streaming: false,
      });
      return;
    }
    o.applyHeaders(res);
    toolPatch(id, { modelUsed: res.headers.get("x-model") ?? "" });
    const acc = await pump(id, res, "");
    if (!acc.trim()) toolPatch(id, { error: "generic" });
    else if (o.isGame) await finish(id, o.authFetch, o.toolId, acc, req);
    if (o.save) await autosave(id, o.authFetch, o.title);
  } catch {
    toolPatch(id, { error: "generic" });
  } finally {
    toolPatch(id, { streaming: false });
    void wakes.get(id)?.release().catch(() => undefined);
    wakes.delete(id);
  }
}

export async function toolResume(id: string, o: ToolRunOpts): Promise<void> {
  const cur = toolGet(id);
  if (cur.streaming) return;
  titles.set(id, o.title);
  toolPatch(id, { streaming: true, error: null });
  try {
    await finish(id, o.authFetch, o.toolId, cur.result, { inputs: cur.values, outLang: cur.outLang, locale: o.locale });
    if (o.save) await autosave(id, o.authFetch, o.title);
  } finally {
    toolPatch(id, { streaming: false });
  }
}
