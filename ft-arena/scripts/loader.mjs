/** يحل استيرادات "@/…" والملفات بلا امتداد في اختبارات Node المباشرة. */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src") + "/";
const SCHEME = "ftsrc:";

const tryExt = (base) => {
  for (const cand of [base + ".ts", base + ".tsx", base + "/index.ts"]) {
    if (existsSync(cand)) return cand;
  }
  return null;
};

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/") || specifier.startsWith("ftsrc:")) {
    const rel = specifier.startsWith("ftsrc:") ? specifier.slice(6) : specifier.slice(2);
    const found = tryExt(SRC + rel);
    if (found) {
      const url = pathToFileURL(found).href;
      return { url, shortCircuit: true };
    }
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const base = new URL(specifier, context.parentURL).pathname;
    if (!/\.(ts|tsx|js|mjs|json)$/.test(base)) {
      const found = tryExt(base);
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
