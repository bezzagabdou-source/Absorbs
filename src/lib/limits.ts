/**
 * Nexus AI v8.5 — one place for every limit.
 * Output size (tokens) + the free-plan "time meter" (percentage, not message credits).
 */

/** MAX (build / hard tasks): the engine asks for this much in one go, then auto-continues until the answer is finished. */
export const MAX_OUTPUT_TOKENS = 64_000; // hard ceiling per request
export const MAX_TARGET_TOKENS = 50_000; // size the MAX contract demands (~180 KB of real code)
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
 * So: every request runs ~13 minutes (maxDuration = 800 in the route files), then the client chains the next
 * request automatically (continueFrom) until the answer is finished or SESSION_MAX_MS (60 min) is reached.
 */
export const REQUEST_GUARD_MS = 790_000; // release the keep-alive just before the 800 s platform limit
export const REQUEST_DEADLINE_MS = 760_000; // stop STARTING new continuation rounds after this
export const SESSION_MAX_MS = 60 * 60 * 1000; // client chain: one hour without stopping
