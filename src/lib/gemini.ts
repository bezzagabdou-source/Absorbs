/**
 * Gemini streaming client — plain REST, no SDK required.
 * Configure in Vercel: GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)
 * Optional extra engines: ANTHROPIC / DEEPSEEK / XAI / HF_TOKEN / OPENROUTER / GROQ / CEREBRAS _API_KEY
 */

import { findHuggingFaceKey, huggingFaceModels, HF_URL } from "@/lib/huggingface";
import { MAX_OUTPUT_TOKENS, MAX_SEGMENT_TOKENS } from "@/lib/limits";
import { assignRoles, isSiteRequest, packBriefs, STUDIO_LEAD_RULES, type RoleId } from "@/lib/site-team";
import { engineOrder, roleFor, sortByTask, SPECIALTY_AR, type EngineName, type Task } from "@/lib/task-router";

export type ChatTurn = { role: "user" | "model"; text: string };

/** Binary input (image / PDF) sent inline to Gemini — Pro only. */
export type Attachment = { mime: string; data: string };

/** Which engine room a request runs in. */
export type Tier = "free" | "pro";
/** "speed" = newest fast model; "quality" = strongest model available (Pro only). */
export type Mode = "speed" | "quality";

/** Static fallbacks, used only when model discovery is not possible. */
const FALLBACK_FREE = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];
const FALLBACK_FAST = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
];
const FALLBACK_MAX = [
  "gemini-pro-latest",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];
/** Kept for the diagnostics route. */
export const FALLBACK_MODELS = FALLBACK_FAST;
export const MODELS = FALLBACK_FAST;

export class GeminiError extends Error {
  code: "NO_KEY" | "BUSY" | "ERROR";
  detail: string;
  constructor(code: "NO_KEY" | "BUSY" | "ERROR", message: string) {
    super(message);
    this.code = code;
    this.detail = message.slice(0, 300);
  }
}

const KEY_NAMES = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GEMINI_KEY",
  "GEMINI_APIKEY",
  "GEMINI",
  "API_KEY",
  "APIKEY",
  "KEY",
];

