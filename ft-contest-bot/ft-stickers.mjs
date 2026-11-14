#!/data/data/com.termux/files/usr/bin/node
/**
 * ⚡ ft-stickers.mjs — سكريبت واحد شامل (Termux): يطلّع **كل الملصقات/الإيموجيات** ديال البوت
 *    من تيليجرام بسرعة (كل الحزم ف نفس الوقت)، ويكتب لك الملفات الجاهزة للنشر.
 *
 * التشغيل:
 *   export TELEGRAM_BOT_TOKEN="123456:ABC..."
 *   node ft-stickers.mjs                      # يعرض كلشي + يكتب stickers.json + stickers.env
 *   node ft-stickers.mjs --set "Pack1,Pack2"  # حزم على ذوقك (وإلا من emoji-packs.txt)
 *   node ft-stickers.mjs --status https://ft-bot-bice.vercel.app/api/telegram/status
 *   node ft-stickers.mjs --apply              # يزيد المتغيرات في Vercel تلقائياً (خاص VERCEL_TOKEN)
 *
 * بلا حتى مكتبة — node 18+ غير fetch.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || "") : "";
};

const OUT_ALL = "stickers.json"; // كل ملصق: file_id + emoji + emojiId + النوع
const OUT_ENV = "stickers.env"; // متغيرات Vercel جاهزة للّصق
const CACHE = ".ft-stickers-cache.json"; // كاش باش يكون أسرع في المرة الجاية

/* ───────────── 1) التوكن ───────────── */
function token() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  for (const file of [".env.local", ".env", "emoji-packs.txt"]) {
    try {
      const line = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => /^(export\s+)?TELEGRAM_BOT_TOKEN\s*=/.test(l) || /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(l));
      if (line) return line.replace(/^(export\s+)?TELEGRAM_BOT_TOKEN\s*=\s*/, "").replace(/["']/g, "").trim();
    } catch {
      /* كمل */
    }
  }
  throw new Error("حط التوكن: export TELEGRAM_BOT_TOKEN=123456:ABC...");
}

async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    if (!json.description) throw new Error(`ما كاينش اتصال بـ api.telegram.org (شوف الشبكة / VPN فـ Termux) — HTTP ${res.status}`);
    throw new Error(json.description);
  }
  return json.result;
}

