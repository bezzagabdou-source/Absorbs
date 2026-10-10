// Renders the Nexus logo (public/icons/*.svg) into every PNG size the PWA / favicon / iOS need.
// Usage: node scripts/gen-icons.mjs   (needs `sharp`, already a dependency)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = (() => { try { return require("sharp"); } catch { return createRequire("/opt/npm-tools/node_modules/")("sharp"); } })();
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
const rounded = readFileSync(join(dir, "nexus-icon.svg"));
const full = readFileSync(join(dir, "nexus-icon-full.svg"));
const maskable = readFileSync(join(dir, "nexus-icon-maskable.svg"));

const jobs = [
  [rounded, 192, "nexus-icon-192.png"],
  [rounded, 512, "nexus-icon-512.png"],
  [maskable, 512, "nexus-maskable-512.png"],
  [full, 180, "nexus-apple-touch-icon.png"],
  [rounded, 32, "nexus-favicon-32.png"],
  [rounded, 48, "nexus-favicon-48.png"],
];
for (const [src, size, name] of jobs) {
  await sharp(src, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(dir, name));
  console.log("wrote", name);
}
// favicon.ico (PNG-in-ICO, 32px) so legacy requests to /favicon.ico succeed
const png32 = await sharp(rounded, { density: 384 }).resize(32, 32).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(png32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(join(dir, "..", "favicon.ico"), Buffer.concat([head, png32]));
console.log("wrote favicon.ico");
