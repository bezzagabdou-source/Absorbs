/**
 * 🔎 emojiDiscovery.ts — اكتشاف باقات الإيموجي المتحرك والتحقق منها.
 *
 * القاعدة: الأسماء هنا «مرشّحين» فقط. ما يدخل للخريطة حتى ID إلا إلا رجّعو تيليجرام
 * بنفسو في getStickerSet. اللي فشل كيتسجّل بالخطأ الحرفي وما يتستعملش.
 */
import { rawTg } from "./telegram";
import { getStore } from "./store";
import { normEmoji } from "./emojiLayer";
import {
  loadCfg,
  loadData,
  mutate,
  saveCfg,
  saveData,
  type EmojiData,
  type EmojiEntry,
  type PackInfo,
} from "./emojiState";

/** باقات إيموجي مخصص مرشّحة (t.me/addemoji/NAME) — الترتيب = الأولوية */
export const CANDIDATE_EMOJI_PACKS: string[] = [
  "RestrictedEmoji",
  "SparklesEmoji",
  "FinanceEmoji",
  "BalloonyEmoji",
  "emojipack_sm",
  "MajorEmojis",
  "TStarsIcons",
  "StarEmoji",
  "SuperStarMayDroid_by_fStikBot",
  "FireworksMaydroid_by_fStikBot",
  "gifts_emoji_by_gifts_changes_bot",
  "Premium_gift",
  "BirthdayCollection",
  "RGBHearts",
  "ColorReactions",
  "neon_td",
  "Verified_sign",
  "Premium_Icon",
  "PremiumIcons",
  "AnimatedIconsEmoji",
  "BasicinterfaceEmoji",
  "color_emoji",
  "interactive_animation",
  "Switches_Emoji",
  "Technology_Emoji",
  "Tech_companies",
  "WeatherEmoji",
  "Battery_Life",
  "tgmacicons",
  "footballstickers_icons",
  "Football_emoji_24",
  "Flags_kotletovv",
  "ToysEmojiFTS",
  "R2DOG2Emoji",
  "DMJQuoteReply",
  "NameColor",
  "MerryChristmasEmoji",
  "ChristmasThemeEmoji",
  "Xmas_emodji",
  "HalloweenEmoji2024",
  "Autumn2024emoji",
  "watercolorautumn",
  "osennii3Emoji",
  "LiveFlowersEmoji",
  "Flower2_by_EmojicBot",
  "NatureEmojis",
  "FireFontEmoji",
  "ColorfulFontEmoji",
  "HDAdaptive",
  "AdaptivePremium",
  "AdaptiveIcons",
  "AdaptiveLines",
  "AdaptiveName",
  "HalloweenAdaptiveEmoji",
];

/** باقات ملصقات عادية متحركة (للخطة البديلة — sendSticker بـ file_id) */
export const CANDIDATE_STICKER_PACKS: string[] = ["AnimatedEmojies", "EmojiAnimations", "HotCherry"];

/** الإيموجيات الأساسية ديال البوت (كتتجرّب فعلياً على حساب الأدمين) */
export const CORE_EMOJIS: string[] = [
  "🔥", "❤️‍🔥", "⭐", "🌟", "✨", "🎁", "👑", "🏆", "💎", "✅", "🚀", "🎉", "💰", "💵", "🪙", "🎯", "⚽", "🔗", "👥", "👤",
  "🛍", "📊", "🥇", "🥈", "🥉", "❌", "⚠️", "⏳", "🔒", "📢", "🏠", "🔙", "👋", "💬", "📌", "🎮", "⚡", "🛡", "☑️", "🆔",
];

export function parsePackName(input: string): string {
  const raw = String(input || "").trim();
  const m = /(?:t\.me|telegram\.me)\/(?:addemoji|addstickers)\/([A-Za-z0-9_]+)/i.exec(raw) || /^@?([A-Za-z0-9_]{3,64})$/.exec(raw);
  return m ? m[1] : "";
}

type TgSticker = {
  emoji?: string;
  custom_emoji_id?: string;
  file_id?: string;
  is_animated?: boolean;
  is_video?: boolean;
  needs_repainting?: boolean;
  type?: string;
};
type TgSet = { name?: string; title?: string; sticker_type?: string; stickers?: TgSticker[] };

