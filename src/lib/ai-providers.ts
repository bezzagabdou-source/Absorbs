/**
 * Unified multi-provider AI router — SERVER SIDE ONLY (route handlers / server actions).
 * Plain REST via fetch: no SDK, no extra dependency.
 *
 * Providers
 *   gemini      gemini-2.5-pro · gemini-2.5-flash            (GEMINI_API_KEY)
 *   openrouter  x-ai/grok-2-1212 · Claude · DeepSeek         (OPENROUTER_API_KEY)
 *   groq        llama-3.3-70b-versatile  (instant replies)   (GROQ_API_KEY)
 *   cerebras    llama3.1-70b  (fast code / debugging)        (CEREBRAS_API_KEY)
 *
 * Usage
 *   const text = await generateAIResponse("code", "Write a debounce hook in TypeScript");
 *
 * Every task owns an ordered fallback chain. Providers without a key are skipped,
 * a rejected key disables that provider for the rest of the call, and a retired /
 * unknown model simply moves on to the next candidate. Keys are never logged.
 */

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type AITask = "code" | "fast" | "grok" | "reasoning";
export type ProviderId = "gemini" | "openrouter" | "groq" | "cerebras";

export const AI_TASKS: readonly AITask[] = ["code", "fast", "grok", "reasoning"];

/** Runtime guard — use it on task names coming from a request body. */
export function isAITask(value: unknown): value is AITask {
  return typeof value === "string" && (AI_TASKS as readonly string[]).includes(value);
}

export type AIErrorCode =
  | "NO_KEY" //            env var missing
  | "INVALID_KEY" //       malformed / placeholder / rejected by the provider (401, 403)
  | "RATE_LIMIT" //        429
  | "MODEL_UNAVAILABLE" // retired or unknown model (404 / model-related 400)
  | "BAD_REQUEST" //       invalid input or content blocked
  | "UPSTREAM" //          5xx / network failure / unreadable response
  | "TIMEOUT"
  | "EMPTY" //             provider answered with no text
  | "ALL_FAILED"; //       every candidate in the chain failed

export interface AttemptLog {
  provider: ProviderId;
  model: string;
  code: AIErrorCode;
  message: string;
}

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly provider?: ProviderId;
  readonly status?: number;
  readonly attempts: AttemptLog[];

  constructor(
    code: AIErrorCode,
    message: string,
    extra: { provider?: ProviderId; status?: number; attempts?: AttemptLog[] } = {}
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.provider = extra.provider;
    this.status = extra.status;
    this.attempts = extra.attempts ?? [];
  }
}

export interface AIOptions {
  /** System instruction. */
  system?: string;
  /** 0 – 2 (default 0.7; 0.2 for `code`). */
  temperature?: number;
  /** Max answer tokens, 1 – 32000 (default 4096). */
  maxTokens?: number;
  /** Per-request timeout in ms (default 45000). */
  timeoutMs?: number;
  /** Extra tries on the SAME model for 5xx / network / timeout (default 1, max 3). */
  retries?: number;
  /** Abort from the caller (e.g. client disconnected). */
  signal?: AbortSignal;
}

export interface AIResult {
  text: string;
  provider: ProviderId;
  model: string;
  task: AITask;
  /** Candidates that failed before this one succeeded. */
  failed: AttemptLog[];
}

export interface Target {
  provider: ProviderId;
  model: string;
}

/* ------------------------------------------------------------------ */
/* Environment & keys                                                  */
/* ------------------------------------------------------------------ */

/** Exact env var names, first one is the canonical name. */
const KEY_ENV: Record<ProviderId, readonly string[]> = {
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
};

const PROVIDER_LABEL: Record<ProviderId, string> = {
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  cerebras: "Cerebras",
};