/* ───────────── 2) أسماء الحزم ───────────── */
function packNames() {
  const names = new Set();
  const push = (raw) =>
    String(raw || "")
      .split(/[\n,]+/)
      .map((x) => x.trim().replace(/^https?:\/\/t\.me\/addstickers\//i, ""))
      .filter((x) => /^[A-Za-z0-9_]{3,64}$/.test(x))
      .forEach((x) => names.add(x));

  push(process.env.STICKER_PACKS || "");
  push(flag("--set"));
  try {
    push(fs.readFileSync("emoji-packs.txt", "utf8").replace(/^#.*$/gm, ""));
  } catch {
    /* بلا ملف */
  }
  // حزم عامة كبداية (زيد/بدّل من emoji-packs.txt)
  [
    "EmojiAnimPack",
    "AnimatedEmojies",
    "CuteAnimatedEmoji",
    "HotCherryEmoji",
    "RestEmoji",
    "SpicyCherryEmoji",
  ].forEach((x) => names.add(x));
  return [...names];
}

/* ───────────── 3) جلب حزمة (بالتوازي = سريع) ───────────── */
async function fetchPack(name) {
  try {
    const set = await tg("getStickerSet", { name });
    return {
      name,
      title: set.title || name,
      type: set.sticker_type || "regular",
      items: (set.stickers || []).map((s) => ({
        pack: name,
        emoji: s.emoji || "❓",
        fileId: s.file_id || "",
        fileUniqueId: s.file_unique_id || "",
        emojiId: s.custom_emoji_id || "",
        animated: Boolean(s.is_animated),
        video: Boolean(s.is_video),
      })),
    };
  } catch (error) {
    return { name, error: error.message, items: [] };
  }
}

/* ───────────── 4) Vercel (اختياري) ───────────── */
async function pushVercel(entries) {
  const vToken = process.env.VERCEL_TOKEN || "";
  const project = process.env.VERCEL_PROJECT || "ft-bot";
  const team = process.env.VERCEL_TEAM || "";
  if (!vToken) return "⚠️ بلا VERCEL_TOKEN — الصق stickers.env يدوياً في Vercel ← Environment Variables";
  for (const [key, value] of entries) {
    const query = new URLSearchParams({ upsert: "true", ...(team ? { teamId: team } : {}) });
    const res = await fetch(`https://api.vercel.com/v10/projects/${project}/env?${query}`, {
      method: "POST",
      headers: { authorization: `Bearer ${vToken}`, "content-type": "application/json" },
      body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview", "development"] }),
    });
    const json = await res.json().catch(() => ({}));
    console.log(res.ok ? `   ✅ ${key}` : `   ⚠️ ${key}: ${json?.error?.message || res.status}`);
  }
  return "✅ تزادو في Vercel — دير Redeploy (أو خلّي GitHub يبني)";
}

/* ───────────── 5) main ───────────── */
try {
  const t0 = Date.now();
  const me = await tg("getMe");
  console.log(`🤖 @${me.username} (${me.id})`);

  const names = packNames();
  console.log(`🔄 نجيب ${names.length} حزمة بالتوازي…`);

  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const packs = await Promise.all(names.map(fetchPack));
  const ok = packs.filter((p) => !p.error);
  const failed = packs.filter((p) => p.error);

  console.log("\n── الحزم ─────────────────────────────");
  for (const p of ok) {
    const kind = p.type === "custom_emoji" ? "إيموجي متحرك" : "ملصقات";
    const sample = p.items.slice(0, 4).map((i) => i.emoji).join(" ");
    console.log(`✅ ${p.name.padEnd(22)} ${kind.padEnd(13)} ${String(p.items.length).padStart(4)}  ${sample}`);
  }
  for (const p of failed) console.log(`⚠️ ${p.name.padEnd(22)} ${p.error}`);

  /* دمج كل الملصقات */
  const all = ok.flatMap((p) => p.items);
  for (const p of ok) cache[p.name] = p.items;
  fs.writeFileSync(CACHE, JSON.stringify(cache), "utf8");

  /* ملصق البوت المحفوظ (sticker:last) */
  const statusUrl = flag("--status");
  if (statusUrl) {
    try {
      const st = await (await fetch(statusUrl)).json();
      const last = st?.stickers?.lastFileId;
      if (last) {
        all.unshift({ pack: "sticker:last", emoji: "🎭", fileId: last, fileUniqueId: "", emojiId: "", animated: false, video: false });
        console.log(`\n🎭 آخر ملصق مصيفط للبوت: ${last.slice(0, 24)}…`);
      }
    } catch {
      console.log("⚠️ ما قدرتش نقرا /api/telegram/status");
    }
  }

  const stickers = all.filter((x) => x.fileId && !x.emojiId);
  const emojis = all.filter((x) => x.emojiId);

  /* stickers.json */
  fs.writeFileSync(OUT_ALL, JSON.stringify({ at: new Date().toISOString(), bot: me.username, stickers, emojis }, null, 1), "utf8");

  /* emoji map (اختياري: يكمل _emoji_ids.json) */
  if (emojis.length && has("--write-map")) {
    const map = {};
    for (const e of emojis) (map[e.emoji] ||= []).includes(e.emojiId) || map[e.emoji].push(e.emojiId);
    fs.writeFileSync("src/lib/_emoji_ids.json", JSON.stringify(map, null, 2) + "\n", "utf8");
    console.log("💾 src/lib/_emoji_ids.json");
  }

  /* stickers.env */
  const unique = (list, n) => [...new Set(list.filter(Boolean))].slice(0, n);
  const entries = [];
  const welcome = all.find((x) => x.pack === "sticker:last")?.fileId || stickers[0]?.fileId || "";
  if (welcome) entries.push(["STICKER_WELCOME", welcome]);
  const more = unique(stickers.map((s) => s.fileId).slice(1), 1)[0];
  if (more) entries.push(["STICKER_MORE", more]);
  const reactions = unique(stickers.map((s) => s.fileId), 3);
  if (reactions.length) entries.push(["STICKER_REACTIONS", reactions.join(",")]);
  if (emojis.length) {
    entries.push(["CUSTOM_EMOJI_IDS", emojis.slice(0, 20).map((e, i) => `e${i + 1}=${e.emojiId}`).join(",")]);
  }
  fs.writeFileSync(
    OUT_ENV,
    ["# مُولّد بـ ft-stickers.mjs — Vercel ← Settings ← Environment Variables", ...entries.map(([k, v]) => `${k}=${v}`), ""].join("\n"),
    "utf8",
  );

  console.log("\n── النتيجة ───────────────────────────");
  console.log(`📦 ملصقات: ${stickers.length}    😀 إيموجي مخصص: ${emojis.length}    ⏱️ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`💾 ${OUT_ALL} + ${OUT_ENV}`);
  if (has("--apply")) console.log(await pushVercel(entries));
  else console.log("للتحديث التلقائي: node ft-stickers.mjs --apply");
} catch (error) {
  console.error(`❌ ${error.message === "fetch failed" ? "ما كاينش اتصال بـ api.telegram.org — شوف الشبكة" : error.message}`);
  process.exit(1);
}
