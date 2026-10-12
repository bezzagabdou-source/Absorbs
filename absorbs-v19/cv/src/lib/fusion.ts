/**
 * Nexus AI v11 — FUSION: merging several engines into one answer that is better than all of them.
 *
 * The v8/v10 ensemble asked a "lead" engine to merge the drafts and hoped for the best.
 * FUSION adds measurable judgement:
 *   - every draft is scored (completeness, size, structure, glitches, language match);
 *   - a weak or broken draft is discarded BEFORE the merge so it cannot poison the result;
 *   - the merge prompt tells the lead exactly which draft is the spine and what each other draft
 *     is allowed to contribute, which removes the "two designs blended together" glitch;
 *   - if the lead fails, the best-scoring draft ships as-is (never an empty answer).
 */

import { glitchScan, integrity } from "@/lib/titan";

export type Draft = {
  engine: string;
  text: string;
  /** ms from request start to the last token */
  ms?: number;
};

export type ScoredDraft = Draft & {
  score: number;
  bytes: number;
  reasons: string[];
};

const AR_RE = /[\u0600-\u06FF]/;

function languageMatch(draft: string, userText: string): number {
  const userAr = AR_RE.test(userText);
  const draftAr = AR_RE.test(draft);
  if (userAr === draftAr) return 1;
  // a code-only answer legitimately has no Arabic
  if (userAr && !draftAr && /```/.test(draft)) return 0.75;
  return 0.35;
}

/**
 * Heuristic quality score in [0, 1]. Deliberately cheap: it runs on the server between
 * streaming rounds, so it must never cost an extra model call.
 */
export function scoreDraft(d: Draft, o: { userText: string; kind: "build" | "hard" | "chat" }): ScoredDraft {
  const text = d.text ?? "";
  const bytes = typeof Buffer !== "undefined" ? Buffer.byteLength(text, "utf8") : text.length;
  const reasons: string[] = [];
  if (!text.trim()) {
    return { ...d, score: 0, bytes: 0, reasons: ["فارغ"] };
  }

  const info = integrity(text);
  const glitches = glitchScan(text);
  let score = 0.5;

  // 1. structural completeness matters most
  if (info.ok) score += 0.22;
  else {
    score -= 0.18;
    reasons.push(`غير مكتمل: ${info.issues.slice(0, 2).join("، ")}`);
  }

  // 2. glitches
  score -= Math.min(0.25, glitches.length * 0.07);
  if (glitches.length) reasons.push(`${glitches.length} مشكلة محتملة`);

  // 3. size, relative to what the task deserves
  if (o.kind === "build") {
    const ideal = 260_000;
    score += Math.min(0.22, (bytes / ideal) * 0.22);
    if (bytes < 20_000) {
      score -= 0.2;
      reasons.push("قصير جدًا لطلب بناء");
    }
  } else if (o.kind === "hard") {
    score += Math.min(0.12, (bytes / 20_000) * 0.12);
  } else {
    // chat: long is NOT better
    if (bytes > 9_000) score -= 0.08;
  }

  // 4. structure signals
  if (/```/.test(text)) score += o.kind === "chat" ? 0 : 0.05;
  if (/^#{1,3}\s/m.test(text) || /^\s*[-*]\s/m.test(text)) score += 0.03;

  // 5. filler / refusal / placeholder penalties
  if (/\b(as an ai|I cannot|لا أستطيع|آسف،?\s*لا)\b/i.test(text.slice(0, 400))) {
    score -= 0.3;
    reasons.push("رفض أو اعتذار");
  }
  if (/\b(TODO|rest of the code|باقي الكود|same as before|\.\.\.\s*etc)\b/i.test(text)) {
    score -= 0.18;
    reasons.push("عناصر نائبة");
  }
  if (/^(sure|certainly|of course|بالتأكيد|طبعا)/i.test(text.trim())) score -= 0.05;

  // 6. language
  score *= 0.85 + 0.15 * languageMatch(text, o.userText);

  // 7. a small bonus for being fast
  if (typeof d.ms === "number" && d.ms < 4000) score += 0.02;

  return { ...d, score: Math.max(0, Math.min(1, score)), bytes, reasons };
}

export function rank(drafts: Draft[], o: { userText: string; kind: "build" | "hard" | "chat" }): ScoredDraft[] {
  return drafts
    .map((d) => scoreDraft(d, o))
    .sort((a, b) => b.score - a.score);
}

/** Drafts that are safe to feed to the merge step. */
export function keepUsable(scored: ScoredDraft[]): ScoredDraft[] {
  if (scored.length === 0) return [];
  const best = scored[0];
  return scored.filter((d, i) => i === 0 || (d.score >= 0.45 && d.score >= best.score - 0.3));
}

/**
 * Builds the merge instruction. The highest-scoring draft is the SPINE: its architecture,
 * names and design tokens survive untouched. Other drafts may only donate missing pieces.
 * This is what stops the "two different designs glued together" failure.
 */
export function fusionPrompt(
  scored: ScoredDraft[],
  o: { userText: string; kind: "build" | "hard" | "chat" }
): string {
  const usable = keepUsable(scored);
  if (usable.length === 0) return "";
  const spine = usable[0];
  const donors = usable.slice(1);

  const header = `FUSION MERGE (v11) — you are the lead engine. ${usable.length} independent drafts answered the same request. Produce ONE final answer that is strictly better than every draft.

RULES
1. DRAFT A is the SPINE. Keep its architecture, file structure, naming, design tokens and visual language EXACTLY. Never blend two design languages, never mix two engines' variable names.
2. The other drafts are DONORS. Take from them only: missing features, missing content, better algorithms, fixed bugs, extra levels/sections/data — and rewrite each borrowed piece in the spine's style and naming.
3. Fix every bug you can see in the spine (undefined names, unclosed tags, inconsistent ids, broken logic). The final answer must run on the first try with zero console errors.
4. Output the FINAL deliverable only — no comparison, no commentary, no "I merged…". ${
    o.kind === "build"
      ? "One self-contained file in a single code block, complete to its final closing tag."
      : "Same format the drafts used."
  }
5. The result must be LONGER and richer than the spine, never shorter.

USER REQUEST
${o.userText.slice(0, 4000)}
`;

  const body = [spine, ...donors]
    .map((d, i) => {
      const label = String.fromCharCode(65 + i);
      const role = i === 0 ? "SPINE" : "DONOR";
      const note = d.reasons.length ? ` — known weaknesses: ${d.reasons.join("، ")}` : "";
      return `

===== DRAFT ${label} (${role} · ${d.engine} · ${Math.round(d.bytes / 1024)} KB · score ${d.score.toFixed(2)})${note} =====
${d.text}`;
    })
    .join("");

  return header + body;
}

/** When the merge fails we still have a winner. */
export function bestOf(drafts: Draft[], o: { userText: string; kind: "build" | "hard" | "chat" }): Draft | null {
  const r = rank(drafts, o);
  return r.length ? r[0] : null;
}

/** Human summary for the `x-fusion` response header / debug panel. */
export function fusionSummary(scored: ScoredDraft[]): string {
  return scored.map((d) => `${d.engine}:${d.score.toFixed(2)}@${Math.round(d.bytes / 1024)}k`).join(" ");
}
