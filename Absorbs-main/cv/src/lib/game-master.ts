import { MOBILE_GAME_CONTRACT } from "@/lib/mobile-game";

/**
 * Nexus AI v16/v21 — GAME MASTER
 * =============================================================================
 * The strict production contract that ends "ضعيفة جدا" (weak) games and "black
 * box" crashes forever. It is injected into the system prompt of EVERY
 * single-file game build so the model writes like a staff game-engine
 * engineer at a top studio, not a demo coder.
 *
 * Pure string constants — no imports, isomorphic.
 */

/** Cheap, broad detector: ANY request whose answer should be a playable game. */
export function isAnyGameRequest(text: string): boolean {
  const t = text || "";
  return (
    /لعبة|العاب|لعبه|ألعاب|ألعب|اللعب|game\b|games\b|jeu\b|jeux\b/i.test(t) &&
    !/لعبة كلمات|معنى لعبة|شرح لعبة|تعريف لعبة/.test(t)
  );
}

/**
 * v21: the binding build contract for every playable game is now the MOBILE GAME
 * CONTRACT (phone-first, request-faithful, compact, internet-capable, zero-crash).
 * The old v16 text demanded "ZERO network" and commercial-size games; that made
 * games slow to generate, fragile, and unable to use online assets.
 */
export const GAME_MASTER = MOBILE_GAME_CONTRACT;
