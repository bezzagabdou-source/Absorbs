/**
 * Resolver for the APEX smoke test: plain Node ESM needs explicit extensions, while
 * the app is written with extension-less TypeScript imports ("@/lib/…" and "./x").
 * This hook maps both to the real .ts files so the test imports the exact modules
 * the serverless function uses.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src") + "/";

const candidates = (base) => [base + ".ts", base + ".tsx", base + ".mjs", base + ".js", base + "/index.ts", base + "/index.tsx"];

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = SRC + specifier.slice(2);
    for (const c of candidates(base)) if (existsSync(c)) return next(c, context);
  }
  if (specifier.startsWith(".")) {
    const parent = context.parentURL ? dirname(fileURLToPath(context.parentURL)) : process.cwd();
    const base = resolvePath(parent, specifier);
    for (const c of candidates(base)) if (existsSync(c)) return next(c, context);
  }
  return next(specifier, context);
}
