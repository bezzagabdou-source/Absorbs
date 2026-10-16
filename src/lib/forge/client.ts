"use client";

/**
 * NEXUS FORGE v19 — حالة الواجهة (client state machine)
 * ---------------------------------------------------------------------------
 * One reducer turns the NDJSON stream into everything the Nexus Code workspace
 * paints: the stage rail, the live file list with per-model attribution, the QA
 * score, the preview document and the live link.
 *
 * Client-safe (no server imports).
 */
import type { ForgeEvent, ForgeMeta, ForgePlanDto, ForgeQa, ForgeScale, ForgeKind, ForgeStats } from "@/lib/forge/types";

export type UiFile = {
  path: string;
  kind: string;
  lines: number;
  kb: number;
  state: "ok" | "issues" | "repaired" | "merged" | "fallback";
  model?: string;
  note?: string;
  at: number;
};

export type UiStage = { stage: string; label: string; pct: number; state: "working" | "done"; model?: string; path?: string; at: number };

export type UiModel = { model: string; key: string; role: string; state: string; path?: string; note?: string; lines?: number; ms?: number; at: number };

export type ForgeUi = {
  phase: "idle" | "running" | "done" | "error";
  scale: ForgeScale | "";
  kind: ForgeKind | "";
  language: string;
  engines: number;
  tier: "free" | "pro" | "";
  target: number;
  pct: number;
  stages: UiStage[];
  logs: string[];
  plan: ForgePlanDto | null;
  waves: { wave: number; total: number; modules: string[] }[];
  files: UiFile[];
  models: UiModel[];
  qa: ForgeQa | null;
  html: string;
  tree: { path: string; data: string }[];
  live: { url: string; slug: string; kind: "db" | "portable" } | null;
  meta: ForgeMeta | null;
  stats: ForgeStats | null;
  net: { images: number; audio: number; source: string } | null;
  error: string | null;
  startedAt: number;
  endedAt: number;
  title: string;
};

export const MAX_LOGS = 260;
export const MAX_STAGES = 400;
export const MAX_MODELS = 400;

export function initialForgeUi(): ForgeUi {
  return {
    phase: "idle",
    scale: "",
    kind: "",
    language: "",
    engines: 0,
    tier: "",
    target: 0,
    pct: 0,
    stages: [],
    logs: [],
    plan: null,
    waves: [],
    files: [],
    models: [],
    qa: null,
    html: "",
    tree: [],
    live: null,
    meta: null,
    stats: null,
    net: null,
    error: null,
    startedAt: 0,
    endedAt: 0,
    title: "",
  };
}

const push = <T,>(list: T[], item: T, max: number): T[] => (list.length >= max ? [...list.slice(list.length - max + 1), item] : [...list, item]);

/** Pure reducer: one NDJSON event → the next UI state. */
export function applyEvent(s: ForgeUi, e: ForgeEvent): ForgeUi {
  const now = Date.now();
  switch (e.t) {
    case "start":
      return {
        ...initialForgeUi(),
        phase: "running",
        scale: e.scale,
        kind: e.kind,
        language: e.language,
        engines: e.engines,
        tier: e.plan,
        target: e.target,
        startedAt: now,
        pct: 2,
        stages: [{ stage: "start", label: "بدأت الورشة", pct: 2, state: "working", at: now }],
      };

    case "stage": {
      // per-module build stages are noise in the rail: keep the last one per path
      const stages = e.path ? s.stages.filter((x) => x.path !== e.path || x.stage !== e.stage) : s.stages;
      return {
        ...s,
        pct: Math.max(s.pct, e.pct || 0),
        stages: push(stages, { stage: e.stage, label: e.label, pct: e.pct, state: e.state, model: e.model, path: e.path, at: now }, MAX_STAGES),
      };
    }

    case "log":
      return { ...s, logs: push(s.logs, e.text, MAX_LOGS) };

    case "net":
      return { ...s, net: { images: e.images, audio: e.audio, source: e.source }, logs: push(s.logs, `الإنترنت: ${e.images} صورة · ${e.audio} صوت (${e.source})`, MAX_LOGS) };

    case "plan":
      return {
        ...s,
        plan: e.plan,
        title: e.plan.title,
        pct: Math.max(s.pct, 9),
        logs: push(s.logs, `الخطة: ${e.plan.modules.length} وحدة · ${e.plan.target.lines.toLocaleString("en")} سطر · ${e.plan.kind}`, MAX_LOGS),
      };

    case "wave":
      return { ...s, waves: [...s.waves, { wave: e.wave, total: e.total, modules: e.modules }], logs: push(s.logs, `الموجة ${e.wave + 1}/${e.total}: ${e.modules.join("، ")}`, MAX_LOGS) };

    case "model":
      return {
        ...s,
        models: push(s.models, { model: e.model, key: e.key, role: e.role, state: e.state, path: e.path, note: e.note, lines: e.lines, ms: e.ms, at: now }, MAX_MODELS),
      };

    case "file": {
      const rest = s.files.filter((f) => f.path !== e.path);
      const file: UiFile = { path: e.path, kind: e.kind, lines: e.lines, kb: e.kb, state: e.state, model: e.model, note: e.note, at: now };
      return { ...s, files: [...rest, file], pct: Math.max(s.pct, 10) };
    }

    case "qa":
      return { ...s, qa: e.qa, pct: Math.max(s.pct, 84) };

    case "html":
      return { ...s, html: e.html, pct: Math.max(s.pct, 80) };

    case "tree":
      return { ...s, tree: e.files };

    case "live":
      return { ...s, live: { url: e.url, slug: e.slug, kind: e.kind }, pct: 99, logs: push(s.logs, `الرابط الحي جاهز: ${e.url}`, MAX_LOGS) };

    case "stats":
      return { ...s, meta: e.meta, stats: e.meta.stats };

    case "done":
      return { ...s, phase: "done", pct: 100, endedAt: now, title: e.title || s.title };

    case "error":
      return { ...s, phase: "error", error: `${e.code}${e.detail ? ` — ${e.detail}` : ""}`, endedAt: now };

    default:
      return s;
  }
}

