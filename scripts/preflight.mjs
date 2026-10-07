// npm run preflight — checks that the project is ready to publish (PWA + Play / Uptodown)
import { existsSync, readFileSync } from "node:fs";

const res = [];
const ok = (m) => res.push(["OK  ", m]);
const warn = (m) => res.push(["WARN", m]);
const bad = (m) => res.push(["FAIL", m]);

for (const f of [
  "public/manifest.webmanifest",
  "public/sw.js",
  "public/offline.html",
  "public/privacy.html",
  "public/icons/nexus-icon-192.png",
  "public/icons/nexus-icon-512.png",
  "public/icons/nexus-maskable-512.png",
  "public/og.png",
]) (existsSync(f) ? ok : bad)(f);

try {
  const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  (m.name && m.short_name && m.start_url && m.icons?.length >= 3 ? ok : bad)("manifest fields (name, start_url, 3 icons)");
} catch {
  bad("manifest.webmanifest is not valid JSON");
}

try {
  const a = readFileSync("public/.well-known/assetlinks.json", "utf8");
  (a.includes("PUT:YOUR") ? warn : ok)(a.includes("PUT:YOUR") ? "assetlinks.json still has the placeholder SHA-256 (fill it after PWABuilder)" : "assetlinks.json fingerprint set");
} catch {
  warn("public/.well-known/assetlinks.json missing");
}

const env = { ...process.env };
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && m[2].trim()) env[m[1]] = m[2].trim();
  }
} catch {}
const has = (...n) => n.some((k) => (env[k] ?? "").length > 0);
(has("DATABASE_URL", "POSTGRES_URL") ? ok : bad)("DATABASE_URL");
(has("GEMINI_API_KEY") ? ok : bad)("GEMINI_API_KEY");
(has("NEXT_PUBLIC_SITE_URL") ? ok : warn)("NEXT_PUBLIC_SITE_URL (public https domain)");
(has("ADMIN_SECRET") ? ok : warn)("ADMIN_SECRET (promo codes)");
(has("GROK_API_KEY", "XAI_API_KEY") ? ok : warn)("GROK_API_KEY");
(has("OPENROUTER_API_KEY") ? ok : warn)("OPENROUTER_API_KEY");
(has("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PUBLIC_KEY") ? ok : warn)("VAPID keys (push notifications): run node scripts/gen-vapid.mjs");

for (const [t, m] of res) console.log(`${t}  ${m}`);
const fails = res.filter(([t]) => t === "FAIL").length;
console.log(fails ? `\n${fails} blocking problem(s).` : "\nNo blocking problems. After deploying open /api/health.");
process.exit(fails ? 1 : 0);
