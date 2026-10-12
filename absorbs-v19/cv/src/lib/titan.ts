/**
 * Nexus AI v11 — TITAN: 5 MB answers, zero glitches.
 *
 * The old never-stop guard only continued while the text "looked cut". TITAN adds:
 *  - a real SIZE target (up to 5 MB of code in one deliverable) with segment chaining;
 *  - overlap de-duplication, so a continuation that repeats the last lines never produces the
 *    classic "duplicated code / broken game" glitch;
 *  - an integrity pass (fences, <script>, <style>, braces, </html>) with automatic repair;
 *  - a glitch scanner that catches the usual killers before the file reaches the user.
 */

import { MAX_SEGMENT_TOKENS } from "@/lib/limits";

export const TITAN = {
  /** Hard ceiling for one deliverable. */
  MAX_BYTES: 5 * 1024 * 1024,
  /** What a MAX build should reach before TITAN stops pushing for more. */
  TARGET_BYTES: 3_000_000,
  /** A build smaller than this is considered unfinished for a "big game / big app" request. */
  MIN_BIG_BYTES: 180_000,
  /** Maximum continuation rounds. */
  MAX_ROUNDS: 120,
  /** Characters of tail context handed to the continuation call. */
  TAIL_CONTEXT: 180_000,
  /** How many characters of overlap we look for when stitching two segments. */
  OVERLAP_WINDOW: 2_000,
  SEGMENT_TOKENS: MAX_SEGMENT_TOKENS,
} as const;

export type Integrity = {
  ok: boolean;
  bytes: number;
  /** unterminated markdown fence */
  openFence: boolean;
  openScript: number;
  openStyle: number;
  missingHtmlClose: boolean;
  braceDelta: number;
  parenDelta: number;
  issues: string[];
};

const textBytes = (s: string) => (typeof Buffer !== "undefined" ? Buffer.byteLength(s, "utf8") : s.length);

/** Everything outside fenced code blocks is ignored when counting brackets. */
function mainCode(text: string): string {
  const blocks = [...text.matchAll(/```[\w-]*[ \t]*\r?\n([\s\S]*?)(?:```|$)/g)].map((m) => m[1]);
  return blocks.length ? blocks.join("\n") : text;
}

function countOutsideStrings(code: string, open: string, close: string): number {
  let depth = 0;
  let inS: string | null = null;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const n = code[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inS) {
      if (c === "\\") i++;
      else if (c === inS) inS = null;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inS = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) depth--;
  }
  return depth;
}

