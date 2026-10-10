/**
 * VERIFY -> SURGICAL REPAIR for generated single-file HTML builds.
 *
 * After the model finishes a game / app, the file is really checked (lib/html-verify.ts). If it has
 * hard errors, the model is asked for a few tiny {find, replace} edits (NOT a rewrite of 200 KB),
 * the edits are applied only when `find` matches exactly once, and the result is re-verified.
 * A repair is kept only if it strictly reduces the number of hard errors, so it can never make a build worse.
 */
import { findHtmlBlock, hardErrors, verifyHtml, type Issue } from "@/lib/html-verify";
import { assertPublic } from "@/lib/link-reader";
import { HEARTBEAT } from "@/lib/turbo";
import { REPLACE_MARK } from "@/lib/stream-marks";

export type AskModel = (system: string, prompt: string) => Promise<string>;

const REPAIR_SYSTEM = `You are a surgical JavaScript / HTML repair engine. A generated single-file game or app FAILED automatic verification. You get the exact errors with numbered source lines.
Return ONLY one JSON object, no prose, no code fence:
{"edits":[{"find":"...","replace":"..."}]}
RULES
- At most 10 edits. Each "find" is copied CHARACTER-FOR-CHARACTER from the numbered lines shown (without the "NN| " prefix), 20-400 characters, long enough to appear exactly ONCE in the file. Multi-line "find" is allowed (use \\n).
- Fix the ROOT CAUSE of each error with the smallest possible change: close the missing brace / parenthesis, remove the duplicate declaration, define the missing function, add the missing element or id, or guard the null access. Never remove features, never rename things used elsewhere, never add external resources (the ONLY allowed addition: the plain <script src=\"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js\"> tag in <head> when THREE is used but not loaded).
- A syntax error often hides further down: fix the reported line first and keep every other line intact.
- If an error cannot be fixed safely, skip it (return fewer edits).`;

export async function readAll(stream: ReadableStream<string>): Promise<string> {
  const r = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out += value;
  }
  return out;
}

/* ---------- remote script / stylesheet URLs: a hallucinated CDN path is a classic "black screen" ---------- */

const TRUSTED_URL = /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js$/;
const urlCache = new Map<string, Promise<boolean>>();
export type UrlProbe = (url: string) => Promise<boolean>;

/** true when the URL answers 2xx (GET, small timeout). Network errors count as "unknown" = true, never a false alarm. */
export const probeUrl: UrlProbe = (url) => {
  let hit = urlCache.get(url);
  if (!hit) {
    hit = (async () => {
      try {
        await assertPublic(new URL(url));
        const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000), headers: { Range: "bytes=0-256", "User-Agent": "NexusVerify/1.0" } });
        void r.body?.cancel().catch(() => undefined);
        return r.status < 400 || r.status === 416;
      } catch {
        return true;
      }
    })();
    urlCache.set(url, hit);
    if (urlCache.size > 300) urlCache.clear();
  }
  return hit;
};

