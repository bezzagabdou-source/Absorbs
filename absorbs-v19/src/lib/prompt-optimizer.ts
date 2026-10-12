/** Shared (server + client) definitions for the automatic prompt optimizer. */

export type OptimizeKind = "general" | "video" | "coder" | "copywriter" | "designer" | "analyst";
export const OPTIMIZE_KINDS: readonly OptimizeKind[] = ["general", "video", "coder", "copywriter", "designer", "analyst"];

export function isOptimizeKind(v: unknown): v is OptimizeKind {
  return typeof v === "string" && (OPTIMIZE_KINDS as readonly string[]).includes(v);
}

const BASE = `You rewrite a user's rough request into ONE better prompt for an AI model. Keep the user's intent and language exactly; never add facts the user did not give; never answer the request yourself. Output ONLY the improved prompt — no preface, no quotes, no markdown fences.`;

export const OPTIMIZER_SYSTEM: Record<OptimizeKind, string> = {
  general: `${BASE} Structure: goal, context, constraints, desired output format. Make vague words concrete. Keep it under 180 words.`,
  video: `${BASE} The target is a text-to-video model, so write the result in ENGLISH even if the user wrote another language. One flowing paragraph (60-110 words): subject and action, setting, camera movement and lens, lighting and mood, visual style, pace. Describe what is VISIBLE only; no on-screen text, no brand names, no real people.`,
  coder: `${BASE} Add: language/framework if implied, inputs and outputs, edge cases to handle, error handling, performance or security constraints, and ask for runnable, complete code with a short explanation of key decisions.`,
  copywriter: `${BASE} Add: audience, tone of voice, channel and length, the single action the reader should take, and 2-3 headline or hook variants to be produced.`,
  designer: `${BASE} Add: platform and screen sizes, style direction and palette, typography feel, key components and states, accessibility needs, and what the finished design must be judged on.`,
  analyst: `${BASE} Add: the business question, the data available and its columns, the metrics to compute, how to treat missing or odd values, and the charts or tables wanted, with the conclusion stated plainly at the end.`,
};