function clean(v: string | undefined): string {
  // strip spaces, newlines and accidental quotes pasted with the key
  return (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

/** Returns which env var holds the key (name only) and the cleaned value. */
export function findGeminiKey(): { name: string; value: string } | undefined {
  const env = process.env;
  const upper = new Map<string, string>();
  for (const k of Object.keys(env)) upper.set(k.toUpperCase(), k);

  // 1) well-known names, case-insensitive
  for (const n of KEY_NAMES) {
    const real = upper.get(n);
    const v = real ? clean(env[real]) : "";
    if (v) return { name: real as string, value: v };
  }
  // 2) last resort: any non-public variable that looks like a Google AI key
  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_")) continue; // Firebase web key lives there
    const v = clean(env[k]);
    if (/^AIza[0-9A-Za-z_-]{30,}$/.test(v)) return { name: k, value: v };
  }
  return undefined;
}

export function getGeminiKey(): string | undefined {
  return findGeminiKey()?.value;
}

async function openStream(
  model: string,
  key: string,
  body: unknown,
  signal?: AbortSignal
): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ModelSets = { free: string[]; fast: string[]; max: string[] };
const FALLBACK_SETS: ModelSets = {
  free: FALLBACK_FREE,
  fast: FALLBACK_FAST,
  max: FALLBACK_MAX,
};

/**
 * Asks Google which models this key can really use, so a retired model name
 * can never break the app. Cached for 30 min per server instance.
 */
const gm = globalThis as typeof globalThis & {
  __barqModels?: { at: number; sets: ModelSets };
  __barqModelsP?: Promise<ModelSets>;
};

/** Cached sets, or at most ~1.5s of waiting before falling back to the static ones. */
async function getModelSets(key: string): Promise<ModelSets> {
  const c = gm.__barqModels;
  if (c && Date.now() - c.at < 30 * 60_000) return c.sets;
  if (!gm.__barqModelsP) {
    gm.__barqModelsP = discoverModels(key).finally(() => {
      gm.__barqModelsP = undefined;
    });
  }
  return Promise.race([
    gm.__barqModelsP,
    sleep(1500).then(() => FALLBACK_SETS),
  ]);
}

const NEVER = /(image|tts|live|audio|embedding|robotics|computer|native|vision|learnlm|gemma|aqa)/;
const UNSTABLE = /(exp|preview|thinking)/;

function versionOf(n: string): number {
  const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
  return v ? parseFloat(v[1]) : 0;
}

async function discoverModels(key: string): Promise<ModelSets> {
  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      {
        headers: { "x-goog-api-key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return rememberFallback();
    const data = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = Array.from(
      new Set(
        (data.models ?? [])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => (m.name ?? "").replace(/^models\//, ""))
          .filter((n) => /^gemini-/.test(n) && !NEVER.test(n))
      )
    );
    const flash = names.filter((n) => /flash/.test(n));
    const pro = names.filter((n) => /-pro/.test(n));
    if (flash.length === 0) return rememberFallback();

    const byScore = (score: (n: string) => number) => (x: string, y: string) =>
      score(y) - score(x);

    // FREE: stable flash only, steady and predictable ("lite" last).
    const stableScore = (n: string) =>
      versionOf(n) * 100 - (/lite/.test(n) ? 150 : 0) - (/-latest$/.test(n) ? 40 : 0);
    const free = flash
      .filter((n) => !UNSTABLE.test(n))
      .sort(byScore(stableScore))
      .slice(0, 5);

    // PRO / speed: the newest flash of all — aliases and previews included.
    const fastScore = (n: string) =>
      (n === "gemini-flash-latest" ? 1000 : 0) +
      versionOf(n) * 100 -
      (/lite/.test(n) ? 150 : 0) -
      (/(exp|thinking)/.test(n) ? 500 : 0) -
      (/preview/.test(n) ? 20 : 0);
    const fast = flash.sort(byScore(fastScore)).slice(0, 4);

    // PRO / quality: the strongest pro model first, then the fast set as a net.
    const maxScore = (n: string) =>
      (n === "gemini-pro-latest" ? 1000 : 0) +
      versionOf(n) * 100 -
      (/(exp|thinking)/.test(n) ? 500 : 0) -
      (/preview/.test(n) ? 20 : 0);
    const max = pro.sort(byScore(maxScore)).slice(0, 2);

    const uniq = (l: string[]) => Array.from(new Set(l));
    const sets: ModelSets = {
      free: free.length ? free : FALLBACK_FREE,
      // newest first, but ALWAYS two stable models inside the first three
      // candidates, so a busy preview model can never take the whole race down
      fast: uniq([
        ...fast.slice(0, 1),
        ...(free.length ? free : FALLBACK_FREE).slice(0, 2),
        ...fast.slice(1),
        ...(free.length ? free : FALLBACK_FREE),
        ...FALLBACK_FREE,
      ]).slice(0, 8),
      max: uniq([...max, ...fast.slice(0, 1), ...free, ...fast]).slice(0, 8),
    };
    gm.__barqModels = { at: Date.now(), sets };
    return sets;
  } catch {
    return rememberFallback();
  }
}

function rememberFallback(): ModelSets {
  // pretend it was fetched 28 min ago: re-checked after ~2 minutes
  gm.__barqModels = { at: Date.now() - 28 * 60_000, sets: FALLBACK_SETS };
  return FALLBACK_SETS;
}

/** 2.5+/3 models "think" by default and can burn the whole token budget silently. */
function configFor(
  model: string,
  base: Record<string, unknown>,
  deep: boolean
): Record<string, unknown> {
  if (/gemini-3/.test(model)) {
    return { ...base, thinkingConfig: { thinkingLevel: deep ? "high" : "low" } };
  }
  if (/gemini-2\.5/.test(model)) {
    return {
      ...base,
      thinkingConfig: { thinkingBudget: deep ? 2048 : 0 },
    };
  }
  return base;
}

type Attempt =
  | { ok: true; res: Response; model: string }
  | { ok: false; status: number; text: string; model: string };

const isBadKey = (a: { status: number; text: string }) =>
  a.status === 401 ||
  a.status === 403 ||
  /API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED/i.test(a.text);

/** One model, one try. Handles models that reject thinkingConfig. */
async function attempt(
  model: string,
  key: string,
  mk: (m: string) => { generationConfig: Record<string, unknown> } & Record<string, unknown>,
  baseGen: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Attempt> {
  try {
    let res = await openStream(model, key, mk(model), signal);
    if (res.status === 400) {
      const t400 = await res.text().catch(() => "");
      if (/thinking/i.test(t400)) {
        const b = mk(model);
        b.generationConfig = baseGen;
        res = await openStream(model, key, b, signal);
      } else {
        return { ok: false, status: 400, text: t400.slice(0, 300), model };
      }
    }
    if (res.ok && res.body) return { ok: true, res, model };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, text: text.slice(0, 300), model };
  } catch (e) {
    return { ok: false, status: 0, text: String(e).slice(0, 200), model };
  }
}

/**
 * PRO "ultra speed": candidates start staggered (0 / 1.8s / 3.6s) or immediately
 * when an earlier one fails — the first healthy stream wins, the rest are cancelled.
 */
function hedged(
  models: string[],
  key: string,
  mk: Parameters<typeof attempt>[2],
  baseGen: Record<string, unknown>
): Promise<{ winner?: Extract<Attempt, { ok: true }>; fails: Attempt[] }> {
  const list = models.slice(0, 3);
  const n = list.length;
  const ctrls = list.map(() => new AbortController());
  const fails: Attempt[] = [];
  const started = new Set<number>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let settled = false;
  let failed = 0;

  return new Promise((resolve) => {
    const finish = (winner?: Extract<Attempt, { ok: true }>, keep = -1) => {
      settled = true;
      timers.forEach(clearTimeout);
      ctrls.forEach((c, j) => {
        if (j !== keep) c.abort();
      });
      resolve({ winner, fails });
    };
    const startNext = () => {
      for (let i = 0; i < n; i++) {
        if (!started.has(i)) return start(i);
      }
    };
    const start = (i: number) => {
      if (settled || started.has(i) || i >= n) return;
      started.add(i);
      void attempt(list[i], key, mk, baseGen, ctrls[i].signal).then((a) => {
        if (settled) {
          if (a.ok) a.res.body?.cancel().catch(() => undefined);
          return;
        }
        if (a.ok) return finish(a, i);
        fails.push(a);
        failed += 1;
        if (isBadKey(a) || failed >= n) return finish();
        startNext();
      });
    };
    start(0);
    for (let i = 1; i < n; i++) timers.push(setTimeout(() => start(i), i * 1800));
  });
}

/* ---------------- free fallbacks: OpenRouter, then Groq (OpenAI-compatible) ---------------- */

type Kind = "gemini" | "openai" | "anthropic";
type Compat = {
  name: string;
  kind: Kind;
  url: string;
  key: string;
  models: string[];
  headers?: Record<string, string>;
};

const withCustom = (custom: string, list: string[]) =>
  Array.from(new Set([...(custom ? [custom] : []), ...list]));

/** Every non-Gemini engine whose key exists joins the team automatically. */
function fallbackProviders(): Compat[] {
  const out: Compat[] = [];
  const env = process.env;

  const aKey = clean(env.ANTHROPIC_API_KEY) || clean(env.CLAUDE_API_KEY);
  if (aKey) {
    out.push({
      name: "claude",
      kind: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      key: aKey,
      models: withCustom(clean(env.ANTHROPIC_MODEL) || clean(env.CLAUDE_MODEL), [
        "claude-sonnet-5-5",
        "claude-opus-5-5",
        "claude-haiku-4-5-20251001",
      ]),
    });
  }
  // No direct Anthropic key but an OpenRouter key exists: Claude is reached THROUGH OpenRouter
  // (same engine name "claude", so the router still puts it first).
  // Opt-in only (OPENROUTER_CLAUDE=on): Claude on OpenRouter is paid, so a free OpenRouter key
  // must never make every request wait for a 402 before moving on.
  const orForClaude = clean(env.OPENROUTER_API_KEY);
  if (!aKey && orForClaude && /^(on|1|true|yes)$/i.test(clean(env.OPENROUTER_CLAUDE))) {
    out.push({
      name: "claude",
      kind: "openai",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: orForClaude,
      models: withCustom(clean(env.OPENROUTER_CLAUDE_MODEL), [
        "anthropic/claude-sonnet-4.5",
        "anthropic/claude-opus-4.5",
        "anthropic/claude-haiku-4.5",
      ]),
      headers: { "X-Title": "Nexus AI v8.4" },
    });
  }
  const dKey = clean(env.DEEPSEEK_API_KEY);
  if (dKey) {
    out.push({
      name: "deepseek",
      kind: "openai",
      url: "https://api.deepseek.com/chat/completions",
      key: dKey,
      models: withCustom(clean(env.DEEPSEEK_MODEL), ["deepseek-chat", "deepseek-reasoner"]),
    });
  }
  const xKey = clean(env.XAI_API_KEY) || clean(env.GROK_API_KEY);
  if (xKey) {
    out.push({
      name: "grok",
      kind: "openai",
      url: "https://api.x.ai/v1/chat/completions",
      key: xKey,
      models: withCustom(clean(env.XAI_MODEL) || clean(env.GROK_MODEL), [
        "grok-4",
        "grok-4-fast",
        "grok-3",
        "grok-code-fast-1",
      ]),
    });
  }
  const hf = findHuggingFaceKey();
  if (hf) {
    out.push({ name: "huggingface", kind: "openai", url: HF_URL, key: hf.value, models: huggingFaceModels() });
  }
  const orKey = clean(env.OPENROUTER_API_KEY);
  if (orKey) {
    out.push({
      name: "openrouter",
      kind: "openai",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: orKey,
      models: withCustom(clean(env.OPENROUTER_MODEL), [
        "openrouter/free",
        "qwen/qwen3.8-27b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "google/gemma-4-31b-it:free",
      ]),
      headers: { "X-Title": "Nexus AI v8.4" },
    });
  }
  const gKey = clean(env.GROQ_API_KEY);
  if (gKey) {
    out.push({
      name: "groq",
      kind: "openai",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: gKey,
      models: withCustom(clean(env.GROQ_MODEL), ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]),
    });
  }
  const cbKey = clean(env.CEREBRAS_API_KEY);
  if (cbKey) {
    out.push({
      name: "cerebras",
      kind: "openai",
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: cbKey,
      // retired models just answer 404 and the loop moves on to the next one
      models: withCustom(clean(env.CEREBRAS_MODEL), ["llama3.1-70b", "llama-3.3-70b", "gpt-oss-120b"]),
    });
  }
  return out;
}

/** Anthropic needs strictly alternating roles starting with "user". */
function toAnthropicMessages(messages: ChatTurn[], atts: Attachment[] = []) {
  const merged: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of messages) {
    const role = m.role === "model" ? "assistant" : "user";
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.text += "\n\n" + m.text;
    else merged.push({ role, text: m.text });
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged.map((m, i) => {
    const isLast = i === merged.length - 1 && m.role === "user";
    if (!isLast || atts.length === 0) return { role: m.role, content: m.text };
    return {
      role: m.role,
      content: [
        ...atts.map((a) =>
          a.mime === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: a.mime, data: a.data } }
            : { type: "image", source: { type: "base64", media_type: a.mime, data: a.data } }
        ),
        { type: "text", text: m.text },
      ],
    };
  });
}

