/**
 * 🧪 emojiOps.ts — اختبارات حقيقية على حساب الأدمين + حالة الصفحة «الإيموجي» في اللوحة.
 * كل نتيجة هنا جاية من جواب تيليجرام الحرفي — ما كاين حتى افتراض.
 */
import { getSettings } from "./settings";
import { getEmojiOutcomes, rawTg, runLadder, sendMessage, tgCall, getTrace, type TgUpdate } from "./telegram";
import { acceptedCustomEmoji, acceptedIcons, buildAttempts, normEmoji, stripTags, type EmojiMode } from "./emojiLayer";
import { loadCfg, loadData, mutate, saveCfg, invalidateRuntime, type EmojiEntry } from "./emojiState";
import { CANDIDATE_EMOJI_PACKS, CORE_EMOJIS, rejectId } from "./emojiDiscovery";

type Msg = { message_id?: number; entities?: unknown[]; reply_markup?: unknown };

/** الأدمين اللي كيستقبل الاختبارات (من الإعدادات في قاعدة البيانات) */
export async function adminTargets(): Promise<string[]> {
  const settings = await getSettings();
  const ids = [...(settings.adminIds || [])].map(String).filter((id) => /^\d{4,20}$/.test(id));
  const owner = String(settings.ownerUsername || "");
  if (/^\d{4,20}$/.test(owner) && !ids.includes(owner)) ids.push(owner);
  return ids;
}