/** Errors for <script src> / stylesheet / NexusNet.script URLs that do not exist (checked in parallel, max 8). */
export async function remoteIssues(code: string, probe: UrlProbe = probeUrl): Promise<Issue[]> {
  const urls = new Set<string>();
  for (const m of code.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](https:\/\/[^"']+)["']/gi)) urls.add(m[1]);
  for (const m of code.matchAll(/<link\b[^>]*\bhref\s*=\s*["'](https:\/\/[^"']+\.css[^"']*)["']/gi)) urls.add(m[1]);
  for (const m of code.matchAll(/NexusNet\.script\(\s*["'](https:\/\/[^"']+)["']/g)) urls.add(m[1]);
  const list = [...urls].filter((u) => !TRUSTED_URL.test(u)).slice(0, 8);
  const res = await Promise.all(list.map(async (u) => ({ u, ok: await probe(u) })));
  return res
    .filter((r) => !r.ok)
    .map((r) => {
      const all = code.split("\n");
      const line = all.findIndex((l) => l.includes(r.u)) + 1;
      return {
        level: "error" as const,
        message: `The URL ${r.u} does not exist (404). Replace it with a REAL pinned file (e.g. https://cdnjs.cloudflare.com/ajax/libs/<lib>/<exact-version>/<file>) or remove the dependency and use the built-in fallback.`,
        line: line || undefined,
        context: line ? all.slice(Math.max(0, line - 3), line + 2).map((l, i) => `${Math.max(0, line - 3) + i + 1}| ${l.slice(0, 220)}`).join("\n") : undefined,
      };
    });
}

function repairPrompt(issues: Issue[], code: string): string {
  const ids = [...code.matchAll(/\bid\s*=\s*["']([\w-]+)["']/g)].map((m) => m[1]);
  const uniq = [...new Set(ids)].slice(0, 80);
  const list = issues
    .slice(0, 6)
    .map((i, n) => `ERROR ${n + 1}${i.line ? ` (line ${i.line})` : ""}: ${i.message}${i.context ? `\n${i.context.slice(0, 2600)}` : ""}`)
    .join("\n\n");
  return `${list}\n\nIDS THAT EXIST IN THE PAGE: ${uniq.join(", ") || "(none)"}\n\nReturn the JSON edits now.`;
}

/** Applies edits whose `find` occurs exactly once. Returns the new code and how many were applied. */
export function applyEdits(code: string, edits: { find: unknown; replace: unknown }[]): { code: string; applied: number } {
  let out = code;
  let applied = 0;
  for (const e of edits.slice(0, 10)) {
    if (typeof e?.find !== "string" || typeof e?.replace !== "string") continue;
    const f = e.find;
    if (f.length < 8 || f.length > 2000) continue;
    const first = out.indexOf(f);
    if (first < 0 || out.indexOf(f, first + 1) >= 0) continue; // missing or ambiguous: skip, never guess
    out = out.slice(0, first) + e.replace + out.slice(first + f.length);
    applied++;
  }
  return { code: out, applied };
}

function parseEdits(raw: string): { find: unknown; replace: unknown }[] {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) return [];
  try {
    const o = JSON.parse(raw.slice(a, b + 1)) as { edits?: unknown };
    return Array.isArray(o.edits) ? (o.edits as { find: unknown; replace: unknown }[]) : [];
  } catch {
    return [];
  }
}

/**
 * Returns the answer text with a repaired html block, or null when nothing needed (or nothing could be) fixed.
 */
export async function repairBuild(
  text: string,
  ask: AskModel,
  o: { rounds?: number; deadlineAt?: number; probe?: UrlProbe } = {}
): Promise<{ text: string; before: number; after: number } | null> {
  const block = findHtmlBlock(text);
  if (!block) return null;
  let code = block.code;
  const check = async (c: string): Promise<Issue[]> => [...verifyHtml(c), ...(await remoteIssues(c, o.probe ?? probeUrl).catch(() => []))];
  let issues = await check(code);
  const before = hardErrors(issues).length;
  if (before === 0) return null;

  let errs = before;
  for (let round = 0; round < (o.rounds ?? 2); round++) {
    if (o.deadlineAt && Date.now() >= o.deadlineAt) break;
    let raw = "";
    try {
      raw = await ask(REPAIR_SYSTEM, repairPrompt(hardErrors(issues), code));
    } catch {
      break;
    }
    const { code: next, applied } = applyEdits(code, parseEdits(raw));
    if (applied === 0) break;
    const nextIssues = await check(next);
    const nextErrs = hardErrors(nextIssues).length;
    if (nextErrs >= errs) break; // never trade one problem for another
    code = next;
    issues = nextIssues;
    errs = nextErrs;
    if (errs === 0) break;
  }
  if (code === block.code) return null;
  return { text: text.slice(0, block.start) + code + text.slice(block.end), before, after: errs };
}

/**
 * Passes the build through untouched, then (still inside the same response) verifies it and, if needed,
 * emits REPLACE_MARK + the repaired answer. Heartbeats keep the connection alive while the repair runs.
 */
export function withVerify(
  source: ReadableStream<string>,
  o: {
    ask: AskModel;
    deadlineAt?: number;
    onResult?: (r: { checked: boolean; before: number; after: number }) => void;
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
          acc += value.split(HEARTBEAT).join("");
          enq(value);
        }
      } catch {
        /* the source died: verify what we have */
      }

      let final = acc;
      const beat = setInterval(() => enq(HEARTBEAT), 4000);
      try {
        const fixed = await repairBuild(acc, o.ask, { deadlineAt: o.deadlineAt });
        if (fixed) {
          final = fixed.text;
          enq(REPLACE_MARK + fixed.text);
          o.onResult?.({ checked: true, before: fixed.before, after: fixed.after });
        } else {
          o.onResult?.({ checked: true, before: 0, after: 0 });
        }
      } catch (e) {
        console.warn("[verify] skipped:", e instanceof Error ? e.message : String(e));
      } finally {
        clearInterval(beat);
      }
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
