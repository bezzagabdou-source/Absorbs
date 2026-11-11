/**
 * Generates every icon the marketplace ships with, from one vector definition:
 *  - web app icons (192, 512, maskable 512, apple-touch 180, favicons),
 *  - Android launcher icons (legacy 48→192, adaptive foreground 108→432),
 *  - store assets (1024 square icon for Uptodown / Play).
 *
 * Run with: node scripts/gen-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const GREEN_DARK = "#0F2A20";
const GREEN = "#14342A";
const GREEN_LIGHT = "#1C4636";
const LIME = "#D5F07B";
const WHITE = "#FFFFFF";

/**
 * Brand artwork, drawn in a 1024x1024 box.
 * `bleed` keeps the artwork inside Android's adaptive-icon safe zone.
 */
function artwork({ transparent = false, radius = 224 } = {}) {
  const background = transparent
    ? ""
    : `<defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${GREEN_LIGHT}"/>
          <stop offset="0.55" stop-color="${GREEN}"/>
          <stop offset="1" stop-color="${GREEN_DARK}"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="${radius}" ry="${radius}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${background}
  <g>
    <!-- price tag (back, lighter) -->
    <g transform="translate(700 196) rotate(16)">
      <rect x="0" y="0" width="210" height="106" rx="21" fill="${LIME}" opacity="0.55"/>
    </g>
    <!-- price tag (front) -->
    <g transform="translate(636 316) rotate(7)">
      <rect x="0" y="0" width="238" height="118" rx="23" fill="${LIME}"/>
      <circle cx="44" cy="62" r="15" fill="${GREEN_DARK}"/>
      <rect x="72" y="48" width="122" height="12" rx="6" fill="${GREEN_DARK}" opacity="0.35"/>
      <rect x="72" y="70" width="84" height="10" rx="5" fill="${GREEN_DARK}" opacity="0.22"/>
    </g>
    <!-- shopping bag -->
    <path d="M412 336a100 100 0 0 1 200 0" fill="none" stroke="${WHITE}" stroke-width="48" stroke-linecap="round"/>
    <path d="M306 372h412l-24 396a46 46 0 0 1-46 43H376a46 46 0 0 1-46-43Z" fill="${WHITE}"/>
    <!-- the Z: exchange + Dz -->
    <path d="M382 452h264v70L508 630h138v70H382v-70l138-108H382Z" fill="${LIME}"/>
  </g>
</svg>`;
}

const OUT = {
  icons: "public/icons",
  android: "../android/app/src/main/res",
  store: "public/store",
  brand: "public/brand",
};

async function png(svg, size, file, { background = null } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  let image = sharp(Buffer.from(svg)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (background) image = image.flatten({ background });
  await image.png({ compressionLevel: 9, effort: 10 }).toFile(file);
  console.log("✓", file, `${size}x${size}`);
}

const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${GREEN}"/>
  <g transform="translate(512 512) scale(0.66) translate(-512 -512)">${artwork({ transparent: true }).replace(/^[\s\S]*?<g>/, "<g>").replace(/<\/svg>\s*$/, "")}</g>
</svg>`;

const svgFull = artwork();
const svgBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g transform="translate(512 512) scale(0.62) translate(-512 -512)">${artwork({ transparent: true }).replace(/^[\s\S]*?<g>/, "<g>").replace(/<\/svg>\s*$/, "")}</g>
</svg>`;

await writeFile(`${OUT.icons}/icon.svg`, svgFull);
await writeFile(`${OUT.brand}/icon.svg`, svgFull).catch(async () => { await mkdir(OUT.brand, { recursive: true }); await writeFile(`${OUT.brand}/icon.svg`, svgFull); });
await mkdir(OUT.icons, { recursive: true });
await mkdir(OUT.store, { recursive: true });

for (const size of [32, 48, 180, 192, 256, 512]) await png(svgFull, size, `${OUT.icons}/icon-${size}.png`);
await png(maskable, 512, `${OUT.icons}/maskable-512.png`);
await png(svgFull, 1024, `${OUT.store}/icon-1024.png`);
await png(svgFull, 512, `${OUT.store}/icon-512.png`);

// Android legacy launcher icons (square, with background).
const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(legacy)) {
  await png(svgFull, size, `${OUT.android}/mipmap-${density}/ic_launcher.png`);
  await png(svgFull, size, `${OUT.android}/mipmap-${density}/ic_launcher_round.png`);
}
// Android adaptive icon foreground: transparent, artwork inside the 66% safe zone.
const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [density, size] of Object.entries(adaptive)) {
  await png(svgBleed, size, `${OUT.android}/mipmap-${density}/ic_launcher_foreground.png`);
}

console.log("Icons generated.");