export function integrity(text: string): Integrity {
  const code = mainCode(text);
  const fences = (text.match(/```/g) ?? []).length;
  const openScript = (code.match(/<script\b/gi) ?? []).length - (code.match(/<\/script>/gi) ?? []).length;
  const openStyle = (code.match(/<style\b/gi) ?? []).length - (code.match(/<\/style>/gi) ?? []).length;
  const isPage = /<html[\s>]/i.test(code);
  const missingHtmlClose = isPage && !/<\/html>\s*$/i.test(code.trim());
  const braceDelta = countOutsideStrings(code, "{", "}");
  const parenDelta = countOutsideStrings(code, "(", ")");
  const issues: string[] = [];
  if (fences % 2 === 1) issues.push("كتلة كود غير مغلقة (```)");
  if (openScript > 0) issues.push(`${openScript} وسم <script> غير مغلق`);
  if (openStyle > 0) issues.push(`${openStyle} وسم <style> غير مغلق`);
  if (missingHtmlClose) issues.push("الملف لا ينتهي بـ </html>");
  if (braceDelta > 0) issues.push(`${braceDelta} قوس { غير مغلق`);
  if (parenDelta > 0) issues.push(`${parenDelta} قوس ( غير مغلق`);
  return {
    ok: issues.length === 0,
    bytes: textBytes(text),
    openFence: fences % 2 === 1,
    openScript,
    openStyle,
    missingHtmlClose,
    braceDelta,
    parenDelta,
    issues,
  };
}

/** True when the answer is cut in the middle of something. */
export function isCut(text: string): boolean {
  const i = integrity(text);
  return i.openFence || i.openScript > 0 || i.openStyle > 0 || i.missingHtmlClose || i.braceDelta > 0;
}

/**
 * Last-resort repair so a truncated giant file still RUNS instead of showing a white screen.
 * Never invents logic — it only closes what the model left open.
 */
export function repair(text: string): string {
  let out = text.replace(/\s+$/, "");
  const i = integrity(out);
  if (i.braceDelta > 0) out += "\n" + "}".repeat(Math.min(i.braceDelta, 40));
  if (i.openScript > 0) out += "\n" + "</script>".repeat(Math.min(i.openScript, 8));
  if (i.openStyle > 0) out += "\n" + "</style>".repeat(Math.min(i.openStyle, 8));
  if (i.missingHtmlClose) {
    if (!/<\/body>/i.test(out)) out += "\n</body>";
    out += "\n</html>";
  }
  if ((out.match(/```/g) ?? []).length % 2 === 1) out += "\n```";
  return out;
}

/**
 * ANTI-GLITCH STITCH.
 * Continuations love to repeat the last lines they were shown. We look for the longest suffix of
 * `acc` that the new segment starts with and drop it, so the file never gets duplicated blocks.
 */
export function stitch(acc: string, next: string): string {
  if (!next) return "";
  let piece = next;

  // a continuation that re-opens a code fence
  piece = piece.replace(/^\s*```[\w-]*[ \t]*\r?\n/, "");
  // typical conversational preambles
  piece = piece.replace(
    /^\s*(?:(?:sure|certainly|of course|here(?:'s| is)[^\n]*|continuing[^\n]*|تابع[^\n]*|إليك[^\n]*|نكمل[^\n]*)\r?\n)+/i,
    ""
  );

  const tail = acc.slice(-TITAN.OVERLAP_WINDOW);
  const max = Math.min(tail.length, piece.length);
  for (let n = max; n >= 24; n--) {
    if (piece.startsWith(tail.slice(tail.length - n))) {
      piece = piece.slice(n);
      break;
    }
  }
  // a whole duplicated line at the seam
  const lastLine = acc.slice(acc.lastIndexOf("\n") + 1);
  if (lastLine.length > 8 && piece.startsWith(lastLine)) piece = piece.slice(lastLine.length);
  return piece;
}

/** Glitches that silently break a generated game / app. */
export function glitchScan(text: string): string[] {
  const found: string[] = [];
  const code = mainCode(text);
  if (/\b(TODO|FIXME|\.\.\.\s*rest of|rest of the code|باقي الكود|same as before|as above)\b/i.test(code))
    found.push("يحتوي على عنصر نائب / كود ناقص");
  if (/\bimport\s+[\s\S]{0,80}\bfrom\s+['"]/.test(code) && /<html[\s>]/i.test(code))
    found.push("استعمال ES modules داخل ملف HTML واحد");
  if (/<script[^>]*src=["']https?:\/\/(?!cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)/i.test(code))
    found.push("ملف خارجي غير موثوق");
  if (/\bdocument\.write\s*\(/.test(code)) found.push("استعمال document.write");
  if (/<canvas/i.test(code) && !/requestAnimationFrame/.test(code))
    found.push("canvas بدون حلقة requestAnimationFrame");
  if (/addEventListener\(\s*["']keydown/.test(code) && !/touchstart|pointerdown/.test(code))
    found.push("تحكّم بالكيبورد فقط — بدون دعم اللمس");
  return found;
}

export type TitanReport = {
  bytes: number;
  kb: number;
  rounds: number;
  integrity: Integrity;
  glitches: string[];
  repaired: boolean;
};

/**
 * TITAN never-stop guard.
 *
 * Keeps asking the same engine for the next segment until the deliverable is both
 * STRUCTURALLY COMPLETE and (for builds) big enough, up to 5 MB.
 *
 * `continueWith` is injected so this module stays engine-agnostic and testable.
 */
export function withTitan(
  source: ReadableStream<string>,
  o: {
    /** opens the next segment; receives everything written so far */
    continueWith: (acc: string, round: number) => Promise<ReadableStream<string>>;
    /** push for size, not only for structural completeness (games / apps / sites) */
    big?: boolean;
    targetBytes?: number;
    maxBytes?: number;
    rounds?: number;
    seed?: string;
    /** epoch ms — do not START a new round after this */
    deadlineAt?: number;
    keepAlive?: boolean;
    onRound?: (round: number, bytes: number) => void;
    onDone?: (full: string, report: TitanReport) => void | Promise<void>;
  }
): ReadableStream<string> {
  const maxBytes = Math.min(o.maxBytes ?? TITAN.MAX_BYTES, TITAN.MAX_BYTES);
  const target = Math.min(o.targetBytes ?? (o.big ? TITAN.TARGET_BYTES : 0), maxBytes);
  const maxRounds = o.rounds ?? TITAN.MAX_ROUNDS;

  return new ReadableStream<string>({
    async start(controller) {
      let acc = o.seed ?? "";
      let gone = false;
      let rounds = 0;

      const put = (t: string) => {
        if (!t) return;
        acc += t;
        if (gone) return;
        try {
          controller.enqueue(t);
        } catch {
          gone = true;
        }
      };

      const drain = async (s: ReadableStream<string>, stitchFirst: boolean) => {
        const reader = s.getReader();
        let head = "";
        let headDone = !stitchFirst;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            if (!headDone) {
              head += value;
              if (head.length < 400 && !gone) continue;
              headDone = true;
              put(stitch(acc, head));
              continue;
            }
            put(value);
          }
          if (!headDone && head) put(stitch(acc, head));
        } finally {
          reader.cancel().catch(() => undefined);
        }
      };

      try {
        await drain(source, false);

        for (let r = 0; r < maxRounds; r++) {
          if (gone && !o.keepAlive) break;
          if (o.deadlineAt && Date.now() >= o.deadlineAt) break;
          const bytes = textBytes(acc);
          if (bytes >= maxBytes) break;
          const incomplete = acc.length > 80 && isCut(acc);
          const tooSmall = o.big === true && bytes < target;
          if (!incomplete && !tooSmall) break;
          rounds = r + 1;
          o.onRound?.(rounds, bytes);
          const next = await o.continueWith(acc, rounds).catch(() => null);
          if (!next) break;
          const before = acc.length;
          await drain(next, true);
          // the engine added nothing useful -> stop instead of looping for ever
          if (acc.length - before < 40) break;
        }
      } catch (e) {
        console.error("[titan] continuation failed:", e);
      }

      let repaired = false;
      if (isCut(acc)) {
        const fixed = repair(acc);
        if (fixed !== acc) {
          const added = fixed.slice(acc.length);
          acc = fixed;
          repaired = true;
          if (!gone && added) {
            try {
              controller.enqueue(added);
            } catch {
              gone = true;
            }
          }
        }
      }

      const report: TitanReport = {
        bytes: textBytes(acc),
        kb: Math.round(textBytes(acc) / 1024),
        rounds,
        integrity: integrity(acc),
        glitches: glitchScan(acc),
        repaired,
      };

      try {
        await o.onDone?.(acc, report);
      } catch {
        /* persistence must never break the stream */
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      /* keepAlive handled by the caller */
    },
  });
}

/** Prompt appended to every continuation call so segments stitch perfectly. */
export const TITAN_CONTINUE_PROMPT = `CONTINUE EXACTLY WHERE YOU STOPPED.
- Resume at the very next character. Do NOT greet, do NOT recap, do NOT repeat the last line, do NOT reopen a code fence.
- Keep every identifier, token, class, id and design decision identical to what is already written.
- Do not restart the file, do not write a second <!DOCTYPE>, do not redefine an existing function.
- Keep going until the deliverable is genuinely finished and ends with its final closing tag.`;

/** Size contract injected into MAX build prompts. */
export const TITAN_SIZE_CONTRACT = `TITAN SIZE CONTRACT (v11)
- This platform streams up to 5 MB per deliverable and continues automatically across segments: SIZE IS NOT A LIMIT.
- A "big" game or app means 5,000-20,000 real lines in ONE self-contained file. Aim for 500 KB-2 MB of working code.
- Never shorten to "fit", never summarise, never write placeholders, TODO, "rest of the code" or "same as before".
- If you approach the end of a segment, simply stop mid-line: the platform resumes you at the exact next character.
- Every segment must be directly appendable to the previous one — no preamble, no repeated lines, no new code fence.`;