/** One request body + headers for any non-Gemini engine. */
function compatRequest(
  p: Compat,
  model: string,
  system: string,
  messages: ChatTurn[],
  o: { temperature: number; maxTokens: number; stream: boolean; atts?: Attachment[] }
): { headers: Record<string, string>; body: string } {
  if (p.kind === "anthropic") {
    return {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": p.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system,
        stream: o.stream,
        temperature: Math.min(o.temperature, 1),
        max_tokens: Math.min(o.maxTokens, 64000),
        messages: toAnthropicMessages(messages, o.atts),
      }),
    };
  }
  const cap = p.name === "groq" || p.name === "cerebras" ? 8000 : 32000;
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.key}`,
      ...(p.headers ?? {}),
    },
    body: JSON.stringify({
      model,
      stream: o.stream,
      temperature: o.temperature,
      max_tokens: Math.min(o.maxTokens, cap),
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text,
        })),
      ],
    }),
  };
}

async function openCompat(
  system: string,
  messages: ChatTurn[],
  temperature: number,
  maxTokens: number,
  opts: { providers?: Compat[]; atts?: Attachment[] } = {}
): Promise<{ res: Response; model: string; kind: Kind } | null> {
  for (const p of opts.providers ?? fallbackProviders()) {
    for (const model of p.models) {
      try {
        const rq = compatRequest(p, model, system, messages, {
          temperature,
          maxTokens,
          stream: true,
          atts: opts.atts,
        });
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 20000); // connection phase only
        let res: Response;
        try {
          res = await fetch(p.url, {
            method: "POST",
            headers: rq.headers,
            body: rq.body,
            cache: "no-store",
            signal: ctl.signal,
          });
        } finally {
          clearTimeout(t);
        }
        if (res.ok && res.body) return { res, model: `${p.name}:${model}`, kind: p.kind };
        console.error(`[fallback] ${p.name}/${model}: ${res.status}`);
        await res.text().catch(() => undefined);
        if (res.status === 401 || res.status === 403) break; // bad key: skip this provider
      } catch (e) {
        console.error(`[fallback] ${p.name}/${model} failed:`, String(e).slice(0, 120));
      }
    }
  }
  return null;
}

/** Text delta of one SSE payload, for every supported wire format. */
function deltaOf(kind: Kind, json: unknown): string[] {
  const j = json as {
    type?: string;
    delta?: { type?: string; text?: string };
    choices?: { delta?: { content?: string } }[];
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (kind === "anthropic") {
    return j?.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text
      ? [j.delta.text]
      : [];
  }
  if (kind === "openai") {
    const t = j?.choices?.[0]?.delta?.content;
    return typeof t === "string" && t ? [t] : [];
  }
  return (j?.candidates?.[0]?.content?.parts ?? [])
    .map((x) => x.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
}

/** Turns an upstream SSE response into a ReadableStream of plain text chunks. */
function pumpStream(
  upstream: Response,
  kind: Kind,
  onDone?: (full: string) => void | Promise<void>
): ReadableStream<string> {
  const decoder = new TextDecoder();
  const full: string[] = [];
  let cancelled = false;
  let rd: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<string>({
    async start(controller) {
      const reader = (upstream.body as ReadableStream<Uint8Array>).getReader();
      rd = reader;
      let buffer = "";
      try {
        for (;;) {
          if (cancelled) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          // eslint-disable-next-line no-cond-assign
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              for (const t of deltaOf(kind, JSON.parse(payload))) {
                full.push(t);
                if (!cancelled) controller.enqueue(t);
              }
            } catch {
              // incomplete JSON line — ignore
            }
          }
        }
      } catch {
        // network hiccup: keep partial text
      } finally {
        if (full.length === 0 && !cancelled) {
          // blocked / empty answer: never leave the user with a blank bubble
          controller.enqueue("تعذّر توليد رد على هذه الرسالة، جرّب صياغة مختلفة.");
        }
        try {
          await onDone?.(full.join(""));
        } catch {
          // persistence errors must never break the stream
        }
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
    cancel() {
      cancelled = true;
      rd?.cancel().catch(() => undefined);
    },
  });
}

/**
 * Opens a Gemini SSE stream and returns a ReadableStream of text chunks.
 * `onDone` fires once with the full accumulated text (even on mid-stream
 * failure it receives the partial text).
 *
 * tier "pro": newest models + hedged requests (ultra speed), attachments allowed,
 *             bigger output budget, optional "quality" mode (strongest model).
 */
export async function streamGemini(opts: {
  system: string;
  messages: ChatTurn[];
  temperature?: number;
  tier?: Tier;
  mode?: Mode;
  maxTokens?: number;
  /** Pro "epic" builds: 3000+ line deliverables (bigger limits, multi-round continuation) */
  epic?: boolean;
  /** Cap one request at this many tokens; the client then asks for the continuation (keeps each request far below the host time limit) */
  segment?: number;
  /** images / PDFs attached to the LAST user turn (ignored for free tier) */
  attachments?: Attachment[];
  /** keep the strong model but skip long "thinking" (lower first-token latency) */
  lowThink?: boolean;
  /** never fall back to the other engines (used when the caller manages failover) */
  noFallback?: boolean;
  /** what kind of job this is: decides which engine leads and the fallback order */
  task?: Task;
  /** let the engines ranked above Gemini for this task (Claude by default) answer first; Gemini is the safety net */
  primaryFirst?: boolean;
  /** Nexus: force one free OpenRouter model (validated catalog id) before anything else */
  freeModel?: string;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const orForced = opts.freeModel ? clean(process.env.OPENROUTER_API_KEY) : "";
  if (opts.freeModel && !orForced) {
    throw new GeminiError("NO_KEY", "OPENROUTER_API_KEY is not configured");
  }
  if (opts.freeModel && orForced) {
    const lead = await openCompat(
      opts.system,
      opts.messages,
      opts.temperature ?? 0.5,
      Math.min(opts.maxTokens ?? 8192, 32000),
      {
        providers: [
          {
            name: "openrouter",
            kind: "openai",
            url: "https://openrouter.ai/api/v1/chat/completions",
            key: orForced,
            // chosen model first, the auto-router is the safety net
            models: Array.from(new Set([opts.freeModel, "openrouter/free"])),
            headers: { "X-Title": "Nexus AI v8.4" },
          },
        ],
      }
    );
    if (lead && lead.res.body) {
      opts.onModel?.(lead.model);
      return pumpStream(lead.res, lead.kind, opts.onDone);
    }
    throw new GeminiError("BUSY", "Free OpenRouter models are busy or rate-limited");
  }
  const key = getGeminiKey() ?? "";
  if (!key && (opts.noFallback || fallbackProviders().length === 0)) {
    throw new GeminiError("NO_KEY", "Gemini API key is not configured");
  }

  const pro = opts.tier === "pro";
  const quality = pro && opts.mode === "quality";
  const baseGen = {
    temperature: opts.temperature ?? 0.75,
    maxOutputTokens: opts.maxTokens ?? (pro ? 8192 : 4096),
    topP: 0.95,
  };
  const atts = pro ? (opts.attachments ?? []) : [];
  const lastIdx = opts.messages.length - 1;
  const mk = (model: string) => ({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.messages.map((m, i) => ({
      role: m.role,
      parts:
        i === lastIdx && m.role === "user" && atts.length > 0
          ? [
              ...atts.map((a) => ({
                inlineData: { mimeType: a.mime, data: a.data },
              })),
              { text: m.text },
            ]
          : [{ text: m.text }],
    })),
    generationConfig: configFor(model, baseGen, quality && !opts.lowThink),
  });

  const sets = key ? await getModelSets(key) : FALLBACK_SETS;
  const models = key ? (quality ? sets.max : pro ? sets.fast : sets.free) : [];

  let upstream: Response | null = null;
  let kind: Kind = "gemini";
  let usedModel = "";
  let lastErr = "";
  // set inside closures below, so keep them typed as plain booleans
  let sawQuota = false as boolean;
  let sawBadKey = false as boolean;
  let sawOverload = false as boolean;

  const note = (a: Attempt) => {
    if (a.ok) return;
    lastErr = `${a.model}: ${a.status} ${a.text}`;
    if (a.status === 429) sawQuota = true; // quotas are per-model: try the next one
    if (a.status === 0 || a.status === 500 || a.status === 503 || a.status === 504) {
      sawOverload = true;
    }
    if (isBadKey(a)) sawBadKey = true;
  };

  // The strongest engine for this task answers first (Claude by default), not Gemini.
  if (opts.primaryFirst && !opts.noFallback) {
    const order = engineOrder(opts.task);
    const gi = key ? order.indexOf("gemini") : order.length;
    const ahead = sortByTask(fallbackProviders(), opts.task).filter(
      (p) => order.indexOf(p.name as EngineName) < gi && (atts.length === 0 || p.kind === "anthropic")
    );
    if (ahead.length > 0) {
      const lead = await openCompat(
        opts.system,
        opts.messages,
        opts.temperature ?? 0.75,
        opts.maxTokens ?? (pro ? 8192 : 4096),
        { atts, providers: ahead }
      );
      if (lead) {
        upstream = lead.res;
        usedModel = lead.model;
        kind = lead.kind;
      }
    }
  }

  for (let round = 0; round < 3 && !upstream; round++) {
    if (pro && !quality) {
      // quality mode waits for the strong model; only speed mode races candidates
      const r = await hedged(models, key, mk, baseGen);
      r.fails.forEach(note);
      if (r.winner) {
        upstream = r.winner.res;
        usedModel = r.winner.model;
        break;
      }
      // the raced candidates all failed: walk the remaining models one by one
      if (!sawBadKey) {
        for (const model of models.slice(3)) {
          const a = await attempt(model, key, mk, baseGen);
          if (a.ok) {
            upstream = a.res;
            usedModel = a.model;
            break;
          }
          note(a);
          if (sawBadKey) break;
        }
        if (upstream) break;
      }
    } else {
      for (const model of models) {
        const a = await attempt(model, key, mk, baseGen);
        if (a.ok) {
          upstream = a.res;
          usedModel = a.model;
          break;
        }
        note(a);
        if (sawBadKey) break; // another model will not fix a bad key
      }
    }
    if (upstream || sawBadKey) break;
    // everything was overloaded / limited: wait a moment and go around once more
    if ((sawOverload || sawQuota) && round < 2) await sleep(round === 0 ? 700 : 1500);
    else break;
  }

  if (!upstream && !opts.noFallback) {
    const fb = await openCompat(
      opts.system,
      opts.messages,
      opts.temperature ?? 0.75,
      opts.maxTokens ?? (pro ? 8192 : 4096),
      { atts, providers: sortByTask(fallbackProviders(), opts.task) }
    );
    if (fb) {
      upstream = fb.res;
      usedModel = fb.model;
      kind = fb.kind;
    }
  }

  if (!upstream && sawBadKey) {
    console.error("[gemini] invalid key:", lastErr);
    throw new GeminiError("NO_KEY", lastErr);
  }
  if (!upstream && (sawQuota || sawOverload)) {
    console.error("[gemini] busy:", lastErr);
    throw new GeminiError("BUSY", lastErr);
  }
  if (!upstream) console.error("[gemini] failed:", lastErr);

  if (!upstream || !upstream.body) {
    throw new GeminiError("ERROR", lastErr || "All models failed");
  }
  opts.onModel?.(usedModel);
  return pumpStream(upstream, kind, opts.onDone);
}

/** Stream → web Response with text/plain body */
export function streamToResponse(
  stream: ReadableStream<string>,
  headers: Record<string, string> = {}
): Response {
  const encoded = stream.pipeThrough(new TextEncoderStream());
  return new Response(encoded, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}


/* =====================================================================
 * AI TEAM ("dream team"): Claude + Gemini + DeepSeek + Grok + OpenRouter + Groq.
 * Every engine whose key exists joins automatically.
 *   Stage 1 — all engines write a full draft IN PARALLEL (quorum: the slowest
 *             engine can never hold the others hostage).
 *   Stage 2 — the lead engine merges them into ONE bigger, better result.
 *             If the lead is down, the next engine takes over (full failover).
 *   Stage 3 — if the answer was cut off (token limit), it is continued and closed.
 * ===================================================================== */

type StreamOpts = Parameters<typeof streamGemini>[0];

/** Detects "build me a game / site / app / big script" style requests. */
export function isBuildRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const noun =
    /(لعب[ةه]|العاب|ألعاب|\bgame|موقع|مواقع|\bsite\b|website|web ?app|landing|صفح[ةه] (هبوط|ويب)|تطبيق|\bapp\b|dashboard|لوح[ةه] (تحكم|قيادة)|متجر|\bstore\b|portfolio|بوت|\bbot\b|extension|إضاف[ةه]|html|نظام|system)/i;
  const verb =
    /(اصنع|اصنعلي|صنع|اعمل|سو[يّ]|صمم|برمج|ابن[يِ]|انشئ|أنشئ|طور|create|build|make|develop|design|generate|بغيت|ابغى|أبغى|أريد|اريد|نحب|حاب|حبيت)/i;
  const codeWrite = /(اكتب|write|اعطني|أعطني|عطيني).{0,40}(كود|code|script|سكريبت|سكربت|برنامج|program)/i;
  return (noun.test(t) && verb.test(t)) || codeWrite.test(t);
}

/**
 * v8: ANY difficult request (code change / fix / refactor / architecture / long
 * document / deep analysis) goes to the AI team — not only games and sites.
 */
export function isHardRequest(text: string, hasFiles = false): boolean {
  const t = text.trim();
  if (isBuildRequest(t)) return true;
  if (t.length < 25 && !hasFiles) return false;
  const codeish =
    /```|function\s*\(|=>|<\/?[a-z][\w-]*[^>]*>|\bSELECT\b|\bimport\s+\w|\bdef\s+\w+\(|\bclass\s+\w+|#include|\bconst\s+\w+\s*=|\bpublic\s+(static|class)/i.test(t);
  const techVerb =
    /(عدّ?ل|عدل|صلّ?ح|صلح|أصلح|اصلح|حسّ?ن|حسن|طوّ?ر|طور|أضف|اضف|زد|حوّ?ل|حول|اشرح|حلّ?ل|حلل|راجع|اكتب|برمج|ابن|أنشئ|انشئ|اصنع|نظّ?م|fix|debug|refactor|optimi[sz]e|improve|add|implement|convert|migrate|review|analy[sz]e|explain|write|build|design|architect|corrige|améliore|ajoute|optimise|écris|analyse)/i.test(t);
  const techNoun =
    /(كود|برنامج|سكريبت|سكربت|دالة|خوارزمية|قاعدة بيانات|استعلام|api|sql|regex|bug|خطأ|مشكلة في|تطبيق|موقع|بوت|code|script|function|algorithm|database|query|backend|frontend|server|component|class|module|architecture|pipeline|test|unit test|docker|git|react|next\.?js|python|java|c\+\+|php|flutter|kotlin|swift|typescript|javascript|node|laravel|django)/i.test(t);
  if (codeish && (techVerb || t.length > 300)) return true;
  if (techVerb && techNoun) return true;
  if (hasFiles && techVerb) return true;
  const deepDoc =
    /(بحث|تقرير|مذكر[ةه]|دراس[ةه]|خط[ةه] عمل|خطة|استراتيجي|business plan|report|thesis|essay|whitepaper|مقال طويل|رسال[ةه] جامعي|مشروع تخرج)/i.test(t) &&
    /(كامل|مفصّ?ل|شامل|طويل|detailed|complete|comprehensive|in[- ]depth|full)/i.test(t);
  const hardMath = /(برهن|أثبت|prove|demonstrate|حل المسأل|solve.{0,30}(equation|problem)|olympiad|أولمبياد)/i.test(t);
  return deepDoc || hardMath || t.length > 1500;
}

const EPIC_RULES = `

EPIC MODE (Nexus 6 Pro): the final deliverable MUST be a large, complete, flawless product of real, working code (never padding, comments or blank lines): games at least 3000 lines; websites / apps / UI as long as the design needs (typically 1200-3500 lines) — quality beats length. Merge the best ideas of every draft, then polish: more real content, more working interactions, better mobile layout. Never summarise, never abbreviate, never write "rest of code". Write every line in full until the file is finished.`;

const DRAFT_RULES = `

You are ONE of several senior engineers working in parallel on the same request. Deliver your most ambitious, complete and polished version: many features, rich content, multiple screens / levels / sections, smooth animations, a cohesive premium design, fully responsive (phone first), zero bugs. One complete self-contained deliverable. No placeholders, no TODO, no "rest of the code here" — write EVERYTHING out in full.`;

/** Web deliverables (game / site / app): the output is rendered straight into a preview iframe. */
const SYNTH_RULES_WEB = `

You are the LEAD engineer. Below the request you will find drafts written by other engineers. Produce ONE final deliverable that is bigger, richer and more polished than every draft:
- merge the strongest mechanics, features, content and visuals from all drafts and add what is still missing;
- fix every bug and inconsistency; if a draft is broken or cut off, rewrite that part properly;
- DESIGN COHERENCE: pick the single best draft as the BASE and keep its ONE visual language (palette, type scale, spacing, components). Port the better features / content from the other drafts INTO that design — never blend several visual styles or palettes together;
- for websites / apps / UI (not games): the page must scroll normally, nothing clipped at 360px (nav labels fully visible), no empty logo/icon boxes (inline SVG), real content, premium and NOT the generic dark-green-glass look unless the user asked for it;
- ONE engine/framework only (never mix rendering stacks), ONE complete self-contained HTML file with inline <style> and <script>;
- no placeholders of any kind (no TODO, no "...", no "rest unchanged") — every function, state and asset synthesizer fully written;
- never mention the drafts, the other engineers or this process.
OUTPUT FORMAT: return ONLY the raw HTML inside a single \`\`\`html fenced block. No text before it, no text after it.`;

const SYNTH_RULES = `

You are the LEAD engineer. Below the request you will find drafts written by other engineers. Produce ONE final deliverable that is bigger, richer and more polished than every draft:
- merge the strongest mechanics, features, content and visuals from all drafts and add what is still missing;
- fix every bug and inconsistency; if a draft is broken or cut off, rewrite that part properly;
- keep a single complete self-contained file inside ONE fenced code block (same format rules as above);
- write the FULL code — never abbreviate, never say "rest unchanged";
- never mention the drafts, the other engineers or this process.
After the code add a SHORT friendly summary (what is inside + how to use it).`;

const DRAFT_RULES_HARD = `

You are ONE of several senior experts working in parallel on the same difficult request. Deliver your single best, most correct and COMPLETE answer: if it involves code, write the full final runnable code (never fragments), handle edge cases, errors and security, and keep every existing feature when modifying something. No placeholders, no TODO, no "rest of the code here".`;

const SYNTH_RULES_HARD = `

You are the LEAD expert. Below the request you will find drafts written by other experts. Produce ONE final answer that is more correct, more complete and better organised than every draft:
- keep the strongest solution, fix every bug / mistake / inconsistency you can detect (verify code mentally, re-check numbers and facts);
- for code: deliver the full final, runnable result in fenced block(s) with language tags — never abbreviate, never say "rest unchanged";
- respond in the user's language and dialect, lead with the result, keep prose tight;
- never mention the drafts, the other experts or this process.`;

const ENGINE_LABEL: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude",
  deepseek: "DeepSeek",
  grok: "Grok",
  openrouter: "OpenRouter",
  groq: "Groq",
  cerebras: "Cerebras",
  huggingface: "Hugging Face",
};

