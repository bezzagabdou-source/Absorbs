/**
 * Nexus AI v15 — DRAFT FILTER
 * =============================================================================
 * "نحي المسودة لي تظهر في كلود 4.5"
 *
 * Claude 4.5, the DeepSeek/Qwen reasoning builds and Gemini Think all like to
 * open with planning prose — "I'll start by creating the engine module…" — and
 * some of them emit a <think> block or a whole first draft before the real
 * answer. This strips that from the STREAM, so the user sees the artefact
 * appear immediately instead of watching the model talk to itself.
 *
 * Design constraints that made this non-trivial:
 *   - It must not delay first paint by more than a few hundred ms, or the UI
 *     feels dead (the v11 heartbeat lesson).
 *   - It must never eat real content. When in doubt it passes text through.
 *   - It has to work on a chunked stream, where a <think> tag can be split
 *     across two reads.
 *
 * Isomorphic, no node imports.
 */

/** Opening tags that mean "this is internal monologue, not the answer". */
const THINK_OPEN = /<(think|thinking|reasoning|scratchpad|internal|draft)>/i;
const THINK_CLOSE = /<\/(think|thinking|reasoning|scratchpad|internal|draft)>/i;

/** Lines that are pure narration and carry no answer content. */
const NARRATION = [
  /^(certainly|sure thing|sure|of course|absolutely|great question|good question)[!,.\s]*$/i,
  /^(i'?ll|i will|let me|let's|i'?m going to|i am going to|i'?d|we'?ll)\b.{0,160}$/i,
  /^here'?s (what|how|my|the) (i|you|we|the|plan|approach)\b.{0,160}$/i,
  /^(first|to start|to begin|step 1)[,:]?\s+(i|let|we|the)\b.{0,160}$/i,
  /^(looking at|based on|thinking about) (your|the) (request|question|ask)\b.{0,160}$/i,
  /^\**\s*(draft|plan|outline|approach|thinking|reasoning|analysis)\s*(version|phase)?\s*\**\s*:?\s*$/i,
  /^\**\s*(المسودة|مسودة|الخطة|خطة العمل|التفكير|التحليل|المخطط)\s*\**\s*:?\s*$/i,
  /^(سأقوم|سوف أقوم|سأبدأ|دعني|اسمح لي|بالتأكيد|طبعا|حسنا|إليك ما)\b.{0,160}$/,
];

/** A line that clearly starts the real answer — stop trimming at once. */
function isContent(line: string): boolean {
  const L = line.trim();
  if (!L) return false;
  return (
    L.startsWith("```") ||
    L.startsWith("#") ||
    L.startsWith("|") ||
    L.startsWith("<") ||
    L.startsWith("- ") ||
    L.startsWith("* ") ||
    /^\d+[.)]\s/.test(L) ||
    L.length > 180
  );
}

/** How much text we are willing to hold back while deciding. */
const PROBE_CHARS = 900;
/** …and for how long. After this we flush whatever we have. */
const PROBE_MS = 700;

export interface DraftFilterOptions {
  /** Set false to pass everything through (used for voice / non-build turns). */
  enabled?: boolean;
}

/**
 * Wraps a text stream and removes thinking blocks + a leading draft.
 *
 * Strategy:
 *   phase "probe"  — buffer up to PROBE_CHARS / PROBE_MS, decide, emit cleaned.
 *   phase "pass"   — stream through, only filtering <think> blocks.
 */
export function withDraftFilter(
  src: ReadableStream<string>,
  opts: DraftFilterOptions = {}
): ReadableStream<string> {
  if (opts.enabled === false) return src;

  const reader = src.getReader();
  let probe = "";
  let phase: "probe" | "pass" = "probe";
  let inThink = false;
  let carry = "";
  const started = Date.now();

  /** Removes complete <think>…</think> pairs and tracks an open one. */
  function filterThink(chunk: string): string {
    let s = carry + chunk;
    carry = "";
    let out = "";

    for (;;) {
      if (inThink) {
        const close = s.search(THINK_CLOSE);
        if (close === -1) {
          // still inside: keep nothing, but hold a tail in case the tag splits
          carry = s.slice(-24);
          return out;
        }
        const m = s.match(THINK_CLOSE);
        s = s.slice(close + (m ? m[0].length : 0));
        inThink = false;
        continue;
      }
      const open = s.search(THINK_OPEN);
      if (open === -1) {
        // hold back a short tail so a split "<thin|king>" is not emitted
        const lt = s.lastIndexOf("<");
        if (lt > -1 && s.length - lt < 16) {
          out += s.slice(0, lt);
          carry = s.slice(lt);
        } else {
          out += s;
        }
        return out;
      }
      out += s.slice(0, open);
      const m = s.match(THINK_OPEN);
      s = s.slice(open + (m ? m[0].length : 0));
      inThink = true;
    }
  }

  /** Trims leading narration once, at the moment we leave probe phase. */
  function trimPreamble(text: string): string {
    // "Final answer:" style markers win outright.
    const mark = text.search(
      /^\**\s*(final(?: version| answer| code)?|الإجابة النهائية|النسخة النهائية|الكود النهائي)\s*\**\s*:?\s*$/im
    );
    if (mark > 0) {
      const after = text.slice(mark);
      const nl = after.indexOf("\n");
      if (nl > -1) return after.slice(nl + 1).replace(/^\s+/, "");
    }

    const lines = text.split("\n");
    let cut = 0;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const L = lines[i].trim();
      if (!L) {
        if (cut === i) cut = i + 1;
        continue;
      }
      if (isContent(L)) break;
      if (NARRATION.some((re) => re.test(L))) {
        cut = i + 1;
        continue;
      }
      break;
    }
    // Never trim everything away — that would look like a dead stream.
    if (cut >= lines.length) return text;
    return lines.slice(cut).join("\n").replace(/^\s+/, "");
  }

  return new ReadableStream<string>({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();

          if (done) {
            const tail = carry;
            carry = "";
            const rest = phase === "probe" ? trimPreamble(probe + tail) : tail;
            if (rest) controller.enqueue(rest);
            controller.close();
            return;
          }

          const cleaned = filterThink(value ?? "");
          if (!cleaned) continue;

          if (phase === "pass") {
            controller.enqueue(cleaned);
            return;
          }

          probe += cleaned;
          const longEnough = probe.length >= PROBE_CHARS;
          const slowEnough = Date.now() - started >= PROBE_MS;
          // a fence means the real answer has started; decide now
          const sawFence = probe.includes("```") || /\n#{1,3}\s/.test(probe);

          if (longEnough || slowEnough || sawFence) {
            phase = "pass";
            const out = trimPreamble(probe);
            probe = "";
            if (out) {
              controller.enqueue(out);
              return;
            }
          }
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel(reason) {
      void reader.cancel(reason).catch(() => undefined);
    },
  });
}
