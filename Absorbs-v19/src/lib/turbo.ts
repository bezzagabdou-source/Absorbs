/**
 * Nexus AI v11 — TURBO: sub-second first token + never-silent streams.
 *
 * Fixes two long-standing glitches:
 *  1. "the first word takes 5-20 s"  -> hedged racing: a second (and third) engine is started
 *     automatically if the leader has not produced a token in `headStartMs`. First token wins,
 *     the losers are aborted. The user always sees the fastest engine of the moment.
 *  2. "long requests hang 20 s+ and never answer" -> a watchdog that (a) keeps the connection
 *     warm with invisible heartbeats, (b) hard-fails over to a rescue engine when the stream
 *     really died, and (c) NEVER closes the response without saying something.
 *
 * Everything here works on plain `ReadableStream<string>` so it composes with the existing
 * streamGemini / ensembleStream / withAutoContinue pipeline without touching them.
 */

/** Zero-width joiner: invisible in the UI, but keeps proxies and the browser connection alive. */
export const HEARTBEAT = "\u2060";

export const TURBO = {
  /** Target time to first visible token. */
  TTFT_TARGET_MS: 900,
  /** Start a parallel back-up engine if the leader is still silent after this. */
  HEDGE_AFTER_MS: 750,
  /** Start a third engine after this. */
  HEDGE_2_AFTER_MS: 1_800,
  /** Emit an invisible heartbeat when nothing has been produced for this long. */
  HEARTBEAT_EVERY_MS: 3_000,
  /** No token at all for this long => the engine is considered dead, rescue takes over. */
  STALL_FAILOVER_MS: 12_000,
  /** Mid-answer silence (tokens already flowing) tolerated before rescue. */
  MID_STALL_FAILOVER_MS: 38_000,
  /** Absolute cap for a single rescue chain. */
  MAX_RESCUES: 3,
} as const;

export type StreamFactory = (signal: AbortSignal) => Promise<ReadableStream<string>>;

