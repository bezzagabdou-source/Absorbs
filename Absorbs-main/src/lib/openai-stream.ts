/**
 * Shared streaming client for OpenAI-compatible chat APIs (xAI Grok, OpenRouter, Hugging Face router).
 * SERVER SIDE ONLY. Plain fetch, no SDK, no extra dependency.
 *
 * - tries the candidate models in order (retired model / busy / rate-limited -> next one)
 * - waits for the FIRST token before returning, so the caller can still fall back cleanly
 * - a rejected key (401/403) stops immediately: other models would fail the same way
 * - API keys are never logged or placed in error messages
 */
import type { ChatTurn } from "@/lib/gemini";

export type StreamErrorCode =
  | "NO_KEY"
  | "INVALID_KEY"
  | "RATE_LIMIT"
  | "MODEL_UNAVAILABLE"
  | "BAD_REQUEST"
  | "UPSTREAM"
  | "TIMEOUT"
  | "EMPTY"
  | "ALL_FAILED";

export class ProviderStreamError extends Error {
  readonly code: StreamErrorCode;
  readonly provider: string;
  readonly status?: number;
  constructor(code: StreamErrorCode, provider: string, message: string, status?: number) {
    super(message);
    this.name = "ProviderStreamError";
    this.code = code;
    this.provider = provider;
    this.status = status;
  }
}

const PLACEHOLDER = /^(your[_-]|xxx|changeme|replace|<|todo|none$|null$|undefined$)/i;

export function cleanKey(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

/** First usable key among the env var names (placeholders and malformed values are skipped). */
export function findEnvKey(names: readonly string[]): string | undefined {
  for (const n of names) {
    const v = cleanKey(process.env[n]);
    if (v.length >= 8 && !/\s/.test(v) && !PLACEHOLDER.test(v)) return v;
  }
  return undefined;
}

export function envModel(name: string, fallback: string): string {
  return cleanKey(process.env[name]) || fallback;
}

function classify(status: number, body: string): StreamErrorCode {
  if (status === 401 || status === 403) return "INVALID_KEY";
  if (status === 429) return "RATE_LIMIT";
  if (status === 402 || status === 404) return "MODEL_UNAVAILABLE"; // 402 = no credits for that model
  if ((status === 400 || status === 422) && /model/i.test(body)) return "MODEL_UNAVAILABLE";
  if (status === 408) return "TIMEOUT";
  if (status >= 500) return "UPSTREAM";
  return "BAD_REQUEST";
}

function errorText(raw: string, key: string): string {
  let msg = raw;
  try {
    const j = JSON.parse(raw) as { error?: unknown; message?: unknown };
    const e = j.error;
    if (typeof e === "string") msg = e;
    else if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string")
      msg = (e as { message: string }).message;
    else if (typeof j.message === "string") msg = j.message;
  } catch {
    /* plain text body */
  }
  if (key) msg = msg.split(key).join("[redacted]");
  return msg.slice(0, 240);
}

export interface StreamOpts {
  /** short id used in logs / errors, e.g. "grok" */
  provider: string;
  url: string;
  key: string;
  /** candidates in priority order (duplicates are ignored) */
  models: string[];
  system: string;
  messages: ChatTurn[];
  temperature?: number;
  maxTokens: number;
  headers?: Record<string, string>;
  /** max wait for the first token per candidate (default 20 s) */
  firstTokenMs?: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}

/** Incremental SSE parser: next() resolves with the next non-empty text delta, or null at the end. */
class SseText {
  private buf = "";
  private readonly dec = new TextDecoder();
  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly provider: string
  ) {}

  async next(): Promise<string | null> {
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data) as {
            error?: { message?: string } | string;
            choices?: { delta?: { content?: string } }[];
          };
          if (j.error) {
            const m = typeof j.error === "string" ? j.error : (j.error.message ?? "stream error");
            throw new ProviderStreamError("UPSTREAM", this.provider, m.slice(0, 200));
          }
          const d = j.choices?.[0]?.delta?.content;
          if (typeof d === "string" && d) return d;
        } catch (e) {
          if (e instanceof ProviderStreamError) throw e;
          /* partial or keep-alive line */
        }
        continue;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        if (this.buf.trim()) {
          this.buf += "\n";
          continue;
        }
        return null;
      }
      this.buf += this.dec.decode(value, { stream: true });
    }
  }

  cancel(): void {
    void this.reader.cancel().catch(() => undefined);
  }
}

export async function streamOpenAICompat(o: StreamOpts): Promise<ReadableStream<string>> {
  const attempts: string[] = [];
  const firstTokenMs = o.firstTokenMs ?? 20_000;
  const payload = (model: string) =>
    JSON.stringify({
      model,
      stream: true,
      temperature: o.temperature ?? 0.6,
      max_tokens: o.maxTokens,
      messages: [
        { role: "system", content: o.system },
        ...o.messages.map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.text })),
      ],
    });

  for (const model of Array.from(new Set(o.models.filter(Boolean)))) {
    if (o.signal?.aborted) throw new ProviderStreamError("UPSTREAM", o.provider, "Request aborted by the caller.");
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    o.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => ctl.abort(), firstTokenMs);
    const cleanup = () => {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onAbort);
    };
    try {
      const res = await fetch(o.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${o.key}`, "Content-Type": "application/json", ...o.headers },
        body: payload(model),
        cache: "no-store",
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => "");
        const code = classify(res.status, raw);
        const msg = errorText(raw, o.key);
        console.error(`[${o.provider}] ${model} -> ${res.status} ${code}: ${msg}`);
        if (code === "INVALID_KEY") {
          throw new ProviderStreamError("INVALID_KEY", o.provider, `${o.provider} rejected the API key (${res.status}).`, res.status);
        }
        attempts.push(`${model}: ${code}`);
        cleanup();
        continue;
      }
      const sse = new SseText(res.body.getReader(), o.provider);
      const first = await sse.next(); // aborted by the timer if the model never answers
      clearTimeout(timer);
      if (first === null) {
        attempts.push(`${model}: EMPTY`);
        sse.cancel();
        cleanup();
        continue;
      }
      o.onModel?.(model);
      let full = first;
      let sentFirst = false;
      return new ReadableStream<string>({
        async pull(controller) {
          try {
            if (!sentFirst) {
              sentFirst = true;
              controller.enqueue(first);
              return;
            }
            const chunk = await sse.next();
            if (chunk === null) {
              cleanup();
              await o.onDone?.(full);
              controller.close();
              return;
            }
            full += chunk;
            controller.enqueue(chunk);
          } catch (e) {
            cleanup();
            controller.error(e);
          }
        },
        cancel() {
          cleanup();
          ctl.abort();
          sse.cancel();
        },
      });
    } catch (e) {
      cleanup();
      if (e instanceof ProviderStreamError) throw e;
      const name = e instanceof Error ? e.name : "";
      if (o.signal?.aborted) throw new ProviderStreamError("UPSTREAM", o.provider, "Request aborted by the caller.");
      const code: StreamErrorCode = name === "AbortError" || name === "TimeoutError" ? "TIMEOUT" : "UPSTREAM";
      console.error(`[${o.provider}] ${model} failed: ${code}`);
      attempts.push(`${model}: ${code}`);
    }
  }
  throw new ProviderStreamError("ALL_FAILED", o.provider, `All ${o.provider} models failed: ${attempts.join(" | ")}`);
}
