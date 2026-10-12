/**
 * Nexus AI v11 — one place for every limit.
 * Output size (tokens) + the free-plan "time meter" (percentage, not message credits).
 */

/** MAX (build / hard tasks): the engine asks for this much in one go, then auto-continues until the answer is finished. */
export const MAX_OUTPUT_TOKENS = 64_000; // hard ceiling per request
export const MAX_TARGET_TOKENS = 62_000; // size the MAX contract demands: more than 60k tokens (~230 KB of real code)

/* ------------------------------------------------------------------ *
 * v11 TITAN — a deliverable is no longer limited to one request.
 * The engine chains segments until the file is complete, up to 5 MB.
 * ------------------------------------------------------------------ */
/** Absolute ceiling for ONE deliverable, across all continuation segments. */
export const TITAN_MAX_BYTES = 5 * 1024 * 1024;
/** What a "big" build (game / app / site) should reach before TITAN stops pushing. */
export const TITAN_TARGET_BYTES = 3_000_000;
/** Continuation rounds allowed inside a single HTTP request. */
export const TITAN_MAX_ROUNDS = 120;

/* ------------------------------------------------------------------ *
 * v11 TURBO — time-to-first-token budget.
 * ------------------------------------------------------------------ */
/** Target for the first visible character. */
export const TTFT_TARGET_MS = 900;
/** Start a parallel back-up engine when the leader is still silent after this. */
export const TTFT_HEDGE_MS = 750;
/** No token at all for this long => the engine is dead, fail over. */
export const STALL_FAILOVER_MS = 18_000;
/** Silence tolerated once tokens are already flowing. */
export const MID_STALL_FAILOVER_MS = 45_000;
/** One continuation segment for MAX (keeps every request under the host time limit). */
export const MAX_SEGMENT_TOKENS = 32_000;
/** Pro everyday answers. */
export const PRO_OUTPUT_TOKENS = 24_000;
/** Free accounts: every answer may be up to 12k tokens. */
export const FREE_OUTPUT_TOKENS = 12_000;

/** Free meter: 100% = 2 hours of active use. At 0% it comes back after the reset delay. */
export const FREE_METER_MS = 2 * 60 * 60 * 1000;
export const FREE_RESET_MS = 2 * 60 * 60 * 1000;
/** Each free request costs this at start (+ the time spent since the previous request, capped, + streaming time). */
export const FREE_BASE_COST_MS = 20_000;
export const FREE_GAP_CAP_MS = 5 * 60 * 1000;

/**
 * Time budget. ONE serverless request cannot live 40-60 minutes (Vercel caps a function: Hobby 300 s, Pro 800 s).
 * So: every request runs up to its maxDuration (300 s on Hobby, 800 s on Pro), then the client chains the next
 * request automatically (continueFrom) until the answer is finished or SESSION_MAX_MS (60 min) is reached.
 */
export const REQUEST_GUARD_MS = 290_000; // release the keep-alive just before the 300 s limit (Pro/800: use 790_000)
export const REQUEST_DEADLINE_MS = 255_000; // stop STARTING new rounds after this (Pro/800: use 760_000)
export const SESSION_MAX_MS = 60 * 60 * 1000; // client chain: one hour without stopping