/** Buffers the NDJSON stream and fires one event per complete line. */
export function makeForgeParser(onEvent: (e: ForgeEvent) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as ForgeEvent);
        } catch {
          /* partial line — wait for the rest */
        }
      }
      nl = buf.indexOf("\n");
    }
  };
}

/* ------------------------------------------------------------------ *
 * presentation helpers
 * ------------------------------------------------------------------ */
export function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} ث`;
  return `${Math.floor(s / 60)}د ${Math.round(s % 60)}ث`;
}

export const SCALE_AR: Record<string, string> = {
  standard: "عادي",
  big: "ضخم",
  titan: "تيتان",
};

export const KIND_AR: Record<string, string> = {
  game: "لعبة",
  site: "موقع",
  system: "نظام + قاعدة بيانات",
  app: "تطبيق ويب",
  tool: "أداة",
  landing: "صفحة هبوط",
};

export const ROLE_AR: Record<string, string> = {
  architect: "مهندس معماري",
  builder: "بنّاء",
  reviewer: "مراجع",
  repair: "مصلح",
};

/** Per-model totals for the "who wrote what" panel. */
export function modelTotals(s: ForgeUi): { model: string; files: number; lines: number; roles: string[] }[] {
  const map = new Map<string, { model: string; files: number; lines: number; roles: Set<string> }>();
  for (const f of s.files) {
    if (f.state === "merged") continue;
    const key = f.model || "—";
    const e = map.get(key) ?? { model: key, files: 0, lines: 0, roles: new Set<string>() };
    e.files++;
    e.lines += f.lines;
    map.set(key, e);
  }
  for (const m of s.models) {
    const e = map.get(m.model) ?? { model: m.model, files: 0, lines: 0, roles: new Set<string>() };
    e.roles.add(m.role);
    if (m.state === "done" && m.lines) e.lines = Math.max(e.lines, 0);
    map.set(m.model, e);
  }
  return Array.from(map.values())
    .map((e) => ({ model: e.model, files: e.files, lines: e.lines, roles: Array.from(e.roles) }))
    .sort((a, b) => b.lines - a.lines || b.files - a.files);
}

/* ------------------------------------------------------------------ *
 * session persistence (a refresh must not lose the build)
 * ------------------------------------------------------------------ */
const KEY = "nexus:forge:session:v19";
const MAX_SAVED_HTML = 1_600_000;

export type SavedSession = {
  at: number;
  prompt: string;
  scale: ForgeScale;
  kind: ForgeKind;
  title: string;
  html: string;
  files: UiFile[];
  tree: { path: string; data: string }[];
  qa: ForgeQa | null;
  meta: ForgeMeta | null;
  live: ForgeUi["live"];
  plan: ForgePlanDto | null;
};

export function saveForgeSession(s: ForgeUi, prompt: string): boolean {
  if (!s.html) return false;
  try {
    const payload: SavedSession = {
      at: Date.now(),
      prompt,
      scale: (s.scale || "big") as ForgeScale,
      kind: (s.kind || "site") as ForgeKind,
      title: s.title || "مشروع Nexus",
      html: s.html.length > MAX_SAVED_HTML ? "" : s.html,
      files: s.files,
      tree: s.tree.map((t) => ({ path: t.path, data: t.data.length > 400_000 ? "" : t.data })),
      qa: s.qa,
      meta: s.meta,
      live: s.live,
      plan: s.plan,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* private mode */
    }
    return false;
  }
}

export function loadForgeSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as SavedSession;
    if (!p || !p.html) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearForgeSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