type Draft = { who: string; text: string };

/** Connected engines, for diagnostics (names only — never keys). */
export function listEngines(): { name: string; models: string[]; specialty: string }[] {
  const out: { name: string; models: string[]; specialty: string }[] = [];
  const sp = (n: string) => SPECIALTY_AR[n as EngineName] ?? "";
  if (getGeminiKey()) out.push({ name: "gemini", models: FALLBACK_FAST, specialty: sp("gemini") });
  for (const p of fallbackProviders()) out.push({ name: p.name, models: p.models, specialty: sp(p.name) });
  return out;
}

/**
 * Lead (merger) order, by task: the specialist for the job leads, the others take over if it is down.
 * Override with BARQ_LEAD=gemini|claude|...
 */
function leadOrder(task?: Task): string[] {
  const base: string[] = engineOrder(task);
  const pref = clean(process.env.BARQ_LEAD).toLowerCase();
  return pref && base.includes(pref) ? [pref, ...base.filter((x) => x !== pref)] : base;
}

const signalFor = (ms: number, stop: AbortSignal) =>
  AbortSignal.any([AbortSignal.timeout(ms), stop]);

async function draftGemini(
  key: string,
  system: string,
  messages: ChatTurn[],
  atts: Attachment[],
  ms: number,
  stop: AbortSignal
): Promise<Draft | null> {
  const sets = await getModelSets(key);
  const last = messages.length - 1;
  const base = { temperature: 0.7, maxOutputTokens: 16000, topP: 0.95 };
  const deadline = Date.now() + ms;
  // newest fast model first, then the stable ones
  const models = Array.from(new Set([sets.fast[0], ...sets.free.slice(0, 2)])).filter(Boolean);
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 4000 || stop.aborted) break;
    try {
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m, i) => ({
          role: m.role,
          parts:
            i === last && m.role === "user" && atts.length > 0
              ? [
                  ...atts.map((a) => ({ inlineData: { mimeType: a.mime, data: a.data } })),
                  { text: m.text },
                ]
              : [{ text: m.text }],
        })),
        generationConfig: configFor(model, base, false),
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const go = () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: signalFor(Math.max(left, 4000), stop),
        });
      let res = await go();
      if (res.status === 400) {
        const t = await res.text().catch(() => "");
        if (/thinking/i.test(t)) {
          body.generationConfig = base;
          res = await go();
        }
      }
      if (!res.ok) {
        await res.text().catch(() => undefined);
        continue;
      }
      const j = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
      if (text.trim().length > 200) return { who: `gemini:${model}`, text };
    } catch {
      /* try the next model */
    }
  }
  return null;
}

