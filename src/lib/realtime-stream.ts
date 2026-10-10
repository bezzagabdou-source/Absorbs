/**
 * ═══════════════════════════════════════════════════════════════════════
 *  NEXUS REALTIME STREAM PROTOCOL  ·  nexus-rt/1.0   (isomorphic, no deps)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  A transport-agnostic live-streaming layer for voice and vision:
 *
 *    • WebSocket transport (primary)   — full-duplex, lowest latency.
 *      Point it at OpenAI Realtime, Gemini Live, or any self-hosted
 *      ws(s):// gateway through NEXT_PUBLIC_REALTIME_WS.
 *
 *    • Fetch-stream transport (fallback) — HTTP body streaming with
 *      `duplex: "half"` + NDJSON framing. Works on plain Vercel
 *      serverless where WebSocket servers aren't available, replacing
 *      the old "one HTTP request per voice turn" pattern with a single
 *      long-lived streamed session.
 *
 *    • Audio helpers — Float32 → PCM16 → base64 frame chunking with an
 *      adaptive energy-gate VAD (so we stream speech, not silence).
 *
 *    • JitterBuffer — reorders out-of-order audio frames by sequence no.
 *
 *  Protocol frames (JSON, NDJSON or WS message):
 *    → { t:"hello", v, mode, lang? }            session bootstrap
 *    → { t:"audio", seq, b64, codec:"pcm16", sr } audio frame
 *    → { t:"frame", seq, b64, w, h }             vision frame (jpeg)
 *    → { t:"text", text }                        text turn
 *    → { t:"control", op:"barge-in"|"commit"|"end" }
 *    ← server: { t:"token"|"audio-out"|"transcript"|"frame-read"|"done"|"error", ... }
 */

export const RT_PROTOCOL_VERSION = "nexus-rt/1.0";

/* ──────────────────────────── events ──────────────────────────── */

export type RTMode = "voice" | "vision" | "voice-vision" | "text";

export type RTClientEvent =
  | { t: "hello"; v: string; mode: RTMode; lang?: string; persona?: string }
  | { t: "audio"; seq: number; b64: string; codec: "pcm16"; sr: number }
  | { t: "frame"; seq: number; b64: string; w: number; h: number }
  | { t: "text"; text: string }
  | { t: "control"; op: "barge-in" | "commit" | "end" }
  | { t: "ping"; at: number };

export type RTServerEvent =
  | { t: "ready"; session: string; heartbeatMs: number }
  | { t: "token"; text: string }
  | { t: "audio-out"; seq: number; b64: string; codec: "pcm16"; sr: number }
  | { t: "transcript"; role: "user" | "model"; text: string; final: boolean }
  | { t: "frame-read"; text: string; seq: number }
  | { t: "barge-in-ack" }
  | { t: "done"; reason?: string }
  | { t: "error"; code: string; message: string }
  | { t: "pong"; at: number };