function tag(emoji: string, id: string): string {
  return `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
}

/** أول أدمين كيوصلو الإرسال */
async function reachableAdmin(): Promise<{ id: string; error: string }> {
  const ids = await adminTargets();
  if (!ids.length) return { id: "", error: "ما كاين حتى adminId في الإعدادات" };
  let last = "";
  for (const id of ids) {
    const res = await rawTg("sendChatAction", { chat_id: id, action: "typing" });
    if (res.ok) return { id, error: "" };
    last = `${id}: ${res.description || "فشل"}`;
  }
  return { id: "", error: `ما قدرتش نوصل لحتى أدمين — ${last}` };
}

export type CapsReport = {
  ok: boolean;
  admin: string;
  text: boolean | null;
  button: boolean | null;
  textNote: string;
  buttonNote: string;
  error?: string;
};

/** 🩺 مؤشر الحالة: هل تيليجرام كيقبل النص المتحرك وأيقونة الزر؟ (إرسال حقيقي للأدمين) */
export async function testCapabilities(): Promise<CapsReport> {
  const admin = await reachableAdmin();
  const base: CapsReport = { ok: false, admin: admin.id, text: null, button: null, textNote: "", buttonNote: "" };
  if (!admin.id) return { ...base, error: admin.error };
  const data = await loadData();
  const picks = CORE_EMOJIS.map(normEmoji).filter((e) => data.map[e]).slice(0, 3);
  if (!picks.length) return { ...base, error: "الخريطة خاوية — دير «اكتشاف» أولاً" };
  const ids = picks.map((e) => data.map[e].id);

  // (أ) نص متحرك فقط
  const a = await rawTg<Msg>("sendMessage", {
    chat_id: admin.id,
    parse_mode: "HTML",
    text: `<b>اختبار النص المتحرك</b> ${picks.map((e, i) => tag(e, ids[i])).join(" ")}`,
  });
  let text: boolean | null = null;
  let textNote = "";
  if (!a.ok) {
    text = false;
    textNote = `رفض: ${a.description || ""}`;
  } else {
    const got = acceptedCustomEmoji(a.result);
    text = got.length > 0;
    textNote = text ? `مقبول (${got.length}/${ids.length})` : "تيليجرام قبل الرسالة ولكن حيّد الإيموجي المتحرك (مالك البوت خاصو Telegram Premium)";
  }

  // (ب) أيقونة زر + لون
  const b = await rawTg<Msg>("sendMessage", {
    chat_id: admin.id,
    text: "اختبار أيقونة الزر المتحركة",
    reply_markup: { inline_keyboard: [[{ text: "زر تجريبي", callback_data: "home", icon_custom_emoji_id: ids[0], style: "success" }]] },
  });
  let button: boolean | null = null;
  let buttonNote = "";
  if (!b.ok) {
    button = false;
    buttonNote = `رفض: ${b.description || ""}`;
  } else {
    const got = acceptedIcons(b.result);
    button = got.length > 0;
    buttonNote = button ? "مقبول" : "تيليجرام قبل الزر ولكن حيّد الأيقونة المتحركة";
  }

  const cfg = await loadCfg();
  cfg.caps = { text, button, textNote: textNote.slice(0, 200), buttonNote: buttonNote.slice(0, 200), checkedAt: Date.now() };
  await saveCfg(cfg, false);
  return { ok: true, admin: admin.id, text, button, textNote, buttonNote };
}

export type CoreReport = {
  ok: boolean;
  admin: string;
  tested: string[];
  missing: string[];
  rejected: { emoji: string; id: string; error: string }[];
  dropped: boolean;
  error?: string;
};

/** 🎯 نجرّبو الإيموجيات الأساسية فعلياً: اللي رفضو تيليجرام كيتبدّل ببديل ولا كيتحيّد */
export async function testCore(): Promise<CoreReport> {
  const admin = await reachableAdmin();
  const report: CoreReport = { ok: false, admin: admin.id, tested: [], missing: [], rejected: [], dropped: false };
  if (!admin.id) return { ...report, error: admin.error };
  const core = [...new Set(CORE_EMOJIS.map(normEmoji))];

  for (let round = 0; round < 3; round++) {
    const data = await loadData();
    const pending = core.filter((e) => data.map[e] && !data.map[e].tested);
    if (!pending.length) break;
    const res = await rawTg<Msg>("sendMessage", {
      chat_id: admin.id,
      parse_mode: "HTML",
      text: `<b>اختبار الإيموجيات الأساسية</b>\n${pending.map((e) => tag(e, data.map[e].id)).join(" ")}`,
    });
    const good: string[] = [];
    const bad: { emoji: string; id: string; error: string }[] = [];
    if (res.ok) {
      const got = new Set(acceptedCustomEmoji(res.result));
      if (!got.size) {
        // إسقاط كامل = الحساب ما مؤهلش (ماشي مشكل IDs) → ما نحيّدو والو
        report.dropped = true;
        break;
      }
      for (const e of pending) {
        if (got.has(data.map[e].id)) good.push(e);
        else bad.push({ emoji: e, id: data.map[e].id, error: "تيليجرام حيّدو من الرسالة" });
      }
    } else {
      // رفض الرسالة كاملة: نجرّبو كل واحد بوحدو باش نعرفو شكون الغالط
      for (let i = 0; i < pending.length; i += 5) {
        const chunk = pending.slice(i, i + 5);
        const results = await Promise.all(
          chunk.map((e) => rawTg<Msg>("sendMessage", { chat_id: admin.id, parse_mode: "HTML", text: `${tag(e, data.map[e].id)} اختبار`, disable_notification: true })),
        );
        results.forEach((r, k) => {
          const e = chunk[k];
          if (r.ok && acceptedCustomEmoji(r.result).includes(data.map[e].id)) good.push(e);
          else bad.push({ emoji: e, id: data.map[e].id, error: r.ok ? "تيليجرام حيّدو من الرسالة" : String(r.description || "رفض") });
        });
      }
    }
    await mutate((d) => {
      for (const e of good) if (d.map[e]) d.map[e].tested = true;
      for (const b of bad) rejectId(d, b.emoji, b.id, b.error);
    });
    report.rejected.push(...bad);
    if (!bad.length) break;
  }
  const final = await loadData();
  report.tested = core.filter((e) => final.map[e]?.tested);
  report.missing = core.filter((e) => !final.map[e]);
  report.ok = true;
  return report;
}

/** 🔘 زر «اختبار» لإيموجي واحد: نص متحرك + أيقونة زر → جواب تيليجرام الحرفي */
export async function testOne(emojiRaw: string) {
  const emoji = normEmoji(String(emojiRaw || "").trim());
  const admin = await reachableAdmin();
  if (!admin.id) return { ok: false, error: admin.error };
  const data = await loadData();
  const entry = data.map[emoji];
  if (!entry) return { ok: false, error: `${emoji || "?"} ما كاينش في الخريطة` };
  const res = await rawTg<Msg>("sendMessage", {
    chat_id: admin.id,
    parse_mode: "HTML",
    text: `${tag(emoji, entry.id)} <b>اختبار</b> — الباقة: ${entry.pack}`,
    reply_markup: { inline_keyboard: [[{ text: "زر تجريبي", callback_data: "home", icon_custom_emoji_id: entry.id, style: "primary" }]] },
  });
  if (!res.ok) return { ok: false, admin: admin.id, id: entry.id, error: String(res.description || "رفض") };
  const text = acceptedCustomEmoji(res.result).includes(entry.id);
  const button = acceptedIcons(res.result).includes(entry.id);
  if (text) await mutate((d) => { if (d.map[emoji]?.id === entry.id) d.map[emoji].tested = true; });
  return { ok: true, admin: admin.id, id: entry.id, pack: entry.pack, text, button, messageId: res.result?.message_id };
}

/** 💥 اختبار الاحتياط بـ ID غالط عمداً: خاص الرسالة توصل على أي حال */
export async function testFallback() {
  const admin = await reachableAdmin();
  if (!admin.id) return { ok: false, error: admin.error };
  const WRONG = "1"; // ID غالط عمداً (للاختبار فقط — ما يدخلش للخريطة)
  const attempts = buildAttempts(
    "sendMessage",
    {
      chat_id: admin.id,
      parse_mode: "HTML",
      text: "🔥 <b>اختبار الاحتياط</b>\nهاد الرسالة تصيفطات بـ ID غالط عمداً — وخاصها توصل بلا حتى خطأ ✅",
      reply_markup: { inline_keyboard: [[{ text: "🏠 القائمة الرئيسية", callback_data: "home", style: "primary" }]] },
    },
    () => WRONG,
    { mode: "animated", text: true, icons: true, strip: true, bulk: false, privateChat: true },
  );
  const out = await runLadder<Msg>("sendMessage", attempts);
  return {
    ok: out.res.ok,
    admin: admin.id,
    delivered: out.res.ok,
    levelUsed: out.used.level,
    tries: out.tries,
    errors: out.errors,
    acceptedAnimated: out.res.ok ? acceptedCustomEmoji(out.res.result).length : 0,
    acceptedIcons: out.res.ok ? acceptedIcons(out.res.result).length : 0,
    finalError: out.res.ok ? "" : String(out.res.description || ""),
  };
}

const SCREENS: { key: string; title: string; text?: string; data?: string }[] = [
  { key: "start", title: "/start", text: "/start" },
  { key: "shop", title: "المتجر", data: "shop" },
  { key: "contests", title: "المسابقات", data: "home" },
  { key: "account", title: "حسابي", data: "profile" },
  { key: "points", title: "نقاطي", data: "points" },
  { key: "reflink", title: "رابط الإحالة", data: "reflink" },
];

/** 📸 نصيفطو كل شاشة رئيسية للأدمين عبر نفس مسار البوت الحقيقي ونرجّعو شنو قبل تيليجرام */
export async function snapshotScreens(only?: string[]) {
  const admin = await reachableAdmin();
  if (!admin.id) return { ok: false, error: admin.error, screens: [] };
  const { handleUpdate } = await import("./bot");
  const from = { id: Number(admin.id), is_bot: false, first_name: "Admin" };
  const screens = [];
  let seq = 0;
  for (const screen of SCREENS.filter((s) => !only?.length || only.includes(s.key))) {
    const since = Date.now();
    const update = (screen.text
      ? { update_id: 990000 + ++seq, message: { message_id: 0, from, chat: { id: from.id, type: "private" }, text: screen.text, date: Math.floor(since / 1000) } }
      : { update_id: 990000 + ++seq, callback_query: { id: `snapshot-${since}`, from, data: screen.data } }) as TgUpdate;
    let error = "";
    try {
      await handleUpdate(update);
    } catch (e) {
      error = String((e as Error)?.message || e);
    }
    const sent = getTrace()
      .filter((t) => t.at >= since && /^(sendMessage|sendPhoto|editMessageText)$/.test(t.method) && String(t.payload.chat_id) === admin.id)
      .reverse();
    const outcomes = getEmojiOutcomes(since).filter((o) => o.chatId === admin.id && o.method !== "answerCallbackQuery").reverse();
    const last = sent[sent.length - 1];
    screens.push({
      key: screen.key,
      title: screen.title,
      ok: !error && outcomes.every((o) => o.ok) && sent.length > 0,
      error,
      messages: outcomes.map((o) => ({ method: o.method, ok: o.ok, level: o.level, tries: o.tries, animated: o.animated, accepted: o.accepted, icons: o.icons, iconsAccepted: o.iconsAccepted, firstError: o.firstError, error: o.error })),
      text: last ? stripTags(String(last.payload.text ?? last.payload.caption ?? "")).slice(0, 900) : "",
      buttons: last ? (((last.payload.reply_markup as { inline_keyboard?: { text?: string; style?: string; icon_custom_emoji_id?: string }[][] })?.inline_keyboard || []).map((row) => row.map((b) => `${b.icon_custom_emoji_id ? "✦" : ""}${b.text}${b.style ? ` [${b.style}]` : ""}`))) : [],
    });
  }
  return { ok: screens.every((s) => s.ok), admin: admin.id, screens };
}

/** 📣 عيّنة بث + رسالة فوز للأدمين فقط (نفس مسار الإرسال الحقيقي) */
export async function sampleMessages() {
  const admin = await reachableAdmin();
  if (!admin.id) return { ok: false, error: admin.error };
  const since = Date.now();
  const broadcast = await sendMessage(admin.id, "📢 عيّنة بث: مسابقة جديدة بدات دابا 🔥\nشارك واربح جوائز 🎁 — بالتوفيق للجميع 🏆", undefined, { parse_mode: undefined, __ctx: "bulk" });
  const win = await tgCall("sendMessage", {
    chat_id: admin.id,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text: ["🎉 <b>مبروك!</b> (عيّنة رسالة الفوز)", "", "وصلت <b>3/3</b> نقاط 🏆", "🎁 تواصل مع المالك باش تستلم <b>جائزة عشوائية</b>."].join("\n"),
    reply_markup: { inline_keyboard: [[{ text: "🏁 المسابقات", callback_data: "home" }]] },
  });
  const outcomes = getEmojiOutcomes(since).filter((o) => o.chatId === admin.id).reverse();
  return {
    ok: broadcast.ok && win.ok,
    admin: admin.id,
    broadcast: { ...(outcomes[0] || {}), ok: broadcast.ok, error: broadcast.ok ? "" : String(broadcast.description || "") },
    win: { ...(outcomes[1] || {}), ok: win.ok, error: win.ok ? "" : String(win.description || "") },
  };
}

export async function setMode(mode: string): Promise<{ ok: boolean; message: string; mode?: EmojiMode }> {
  if (mode !== "animated" && mode !== "stickers" && mode !== "plain") return { ok: false, message: "وضع غير معروف" };
  const cfg = await loadCfg();
  cfg.mode = mode;
  await saveCfg(cfg, false);
  invalidateRuntime();
  return { ok: true, mode, message: `الوضع دابا: ${mode}` };
}

/** 📋 كل ما تحتاجو صفحة «الإيموجي» في اللوحة */
export async function emojiStatus(opts: { q?: string; limit?: number } = {}) {
  const [cfg, data] = await Promise.all([loadCfg(), loadData()]);
  const core = [...new Set(CORE_EMOJIS.map(normEmoji))];
  const q = normEmoji(String(opts.q || "").trim()).toLowerCase();
  const row = (emoji: string, e: EmojiEntry) => ({ emoji, id: e.id, pack: e.pack, anim: e.anim, tested: Boolean(e.tested), manual: Boolean(e.manual), core: core.includes(emoji), alts: e.alts || [] });
  const all = Object.entries(data.map).map(([emoji, e]) => row(emoji, e));
  const filtered = q ? all.filter((r) => r.emoji === q || r.pack.toLowerCase().includes(q) || r.id === q) : all;
  filtered.sort((a, b) => Number(b.core) - Number(a.core) || Number(b.manual) - Number(a.manual) || Number(b.tested) - Number(a.tested));
  const usage: Record<string, number> = {};
  for (const r of all) usage[r.pack] = (usage[r.pack] || 0) + 1;
  return {
    ok: true,
    mode: cfg.mode,
    caps: cfg.caps,
    discovery: cfg.discovery,
    candidates: CANDIDATE_EMOJI_PACKS.length,
    counts: {
      emojis: all.length,
      animated: all.filter((r) => r.anim).length,
      tested: all.filter((r) => r.tested).length,
      packs: Object.values(data.packs).filter((p) => p.type === "custom_emoji").length,
      stickerPacks: Object.values(data.packs).filter((p) => p.type === "regular").length,
      stickers: Object.keys(data.stickers).length,
      failedPacks: Object.keys(data.failed).length,
      rejected: Object.keys(data.rejected).length,
    },
    core: core.map((emoji) => ({ emoji, ...(data.map[emoji] ? { id: data.map[emoji].id, pack: data.map[emoji].pack, tested: Boolean(data.map[emoji].tested) } : { id: "", pack: "", tested: false }) })),
    packs: Object.values(data.packs).map((p) => ({ ...p, used: usage[p.name] || 0 })).sort((a, b) => b.used - a.used),
    failed: Object.entries(data.failed).map(([name, f]) => ({ name, error: f.error })),
    rejected: Object.entries(data.rejected).map(([id, error]) => ({ id, error })),
    removedPacks: data.removedPacks,
    stickers: Object.entries(data.stickers).slice(0, 60).map(([emoji, s]) => ({ emoji, pack: s.pack })),
    total: filtered.length,
    map: filtered.slice(0, Math.min(500, Math.max(1, opts.limit || 150))),
  };
}
