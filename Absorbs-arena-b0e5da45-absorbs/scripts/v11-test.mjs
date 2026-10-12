/** Builds the v11 engines to plain ESM, then runs the self test. */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".v11-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const libs = ["titan", "turbo", "fusion", "arabic-vision", "design-canvas"]
  .map((n) => `src/lib/${n}.ts`)
  .join(" ");

execSync(
  `npx esbuild ${libs} --bundle --format=esm --platform=node --outdir=${out} --alias:@=./src --log-level=warning`,
  { stdio: "inherit", cwd: join(here, "..") }
);
await import(join(here, "v11-selftest.mjs"));
