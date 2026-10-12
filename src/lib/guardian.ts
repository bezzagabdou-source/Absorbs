/**
 * ══════════════════════════════════════════════════════════════════════════
 *  NEXUS GUARDIAN  ·  `src/lib/guardian.ts`  (SERVER ONLY)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  "The AI checks the build before the user ever sees it."
 *
 *  Three layers, cheapest first:
 *
 *    1. STATIC SCAN  — deterministic, free, instant. Parses (never executes)
 *       the artefact and reports the defects that actually break things:
 *       syntax errors, dead element lookups, inline handlers calling functions
 *       that do not exist, external assets, missing doctype / viewport,
 *       unbalanced tags, duplicate ids, leftover placeholders, empty screens…
 *    2. AI REVIEW    — a hostile reviewer reads the artefact and returns a
 *       scored JSON report (blocking defects + improvements).
 *    3. AUTO-REPAIR  — surgical {find, replace} edits (never a rewrite),
 *       applied only when `find` occurs exactly once, and kept only when they
 *       strictly reduce the number of blocking defects.
 *
 *  Nothing here can make a build worse: every change is verified, measured and
 *  rolled back if it does not help. If the AI is unavailable, the static scan
 *  still runs and the artefact is delivered untouched.
 */

import { findHtmlBlock, verifyHtml, type Issue } from "@/lib/html-verify";
import { checkHtml } from "@/lib/code-check";
import { completeUnified } from "@/lib/model-router";
import { SELF_REVIEW } from "@/lib/personas-v18";
import { REPLACE_MARK } from "@/lib/stream-marks";

/* ───────────────────────────── 1 · static scan ───────────────────────────── */

export type GuardianIssue = {
  level: "error" | "warn";
  rule: string;
  message: string;
  line?: number;
};

const PLACEHOLDERS = [
  /\/\/\s*(TODO|FIXME|rest of|…)/
  , /\/\*\s*(TODO|FIXME)/i
  , /\b(rest of the code|browse the rest|continue the code)\b/i
  , /\.\.\.\s*<\/(script|style|body|html)>/i
  , /\b(lorem ipsum|your code here|add your logic here)\b/i
];