async function draftCompat(
  p: Compat,
  system: string,
  messages: ChatTurn[],
  atts: Attachment[],
  ms: number,
  stop: AbortSignal
): Promise<Draft | null> {
  const deadline = Date.now() + ms;
  for (const model of p.models.slice(0, 3)) {
    const left = deadline - Date.now();
    if (left < 4000 || stop.aborted) break;
    try {
      const rq = compatRequest(p, model, system, messages, {
        temperature: 0.7,
        maxTokens: 14000,
        stream: false,
        atts,
      });
      const res = await fetch(p.url, {
        method: "POST",
        headers: rq.headers,
        body: rq.body,
        cache: "no-store",
        signal: signalFor(left, stop),
      });
      if (!res.ok) {
        await res.text().catch(() => undefined);
        if (res.status === 401 || res.status === 403) break;
        continue;
      }
      const j = (await res.json()) as {
        content?: { type?: string; text?: string }[];
        choices?: { message?: { content?: string } }[];
      };
      const text =
        p.kind === "anthropic"
          ? (j.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("")
          : j.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim().length > 200) {
        return { who: `${p.name}:${model}`, text };
      }
    } catch {
      /* try the next model */
    }
  }
  return null;
}

/**
 * Waits for the drafts with a QUORUM rule: once two engines delivered, the rest
 * get 15 more seconds at most. A hard deadline protects the whole request.
 */