/* ──────────────────────── base64 (isomorphic) ──────────────────────── */

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Chunk-safe base64 encoder for raw bytes — no btoa/Buffer size limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let off = 0; off < bytes.length; off += CHUNK) {
    const end = Math.min(off + CHUNK, bytes.length);
    let s = "";
    for (let i = off; i < end; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < end ? bytes[i + 1] : NaN;
      const b2 = i + 2 < end ? bytes[i + 2] : NaN;
      s += B64_ALPHABET[b0 >> 2] + B64_ALPHABET[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
      s += isNaN(b1) ? "==" : B64_ALPHABET[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
      s += isNaN(b2) ? "=" : B64_ALPHABET[b2 & 63];
    }
    out += s;
  }
  return out;
}

const B64_LOOKUP = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) m[B64_ALPHABET.charCodeAt(i)] = i;
  return m;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, "");
  const outLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let j = 0;
  for (let i = 0; i + 3 < clean.length + 1 && j < outLen; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)] ?? 0;
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)] ?? 0;
    const c2 = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0 : 0;
    const c3 = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0 : 0;
    out[j++] = (c0 << 2) | (c1 >> 4);
    if (j < outLen) out[j++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (j < outLen) out[j++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

/* ─────────────────────────── audio codecs ─────────────────────────── */

/** Float32 samples [-1,1] → little-endian PCM16 bytes. */
export function floatTo16BitPCM(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** little-endian PCM16 bytes → Float32 samples. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const n = Math.floor(bytes.length / 2);
  const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export interface AudioFrameEvent {
  t: "audio";
  seq: number;
  b64: string;
  codec: "pcm16";
  sr: number;
}

/**
 * Slices raw Float32 audio into streaming frames of `chunkMs` milliseconds,
 * base64-encoded and ready to send. Sequence numbers start at `fromSeq`.
 */
export function chunkAudioFrames(
  samples: Float32Array,
  sampleRate = 16_000,
  chunkMs = 250,
  fromSeq = 0
): AudioFrameEvent[] {
  const per = Math.max(1, Math.round((sampleRate * chunkMs) / 1000));
  const frames: AudioFrameEvent[] = [];
  for (let off = 0, seq = fromSeq; off < samples.length; off += per, seq++) {
    frames.push({
      t: "audio",
      seq,
      b64: bytesToBase64(floatTo16BitPCM(samples.subarray(off, Math.min(off + per, samples.length)))),
      codec: "pcm16",
      sr: sampleRate,
    });
  }
  return frames;
}

/* ───────────────────── adaptive energy-gate VAD ───────────────────── */

/**
 * Feed it PCM16 frames; it tracks the ambient noise floor and reports when
 * a frame carries speech (energy ≥ floor × margin). Adaptive: the floor
 * follows the quietest recent frames, so AC-hum / street noise never
 * triggers a false wake.
 */
export class EnergyVAD {
  private floor = 320;
  constructor(
    private readonly margin = 2.2,
    private readonly attackMs = 120,
    private readonly releaseMs = 450
  ) {}
  private speakingSince = 0;
  private quietSince = 0;
  speech: boolean = false;

  /** @returns true if this frame should be streamed upstream */
  accept(pcm: Uint8Array, sampleRate: number): boolean {
    let sum = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) {
      const v = pcm[i] | (pcm[i + 1] << 8);
      const s = v << 16 >> 16; // sign-extend
      sum += s * s;
    }
    const rms = Math.sqrt(sum / Math.max(1, pcm.length / 2));
    const now = Date.now();
    const frameMs = (pcm.length / 2 / sampleRate) * 1000;

    if (rms > this.floor * this.margin) {
      this.quietSince = 0;
      if (!this.speech) {
        if (!this.speakingSince) this.speakingSince = now;
        if (now - this.speakingSince >= this.attackMs) this.speech = true;
      }
    } else {
      this.speakingSince = 0;
      // noise floor follows the quiet frames (slowly, never below 90 RMS)
      this.floor = this.floor * 0.985 + Math.min(rms, this.floor) * 0.015;
      this.floor = Math.max(90, this.floor);
      if (this.speech) {
        if (!this.quietSince) this.quietSince = now;
        if (now - this.quietSince >= this.releaseMs + frameMs) this.speech = false;
      }
    }
    return this.speech;
  }
}

/* ─────────────────────────── jitter buffer ─────────────────────────── */

/**
 * Re-orders audio frames arriving out of order (WS racing multipath).
 * Frames later than `window` positions behind the head are dropped.
 */
export class JitterBuffer<T extends { seq: number }> {
  private readonly buf = new Map<number, T>();
  private head = -1;
  constructor(private readonly window = 24) {}

  push(frame: T): T[] {
    if (this.head < 0) this.head = frame.seq;
    if (frame.seq < this.head) return []; // too late
    this.buf.set(frame.seq, frame);
    const out: T[] = [];
    let guard = this.window;
    while (this.buf.has(this.head) && guard-- > 0) {
      out.push(this.buf.get(this.head)!);
      this.buf.delete(this.head);
      this.head++;
    }
    // head can't run ahead forever — skip the gap if the buffer is full
    if (this.buf.size > this.window) {
      const next = Math.min(...this.buf.keys());
      this.head = next;
    }
    return out;
  }

  reset(): void {
    this.buf.clear();
    this.head = -1;
  }
}

/* ─────────────────────── frame (de)serialisation ─────────────────────── */

export function encodeEvent(e: RTClientEvent | RTServerEvent): string {
  return JSON.stringify(e) + "\n";
}

/** Incremental NDJSON parser — feed raw stream chunks, get complete events back. */
export class EventDecoder<T = RTServerEvent> {
  private buf = "";
  private readonly dec = new TextDecoder();
  push(chunk: Uint8Array): T[] {
    this.buf += this.dec.decode(chunk, { stream: true });
    const out: T[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line || line === "[DONE]") continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        /* keep-alive / partial line */
      }
    }
    return out;
  }
  flush(): T[] {
    const rest = this.buf.trim();
    this.buf = "";
    if (!rest) return [];
    try {
      return [JSON.parse(rest) as T];
    } catch {
      return [];
    }
  }
}