/** Strips spaces, newlines and quotes that are often pasted together with a key. */
function cleanEnv(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

const PLACEHOLDER = /^(your[_-]|xxx|changeme|replace|<|todo|none$|null$|undefined$)/i;

function findKey(provider: ProviderId): { name: string; value: string } | undefined {
  for (const name of KEY_ENV[provider]) {
    const value = cleanEnv(process.env[name]);
    if (value) return { name, value };
  }
  return undefined;
}

/** Returns a usable key or throws NO_KEY / INVALID_KEY (never includes the key itself). */
function resolveKey(provider: ProviderId): string {
  const found = findKey(provider);
  if (!found) {
    throw new AIProviderError(
      "NO_KEY",
      `${PROVIDER_LABEL[provider]} key is missing: set ${KEY_ENV[provider][0]} in .env.local / Vercel.`,
      { provider }
    );
  }
  if (found.value.length < 8 || /\s/.test(found.value) || PLACEHOLDER.test(found.value)) {
    throw new AIProviderError(
      "INVALID_KEY",
      `${found.name} looks malformed or is still a placeholder (no spaces / quotes allowed).`,
      { provider }
    );
  }
  return found.value;
}

/** Which providers are configured (names only — never the key values). */
export function getProviderStatus(): Record<
  ProviderId,
  { configured: boolean; envVar: string }
> {
  const out = {} as Record<ProviderId, { configured: boolean; envVar: string }>;
  for (const p of Object.keys(KEY_ENV) as ProviderId[]) {
    const found = findKey(p);
    out[p] = { configured: Boolean(found), envVar: found?.name ?? KEY_ENV[p][0] };
  }
  return out;
}

/** Removes every configured key value from a string before it is logged / thrown. */
function redact(text: string): string {
  let out = text;
  for (const p of Object.keys(KEY_ENV) as ProviderId[]) {
    for (const name of KEY_ENV[p]) {
      const v = cleanEnv(process.env[name]);
      if (v.length >= 8) out = out.split(v).join("[redacted]");
    }
  }
  return out.slice(0, 400);
}

/* ------------------------------------------------------------------ */
/* Models & routing                                                    */
/* ------------------------------------------------------------------ */

const envModel = (name: string, fallback: string): string => cleanEnv(process.env[name]) || fallback;
const uniq = <T,>(list: T[]): T[] => Array.from(new Set(list));

/** Explicit OpenRouter picks, for `generateWithTarget`. Each can be overridden via env. */
export function openRouterModels(): { grok: string; claude: string; deepseek: string; deepseekR1: string; fast: string } {
  return {
    /** DeepSeek served by OpenRouter: the speed engine for everyday answers and code */
    fast: envModel("OPENROUTER_FAST_MODEL", "deepseek/deepseek-chat-v3.1"),
    grok: envModel("OPENROUTER_GROK_MODEL", "x-ai/grok-2-1212"),
    claude: envModel("OPENROUTER_CLAUDE_MODEL", "anthropic/claude-sonnet-4.5"),
    deepseek: envModel("OPENROUTER_DEEPSEEK_MODEL", "deepseek/deepseek-chat-v3.1"),
    deepseekR1: envModel("OPENROUTER_DEEPSEEK_R1_MODEL", "deepseek/deepseek-r1"),
  };
}

/**
 * Ordered candidates per task. Read at call time so env overrides apply without a rebuild.
 *
 *   code       → Cerebras (fast code/debug) → Gemini Pro → DeepSeek → Groq
 *   fast       → Groq → Cerebras → Gemini Flash
 *   grok       → Grok via OpenRouter → Gemini Flash → Groq
 *   reasoning  → Gemini Pro → DeepSeek R1 → Claude → Gemini Flash → Groq
 */
export function buildPlan(task: AITask): Target[] {
  const gemPro = envModel("GEMINI_PRO_MODEL", "gemini-2.5-pro");
  const gemFlash = envModel("GEMINI_FLASH_MODEL", "gemini-2.5-flash");
  const groq = envModel("GROQ_MODEL", "llama-3.3-70b-versatile");
  const or = openRouterModels();
  // Cerebras retires models over time: the requested one first, then its successors.
  const cerebras = uniq([envModel("CEREBRAS_MODEL", "llama3.1-70b"), "llama-3.3-70b", "gpt-oss-120b"]);
  const cb = (): Target[] => cerebras.map((model) => ({ provider: "cerebras" as const, model }));

  switch (task) {
    case "code":
      return [
        { provider: "openrouter", model: or.fast },
        ...cb(),
        { provider: "gemini", model: gemPro },
        { provider: "openrouter", model: or.deepseek },
        { provider: "groq", model: groq },
      ];
    case "fast":
      return [
        { provider: "groq", model: groq },
        { provider: "openrouter", model: or.fast },
        ...cb(),
        { provider: "gemini", model: gemFlash },
      ];
    case "grok":
      return [
        { provider: "openrouter", model: or.grok },
        { provider: "openrouter", model: envModel("OPENROUTER_GROK_FALLBACK", "x-ai/grok-4-fast") },
        { provider: "gemini", model: gemFlash },
        { provider: "groq", model: groq },
      ];
    case "reasoning":
      return [
        { provider: "gemini", model: gemPro },
        { provider: "openrouter", model: or.deepseekR1 },
        { provider: "openrouter", model: or.claude },
        { provider: "gemini", model: gemFlash },
        { provider: "groq", model: groq },
      ];
  }
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

interface Req {
  task: AITask;
  prompt: string;
  system?: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function classify(status: number, message: string): AIErrorCode {
  if (status === 401 || status === 403) return "INVALID_KEY";
  if (status === 429) return "RATE_LIMIT";
  if (status === 404) return "MODEL_UNAVAILABLE";
  if ((status === 400 || status === 422) && /model/i.test(message) && /(not|found|exist|support|deprecat|unavailable|access)/i.test(message))
    return "MODEL_UNAVAILABLE";
  if (status === 408) return "TIMEOUT";
  if (status >= 500) return "UPSTREAM";
  if (status >= 400) return "BAD_REQUEST";
  return "UPSTREAM";
}

function errorMessageOf(json: unknown, raw: string): string {
  if (isRecord(json)) {
    const e = json.error;
    if (typeof e === "string") return e;
    if (isRecord(e) && typeof e.message === "string") return e.message;
    if (typeof json.message === "string") return json.message;
  }
  return raw || "empty error body";
}

async function postJson(
  provider: ProviderId,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  req: Req
): Promise<{ status: number; json: unknown; raw: string }> {
  const signal = req.signal
    ? AbortSignal.any([AbortSignal.timeout(req.timeoutMs), req.signal])
    : AbortSignal.timeout(req.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (req.signal?.aborted) throw new AIProviderError("UPSTREAM", "Request aborted by the caller.", { provider });
    if (name === "TimeoutError" || name === "AbortError")
      throw new AIProviderError("TIMEOUT", `${PROVIDER_LABEL[provider]} timed out after ${req.timeoutMs}ms.`, { provider });
    throw new AIProviderError("UPSTREAM", `${PROVIDER_LABEL[provider]} network error: ${redact(String(e))}`, { provider });
  }
  const raw = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, raw };
}

/** Plain text answer: no <think> blocks, no BOM, normalised newlines, trimmed. */
function cleanOutput(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function finish(provider: ProviderId, text: string | undefined, status: number): string {
  const out = cleanOutput(text ?? "");
  if (!out) throw new AIProviderError("EMPTY", `${PROVIDER_LABEL[provider]} returned an empty answer.`, { provider, status });
  return out;
}

/* ------------------------------------------------------------------ */
/* Provider adapters                                                   */
/* ------------------------------------------------------------------ */

const OPENAI_COMPAT: Record<Exclude<ProviderId, "gemini">, { url: string; maxCap: number }> = {
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", maxCap: 32000 },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", maxCap: 8192 },
  cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", maxCap: 8192 },
};

async function callOpenAICompat(
  provider: Exclude<ProviderId, "gemini">,
  model: string,
  key: string,
  req: Req
): Promise<string> {
  const cfg = OPENAI_COMPAT[provider];
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (provider === "openrouter") {
    headers["X-Title"] = "Nexus AI v8.4";
    const site = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL);
    if (/^https?:\/\//i.test(site)) headers["HTTP-Referer"] = site;
  }
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.prompt });

  const { status, json, raw } = await postJson(
    provider,
    cfg.url,
    headers,
    {
      model,
      messages,
      temperature: req.temperature,
      max_tokens: Math.min(req.maxTokens, cfg.maxCap),
      stream: false,
    },
    req
  );

  if (status < 200 || status >= 300) {
    const msg = redact(errorMessageOf(json, raw));
    throw new AIProviderError(classify(status, msg), `${PROVIDER_LABEL[provider]} ${status}: ${msg}`, { provider, status });
  }
  // OpenRouter can answer 200 with an { error } body
  if (isRecord(json) && json.error !== undefined && !Array.isArray(json.choices)) {
    const msg = redact(errorMessageOf(json, raw));
    throw new AIProviderError("UPSTREAM", `${PROVIDER_LABEL[provider]}: ${msg}`, { provider, status });
  }
  let text: string | undefined;
  if (isRecord(json) && Array.isArray(json.choices)) {
    const first: unknown = json.choices[0];
    if (isRecord(first) && isRecord(first.message)) {
      const c = first.message.content;
      if (typeof c === "string") text = c;
      else if (Array.isArray(c))
        text = c.map((p) => (isRecord(p) && typeof p.text === "string" ? p.text : "")).join("");
    }
  }
  return finish(provider, text, status);
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

function geminiThinkingBudget(model: string, task: AITask): number | undefined {
  if (/gemini-2\.5-pro/.test(model)) return task === "reasoning" ? 8192 : 2048; // Pro cannot disable thinking
  if (/gemini-2\.5-flash/.test(model)) return task === "reasoning" ? 1024 : 0;
  return undefined;
}

async function callGemini(model: string, key: string, req: Req): Promise<string> {
  const budget = geminiThinkingBudget(model, req.task);
  // thinking tokens count against maxOutputTokens: add headroom so the visible answer isn't starved
  const maxOutputTokens = Math.min(req.maxTokens + (budget ?? 0), 65536);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const build = (withThinking: boolean) => ({
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generationConfig: {
      temperature: Math.min(req.temperature, 2),
      maxOutputTokens,
      topP: 0.95,
      ...(withThinking && budget !== undefined ? { thinkingConfig: { thinkingBudget: budget } } : {}),
    },
  });

  const headers = { "x-goog-api-key": key };
  let r = await postJson("gemini", url, headers, build(true), req);
  if (r.status === 400 && /thinking/i.test(errorMessageOf(r.json, r.raw))) {
    r = await postJson("gemini", url, headers, build(false), req);
  }
  const { status, json, raw } = r;

  if (status < 200 || status >= 300) {
    const msg = redact(errorMessageOf(json, raw));
    // Google answers an invalid key with 400 + API_KEY_INVALID
    const code = /API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED/i.test(msg)
      ? "INVALID_KEY"
      : classify(status, msg);
    throw new AIProviderError(code, `Gemini ${status}: ${msg}`, { provider: "gemini", status });
  }

  let text = "";
  if (isRecord(json)) {
    const block = isRecord(json.promptFeedback) ? json.promptFeedback.blockReason : undefined;
    const cand: unknown = Array.isArray(json.candidates) ? json.candidates[0] : undefined;
    if (isRecord(cand) && isRecord(cand.content) && Array.isArray(cand.content.parts)) {
      text = (cand.content.parts as GeminiPart[])
        .filter((p) => isRecord(p) && p.thought !== true && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
    }
    if (!text.trim() && typeof block === "string") {
      throw new AIProviderError("BAD_REQUEST", `Gemini blocked the prompt (${block}).`, { provider: "gemini", status });
    }
    if (!text.trim() && isRecord(cand) && cand.finishReason === "SAFETY") {
      throw new AIProviderError("BAD_REQUEST", "Gemini blocked the answer (SAFETY).", { provider: "gemini", status });
    }
  }
  return finish("gemini", text, status);
}

/** One call to one specific provider/model — no fallback. */
async function callTarget(target: Target, key: string, req: Req): Promise<string> {
  return target.provider === "gemini"
    ? callGemini(target.model, key, req)
    : callOpenAICompat(target.provider, target.model, key, req);
}

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

const MAX_PROMPT_CHARS = 200_000;

function normalise(task: AITask, prompt: string, o: AIOptions): Req {
  if (typeof window !== "undefined") {
    throw new AIProviderError("BAD_REQUEST", "ai-providers must only run on the server (API keys).");
  }
  if (!isAITask(task)) {
    throw new AIProviderError("BAD_REQUEST", `Unknown task "${String(task)}". Use: ${AI_TASKS.join(", ")}.`);
  }
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new AIProviderError("BAD_REQUEST", "Prompt must be a non-empty string.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new AIProviderError("BAD_REQUEST", `Prompt is too long (${prompt.length} > ${MAX_PROMPT_CHARS} characters).`);
  }
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    task,
    prompt: prompt.trim(),
    system: typeof o.system === "string" && o.system.trim() ? o.system.trim() : undefined,
    temperature: num(o.temperature, task === "code" ? 0.2 : 0.7, 0, 2),
    maxTokens: Math.round(num(o.maxTokens, 4096, 1, 32000)),
    timeoutMs: Math.round(num(o.timeoutMs, 45_000, 1000, 120_000)),
    signal: o.signal,
  };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

const RETRYABLE: ReadonlySet<AIErrorCode> = new Set<AIErrorCode>(["UPSTREAM", "TIMEOUT"]);

function toProviderError(e: unknown, target: Target): AIProviderError {
  if (e instanceof AIProviderError) return e;
  return new AIProviderError("UPSTREAM", redact(String(e)), { provider: target.provider });
}

/**
 * Runs the task's fallback chain and returns the answer together with the provider / model
 * that produced it. Throws AIProviderError (NO_KEY, BAD_REQUEST or ALL_FAILED).
 */
export async function generateAIResult(task: AITask, prompt: string, options: AIOptions = {}): Promise<AIResult> {
  const req = normalise(task, prompt, options);
  const retries = Math.round(
    typeof options.retries === "number" && Number.isFinite(options.retries) ? Math.min(3, Math.max(0, options.retries)) : 1
  );
  const plan = buildPlan(req.task);
  const failed: AttemptLog[] = [];
  const dead = new Set<ProviderId>(); // providers with a missing / rejected key
  let anyKey = false;

  for (const target of plan) {
    if (req.signal?.aborted) throw new AIProviderError("UPSTREAM", "Request aborted by the caller.", { attempts: failed });
    if (dead.has(target.provider)) continue;

    let key: string;
    try {
      key = resolveKey(target.provider);
    } catch (e) {
      const err = toProviderError(e, target);
      failed.push({ provider: target.provider, model: target.model, code: err.code, message: err.message });
      dead.add(target.provider);
      continue;
    }
    anyKey = true;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await callTarget(target, key, req);
        return { text, provider: target.provider, model: target.model, task: req.task, failed };
      } catch (e) {
        const err = toProviderError(e, target);
        if (err.code === "INVALID_KEY") dead.add(target.provider);
        if (RETRYABLE.has(err.code) && attempt < retries && !req.signal?.aborted) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        failed.push({ provider: target.provider, model: target.model, code: err.code, message: err.message });
        console.error(`[ai] ${target.provider}/${target.model} → ${err.code}: ${err.message}`);
        break;
      }
    }
  }

  if (!anyKey) {
    const needed = uniq(plan.map((t) => KEY_ENV[t.provider][0])).join(", ");
    throw new AIProviderError("NO_KEY", `No usable API key for task "${req.task}". Set at least one of: ${needed}.`, {
      attempts: failed,
    });
  }
  // a request every provider rejects as invalid is the caller's problem, not an outage
  if (failed.length > 0 && failed.every((a) => a.code === "BAD_REQUEST")) {
    throw new AIProviderError("BAD_REQUEST", failed[0].message, { attempts: failed });
  }
  const summary = failed.map((a) => `${a.provider}/${a.model}: ${a.code}`).join(" | ");
  throw new AIProviderError("ALL_FAILED", `All providers failed for task "${req.task}" — ${summary}`, { attempts: failed });
}

