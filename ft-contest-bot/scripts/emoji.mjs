#!/usr/bin/env node
/**
 * ✨ emoji.mjs — سكربت الإيموجيات المتحركة (Custom Emoji) — ملف واحد، بلا أي مكتبة.
 *
 *   node scripts/emoji.mjs sync                  # يجيب الحزم ويكتب src/lib/_emoji_ids.json
 *   node scripts/emoji.mjs sync --set "Name1,Name2"
 *   node scripts/emoji.mjs add "PackName"        # يزيد حزمة ويحدّث الخريطة
 *   node scripts/emoji.mjs list                  # يشوف الخريطة الحالية
 *   node scripts/emoji.mjs test "أهلاً 🔥⭐🎁"     # يجرب fx() ويطبع HTML
 *
 * التوكن: TELEGRAM_BOT_TOKEN من البيئة أو من .env أو أول سطر في emoji-packs.txt
 * ملاحظة: getStickerSet يرجع نوع الحزمة custom_emoji وكل ملصق فيه custom_emoji_id.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src", "lib", "_emoji_ids.json");
const CACHE = path.join(ROOT, ".emoji-packs.json");
const PACKS_FILE = path.join(ROOT, "emoji-packs.txt");

/* ──────────────── حزم عامة متنوعة (عدّلها كيما تحب) ──────────────── */
// ⚠️ أسماء الحزم تتغيّر مع الوقت؛ زيد/بدّل من هنا أو من emoji-packs.txt
const DEFAULT_PACKS = [
  "EmojiAnimPack",
  "AnimatedEmojies",
  "CuteAnimatedEmoji",
  "HotCherryEmoji",
  "RestEmoji",
  "Gifts",
  "SnowballsEmoji",
  "SpongeBobEmoji",
];

/* ──────────────── أدوات صغيرة ──────────────── */
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
};
const say = (...a) => console.log(...a);

function token() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  for (const file of [".env.local", ".env", "emoji-packs.txt"]) {
    try {
      const txt = fs.readFileSync(path.join(ROOT, file), "utf8");
      const line = txt
        .split("\n")
        .map((l) => l.trim())
        .find((l) => /^(export\s+)?TELEGRAM_BOT_TOKEN\s*=/.test(l) || /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(l));
      if (line) return line.replace(/^(export\s+)?TELEGRAM_BOT_TOKEN\s*=\s*/, "").replace(/["']/g, "").trim();
    } catch {
      /* كمل */
    }
  }
  throw new Error("ما لقيتش التوكن: حط TELEGRAM_BOT_TOKEN في البيئة أو في .env");
}

async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`${method}: ${json.description || res.status}`);
  return json.result;
}

/** ياخذ حزمة → [{ emoji, id }] */
async function fetchPack(name) {
  const set = await tg("getStickerSet", { name });
  if (set.sticker_type && set.sticker_type !== "custom_emoji") {
    throw new Error(`${name}: ماشي حزمة إيموجي (${set.sticker_type})`);
  }
  return (set.stickers || [])
    .map((s) => ({ emoji: s.emoji || "❓", id: String(s.custom_emoji_id || "") }))
    .filter((s) => s.id);
}

/** يدمج حزمة في الخريطة: base → [ids] بلا تكرار */
function mergeInto(map, items, stats) {
  for (const { emoji, id } of items) {
    const list = map[emoji] || (map[emoji] = []);
    if (!list.includes(id)) {
      list.push(id);
      stats.added++;
    }
  }
  return map;
}

/* ──────────────── الأوامر ──────────────── */
async function cmdSync(packs) {
  const cache = readJson(CACHE, { packs: {} });
  const map = readJson(OUT, {});
  const stats = { added: 0, packs: 0, failed: [] };

  for (const name of packs) {
    try {
      const items = await fetchPack(name);
      cache.packs[name] = items;
      mergeInto(map, items, stats);
      stats.packs++;
      say(`✅ ${name} → ${items.length} إيموجي`);
    } catch (error) {
      stats.failed.push(`${name}: ${error.message}`);
      say(`⚠️ ${name} → ${error.message}`);
    }
  }

  writeJson(CACHE, cache);
  writeJson(OUT, map);
  const total = Object.values(map).reduce((n, l) => n + l.length, 0);
  say(`\n💾 ${OUT}`);
  say(`📦 حزم: ${stats.packs} • إيموجي أساسي: ${Object.keys(map).length} • IDs: ${total} • جديد: ${stats.added}`);
  if (stats.failed.length) say(`⚠️ فشلو: ${stats.failed.length} حزمة (شوف الأسماء فوق)`);
}

function cmdList() {
  const map = readJson(OUT, {});
  const rows = Object.entries(map);
  if (!rows.length) return say("الخريطة خاوية — شغّل: node scripts/emoji.mjs sync");
  for (const [base, ids] of rows) say(`${base}  →  ${ids.length} نسخة  (${ids[0]})`);
  say(`\nالمجموع: ${rows.length} إيموجي أساسي`);
}

async function cmdAdd(name) {
  if (!name) throw new Error('استعمل: node scripts/emoji.mjs add "PackName"');
  const map = readJson(OUT, {});
  const cache = readJson(CACHE, { packs: {} });
  const items = await fetchPack(name);
  const stats = { added: 0 };
  mergeInto(map, items, stats);
  cache.packs[name] = items;
  writeJson(CACHE, cache);
  writeJson(OUT, map);
  say(`✅ ${name}: ${items.length} إيموجي (جديد: ${stats.added}) → ${OUT}`);
}

/** نسخة JS من fx() للاختبار السريع */
function cmdTest(text) {
  const map = readJson(OUT, {});
  const bases = Object.keys(map).sort((a, b) => b.length - a.length);
  if (!bases.length) return say("الخريطة خاوية — شغّل sync");
  const pattern = new RegExp(`(${bases.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const out = String(text || "").split(/(<[^>]+>|https?:\/\/\S+)/g).map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(pattern, (m) => {
      const id = map[m][Math.floor(Math.random() * map[m].length)];
      return `<tg-emoji emoji-id="${id}">${m}</tg-emoji>`;
    });
  }).join("");
  say(out);
}

/* ──────────────── main ──────────────── */
const [cmd = "sync", ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : "";
};

try {
  if (cmd === "sync") {
    const custom = flag("--set") || (fs.existsSync(PACKS_FILE) ? fs.readFileSync(PACKS_FILE, "utf8").split(/[\n,]+/).map((x) => x.trim()).filter((x) => x && !x.startsWith("#") && !x.includes(":")) : []);
    const packs = custom.length ? custom : DEFAULT_PACKS;
    say(`🔄 نجيب ${packs.length} حزمة…\n`);
    await cmdSync(packs);
  } else if (cmd === "add") {
    await cmdAdd(rest[0]);
  } else if (cmd === "list") {
    cmdList();
  } else if (cmd === "test") {
    cmdTest(rest.join(" "));
  } else {
    say("الأوامر: sync | add \"Pack\" | list | test \"نص\"");
  }
} catch (error) {
  say(`❌ ${error.message}`);
  process.exit(1);
}