type Candidate = { emoji: string; id: string; pack: string; anim: boolean; score: number };

export type PackCheck =
  | { ok: true; info: PackInfo; emojis: Candidate[]; stickers: { emoji: string; fileId: string }[] }
  | { ok: false; name: string; error: string };

/** نتحققو من باقة واحدة عند تيليجرام (getStickerSet) */
export async function checkPack(name: string, rank: number, source: PackInfo["source"]): Promise<PackCheck> {
  const res = await rawTg<TgSet>("getStickerSet", { name });
  if (!res.ok || !res.result) return { ok: false, name, error: String(res.description || "getStickerSet فشل") };
  const set = res.result;
  const list = Array.isArray(set.stickers) ? set.stickers : [];
  const type = set.sticker_type === "custom_emoji" ? "custom_emoji" : "regular";
  const emojis: Candidate[] = [];
  const stickers: { emoji: string; fileId: string }[] = [];
  let animated = 0;
  list.forEach((s, index) => {
    const anim = Boolean(s.is_animated || s.is_video);
    if (anim) animated += 1;
    const emoji = normEmoji(String(s.emoji || ""));
    if (!emoji) return;
    if (type === "custom_emoji" && s.custom_emoji_id) {
      emojis.push({
        emoji,
        id: String(s.custom_emoji_id),
        pack: String(set.name || name),
        anim,
        score: rank * 1000 + index + (anim ? 0 : 1_000_000) + (s.needs_repainting ? 500_000 : 0),
      });
    } else if (type === "regular" && s.file_id && anim) {
      stickers.push({ emoji, fileId: String(s.file_id) });
    }
  });
  if (type === "custom_emoji" && !emojis.length) return { ok: false, name, error: "الباقة ما فيها حتى custom_emoji_id" };
  return {
    ok: true,
    info: {
      name: String(set.name || name),
      title: String(set.title || name).slice(0, 80),
      type,
      count: list.length,
      animated,
      verifiedAt: Date.now(),
      source,
    },
    emojis,
    stickers,
  };
}

const MAX_ALTS = 2;

/** ندمجو مرشّحين باقة في الخريطة (الأفضل = أقل score) */
function mergeCandidates(data: EmojiData, scores: Record<string, number>, list: Candidate[]): void {
  for (const c of list) {
    if (data.rejected[c.id] || data.removed.includes(c.emoji)) continue;
    const cur = data.map[c.emoji];
    if (!cur) {
      data.map[c.emoji] = { id: c.id, pack: c.pack, anim: c.anim };
      scores[c.emoji] = c.score;
      continue;
    }
    if (cur.id === c.id || (cur.alts || []).some((a) => a.id === c.id)) continue;
    const curScore = scores[c.emoji] ?? Number.MAX_SAFE_INTEGER;
    const alt = { id: c.id, pack: c.pack, anim: c.anim };
    if (!cur.manual && c.score < curScore) {
      const demoted = { id: cur.id, pack: cur.pack, anim: cur.anim };
      data.map[c.emoji] = { ...alt, alts: [demoted, ...(cur.alts || [])].filter((a) => a.pack !== c.pack).slice(0, MAX_ALTS) };
      scores[c.emoji] = c.score;
    } else if (c.pack !== cur.pack && !(cur.alts || []).some((a) => a.pack === c.pack) && (cur.alts || []).length < MAX_ALTS) {
      cur.alts = [...(cur.alts || []), alt];
    }
  }
}

function applyOverrides(data: EmojiData): void {
  for (const [emoji, o] of Object.entries(data.overrides)) {
    const cur = data.map[emoji];
    const alts = cur && cur.id !== o.id ? [{ id: cur.id, pack: cur.pack, anim: cur.anim }, ...(cur.alts || [])].slice(0, MAX_ALTS) : cur?.alts;
    data.map[emoji] = { id: o.id, pack: o.pack, anim: o.anim, manual: true, tested: cur?.id === o.id ? cur.tested : undefined, ...(alts?.length ? { alts } : {}) };
  }
  for (const emoji of data.removed) delete data.map[emoji];
}