/* ───────────────────── the session (client-side) ───────────────────── */

export type RTSessionHandlers = {
  onOpen?: () => void;
  onEvent?: (e: RTServerEvent) => void;
  onError?: (err: Error) => void;
  onClose?: (reason: string) => void;
};

interface WSLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, cb: (ev: unknown) => void): void;
}

/**
 * One live session. WebSocket first (configure NEXT_PUBLIC_REALTIME_WS for a
 * ws(s):// gateway — OpenAI Realtime, Gemini Live, or a self-hosted bridge);
 * when no WS endpoint exists it transparently uses fetch body-streaming
 * against a same-origin route, which still replaces the old
 * request-per-turn pattern with ONE long-lived streamed session.
 */
export class NexusRealtimeSession {
  transport: "websocket" | "fetch-stream" | "closed" = "closed";
  private ws: WSLike | null = null;
  private seq = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private fetchCtl: AbortController | null = null;
  private writeQueue: RTClientEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private streamWriter: { write(e: RTClientEvent): void; close(): void } | null = null;

  constructor(
    private readonly url: string,
    private readonly mode: RTMode = "voice",
    private readonly handlers: RTSessionHandlers = {},
    private readonly opts: {
      lang?: string;
      persona?: string;
      heartbeatMs?: number;
      fetchFlushMs?: number;
      /** extra headers for the fetch-stream transport (e.g. Authorization) */
      headers?: Record<string, string>;
    } = {}
  ) {}

  get isLive(): boolean {
    return this.transport !== "closed";
  }

  async connect(): Promise<void> {
    if (this.url.startsWith("ws://") || this.url.startsWith("wss://")) {
      await this.connectWs();
    } else {
      await this.connectFetchStream();
    }
  }

  /* ---- primary: WebSocket ---- */
  private connectWs(): Promise<void> {
    return new Promise((resolve, reject) => {
      const g = globalThis as { WebSocket?: new (u: string) => WSLike };
      if (!g.WebSocket) {
        reject(new Error("WebSocket unavailable"));
        return;
      }
      const ws = new g.WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener("open", () => {
        this.transport = "websocket";
        this.sendRaw({ t: "hello", v: RT_PROTOCOL_VERSION, mode: this.mode, lang: this.opts.lang, persona: this.opts.persona });
        this.heartbeat = setInterval(
          () => this.sendRaw({ t: "ping", at: Date.now() }),
          this.opts.heartbeatMs ?? 15_000
        );
        this.handlers.onOpen?.();
        resolve();
      });
      ws.addEventListener("message", (ev) => {
        try {
          const data = (ev as { data?: unknown }).data;
          this.handlers.onEvent?.(JSON.parse(String(data)) as RTServerEvent);
        } catch {
          /* malformed frame */
        }
      });
      ws.addEventListener("error", () => {
        if (this.transport === "closed") reject(new Error("websocket failed"));
        else this.handlers.onError?.(new Error("websocket error"));
      });
      ws.addEventListener("close", (ev) => {
        const c = ev as { reason?: string };
        this.shutdown();
        this.handlers.onClose?.(c.reason ?? "closed");
      });
    });
  }

