/**
 * "Studio" mode for websites / web apps: instead of every engine writing a full
 * draft and one of them blending the results, each engine plays ONE role:
 *
 *   🎨 Art director  → design system, layout, motion, logo idea
 *   ✍️ Copywriter    → every real text + data item, in the user's language/dialect
 *   🧱 Architect     → structure, data model, interactions, edge cases, 360px plan
 *   🛠️ Lead builder  → writes the final single-file site following the 3 briefs
 *
 * Roles go to the engine best suited for them; with fewer engines the same engine
 * simply plays several roles. Games keep the classic draft-and-merge team.
 */
import type { EngineName } from "@/lib/task-router";
import { SITE_SPEC } from "@/lib/prompts";

export type RoleId = "director" | "writer" | "architect";

type Role = {
  id: RoleId;
  emoji: string;
  labelAr: string;
  /** engines best → worst for this job */
  prefs: EngineName[];
  brief: string;
};

const BRIEF_COMMON = `You are one specialist in a small studio that is about to build ONE website / web app as a single HTML file. You do NOT write the final site and you do NOT output a full HTML page. Write a sharp, concrete BRIEF (Markdown, max ~700 words) that the lead builder will follow exactly. Be specific (real values, real names), never generic. Answer in English for structure but keep every piece of user-facing text in the user's own language / dialect.`;

export const ROLES: Role[] = [
  {
    id: "architect",
    emoji: "🧱",
    labelAr: "المهندس",
    prefs: ["deepseek", "huggingface", "claude", "gemini", "openrouter", "grok", "groq"],
    brief: `${BRIEF_COMMON}

YOUR ROLE: SOFTWARE ARCHITECT. Deliver:
1. Sitemap: the exact sections / screens / tabs, in order, and what each one does.
2. Component list and the HTML skeleton outline (landmarks, ids, classes).
3. Data model: the JS objects/arrays that drive the UI (field names + 3 sample rows), localStorage keys (always inside try/catch).
4. Every interaction as a rule: trigger → state change → UI result (search, filters, tabs, modals, forms + validation, theme/language toggle...). Include the 3 trickiest algorithms or state transitions in short pseudo-code.
5. Mobile plan at 360px / 768px / 1280px: nav pattern (labels never clipped), grids, what stacks or scrolls.
6. Edge cases, empty/error/loading states, accessibility (focus, aria), and the 5 mistakes most likely to break this exact page.`,
  },
  {
    id: "director",
    emoji: "🎨",
    labelAr: "المصمم",
    prefs: ["grok", "gemini", "claude", "huggingface", "deepseek", "openrouter", "groq"],
    brief: `${BRIEF_COMMON}

YOUR ROLE: ART DIRECTOR. Follow this design standard:
${SITE_SPEC}

Deliver:
1. Aesthetic direction: a name + 2 sentences on why it fits THIS subject and audience (do not default to dark + neon green + glass).
2. A ready-to-paste :root token block (colours with hex, radius, shadows, spacing scale) and a light/dark plan.
3. Typography: system font stacks, the type scale with clamp() values, Arabic line-height rules if RTL.
4. Layout per section: the hero composition, grid rhythm, card anatomy, whitespace and alignment decisions.
5. A signature visual idea built only from CSS / inline SVG (pattern, gradient mesh, illustration, big type) and the logo mark as an SVG description.
6. Motion plan (3-5 specific micro-interactions, respecting reduced motion) and a short DO / DON'T list.`,
  },
  {
    id: "writer",
    emoji: "✍️",
    labelAr: "الكاتب",
    prefs: ["gemini", "claude", "grok", "huggingface", "openrouter", "deepseek", "groq"],
    brief: `${BRIEF_COMMON}

YOUR ROLE: COPYWRITER & CONTENT EDITOR (native-level in the user's language and dialect; for Arabic use clear Modern Standard Arabic unless the user clearly wants Darija). Deliver the FINAL TEXT, ready to paste:
1. Site name, tagline, meta description, nav labels (each ≤ 8 characters).
2. Hero: headline, sub-headline, primary + secondary button text.
3. Every section: title, short intro, and all items with REAL specific content (names, descriptions, numbers, prices in the right currency). Minimum 8 real data items wherever a list or grid exists. Never lorem ipsum, never "Item 1".
4. Microcopy: empty states, error messages, form labels/placeholders, success messages, button labels, footer text.
5. Tone: 3 adjectives and one example sentence. Religious, medical or factual claims must be accurate and sourced from well-known material only.`,
  },
];

/** A website / web app / landing page / dashboard request (not a game, bot or script). */
export function isSiteRequest(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 12) return false;
  if (/(لعب[ةه]|العاب|ألعاب|\bgames?\b)/i.test(t)) return false;
  return /(موقع|مواقع|\bsites?\b|website|web ?app|landing|صفح[ةه] (هبوط|ويب|رئيسي)|متجر|\bstore\b|portfolio|معرض أعمال|dashboard|لوح[ةه] (تحكم|قيادة)|تطبيق ويب|\bapp\b|تطبيق|html)/i.test(t);
}

export type RolePlan = { role: Role; engine: string };

/** Gives every role the best engine that is available; engines are reused only when there are fewer than 3. */
export function assignRoles(available: string[]): RolePlan[] {
  const used = new Set<string>();
  return ROLES.map((role) => {
    const fresh = role.prefs.find((e) => available.includes(e) && !used.has(e));
    const any = role.prefs.find((e) => available.includes(e)) ?? available[0];
    const engine = fresh ?? any;
    used.add(engine);
    return { role, engine };
  }).filter((p) => Boolean(p.engine));
}

/** System text for the lead builder once the briefs are in. */
export const STUDIO_LEAD_RULES = `

You are the LEAD BUILDER of a small studio. Below the request you will find three specialist briefs (art director, copywriter, architect). Build the FINAL website now:
- FOLLOW THE ART DIRECTOR exactly: use their :root tokens, palette, type scale, layout rhythm, signature visual and motion plan. Keep ONE visual language.
- USE THE COPYWRITER'S TEXT verbatim (names, nav labels, headlines, data items, microcopy). Never replace it with placeholder text.
- IMPLEMENT THE ARCHITECT'S structure, data model and interaction rules; avoid the pitfalls they list.
- If briefs conflict, working code and usability win. If a brief is missing or weak, use your own best judgement. If the conversation already contains a site, keep every existing feature and apply only the requested changes.
- Before you answer, silently run the FINAL CHECK of the design spec (360px clipping, empty icons/logo, dead buttons, scrolling, closed tags).
- ONE complete self-contained HTML file, inline <style> and <script>, no external network, no placeholders, never cut off.
- Never mention the briefs, the studio or this process.
OUTPUT FORMAT: return ONLY the raw HTML inside a single \`\`\`html fenced block. No text before it, no text after it.`;

export function packBriefs(parts: { role: RoleId; who: string; text: string }[]): string {
  const title: Record<RoleId, string> = {
    director: "ART DIRECTOR BRIEF",
    writer: "COPYWRITER BRIEF (final text)",
    architect: "ARCHITECT BRIEF",
  };
  return parts
    .map((p) => `### ${title[p.role]}\n\n${p.text.slice(0, 14_000)}`)
    .join("\n\n---\n\n");
}