/**
 * Main entry point: routes `task` to the best provider and returns the clean answer text.
 *
 *   "code"      → Cerebras llama3.1-70b (fast code / debugging), then Gemini Pro …
 *   "fast"      → Groq llama-3.3-70b-versatile (instant replies), then Cerebras / Gemini Flash
 *   "grok"      → x-ai/grok-2-1212 via OpenRouter, then Gemini Flash / Groq
 *   "reasoning" → gemini-2.5-pro, then DeepSeek R1 / Claude via OpenRouter …
 */
export async function generateAIResponse(task: AITask, prompt: string, options: AIOptions = {}): Promise<string> {
  return (await generateAIResult(task, prompt, options)).text;
}

/** Same as generateAIResponse but never throws — handy for route handlers. */
export async function generateAIResponseSafe(
  task: AITask,
  prompt: string,
  options: AIOptions = {}
): Promise<{ ok: true; text: string; provider: ProviderId; model: string } | { ok: false; code: AIErrorCode; error: string }> {
  try {
    const r = await generateAIResult(task, prompt, options);
    return { ok: true, text: r.text, provider: r.provider, model: r.model };
  } catch (e) {
    const err = e instanceof AIProviderError ? e : new AIProviderError("UPSTREAM", redact(String(e)));
    return { ok: false, code: err.code, error: err.message };
  }
}

/**
 * Calls ONE explicit provider/model, no fallback — e.g. Claude or DeepSeek through OpenRouter:
 *   generateWithTarget({ provider: "openrouter", model: openRouterModels().claude }, prompt)
 */
export async function generateWithTarget(target: Target, prompt: string, options: AIOptions = {}): Promise<string> {
  const task: AITask = target.provider === "cerebras" ? "code" : target.provider === "groq" ? "fast" : "reasoning";
  const req = normalise(task, prompt, options);
  const key = resolveKey(target.provider);
  try {
    return await callTarget(target, key, req);
  } catch (e) {
    throw toProviderError(e, target);
  }
}