function raf(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/**
 * HEDGED RACE — the heart of the "answers in under a second" promise.
 *
 * `factories[0]` starts immediately. If it has not produced its first character after
 * `headStartMs`, `factories[1]` starts in parallel, and so on. The first stream to produce a
 * real character becomes THE answer; every other attempt is aborted so no tokens are wasted.
 */
export function hedgedRace(
  factories: StreamFactory[],
  o: {
    headStartMs?: number;
    secondHedgeMs?: number;
    onWinner?: (index: number) => void;
    /** called when every attempt failed */
    onAllFailed?: (errors: unknown[]) => void;
  } = {}
): ReadableStream<string> {
  const headStart = o.headStartMs ?? TURBO.HEDGE_AFTER_MS;
  const second = o.secondHedgeMs ?? TURBO.HEDGE_2_AFTER_MS;
  const list = factories.filter(Boolean);

  return new ReadableStream<string>({
    async start(controller) {
      if (list.length === 0) {
        controller.close();
        return;
      }
      const errors: unknown[] = [];
      let settled = false;
      let winner = -1;
      const controllers: AbortController[] = [];
      let closed = false;

      const safeEnqueue = (t: string) => {
        if (closed || !t) return;
        try {
          controller.enqueue(t);
        } catch {
          closed = true;
        }
      };

      const attempt = async (index: number): Promise<void> => {
        const ctl = new AbortController();
        controllers[index] = ctl;
        let reader: ReadableStreamDefaultReader<string> | null = null;
        try {
          const stream = await list[index](ctl.signal);
          if (ctl.signal.aborted) return;
          reader = stream.getReader();
          // a losing engine must stop the instant it is aborted, even if its own read() is
          // still blocked for seconds — otherwise the winner's answer cannot close.
          const readOrAbort = (r: ReadableStreamDefaultReader<string>) =>
            Promise.race([
              r.read(),
              new Promise<ReadableStreamReadResult<string>>((resolve) => {
                if (ctl.signal.aborted) resolve({ done: true, value: undefined });
                else ctl.signal.addEventListener("abort", () => resolve({ done: true, value: undefined }), { once: true });
              }),
            ]);
          for (;;) {
            const { done, value } = await readOrAbort(reader);
            if (done) break;
            if (ctl.signal.aborted) return;
            if (!value) continue;
            if (!settled) {
              // first real character anywhere -> this engine owns the answer
              settled = true;
              winner = index;
              o.onWinner?.(index);
              controllers.forEach((c, i) => {
                if (i !== index) c?.abort();
              });
            }
            if (winner !== index) return;
            safeEnqueue(value);
          }
        } catch (e) {
          if (!ctl.signal.aborted) errors.push(e);
        } finally {
          reader?.cancel().catch(() => undefined);
        }
      };

      const runners: Promise<void>[] = [attempt(0)];

      if (list.length > 1) {
        runners.push(
          (async () => {
            await raf(headStart);
            if (settled) return;
            await attempt(1);
          })()
        );
      }
      if (list.length > 2) {
        runners.push(
          (async () => {
            await raf(second);
            if (settled) return;
            await attempt(2);
          })()
        );
      }
      for (let i = 3; i < list.length; i++) {
        const idx = i;
        runners.push(
          (async () => {
            await raf(second + (idx - 2) * 1500);
            if (settled) return;
            await attempt(idx);
          })()
        );
      }

      await Promise.allSettled(runners);
      if (!settled) o.onAllFailed?.(errors);
      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      /* individual attempts abort through their own signals */
    },
  });
}

/**
 * WATCHDOG — a stream that is physically unable to go silent.
 *
 * - invisible heartbeat while the engine is thinking (kills the "nothing happens" feeling and
 *   stops proxies from dropping the connection);
 * - automatic failover to `rescue()` when no token arrived for `stallMs`;
 * - a guaranteed, human message instead of an empty answer when everything failed.
 */
export function withWatchdog(
  source: ReadableStream<string>,
  o: {
    /** opens a replacement stream when the current one dies or stalls */
    rescue?: (reason: "stall" | "error" | "empty") => Promise<ReadableStream<string> | null>;
    /** silence allowed before the FIRST token */
    stallMs?: number;
    /** silence allowed once tokens are already flowing */
    midStallMs?: number;
    heartbeatMs?: number;
    maxRescues?: number;
    /** message shown when nothing at all could be produced */
    fallbackText?: string;
    onEvent?: (e: { type: "heartbeat" | "stall" | "rescue" | "dead"; at: number }) => void;
    onDone?: (full: string) => void | Promise<void>;
    /** keep working even if the browser disconnected */
    keepAlive?: boolean;
  } = {}
): ReadableStream<string> {
  const stallMs = o.stallMs ?? TURBO.STALL_FAILOVER_MS;
  const midStallMs = o.midStallMs ?? TURBO.MID_STALL_FAILOVER_MS;
  const beatMs = o.heartbeatMs ?? TURBO.HEARTBEAT_EVERY_MS;
  const maxRescues = o.maxRescues ?? TURBO.MAX_RESCUES;
  const fallback =
    o.fallbackText ??
    "\u26a0\ufe0f المحرّك تأخّر أكثر من اللازم. أعد إرسال الطلب — النسخة الاحتياطية جاهزة وسترد فورًا.";

  return new ReadableStream<string>({
    async start(controller) {
      let acc = "";
      let gone = false;
      let finished = false;
      let lastAt = Date.now();
      let rescues = 0;
      let current: ReadableStream<string> | null = source;
      let reader: ReadableStreamDefaultReader<string> | null = null;

      const put = (t: string, visible = true) => {
        if (visible) {
          acc += t;
          lastAt = Date.now();
        }
        if (gone) return;
        try {
          controller.enqueue(t);
        } catch {
          gone = true;
        }
      };

      // invisible keep-alive loop
      const beat = setInterval(() => {
        if (finished || gone) return;
        if (Date.now() - lastAt >= beatMs) {
          o.onEvent?.({ type: "heartbeat", at: Date.now() });
          try {
            if (!gone) controller.enqueue(HEARTBEAT);
          } catch {
            gone = true;
          }
        }
      }, Math.max(250, Math.floor(beatMs / 2)));

      /** read a stream, resolving "stall" when it goes quiet for too long */
      const pump = async (s: ReadableStream<string>): Promise<"end" | "stall" | "error"> => {
        reader = s.getReader();
        try {
          for (;;) {
            const limit = acc.length === 0 ? stallMs : midStallMs;
            const race = await Promise.race([
              reader.read().then((r) => ({ kind: "chunk" as const, r })),
              raf(limit).then(() => ({ kind: "timeout" as const })),
            ]);
            if (race.kind === "timeout") {
              if (Date.now() - lastAt >= limit) return "stall";
              continue;
            }
            const { done, value } = race.r;
            if (done) return "end";
            if (value) put(value);
          }
        } catch {
          return "error";
        } finally {
          reader?.cancel().catch(() => undefined);
          reader = null;
        }
      };

      try {
        while (current) {
          const outcome = await pump(current);
          current = null;
          if (outcome === "end" && acc.trim().length > 0) break;
          const reason: "stall" | "error" | "empty" =
            outcome === "stall" ? "stall" : outcome === "error" ? "error" : "empty";
          o.onEvent?.({ type: reason === "stall" ? "stall" : "dead", at: Date.now() });
          if (!o.rescue || rescues >= maxRescues) break;
          rescues++;
          o.onEvent?.({ type: "rescue", at: Date.now() });
          current = await o.rescue(reason).catch(() => null);
          lastAt = Date.now();
        }
        if (acc.trim().length === 0) put("\n" + fallback + "\n");
      } finally {
        finished = true;
        clearInterval(beat);
        try {
          await o.onDone?.(acc);
        } catch {
          /* persistence must never break the stream */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      if (o.keepAlive) return;
    },
  });
}

/**
 * Opens the HTTP response instantly with an invisible byte so the browser paints the
 * "typing" state in a few milliseconds instead of waiting for the model's first token.
 */
export function withInstantOpen(source: ReadableStream<string>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue(HEARTBEAT);
      const reader = source.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch {
        /* upstream ended badly; close cleanly */
      } finally {
        reader.cancel().catch(() => undefined);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
}

/** Strips every heartbeat character — use before saving an answer to the database. */
export function cleanOutput(text: string): string {
  return text.split(HEARTBEAT).join("");
}