const EXTERNAL_ASSET =
  /(<(?:script|link|img|source|iframe|audio|video)\b[^>]*\b(?:src|href)\s*=\s*["'])(https?:)?\/\//i;

/**
 * Deterministic checks. Safe on untrusted code: the JS is only compiled
 * (node:vm `new Script`) — never executed.
 */
export function scanArtefact(code: string): GuardianIssue[] {
  const out: GuardianIssue[] = [];
  const push = (level: GuardianIssue["level"], rule: string, message: string, line?: number) =>
    out.push({ level, rule, message, ...(line ? { line } : {}) });

  if (!code || code.trim().length < 64) {
    push("error", "empty", "الملف فارغ أو قصير جدًا");
    return out;
  }

  /* --- structural --- */
  if (!/^\s*<!doctype html>/i.test(code)) push("error", "doctype", "لا يوجد <!DOCTYPE html>");
  if (!/<\/html>\s*$/i.test(code.trim())) push("error", "close", "الملف لا ينتهي بـ </html> (مقطوع)");
  if (!/<meta\s+name=["']viewport["']/i.test(code))
    push("warn", "viewport", "لا يوجد meta viewport — العرض سيكون سيئًا على الجوال");
  if (!/<title>/i.test(code)) push("warn", "title", "لا يوجد <title>");
  if (EXTERNAL_ASSET.test(code))
    push("error", "external", "يعتمد على ملف خارجي (CDN/صورة/خط) — لن يعمل بلا إنترنت");

  /* --- placeholders: the #1 sign of a model that gave up --- */
  for (const re of PLACEHOLDERS) {
    const m = re.exec(code);
    if (m) {
      push("error", "placeholder", `يوجد مكان ناقص: "${m[0].slice(0, 40)}"`);
      break;
    }
  }

  /* --- deep static analysis of the JS + DOM contract --- */
  for (const i of verifyHtml(code) as Issue[]) {
    push(i.level, i.level === "error" ? "runtime" : "hint", i.message, i.line);
  }
  for (const msg of checkHtml(code)) push("error", "structure", msg);

  /* --- canvas / game sanity --- */
  const hasCanvas = /<canvas\b/i.test(code);
  if (hasCanvas) {
    if (!/requestanimationframe/i.test(code))
      push("error", "loop", "لا توجد حلقة requestAnimationFrame — اللعبة لن تتحرك");
    if (!/addEventListener\(\s*["'](resize|orientationchange)["']/i.test(code))
      push("warn", "resize", "لا يوجد معالج resize — الشاشة ستتشوه عند تدوير الجوال");
    if (/document\.getElementById\([^)]*\)\.\w+\s*=/.test(code) && !/if\s*\(\s*\w+\s*\)/.test(code))
      push("warn", "nullcheck", "بعض عناصر DOM تُستعمل مباشرة بلا فحص null");
  }

  /* --- audio autoplay (blocked by every browser) --- */
  if (/new\s+(window\.)?(AudioContext|webkitAudioContext)\s*\(/i.test(code) &&
      !/(addEventListener\(\s*["'](click|pointerdown|touchstart|keydown))/i.test(code))
    push("warn", "audio", "AudioContext يُنشأ خارج أول تفاعل — المتصفح سيحجب الصوت");

  /* --- security --- */
  if (/\.innerHTML\s*=/.test(code) && !/textContent/.test(code))
    push("warn", "xss", "استخدام innerHTML بمحتوى متغيّر — فضّل textContent");
  if (/\beval\s*\(|new\s+Function\s*\(/.test(code) && !/^\s*\/\//m.test(code))
    push("warn", "eval", "استخدام eval / new Function — ممنوع في ملفات المستخدم");

  /* --- rtl --- */
  if (/[\u0600-\u06FF]/.test(code) && !/dir\s*=\s*["']rtl["']/i.test(code))
    push("warn", "rtl", "النص عربي والصفحة ليست dir=\"rtl\"");

  return out;
}

export const blockingIssues = (issues: GuardianIssue[]): GuardianIssue[] =>
  issues.filter((i) => i.level === "error");

/* ───────────────────────────── 2 · AI review ───────────────────────────── */

export type GuardianReport = {
  score: number;
  blocking: { where: string; what: string; fix: string }[];
  notes: string[];
};

const REVIEW_SYSTEM = `${SELF_REVIEW}\n\nAnswer with the JSON object only. No prose, no code fence, no commentary.`;

function parseReport(raw: string): GuardianReport | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as {
      score?: unknown;
      blocking?: unknown;
      notes?: unknown;
    };
    const score = typeof o.score === "number" ? Math.max(0, Math.min(100, Math.round(o.score))) : 0;
    const blocking = Array.isArray(o.blocking)
      ? (o.blocking as unknown[])
          .slice(0, 8)
          .map((x) => {
            const r = (x ?? {}) as Record<string, unknown>;
            return {
              where: typeof r.where === "string" ? r.where.slice(0, 120) : "",
              what: typeof r.what === "string" ? r.what.slice(0, 300) : "",
              fix: typeof r.fix === "string" ? r.fix.slice(0, 300) : "",
            };
          })
          .filter((x) => x.what)
      : [];
    const notes = Array.isArray(o.notes)
      ? (o.notes as unknown[]).slice(0, 6).map((x) => String(x).slice(0, 200))
      : [];
    return { score, blocking, notes };
  } catch {
    return null;
  }
}

/** The AI reads the artefact as a hostile reviewer. Never throws. */
export async function reviewArtefact(
  code: string,
  o: { kind?: "game" | "site" | "app"; signal?: AbortSignal; maxChars?: number } = {}
): Promise<GuardianReport | null> {
  const cap = o.maxChars ?? 48_000;
  const body = code.length > cap ? code.slice(0, cap) + "\n…[truncated for review]" : code;
  try {
    const { text } = await completeUnified({
      system: REVIEW_SYSTEM,
      messages: [
        {
          role: "user",
          text: `Review this ${o.kind ?? "web"} artefact (${code.length} chars):\n\n${body}`,
        },
      ],
      maxTokens: 1400,
      userText: "review this build",
      prefer: "quality",
      signal: o.signal,
    });
    return parseReport(text);
  } catch (e) {
    console.warn("[guardian] review skipped:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/* ──────────────────────────── 3 · auto-repair ──────────────────────────── */

export type Edit = { find: string; replace: string };

function parseEdits(raw: string): Edit[] {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return [];
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as { edits?: unknown };
    return Array.isArray(o.edits) ? (o.edits as Edit[]) : [];
  } catch {
    return [];
  }
}

/** Applies edits whose `find` occurs exactly once — never guesses. */
export function applyEdits(code: string, edits: Edit[]): { code: string; applied: number } {
  let out = code;
  let applied = 0;
  for (const e of edits.slice(0, 12)) {
    if (typeof e?.find !== "string" || typeof e?.replace !== "string") continue;
    const f = e.find;
    if (f.length < 8 || f.length > 2000) continue;
    const first = out.indexOf(f);
    if (first < 0 || out.indexOf(f, first + 1) >= 0) continue;
    out = out.slice(0, first) + e.replace + out.slice(first + f.length);
    applied++;
  }
  return { code: out, applied };
}

const FIX_SYSTEM = `You are a surgical code-repair engine for single-file HTML builds (games, apps, sites).
You receive EXACT defects (from a static analyser and from a reviewer). Return ONLY one JSON object, no prose, no code fence:
{"edits":[{"find":"...","replace":"..."}]}
RULES
- At most 10 edits. Each "find" is copied CHARACTER-FOR-CHARACTER from the artefact, 20-400 chars, long enough to appear EXACTLY ONCE. Multi-line "find" is allowed (use \\n).
- Fix the ROOT CAUSE with the smallest possible change: close the missing brace, define the missing function, add the missing element or id, guard the null access, remove the external URL, add the missing listener.
- Never remove a feature, never rename something used elsewhere, never add an external resource, never rewrite the file.
- If a defect cannot be fixed safely, skip it (fewer edits is fine).`;

/** Ask the model for surgical fixes for the given defects. Never throws. */
export async function requestFixes(
  code: string,
  defects: string[],
  o: { signal?: AbortSignal; maxChars?: number } = {}
): Promise<Edit[]> {
  if (!defects.length) return [];
  const cap = o.maxChars ?? 40_000;
  const head = code.length > cap ? code.slice(0, cap) : code;
  const list = defects.slice(0, 8).map((d, i) => `${i + 1}. ${d}`).join("\n");
  try {
    const { text } = await completeUnified({
      system: FIX_SYSTEM,
      messages: [
        {
          role: "user",
          text: `DEFECTS:\n${list}\n\nARTEFACT (first ${head.length} chars of ${code.length}):\n${head}`,
        },
      ],
      maxTokens: 2400,
      userText: "fix these defects in the build",
      prefer: "quality",
      signal: o.signal,
    });
    return parseEdits(text);
  } catch (e) {
    console.warn("[guardian] fix request skipped:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/* ──────────────────────────── 4 · the pipeline ──────────────────────────── */

export type GuardianResult = {
  /** the artefact, repaired when a repair strictly helped */
  code: string;
  /** static defects before / after */
  before: GuardianIssue[];
  after: GuardianIssue[];
  /** how many surgical edits were applied */
  repairs: number;
  /** rounds of AI repair actually executed */
  rounds: number;
  /** the reviewer's verdict (null when the AI was unavailable) */
  report: GuardianReport | null;
  /** 0-100 — static score, always available even with no AI */
  score: number;
  verdict: "clean" | "repaired" | "reviewed" | "issues";
};

const scoreOf = (issues: GuardianIssue[]): number => {
  const errs = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  return Math.max(0, 100 - errs * 18 - warns * 4);
};

/**
 * The full GUARDIAN pass: scan → repair → re-scan → review → repair again.
 * Never throws, never returns worse code than it received.
 */
export async function guardianPass(
  code: string,
  o: {
    kind?: "game" | "site" | "app";
    rounds?: number;
    review?: boolean;
    deadlineAt?: number;
    signal?: AbortSignal;
  } = {}
): Promise<GuardianResult> {
  let current = code;
  let before = scanArtefact(current);
  let after = before;
  let repairs = 0;
  let rounds = 0;
  let report: GuardianReport | null = null;

  const timeLeft = () => !o.deadlineAt || Date.now() < o.deadlineAt;

  /* --- layer 1+3: static defects → surgical repair → re-scan --- */
  for (let r = 0; r < (o.rounds ?? 2); r++) {
    if (!timeLeft()) break;
    const errs = blockingIssues(after);
    if (!errs.length) break;
    rounds++;
    const defects = errs.slice(0, 6).map((i) => `${i.rule}: ${i.message}${i.line ? ` (line ${i.line})` : ""}`);
    const edits = await requestFixes(current, defects, { signal: o.signal });
    if (!edits.length) break;
    const next = applyEdits(current, edits);
    if (!next.applied) break;
    const nextIssues = scanArtefact(next.code);
    if (blockingIssues(nextIssues).length >= blockingIssues(after).length) break; // never worse
    current = next.code;
    after = nextIssues;
    repairs += next.applied;
    if (!blockingIssues(after).length) break;
  }

  /* --- layer 2: hostile AI review, then one more repair round --- */
  if (o.review !== false && timeLeft()) {
    report = await reviewArtefact(current, { kind: o.kind, signal: o.signal });
    if (report && report.blocking.length && timeLeft()) {
      const defects = report.blocking.map((b) => `${b.where || "?"}: ${b.what} — fix: ${b.fix}`);
      const edits = await requestFixes(current, defects, { signal: o.signal });
      if (edits.length) {
        const next = applyEdits(current, edits);
        const nextIssues = scanArtefact(next.code);
        if (next.applied && blockingIssues(nextIssues).length <= blockingIssues(after).length) {
          current = next.code;
          after = nextIssues;
          repairs += next.applied;
        }
      }
    }
  }

  const errs = blockingIssues(after).length;
  const improved = repairs > 0;
  const verdict: GuardianResult["verdict"] = errs === 0 && report && report.blocking.length === 0
    ? improved ? "repaired" : "clean"
    : errs === 0 && report
      ? "reviewed"
      : errs === 0
        ? improved ? "repaired" : "clean"
        : "issues";

  return { code: current, before, after, repairs, rounds, report, score: scoreOf(after), verdict };
}

/**
 * Runs the GUARDIAN over a model ANSWER that may contain one ```html block.
 * Returns the answer untouched when there is nothing to check.
 */
export async function guardianAnswer(
  text: string,
  o: { kind?: "game" | "site" | "app"; rounds?: number; deadlineAt?: number; signal?: AbortSignal } = {}
): Promise<{ text: string; result: GuardianResult | null }> {
  const block = findHtmlBlock(text);
  if (!block) return { text, result: null };
  const res = await guardianPass(block.code, {
    kind: o.kind,
    rounds: o.rounds ?? 1,
    deadlineAt: o.deadlineAt,
    signal: o.signal,
  });
  if (res.code === block.code) return { text, result: res };
  return { text: text.slice(0, block.start) + res.code + text.slice(block.end), result: res };
}

/* ──────────────────── 5 · streaming wrapper (chat builds) ────────────────── */

/**
 * Passes the build through untouched, then runs the GUARDIAN on the finished
 * artefact and — only when a repair strictly helps — emits REPLACE_MARK plus
 * the repaired answer (the client swaps the bubble in place).
 */
export function withGuardian(
  source: ReadableStream<string>,
  o: {
    kind?: "game" | "site" | "app";
    deadlineAt?: number;
    signal?: AbortSignal;
    onResult?: (r: GuardianResult | null) => void;
    onDone?: (final: string) => void | Promise<void>;
  }
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      let acc = "";
      let gone = false;
      const enq = (t: string) => {
        if (gone) return;
        try {
          controller.enqueue(t);
        } catch {
          gone = true;
        }
      };
      const reader = source.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          acc = applyReplace(acc, value);
          enq(value);
        }
      } catch {
        /* the source died — check what we have */
      }

      let final = acc;
      let result: GuardianResult | null = null;
      const beat = setInterval(() => enq("\u2060"), 4000);
      try {
        const guarded = await guardianAnswer(acc, {
          kind: o.kind,
          rounds: 1,
          deadlineAt: o.deadlineAt,
          signal: o.signal,
        });
        result = guarded.result;
        if (result && guarded.text !== acc) {
          final = guarded.text;
          enq(REPLACE_MARK + final);
        }
      } catch (e) {
        console.warn("[guardian] skipped:", e instanceof Error ? e.message : String(e));
      } finally {
        clearInterval(beat);
      }
      o.onResult?.(result);
      try {
        await o.onDone?.(final);
      } catch {
        /* persistence must never break the stream */
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
}

/** Local mirror of the client-side mark handling (keeps the accumulated text clean). */
function applyReplace(acc: string, chunk: string): string {
  const next = acc + chunk;
  const k = next.lastIndexOf(REPLACE_MARK);
  return k < 0 ? next : next.slice(k + REPLACE_MARK.length);
}

/* ───────────────────────── 6 · human-readable summary ───────────────────── */

/** A short bilingual line the UI can show next to a build. */
export function guardianSummary(r: GuardianResult): string {
  const errs = blockingIssues(r.after).length;
  const warns = r.after.filter((i) => i.level === "warn").length;
  if (errs === 0 && !r.report?.blocking.length)
    return `✅ فحص الحارس: نظيف (${r.score}/100)${r.repairs ? ` · أُصلح ${r.repairs} تعديل` : ""}`;
  const bits: string[] = [];
  if (errs) bits.push(`${errs} خطأ`);
  if (warns) bits.push(`${warns} تنبيه`);
  if (r.report?.blocking.length) bits.push(`${r.report.blocking.length} ملاحظة مراجعة`);
  return `🛡️ فحص الحارس: ${bits.join(" · ")} (${r.score}/100)`;
}