function collectDrafts(
  jobs: Promise<Draft | null>[],
  ms: number,
  stop: AbortController
): Promise<Draft[]> {
  return new Promise((resolve) => {
    const out: Draft[] = [];
    let pending = jobs.length;
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    let hard: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (hard) clearTimeout(hard);
      if (grace) clearTimeout(grace);
      stop.abort(); // cancel the engines that are still working
      resolve(out.slice());
    };
    hard = setTimeout(finish, ms + 2000);
    if (pending === 0) return finish();
    for (const j of jobs) {
      void j
        .catch(() => null)
        .then((d) => {
          if (settled) return;
          if (d) out.push(d);
          pending -= 1;
          if (pending === 0) return finish();
          if (out.length >= 2 && !grace) grace = setTimeout(finish, 15_000);
        });
    }
  });
}

/** Opens the final-answer stream on the first engine that works (full failover). */
async function streamLead(
  opts: StreamOpts,
  atts: Attachment[]
): Promise<{ stream: ReadableStream<string>; model: string }> {
  const key = getGeminiKey() ?? "";
  const providers = fallbackProviders();
  const maxTokens = opts.segment ?? Math.max(opts.maxTokens ?? 0, opts.epic ? MAX_OUTPUT_TOKENS : 32_000);
  let lastErr: unknown = null;
  for (const name of leadOrder(opts.task)) {
    try {
      if (name === "gemini") {
        if (!key) continue;
        let model = "";
        const stream = await streamGemini({
          ...opts,
          mode: "quality",
          tier: "pro",
          lowThink: true,
          noFallback: true,
          maxTokens,
          onModel: (m) => {
            model = m;
          },
          onDone: undefined,
          attachments: atts,
        });
        return { stream, model: model || "gemini" };
      }
      const p = providers.find((x) => x.name === name);
      if (!p) continue;
      const fb = await openCompat(opts.system, opts.messages, opts.temperature ?? 0.7, maxTokens, {
        providers: [p],
        atts,
      });
      if (fb) return { stream: pumpStream(fb.res, fb.kind), model: fb.model };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new GeminiError("ERROR", "No engine available");
}

/** True when a code answer stops before its last fence / </html>. */
export function looksCut(text: string): boolean {
  const fences = (text.match(/```/g) ?? []).length;
  if (fences % 2 === 1) return true;
  const blocks = [...text.matchAll(/```html[ \t]*\r?\n([\s\S]*?)```/gi)];
  for (const b of blocks) {
    const code = b[1];
    // a full page must end with </html>; an unclosed <script>/<style> also means a cut
    if (/<html[\s>]/i.test(code) && !/<\/html>\s*$/i.test(code.trim())) return true;
    const open = (code.match(/<script\b/gi) ?? []).length;
    const close = (code.match(/<\/script>/gi) ?? []).length;
    if (open > close) return true;
  }
  return false;
}

/**
 * Returns IMMEDIATELY with a stream (so the connection stays alive while the
 * engines work). If anything fails, `onFail` runs (refund the credit) and the
 * user gets a friendly message instead of a dead request.
 */
export function ensembleStream(
  opts: StreamOpts & {
    onFail?: (e: unknown) => void | Promise<void>;
    /** "hard" = any difficult task (code edit, analysis…) · "build" = game / site / app */
    kind?: "build" | "hard";
    /** keep working (and saving the answer) even if the browser disconnects */
    keepAlive?: boolean;
    /** force "studio" mode (each engine plays one role) for a website / UI request */
    site?: boolean;
  }
): ReadableStream<string> {
  opts.onModel?.("ensemble");
  let cancelled = false;
  let gone = false;
  let reader: ReadableStreamDefaultReader<string> | null = null;
  let acc = "";
  const closeSafe = (c: ReadableStreamDefaultController<string>) => {
    try {
      c.close();
    } catch {
      /* already closed */
    }
  };

  return new ReadableStream<string>({
    async start(controller) {
      const put = (t: string) => {
        if (cancelled || gone) return;
        try {
          controller.enqueue(t);
        } catch {
          gone = true;
        }
      };
      try {
        const key = getGeminiKey() ?? "";
        const providers = fallbackProviders();
        const atts = opts.attachments ?? [];
        // images / PDFs: only engines that can actually read them join the draft stage
        const seeing = atts.length > 0 ? providers.filter((p) => p.kind === "anthropic") : providers;
        const team = key || seeing.length > 0 ? seeing : providers;
        const order = engineOrder(opts.task);
        const members = [...(key ? ["gemini"] : []), ...team.map((p) => p.name)].sort(
          (x, y) => order.indexOf(x as EngineName) - order.indexOf(y as EngineName)
        );
        const names = members.map((n) => `${ENGINE_LABEL[n] ?? n} (${SPECIALTY_AR[n as EngineName] ?? ""})`);
        const lastText = opts.messages[opts.messages.length - 1]?.text ?? "";
        const studio =
          opts.kind === "build" && atts.length === 0 && members.length > 0 && (opts.site === true || isSiteRequest(lastText));
        if (!studio) put(
          opts.kind === "hard"
            ? `> 🧠 Nexus AI v8.4 فعّل **فريق الذكاء الاصطناعي**، وكل واحد بتخصصه: ${names.join(" + ")} — يحلّون المهمة معًا ثم يدمجون أقوى إجابة…\n\n`
            : `> ⚡ فريق Nexus AI v8.4 يشتغل، وكل محرّك بتخصصه: **${names.join(" + ")}** — كل واحد يبني نسخته ثم يندمجون في نتيجة واحدة أقوى…\n\n`
        );

        const MS = Number(process.env.BARQ_DRAFT_MS) > 5000 ? Number(process.env.BARQ_DRAFT_MS) : opts.epic ? 40_000 : 55_000;
        const stop = new AbortController();
        let drafts: Draft[] = [];
        const studioParts: { role: RoleId; who: string; text: string }[] = [];
        if (studio) {
          // Studio mode: each engine plays ONE role and writes a short brief (not a full draft)
          const plan = assignRoles(members);
          put(
            `> 🎬 Nexus AI v8.4 يشتغل كاستوديو، كل واحد بدوره: ${plan
              .map((p) => `${p.role.emoji} ${p.role.labelAr} (**${ENGINE_LABEL[p.engine] ?? p.engine}**)`)
              .join(" + ")} — ثم يبني المصمّم الأول الموقع النهائي…\n\n`
          );
          const BMS = 35_000;
          const run = (p: { role: { id: RoleId; brief: string }; engine: string }, ms: number, sig: AbortSignal) => {
            const prov = team.find((x) => x.name === p.engine);
            const job =
              p.engine === "gemini" && key
                ? draftGemini(key, p.role.brief, opts.messages, [], ms, sig)
                : prov
                  ? draftCompat(prov, p.role.brief, opts.messages, [], ms, sig)
                  : Promise.resolve(null);
            return job.then((d) => (d ? ({ who: `${p.role.id}|${d.who}`, text: d.text } as Draft) : null));
          };
          const got = await collectDrafts(plan.map((p) => run(p, BMS, stop.signal)), BMS, stop);
          for (const d of got) {
            const [rid, who] = d.who.split("|");
            studioParts.push({ role: rid as RoleId, who, text: d.text });
          }
          // a role whose engine failed gets ONE retry on another engine
          const missing = plan.filter((p) => !studioParts.some((x) => x.role === p.role.id));
          if (missing.length > 0 && !cancelled) {
            const stop2 = new AbortController();
            const others = members.filter((m) => !missing.some((p) => p.engine === m));
            const retry = missing.map((p, i) => run({ role: p.role, engine: (others[i % Math.max(others.length, 1)] ?? members[0]) }, 20_000, stop2.signal));
            const got2 = await collectDrafts(retry, 20_000, stop2);
            for (const d of got2) {
              const [rid, who] = d.who.split("|");
              studioParts.push({ role: rid as RoleId, who, text: d.text });
            }
          }
          drafts = studioParts.map((x) => ({ who: x.who, text: x.text }));
        } else {
          const draftSys = opts.system + (opts.kind === "hard" ? DRAFT_RULES_HARD : DRAFT_RULES);
          const jobs: Promise<Draft | null>[] = [
            ...(key
              ? [draftGemini(key, draftSys + roleFor("gemini", opts.task), opts.messages, atts, MS, stop.signal)]
              : []),
            ...team.map((p) =>
              draftCompat(
                p,
                draftSys + roleFor(p.name as EngineName, opts.task),
                opts.messages,
                atts,
                MS,
                stop.signal
              )
            ),
          ];
          drafts = await collectDrafts(jobs, MS, stop);
        }
        if (cancelled) return closeSafe(controller);

        let messages = opts.messages;
        let system = opts.system;
        if (studio && studioParts.length > 0) {
          const doneRoles = studioParts.map((x) => ({ director: "🎨", writer: "✍️", architect: "🧱" }[x.role]));
          put(`> ✅ الخطة جاهزة ${doneRoles.join(" ")} — جاري بناء الموقع النهائي…\n\n`);
          const lastTurn = opts.messages[opts.messages.length - 1];
          messages = [
            ...opts.messages.slice(0, -1),
            { role: "user", text: `${lastTurn.text}\n\n=====\nSPECIALIST BRIEFS (follow them):\n\n${packBriefs(studioParts)}` },
          ];
          system = opts.system + STUDIO_LEAD_RULES + (opts.epic ? EPIC_RULES : "");
        } else if (drafts.length > 0) {
          const who = drafts.map((d) => ENGINE_LABEL[d.who.split(":")[0]] ?? d.who);
          put(`> ✅ شاركوا: **${who.join(" · ")}** — جاري الدمج النهائي…\n\n`);
          const pack = drafts
            .map((d, i) => `### DRAFT ${i + 1}\n\n${d.text.slice(0, 26_000)}`)
            .join("\n\n---\n\n");
          const lastTurn = opts.messages[opts.messages.length - 1];
          messages = [
            ...opts.messages.slice(0, -1),
            {
              role: "user",
              text: `${lastTurn.text}\n\n=====\nDrafts from the other engineers (merge and surpass them):\n\n${pack}`,
            },
          ];
          const web = drafts.some((d) => /```html/i.test(d.text));
          system = opts.system + (opts.kind === "hard" ? SYNTH_RULES_HARD : web ? SYNTH_RULES_WEB : SYNTH_RULES) + (opts.epic ? EPIC_RULES : "");
        }

        if (opts.epic && drafts.length === 0) system = opts.system + EPIC_RULES;
        const lead = await streamLead({ ...opts, system, messages }, atts);
        reader = lead.stream.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          acc += value;
          put(value);
        }

        // Stage 3 — cut off by the token limit? continue once and close the file.
        for (let round = 0; round < (opts.segment ? 0 : opts.epic ? 6 : 3) && !cancelled && acc.length > 500 && looksCut(acc); round++) {
          const origLast = opts.messages[opts.messages.length - 1];
          const cont = await streamLead(
            {
              ...opts,
              system,
              messages: [
                { role: "user", text: origLast.text },
                { role: "model", text: acc },
                {
                  role: "user",
                  text: "Your previous answer was cut off. Continue EXACTLY from the last character you wrote — no repetition, no preface, no new code fence. Finish the code, close every open tag / function, end with </html> if it is a web page, then close the code fence.",
                },
              ],
            },
            []
          );
          reader = cont.stream.getReader();
          let head = "";
          let headDone = false;
          for (;;) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            if (!headDone) {
              head += value;
              if (head.length < 16) continue;
              headDone = true;
              const clean2 = head.replace(/^\s*```(?:html)?[ \t]*\r?\n/i, "");
              acc += clean2;
              put(clean2);
              continue;
            }
            acc += value;
            put(value);
          }
          if (!headDone && head) {
            acc += head;
            put(head);
          }
        }

        try {
          await opts.onDone?.(acc);
        } catch {
          /* persistence errors must never break the stream */
        }
        closeSafe(controller);
      } catch (e) {
        console.error("[ensemble] failed:", e);
        // the answer was already mostly written: keep it (the client finishes it)
        if (acc.length > 800) {
          try {
            await opts.onDone?.(acc);
          } catch {
            /* ignore */
          }
          return closeSafe(controller);
        }
        // ANOTHER WAY: the team failed → answer with the fastest single engine
        let recovered = false;
        try {
          put("\n\n> 🔄 تحويل تلقائي لمسار بديل سريع…\n\n");
          const fb = await streamGemini({
            system: opts.system,
            messages: opts.messages,
            attachments: opts.attachments,
            tier: "pro",
            mode: "speed",
            maxTokens: Math.max(opts.maxTokens ?? 0, 24_000),
            temperature: opts.temperature,
          });
          const r2 = fb.getReader();
          let acc2 = "";
          for (;;) {
            const { done, value } = await r2.read();
            if (done || cancelled) break;
            acc2 += value;
            put(value);
          }
          if (acc2.trim()) {
            recovered = true;
            try {
              await opts.onDone?.(acc2);
            } catch {
              /* ignore */
            }
          }
        } catch (e2) {
          console.error("[ensemble] fallback failed:", e2);
        }
        if (!recovered) {
          try {
            await opts.onFail?.(e);
          } catch {
            /* ignore */
          }
          put("\n\n⚠️ تعذّر إكمال الطلب الآن (ضغط على المحرّكات). أعد المحاولة بعد لحظات — لم يُخصم أي رصيد.");
        }
        closeSafe(controller);
      }
    },
    cancel() {
      if (opts.keepAlive) {
        gone = true; // browser left: keep generating + saving on the server
        return;
      }
      cancelled = true;
      reader?.cancel().catch(() => undefined);
    },
  });
}

