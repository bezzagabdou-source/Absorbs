/** Bundles the web engine then runs the live self test. */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".v13-build");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execSync(
  `npx esbuild src/lib/websearch.ts --bundle --format=esm --platform=node --outdir=${out} --alias:@=./src --log-level=warning`,
  { stdio: "inherit", cwd: join(here, "..") }
);
await import(join(here, "v13-web-selftest.mjs"));