export function allPackNames(data: EmojiData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...CANDIDATE_EMOJI_PACKS, ...data.extraPacks, ...CANDIDATE_STICKER_PACKS]) {
    const key = name.toLowerCase();
    if (seen.has(key) || data.removedPacks.some((r) => r.toLowerCase() === key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const WORK_KEY = "emoji2:work";
const LEASE_KEY = "emoji2:lease";
type Work = { map: Record<string, EmojiEntry>; scores: Record<string, number>; packs: Record<string, PackInfo>; failed: EmojiData["failed"]; stickers: EmojiData["stickers"]; tested: Record<string, string> };

export type StepResult = {
  ok: boolean;
  done: boolean;
  busy?: boolean;
  cursor: number;
  total: number;
  verified: number;
  failed: number;
  emojis: number;
  error?: string;
};

/**
 * دفعة واحدة من الاكتشاف (تحت مهلة الدالة). نعاودو النداء حتى done=true.
 * الخريطة القديمة كتبقى خدّامة حتى تكمل الجديدة (تبديل في آخر دفعة).
 */
export async function discoveryStep(opts: { restart?: boolean; budgetMs?: number } = {}): Promise<StepResult> {
  const store = getStore();
  const leaseToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const budget = Math.min(50_000, Math.max(3_000, opts.budgetMs ?? 35_000));
  if (!(await store.acquireLease(LEASE_KEY, leaseToken, budget + 20_000))) {
    const cfg = await loadCfg();
    return { ok: true, done: false, busy: true, cursor: cfg.discovery.cursor, total: cfg.discovery.total, verified: 0, failed: 0, emojis: 0 };
  }
  const started = Date.now();
  try {
    const [cfg, data] = await Promise.all([loadCfg(), loadData()]);
    const names = allPackNames(data);
    let work = (await store.get<Work>(WORK_KEY)) || null;
    if (opts.restart || !work || cfg.discovery.cursor <= 0 || cfg.discovery.cursor > names.length) {
      const tested: Record<string, string> = {};
      for (const [emoji, entry] of Object.entries(data.map)) if (entry.tested) tested[emoji] = entry.id;
      work = { map: {}, scores: {}, packs: {}, failed: {}, stickers: {}, tested };
      cfg.discovery = { cursor: 0, total: names.length, startedAt: Date.now(), finishedAt: cfg.discovery.finishedAt, running: true, lastError: "" };
    }
    cfg.discovery.total = names.length;
    cfg.discovery.running = true;
    const scratch: EmojiData = { ...data, map: work.map };

    const CONCURRENCY = 4;
    let cursor = cfg.discovery.cursor;
    while (cursor < names.length && Date.now() - started < budget) {
      const slice = names.slice(cursor, cursor + CONCURRENCY);
      const results = await Promise.all(
        slice.map((name, i) => {
          const source: PackInfo["source"] = data.extraPacks.includes(name) ? "panel" : "catalog";
          return checkPack(name, cursor + i, source).catch((e) => ({ ok: false as const, name, error: String((e as Error)?.message || e) }));
        }),
      );
      for (const r of results) {
        if (!r.ok) {
          work.failed[r.name] = { error: r.error.slice(0, 200), at: Date.now() };
          continue;
        }
        work.packs[r.info.name] = r.info;
        mergeCandidates(scratch, work.scores, r.emojis);
        for (const s of r.stickers) if (!work.stickers[s.emoji]) work.stickers[s.emoji] = { fileId: s.fileId, pack: r.info.name };
      }
      cursor += slice.length;
    }
    work.map = scratch.map;
    cfg.discovery.cursor = cursor;
    const done = cursor >= names.length;

    if (done) {
      // شبكة طايحة؟ ما نمسحوش خريطة خدّامة بخريطة خاوية
      const verified = Object.values(work.packs).filter((p) => p.type === "custom_emoji").length;
      if (!verified && Object.keys(data.map).length) {
        cfg.discovery = { ...cfg.discovery, cursor: 0, running: false, lastError: "ما تحقّقات حتى باقة — احتفظنا بالخريطة القديمة" };
        await store.del(WORK_KEY);
        await saveCfg(cfg, false);
        return { ok: false, done: true, cursor: 0, total: names.length, verified: 0, failed: Object.keys(work.failed).length, emojis: Object.keys(data.map).length, error: cfg.discovery.lastError };
      }
      for (const [emoji, id] of Object.entries(work.tested)) if (work.map[emoji]?.id === id) work.map[emoji].tested = true;
      data.map = work.map;
      data.packs = work.packs;
      data.failed = work.failed;
      if (Object.keys(work.stickers).length) data.stickers = work.stickers;
      applyOverrides(data);
      await saveData(data);
      await store.del(WORK_KEY);
      cfg.discovery = { cursor: 0, total: names.length, startedAt: cfg.discovery.startedAt, finishedAt: Date.now(), running: false, lastError: "" };
      await saveCfg(cfg, true);
      return { ok: true, done: true, cursor: names.length, total: names.length, verified, failed: Object.keys(work.failed).length, emojis: Object.keys(data.map).length };
    }
    await store.set(WORK_KEY, work);
    await saveCfg(cfg, false);
    return {
      ok: true,
      done: false,
      cursor,
      total: names.length,
      verified: Object.keys(work.packs).length,
      failed: Object.keys(work.failed).length,
      emojis: Object.keys(work.map).length,
    };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 200);
    try {
      const cfg = await loadCfg();
      cfg.discovery.lastError = message;
      cfg.discovery.running = false;
      await saveCfg(cfg, false);
    } catch {
      /* نكملو */
    }
    return { ok: false, done: false, cursor: 0, total: 0, verified: 0, failed: 0, emojis: 0, error: message };
  } finally {
    await store.releaseLease(LEASE_KEY, leaseToken).catch(() => undefined);
  }
}

const WEEK_MS = 7 * 24 * 3600_000;

/** هل خاص الاكتشاف يخدم دابا؟ (أول مرة / كل أسبوع / دفعة ما كملاتش) */
export async function discoveryDue(): Promise<"first" | "weekly" | "resume" | ""> {
  const cfg = await loadCfg();
  if (cfg.discovery.cursor > 0) return "resume";
  if (!cfg.discovery.finishedAt) return "first";
  if (Date.now() - cfg.discovery.finishedAt > WEEK_MS) return "weekly";
  return "";
}

/** ➕ نزيدو باقة برابط/اسم: كتتحقق فوراً وكتدخل للخريطة */
export async function addPackByLink(input: string, source: PackInfo["source"] = "panel"): Promise<{ ok: boolean; message: string; name?: string; added?: number }> {
  const name = parsePackName(input);
  if (!name) return { ok: false, message: "رابط/اسم الباقة ماشي صحيح (مثال: https://t.me/addemoji/RestrictedEmoji)" };
  const current = await loadData();
  const rank = Math.max(0, allPackNames(current).findIndex((n) => n.toLowerCase() === name.toLowerCase()));
  const check = await checkPack(name, rank >= 0 ? rank : 900, source);
  if (!check.ok) return { ok: false, message: `تيليجرام رفض الباقة «${name}»: ${check.error}`, name };
  let added = 0;
  await mutate((data) => {
    data.removedPacks = data.removedPacks.filter((n) => n.toLowerCase() !== name.toLowerCase());
    if (!allPackNames(data).some((n) => n.toLowerCase() === name.toLowerCase())) data.extraPacks.push(check.info.name);
    data.packs[check.info.name] = check.info;
    delete data.failed[name];
    const before = Object.keys(data.map).length;
    // باقة زادها المالك: كتعمّر غير الإيموجيات الناقصة + بدائل (ما كتبدّلش الاختيارات الحالية)
    const scores: Record<string, number> = {};
    for (const emoji of Object.keys(data.map)) scores[emoji] = -1;
    mergeCandidates(data, scores, check.emojis);
    for (const s of check.stickers) if (!data.stickers[s.emoji]) data.stickers[s.emoji] = { fileId: s.fileId, pack: check.info.name };
    applyOverrides(data);
    added = Object.keys(data.map).length - before;
  });
  const what = check.info.type === "custom_emoji" ? `${check.emojis.length} إيموجي` : `${check.stickers.length} ملصق متحرك`;
  return { ok: true, name: check.info.name, added, message: `تمّت إضافة «${check.info.title}» — ${what} (جديد في الخريطة: ${added})` };
}

/** 🗑 نحيّدو باقة: كل إيموجي كان منها كيتبدّل ببديل من باقة أخرى ولا كيتحيّد */
export async function removePack(input: string): Promise<{ ok: boolean; message: string }> {
  const name = parsePackName(input);
  if (!name) return { ok: false, message: "اسم الباقة ماشي صحيح" };
  let dropped = 0;
  let replaced = 0;
  await mutate((data) => {
    const key = name.toLowerCase();
    if (!data.removedPacks.some((n) => n.toLowerCase() === key)) data.removedPacks.push(name);
    data.extraPacks = data.extraPacks.filter((n) => n.toLowerCase() !== key);
    for (const p of Object.keys(data.packs)) if (p.toLowerCase() === key) delete data.packs[p];
    for (const [emoji, entry] of Object.entries(data.map)) {
      const alts = (entry.alts || []).filter((a) => a.pack.toLowerCase() !== key);
      if (entry.pack.toLowerCase() !== key) {
        if (alts.length !== (entry.alts || []).length) entry.alts = alts;
        continue;
      }
      if (data.overrides[emoji]?.pack.toLowerCase() === key) delete data.overrides[emoji];
      if (alts.length) {
        data.map[emoji] = { ...alts[0], alts: alts.slice(1) };
        replaced += 1;
      } else {
        delete data.map[emoji];
        dropped += 1;
      }
    }
    for (const [emoji, s] of Object.entries(data.stickers)) if (s.pack.toLowerCase() === key) delete data.stickers[emoji];
  });
  return { ok: true, message: `تحيّدات «${name}» — ${replaced} تبدّل ببديل، ${dropped} تحيّد` };
}

/** ✏️ المالك يختار ID لإيموجي: خاص الـID يكون موجود في باقة متحقَّق منها */
export async function setEmoji(emojiRaw: string, id: string): Promise<{ ok: boolean; message: string }> {
  const emoji = normEmoji(String(emojiRaw || "").trim());
  const cleanId = String(id || "").trim();
  if (!emoji || !/^\d{6,25}$/.test(cleanId)) return { ok: false, message: "الإيموجي أو الـID ماشي صحيح" };
  const data = await loadData();
  const cur = data.map[emoji];
  let found = cur?.id === cleanId ? { id: cur.id, pack: cur.pack, anim: cur.anim } : (cur?.alts || []).find((a) => a.id === cleanId);
  if (!found) {
    // نتحققو عند تيليجرام: getCustomEmojiStickers كيرجّع الملصق إلا كان الـID حقيقي
    const res = await rawTg<{ custom_emoji_id?: string; set_name?: string; is_animated?: boolean; is_video?: boolean }[]>("getCustomEmojiStickers", { custom_emoji_ids: [cleanId] });
    const s = res.ok ? (res.result || [])[0] : undefined;
    if (!s?.custom_emoji_id) return { ok: false, message: `تيليجرام ما عرفش هاد الـID: ${res.description || "ما رجّع حتى ملصق"}` };
    found = { id: String(s.custom_emoji_id), pack: String(s.set_name || "—"), anim: Boolean(s.is_animated || s.is_video) };
  }
  const chosen = found;
  await mutate((d) => {
    d.removed = d.removed.filter((e) => e !== emoji);
    delete d.rejected[chosen.id];
    d.overrides[emoji] = chosen;
    applyOverrides(d);
  });
  return { ok: true, message: `تمّ: ${emoji} ← ${chosen.id} (${chosen.pack})` };
}

export async function removeEmoji(emojiRaw: string): Promise<{ ok: boolean; message: string }> {
  const emoji = normEmoji(String(emojiRaw || "").trim());
  if (!emoji) return { ok: false, message: "الإيموجي ماشي صحيح" };
  await mutate((d) => {
    if (!d.removed.includes(emoji)) d.removed.push(emoji);
    delete d.overrides[emoji];
    delete d.map[emoji];
  });
  return { ok: true, message: `تحيّد ${emoji} من الخريطة (غادي يبان عادي)` };
}

/** ❌ ID رفضو تيليجرام في الاختبار: نبدّلوه ببديل ولا نحيّدوه */
export function rejectId(data: EmojiData, emoji: string, id: string, reason: string): void {
  data.rejected[id] = reason.slice(0, 160);
  const cur = data.map[emoji];
  if (!cur || cur.id !== id) return;
  if (data.overrides[emoji]?.id === id) delete data.overrides[emoji];
  const alts = (cur.alts || []).filter((a) => !data.rejected[a.id]);
  if (alts.length) data.map[emoji] = { ...alts[0], alts: alts.slice(1) };
  else delete data.map[emoji];
}