/**
 * Continues a cut-off big build in a NEW request (so it gets a fresh time
 * budget). Streams only the missing tail — no drafts, no repetition.
 */
export function continueStream(o: { system: string; user: string; partial: string }): ReadableStream<string> {
  let reader: ReadableStreamDefaultReader<string> | null = null;
  let cancelled = false;
  const fence = /^\s*```(?:html)?[ \t]*\r?\n/i;
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const lead = await streamLead(
          {
            system: o.system + EPIC_RULES,
            temperature: 0.7,
            epic: true,
            segment: 16_000,
            messages: [
              { role: "user", text: o.user },
              { role: "model", text: o.partial },
              {
                role: "user",
                text: "Your previous answer was cut off. Continue EXACTLY from the last character you wrote: no repetition, no preface, no new code fence. Keep every system and feature complete, close every open tag / function, end with </html> if it is a web page, then close the code fence.",
              },
            ],
          },
          []
        );
        reader = lead.stream.getReader();
        let head = "";
        let headDone = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          if (!headDone) {
            head += value;
            if (head.length < 16) continue;
            headDone = true;
            controller.enqueue(head.replace(fence, ""));
            continue;
          }
          controller.enqueue(value);
        }
        if (!headDone && head) controller.enqueue(head.replace(fence, ""));
      } catch (e) {
        console.error("[continue] failed:", e);
      }
      try {
        controller.close();
      } catch {
        /* closed */
      }
    },
    cancel() {
      cancelled = true;
      reader?.cancel().catch(() => undefined);
    },
  });
}


/**
 * NEVER-STOP guard: wraps any answer stream. When the model ends in the middle of
 * a code block (token limit, network hiccup, engine failover) the answer is
 * continued automatically — up to `rounds` times — until every fence / </html> is closed.
 */
export function withAutoContinue(
  source: ReadableStream<string>,
  o: {
    system: string;
    messages: ChatTurn[];
    rounds?: number;
    /** text already delivered earlier (a client-side continuation request) */
    seed?: string;
    onDone?: (full: string) => void | Promise<void>;
    /** keep generating + saving even if the browser disconnects */
    keepAlive?: boolean;
    /** epoch ms: do not start another continuation round after this (lets the request end cleanly before the host limit) */
    deadlineAt?: number;
  }
): ReadableStream<string> {
  let reader: ReadableStreamDefaultReader<string> | null = null;
  let cancelled = false;
  let gone = false;
  const fence = /^\s*```[\w-]*[ \t]*\r?\n/;
  return new ReadableStream<string>({
    async start(controller) {
      let acc = o.seed ?? "";
      const put = (t: string) => {
        acc += t;
        if (cancelled || gone) return;
        try {
          controller.enqueue(t);
        } catch {
          gone = true;
        }
      };
      try {
        reader = source.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          put(value);
        }
        const rounds = o.rounds ?? 14;
        for (let r = 0; r < rounds && !cancelled && acc.length > 300 && looksCut(acc) && (!o.deadlineAt || Date.now() < o.deadlineAt); r++) {
          const lastUser = [...o.messages].reverse().find((m) => m.role === "user");
          const cont = await streamLead(
            {
              system: o.system + CONTINUE_RULES,
              temperature: 0.5,
              segment: MAX_SEGMENT_TOKENS,
              messages: [
                { role: "user", text: (lastUser?.text ?? "").slice(0, 24_000) },
                { role: "model", text: acc.slice(-170_000) },
                { role: "user", text: CONTINUE_PROMPT },
              ],
            },
            []
          );
          reader = cont.stream.getReader();
          let head = "";
          let headDone = false;
          for (;;) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            if (!headDone) {
              head += value;
              if (head.length < 16) continue;
              headDone = true;
              put(head.replace(fence, ""));
              continue;
            }
            put(value);
          }
          if (!headDone && head) put(head.replace(fence, ""));
        }
      } catch (e) {
        console.error("[auto-continue] failed:", e);
      }
      try {
        await o.onDone?.(acc);
      } catch {
        /* persistence errors must never break the stream */
      }
      try {
        controller.close();
      } catch {
        /* closed */
      }
    },
    cancel() {
      if (o.keepAlive) {
        gone = true;
        return;
      }
      cancelled = true;
      reader?.cancel().catch(() => undefined);
    },
  });
}

const CONTINUE_RULES = `

CONTINUATION MODE: you are finishing an answer that was cut off. Output ONLY the missing remainder, starting at the exact next character. Never repeat earlier text, never add a preface, never open a new code fence. Keep names, variables, CSS classes and structure identical to the part already written. Close every open tag / bracket / function and the code fence.`;

const CONTINUE_PROMPT =
  "Your previous answer was cut off. Continue EXACTLY from the last character you wrote — no repetition, no preface, no new code fence. Finish the code, close every open tag / function / brace, end with </html> if it is a web page, then close the code fence.";
