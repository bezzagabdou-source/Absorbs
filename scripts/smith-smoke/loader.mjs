/**
 * Resolves the "@/…" alias for plain Node, so the smoke test can import the real
 * factory modules (compose.ts, blueprints.ts) exactly as the app does.
 * Used through register.mjs — see scripts/smith-smoke/run.mjs.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src") + "/";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = SRC + specifier.slice(2);
    for (const cand of [base + ".ts", base + ".tsx", base + "/index.ts"]) {
      if (existsSync(cand)) return next(cand, context);
    }
  }
  return next(specifier, context);
}