  /* ---- fallback: fetch duplex streaming (Vercel-friendly) ---- */
  private async connectFetchStream(): Promise<void> {
    const ctl = new AbortController();
    this.fetchCtl = ctl;
    const self = this;

    // an out-of-stream writer fed by the audio/text queue, flushed as NDJSON
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        self.streamWriter = {
          write(e) {
            try {
              c.enqueue(enc.encode(encodeEvent(e)));
            } catch {
              /* stream already closed */
            }
          },
          close() {
            try {
              c.close();
            } catch {
              /* already closed */
            }
          },
        };
      },
    });

    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        "x-rt-protocol": RT_PROTOCOL_VERSION,
        ...(this.opts.headers ?? {}),
      },
      body,
      signal: ctl.signal,
      // @ts-expect-error — `duplex` is required for request streaming; typed in lib.dom for Runtypes but not everywhere
      duplex: "half",
    });
    if (!res.ok || !res.body) throw new Error(`realtime session HTTP ${res.status}`);

    this.transport = "fetch-stream";
    this.sendRaw({ t: "hello", v: RT_PROTOCOL_VERSION, mode: this.mode, lang: this.opts.lang, persona: this.opts.persona });
    this.flushTimer = setInterval(() => this.flush(), this.opts.fetchFlushMs ?? 40);
    this.heartbeat = setInterval(() => this.sendRaw({ t: "ping", at: Date.now() }), this.opts.heartbeatMs ?? 15_000);
    this.handlers.onOpen?.();

    // consume the streamed response
    const decoder = new EventDecoder<RTServerEvent>();
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) for (const ev of decoder.push(value)) this.handlers.onEvent?.(ev);
      }
      for (const ev of decoder.flush()) this.handlers.onEvent?.(ev);
      this.shutdown();
      this.handlers.onClose?.("eof");
    } catch (e) {
      if (!ctl.signal.aborted) this.handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      this.shutdown();
      this.handlers.onClose?.("error");
    }
  }

  private flush(): void {
    // placeholder hook for batch-mode transports; fetch-stream writes eagerly
  }

  private sendRaw(e: RTClientEvent): void {
    if (this.transport === "websocket" && this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(e));
    } else if (this.transport === "fetch-stream") {
      this.streamWriter?.write(e);
    } else {
      this.writeQueue.push(e);
    }
  }

  /** Quantizes + chunks a Float32 audio buffer and streams it frame by frame. */
  sendAudio(samples: Float32Array, sampleRate = 16_000): number {
    const frames = chunkAudioFrames(samples, sampleRate, 250, this.seq);
    for (const f of frames) this.sendRaw(f);
    this.seq += frames.length;
    return frames.length;
  }

  sendText(text: string): void {
    this.sendRaw({ t: "text", text: text.slice(0, 8000) });
  }

  /** "barge-in": the user started speaking — the agent must stop talking now. */
  bargeIn(): void {
    this.sendRaw({ t: "control", op: "barge-in" });
  }

  commit(): void {
    this.sendRaw({ t: "control", op: "commit" });
  }

  end(): void {
    try {
      this.sendRaw({ t: "control", op: "end" });
    } catch {
      /* closing anyway */
    }
    this.shutdown();
  }

  private shutdown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.heartbeat = null;
    this.flushTimer = null;
    try {
      this.streamWriter?.close();
    } catch {
      /* closed */
    }
    try {
      if (this.ws && this.ws.readyState <= 1) this.ws.close(1000, "done");
    } catch {
      /* closed */
    }
    this.ws = null;
    this.fetchCtl?.abort();
    this.transport = "closed";
  }
}

/** Where the client should open its realtime session. */
export function resolveRealtimeUrl(mode: RTMode): { url: string; transport: "websocket" | "fetch-stream" } {
  const ws = (typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_REALTIME_WS ?? "").trim() : "") || "";
  if (ws.startsWith("ws://") || ws.startsWith("wss://")) return { url: ws, transport: "websocket" };
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();
  return { url: `${base}/api/realtime?mode=${mode}`, transport: "fetch-stream" };
}
