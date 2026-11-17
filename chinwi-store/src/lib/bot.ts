import { allSettings, log, one, q, setSetting } from "./db";
import { env } from "./env";
import { money, shortDate } from "./format";
import {
  attachReceipt,
  createOrder,
  getOrder,
  listOrders,
  ORDER_STATUS_LABEL,
  setOrderStatus,
  userOrders,
} from "./orders";
import {
  clearUserState,
  createProduct,
  getCategory,
  getProduct,
  getUser,
  isAdminUser,
  listCategories,
  listChannels,
  listProducts,
  listWallets,
  setUserState,
  settingBool,
  settingNumber,
  settingString,
  settings as loadSettings,
  touchUser,
  upsertUser,
} from "./store";
import {
  answerCallback,
  escapeHtml,
  getChatMemberStatus,
  getUserAvatarFileId,
  sendChatAction,
  sendMessage,
  sendPhoto,
  setEmojiMap,
  type ButtonStyle,
  type InlineButton,
  type InlineKeyboard,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
  type TgUser,
} from "./telegram";
import type { CategoryRow, ChannelRow, OrderRow, ProductRow, SettingsMap, UserRow, WalletRow } from "./types";

/* ───────────────────────── أدوات الأزرار ───────────────────────── */

const G = "🟢";
const R = "🔴";
const Y = "🟢";

/** الأزرار التي تُلوَّن أحمر: الرجوع والإلغاء والرفض */
function isDanger(cb: string | undefined, text: string): boolean {
  if (!cb) return /^(❌|🔙|🗑|⛔️)/.test(text);
  return /^(cancel:|rej:|rm:|del:|unblock:)/.test(cb) || /^(❌|🔙)/.test(text);
}
/** تلوين تلقائي: أخضر للعمليات، أحمر للرجوع/الإلغاء، بلا لون للعناوين */
function paint<T extends InlineButton>(btn: T): T {
  if (btn.style) return btn;
  if (btn.callback_data === "nop" && !/^(💰)/.test(btn.text)) return btn;
  return { ...btn, style: isDanger(btn.callback_data, btn.text) ? "danger" : "success" };
}

function b(text: string, callback_data: string, style?: ButtonStyle): InlineButton {
  return style ? { text, callback_data, style } : paint({ text, callback_data });
}
function link(text: string, url: string, style?: ButtonStyle): InlineButton {
  return style ? { text, url, style } : paint({ text, url });
}
function kb(rows: InlineButton[][]): InlineKeyboard {
  return { inline_keyboard: rows.filter((r) => r.length > 0).map((r) => r.map((x) => paint(x))) };
}

function imgUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${env.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function mentions(user: TgUser | UserRow): string {
  const username = "username" in user ? user.username : null;
  if (username) return `@${username}`;
  return escapeHtml(("first_name" in user && user.first_name) || "بدون اسم");
}


/* ───────────────────────── حماية ───────────────────────── */

const rateBuckets = new Map<number, { count: number; start: number }>();

/** حدّ رسائل بسيط في الذاكرة لكل مستخدم (نافذة دقيقة) */
function rateLimitOk(userId: number, limit: number): boolean {
  if (!Number.isFinite(limit) || limit <= 0) return true;
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || now - bucket.start > 60_000) {
    rateBuckets.set(userId, { count: 1, start: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/** تنبيه المالك بحدث أمني (مرة واحدة لكل حدث) */
async function notifyOwnerSecurity(text: string): Promise<void> {
  try {
    const s = await allSettings();
    if (!settingBool(s, "security_alert_owner", true)) return;
    const ownerId = Number(s.owner_chat_id ?? 0);
    if (!ownerId) return;
    await sendMessage(ownerId, `🛡 <b>تنبيه أمني</b>\n${text}`);
  } catch {
    /* صامت */
  }
}

/* ───────────────────────── بوابة الاشتراك ───────────────────────── */

type SubState = { ok: boolean; missing: ChannelRow[]; unverifiable: ChannelRow[] };

async function subscriptionState(userId: number, channels: ChannelRow[]): Promise<SubState> {
  const missing: ChannelRow[] = [];
  const unverifiable: ChannelRow[] = [];
  for (const ch of channels) {
    const status = await getChatMemberStatus(ch.chat, userId);
    if (!status) {
      unverifiable.push(ch);
      continue;
    }
    if (!["creator", "administrator", "member"].includes(status)) missing.push(ch);
  }
  return { ok: missing.length === 0, missing, unverifiable };
}

/** تنبيه للمالك مرة واحدة فقط: البوت ليس مشرفاً في القنوات */
async function warnOwnerUnverifiedOnce(): Promise<void> {
  try {
    const s = await loadSettings();
    if (settingBool(s, "gate_warned", false)) return;
    await notifyOwner(
      [
        "⚠️ <b>تنبيه إداري</b>",
        "",
        "البوت لم يستطع التحقق من اشتراك الزبائن في القنوات (ليس مشرفاً فيها).",
        "أضف البوت <b>مشرفاً</b> في القنوات حتى يعمل التحقق التلقائي بدقة.",
      ].join("\n"),
    );
    await setSetting("gate_warned", true);
  } catch {
    /* لا نعطّل التدفق */
  }
}

/** رسالة بوابة الاشتراك — أزرار خضراء للقنوات + زر التحقق */
async function sendSubscriptionGate(
  chatId: number,
  s: SettingsMap,
  state: SubState,
  channels: ChannelRow[],
): Promise<void> {
  const rows: InlineButton[][] = channels.map((ch) => [
    link(`📣 اشترك في ${ch.title || ch.chat}`, ch.url || `https://t.me/${ch.chat.replace(/^@/, "")}`),
  ]);
  rows.push([link(`💬 الدعم`, `https://t.me/${settingString(s, "support_username", "F_Q_Q_T").replace(/^@/, "")}`)]);
  rows.push([b(`🔄 تحقق من الاشتراك`, "chk")]);

  const text = [
    "🔒 <b>الاشتراك إجباري — خطوة واحدة فقط</b>",
    "━━━━━━━━━━━━━━━",
    "🎁 باش تستفيد من <b>كل</b> خدمات المتجر، اشترك في القنوات التالية 👇",
    "",
    ...channels.map((ch) => {
      const bad = state.missing.includes(ch);
      return `${bad ? "📣" : "✅"} <b>${escapeHtml(ch.title || ch.chat)}</b>${bad ? " — <i>لم تشترك بعد</i>" : ""}`;
    }),
    "━━━━━━━━━━━━━━━",
    "⚡️ الاشتراك يمنحك: أسعار خاصة، عروض حصرية، ودعماً أسرع.",
    "👇 بعد ما تشترك اضغط <b>«🔄 تحقق من الاشتراك»</b>",
  ].join("\n");
  await sendMessage(chatId, text, kb(rows));
}

/** حسابات معفاة من الاشتراك الإجباري (يوزرات أو أرقام آي دي، مفصولة بفاصلة) */
function gateExemptList(s: SettingsMap): string[] {
  return settingString(s, "gate_bypass", "@A_B_B_X_N")
    .split(/[,\s]+/)
    .map((x) => x.replace(/^@/, "").trim().toLowerCase())
    .filter(Boolean);
}

function isGateExempt(s: SettingsMap, userId: number, user: UserRow | null): boolean {
  const list = gateExemptList(s);
  if (!list.length) return false;
  if (list.includes(String(userId))) return true;
  const un = (user?.username ?? "").replace(/^@/, "").toLowerCase();
  return Boolean(un) && list.includes(un);
}

async function guardSubscription(
  chatId: number,
  userId: number,
  s: SettingsMap,
  user: UserRow | null,
): Promise<boolean> {
  if (!settingBool(s, "require_subscription", true)) return true;
  // حسابات معفاة (مثل صاحب المتجر) تمرّ مباشرة بلا بوابة
  if (isGateExempt(s, userId, user)) return true;
  const channels = await listChannels(true);
  if (!channels.length) return true;
  const state = await subscriptionState(userId, channels);
  // نفتح القائمة فقط إذا تحقّقنا فعلياً من الاشتراك في كل القنوات
  if (state.ok && state.unverifiable.length === 0) return true;
  void user; // المالك يرى البوابة أيضاً (للمعاينة) ثم يكمل بزر التحقق
  await sendSubscriptionGate(chatId, s, state, channels);
  return false;
}

/* ───────────────────────── أدوات عرض الأزرار ───────────────────────── */

/** يختار إيموجي مناسباً لكل عرض حسب اسمه (مثل تصميم الأزرار في تيليجرام) */
function guessEmoji(name: string, fallback?: string | null): string {
  const n = String(name || "");
  const rules: [RegExp, string][] = [
    [/جوهر|جواهر|diamond/i, "💎"],
    [/بريميوم|premium/i, "⭐️"],
    [/كوين|كوينز|نقط|coin|point/i, "⭐️"],
    [/بيس|pes|كونت|لاعب|اسطوري|أسطوري/i, "⚽️"],
    [/تيك|tiktok/i, "🎵"],
    [/دولار|usd/i, "💵"],
    [/شهر|أسبوع|سنو|شهري/i, "🎁"],
    [/باقة|عرض|خصم|تخفيض/i, "🔥"],
    [/حساب|اشتراك/i, "👤"],
  ];
  for (const [re, emoji] of rules) if (re.test(n)) return emoji;
  return (fallback && fallback.trim()) || "🎁";
}

/** قصّ الاسم حتى يبقى الزر أنيقاً */
function shortName(name: string, max = 24): string {
  const n = String(name || "").trim();
  return n.length > max ? `${n.slice(0, max - 1)}…` : n;
}

/** رقم قصير للسعر (بدون كسور) */
function priceLabel(p: ProductRow, s: SettingsMap): string {
  const cur = settingString(s, "currency", "دج");
  if (p.price === null || p.price === undefined) return "📩 سعر خاص";
  return money(p.price, cur);
}

/* ───────────────────────── القوائم ───────────────────────── */

async function sendMainMenu(chatId: number, s: SettingsMap, user: UserRow | null, editFrom?: number, withBanner = false): Promise<void> {
  const cats = await listCategories({ activeOnly: true });
  const bySlug = (slug: string): CategoryRow | undefined => cats.find((c) => c.slug === slug);
  const support = settingString(s, "support_username", "F_Q_Q_T").replace(/^@/, "");

  const rows: InlineButton[][] = [];
  rows.push([b(`🎮 شحن الألعاب الرقمية`, "games")]);
  const tg = bySlug("telegram");
  if (tg) rows.push([b(`🌟 شحن تليجرام بريموم`, `cat:${tg.id}`)]);
  const tt = bySlug("tiktok");
  if (tt) rows.push([b(`🎵 شحن عملات تيك توك`, `cat:${tt.id}`)]);
  const digital = bySlug("digital");
  if (digital) rows.push([b(`🤖 المنتجات الرقمية والذكاء الاصطناعي`, `cat:${digital.id}`)]);
  rows.push([b(`🔥 الأكثر مبيعاً`, "top"), b(`🔍 بحث`, "search")]);
  rows.push([b(`💵 بيع وشراء الدولار للمتجر`, "usd")]);
  rows.push([b(`🧾 طلباتي`, "orders"), b(`👤 حسابي`, "account")]);
  rows.push([link(`📞 الدعم الفني وتواصل مع المالك`, `https://t.me/${support}`, "danger")]);
  if (isAdminUser(user)) rows.push([b(`🛡 لوحة الإدارة`, "adm")]);

  const text = [
    `👑 <b>${escapeHtml(settingString(s, "store_name", "CHINWI STORE"))}</b>  ✨`,
    `<i>${escapeHtml(settingString(s, "store_tagline", ""))}</i>`,
    "━━━━━━━━━━━━━━━",
    settingString(s, "welcome_text", ""),
    "",
    `📣 ${escapeHtml(settingString(s, "announcement", ""))}`,
    "━━━━━━━━━━━━━━━",
    `👤 مرحباً <b>${mentions(user ?? { id: chatId } as TgUser)}</b> — نوّرت المتجر 🌟`,
    "🎯 <b>اختر القسم الذي تريده 👇</b>",
  ].join("\n");

  void editFrom;
  if (withBanner) {
    const banner = imgUrl(settingString(s, "banner_image", "/catalog/banner.jpg"));
    try {
      await sendPhoto(chatId, { url: banner }, text, kb(rows));
      return;
    } catch {
      /* لو رفض تيليجرام الصورة/الوصف نرسل نصاً */
    }
  }
  await sendMessage(chatId, text, kb(rows));
}

/** قائمة فرعية: شحن الألعاب الرقمية (فري فاير / بيس …) */
async function sendGamesMenu(chatId: number, s: SettingsMap): Promise<void> {
  const cats = (await listCategories({ activeOnly: true })).filter((c) => c.section === "games");
  if (!cats.length) {
    await sendMessage(chatId, `⚠️ لا توجد أقسام ألعاب حالياً.`, kb([[b(`🏠 الرئيسية`, "home")]]));
    return;
  }
  const counts = new Map<number, number>();
  for (const row of await q<{ category_id: string; c: string }>(
    "SELECT category_id, count(*)::text AS c FROM products WHERE active = true GROUP BY category_id",
  )) {
    counts.set(Number(row.category_id), Number(row.c));
  }
  const rows: InlineButton[][] = cats.map((c) => [
    b(`${c.emoji} ${c.name}${counts.get(c.id) ? ` (${counts.get(c.id)})` : ""}`, `cat:${c.id}`),
  ]);
  rows.push([b(`🏠 الرئيسية`, "home")]);
  await sendMessage(
    chatId,
    [
      "🎮 <b>شحن الألعاب الرقمية</b>",
      "",
      "اختر اللعبة التي تريد شحنها 👇",
      ...cats.map((c) => `• ${c.emoji} <b>${escapeHtml(c.name)}</b>${c.description ? ` — ${escapeHtml(c.description)}` : ""}`),
    ].join("\n"),
    kb(rows),
  );
}

async function sendCategory(chatId: number, categoryId: number, s: SettingsMap): Promise<void> {
  const cat = await getCategory(categoryId);
  if (!cat) {
    await sendMessage(chatId, `⚠️ هذا القسم غير موجود.`, kb([[b(`🔙 رجوع`, "home")]]));
    return;
  }
  const products = await listProducts({ categoryId, activeOnly: true });
  if (!products.length) {
    await sendMessage(
      chatId,
      `${cat.emoji} <b>${escapeHtml(cat.name)}</b>\n\n${R} لا توجد عروض في هذا القسم حالياً.`,
      kb([[b(`🔙 رجوع`, "home")]]),
    );
    return;
  }

  const rows: InlineButton[][] = [];
  // هيدر القسم (مثل: — 🎁 حسابات بيس —)
  rows.push([b(`${cat.emoji || "🗂"} — ${shortName(cat.name, 30)} —`, "nop")]);
  // كل عرض = زر سعر أحمر + زر اسم أخضر
  for (const p of products) {
    rows.push([
      b(`💰 ${priceLabel(p, s)}`, "nop", "danger"),
      b(`${guessEmoji(p.name, cat.emoji)} ${shortName(p.name)}`, `prd:${p.id}`),
    ]);
  }
  rows.push([b(`🏠 الرئيسية`, "home"), b(`🔍 بحث`, "search")]);

  const caption = [
    `${cat.emoji} <b>${escapeHtml(cat.name)}</b>`,
    cat.description ? `<i>${escapeHtml(cat.description)}</i>` : "",
    "",
    `📦 عدد العروض: <b>${products.length}</b>`,
    "اختر العرض المناسب 👇",
  ]
    .filter(Boolean)
    .join("\n");

  await sendPhoto(chatId, { url: imgUrl(cat.image_url) }, caption, kb(rows));
}

async function sendTop(chatId: number, s: SettingsMap): Promise<void> {
  const products = await q<ProductRow>(
    "SELECT * FROM products WHERE active = true ORDER BY sold DESC, price ASC NULLS LAST LIMIT 12",
  );
  if (!products.length) {
    await sendMessage(chatId, `⚠️ لا توجد عروض حالياً.`, kb([[b(`🔙 رجوع`, "home")]]));
    return;
  }
  const rows: InlineButton[][] = [[b("🔥 — الأكثر مبيعاً —", "nop")]];
  for (const p of products) {
    rows.push([
      b(`💰 ${priceLabel(p, s)}`, "nop", "danger"),
      b(`${guessEmoji(p.name)} ${shortName(p.name)}`, `prd:${p.id}`),
    ]);
  }
  rows.push([b(`🏠 الرئيسية`, "home"), b(`🔍 بحث`, "search")]);
  await sendMessage(
    chatId,
    [
      "🔥 <b>الأكثر مبيعاً في المتجر</b>",
      "",
      "<i>هذه العروض الأكثر طلباً من زبائننا — اضغط على الاسم لرؤية التفاصيل.</i>",
    ].join("\n"),
    kb(rows),
  );
}

async function sendSearchPrompt(chatId: number, s: SettingsMap): Promise<void> {
  await sendMessage(
    chatId,
    [
      "🔍 <b>البحث في المتجر</b>",
      "",
      "اكتب اسم المنتج أو جزءاً منه في المحادثة (مثال: <code>جوهرة</code>، <code>بيس</code>، <code>بريميوم</code>) وسأعرض لك النتائج فوراً.",
    ].join("\n"),
    kb([[b(`🏠 الرئيسية`, "home")]]),
  );
}

function priceShort(p: ProductRow, s: SettingsMap): string {
  const cur = settingString(s, "currency", "دج");
  if (p.price === null || p.price === undefined) return `${p.name} — 📩 سعر خاص`;
  return `${p.name} — ${money(p.price, cur)}`;
}

async function sendProduct(chatId: number, productId: number, s: SettingsMap): Promise<void> {
  const p = await getProduct(productId);
  if (!p || !p.active) {
    await sendMessage(chatId, `⚠️ هذا العرض غير متوفر حالياً.`, kb([[b(`🔙 رجوع`, "home")]]));
    return;
  }
  const cur = settingString(s, "currency", "دج");
  const priceLine =
    p.price === null || p.price === undefined
      ? "📩 <b>السعر غير محدد</b> — تواصل مع المالك لتحديد السعر"
      : `💰 السعر: <b>${money(p.price, cur)}</b>`;
  const wallets = await listWallets(true);
  const rows: InlineButton[][] = [];
  if (p.price === null || p.price === undefined) {
    rows.push([b(`📩 اطلب هذا المنتج`, `ask:${p.id}`)]);
  } else {
    rows.push([b(`🛒 شراء الآن — ${money(p.price, cur)}`, `buy:${p.id}`)]);
  }
  // أرقام محافظ المالك تظهر مباشرة مع المنتج (زر نسخ لكل محفظة)
  for (const w of wallets.slice(0, 5)) {
    rows.push([{ text: `📋 ${w.name} — ${w.account}`, copy_text: { text: w.account }, style: "primary" }]);
  }
  rows.push([b(`🧾 طلباتي`, "orders")]);
  rows.push([b(`🔙 رجوع للقسم`, `cat:${p.category_id}`)]);

  const details = (p.fields ?? []).map((f) => `• ${escapeHtml(f.label)}`).join("\n");
  const caption = [
    `🎁 <b>${escapeHtml(p.name)}</b>`,
    p.badge ? `<i>${escapeHtml(p.badge)}</i>` : "",
    "",
    priceLine,
    p.description ? `\n${escapeHtml(p.description)}` : "",
    details ? `\n📝 <b>المعلومات المطلوبة:</b>\n${details}` : "",
    p.stock !== null ? `\n📦 المتوفر: <b>${p.stock}</b>` : "",
    p.sold ? `\n🔥 تم بيعه: <b>${p.sold}</b> مرة` : "",
    wallets.length
      ? `\n💳 <b>الدفع إلى المالك:</b>\n${wallets.map((w) => `• ${w.emoji} ${escapeHtml(w.name)}: <code>${escapeHtml(w.account)}</code>`).join("\n")}\n<i>اضغط على الزر لنسخ الرقم، ثم أرسل الإيصال هنا بعد التحويل.</i>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendPhoto(chatId, { fileId: p.image_file_id, url: imgUrl(p.image_url) }, caption, kb(rows));
}

async function sendShop(chatId: number, s: SettingsMap): Promise<void> {
  await sendMainMenu(chatId, s, null);
}

/* ───────────────────────── إشعار المالك ───────────────────────── */

export async function ownerChatIds(): Promise<number[]> {
  const s = await loadSettings();
  const ids = new Set<number>();
  const fromSettings = settingNumber(s, "owner_chat_id", 0);
  if (fromSettings > 0) ids.add(fromSettings);
  if (env.ownerChatId > 0) ids.add(env.ownerChatId);
  const rows = await q<{ tg_id: string }>("SELECT tg_id FROM users WHERE is_owner = true OR is_admin = true");
  for (const r of rows) ids.add(Number(r.tg_id));
  return [...ids].filter((id) => id > 0);
}

async function notifyOwner(text: string, keyboard?: InlineKeyboard): Promise<void> {
  const ids = await ownerChatIds();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await sendMessage(id, text, keyboard);
      } catch (err) {
        console.error("[bot] owner notify failed", id, err);
      }
    }),
  );
}

async function notifyOwnerPhoto(fileId: string, caption: string, keyboard?: InlineKeyboard): Promise<void> {
  const ids = await ownerChatIds();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await sendPhoto(id, { fileId }, caption, keyboard);
      } catch (err) {
        console.error("[bot] owner photo failed", err);
        await sendMessage(id, caption, keyboard).catch(() => {});
      }
    }),
  );
}

/* ───────────────────────── اطلاع ───────────────────────── */

function orderSummary(o: OrderRow, s: SettingsMap): string {
  const cur = settingString(s, "currency", "دج");
  return [
    `🧾 طلب <b>#${o.code}</b>`,
    `📦 ${escapeHtml(o.product_name)}`,
    o.kind === "usd" ? `💵 الكمية: <b>${o.usd_amount}$</b> × ${o.rate} = <b>${money(o.amount, cur)}</b>` : `💰 المبلغ: <b>${money(o.amount, cur)}</b>`,
    `📊 الحالة: ${ORDER_STATUS_LABEL[o.status] ?? o.status}`,
    `🗓 ${shortDate(o.created_at)}`,
  ].join("\n");
}

/* ───────────────────────── التدفقات ───────────────────────── */

async function startPurchase(chatId: number, productId: number, userId: number, s: SettingsMap): Promise<void> {
  const p = await getProduct(productId);
  if (!p || !p.active) {
    await sendMessage(chatId, `⚠️ هذا العرض لم يعد متوفراً.`, kb([[b(`🔙 رجوع`, "home")]]));
    return;
  }
  if (p.price === null || p.price === undefined) {
    await sendMessage(
      chatId,
      [
        `📩 <b>${escapeHtml(p.name)}</b>`,
        "",
        "سعر هذا المنتج يحدده المالك حسب الطلب.",
        "اضغط على الزر لإرسال طلبك، وسيتواصل معك المالك بالسعر والتفاصيل 👇",
      ].join("\n"),
      kb([
        [b(`📩 إرسال طلب السعر`, `ask:${p.id}`)],
        [b(`🔙 رجوع`, `cat:${p.category_id}`)],
      ]),
    );
    return;
  }
  const fields = p.fields ?? [];
  if (fields.length) {
    await setUserState(userId, `field:${p.id}`, {
      productId: p.id,
      index: 0,
      values: {},
    });
    const f = fields[0];
    await sendMessage(
      chatId,
      [
        `🛒 <b>${escapeHtml(p.name)}</b> — ${money(p.price, s.currency as string)}`,
        "",
        `الخطوة <b>1/${fields.length}</b>`,
        f.label,
        f.placeholder ? `<i>${escapeHtml(f.placeholder)}</i>` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      kb([[b(`❌ إلغاء`, "home")]]),
    );
    return;
  }
  await createOrderAndShowPayment(chatId, userId, p, {}, s);
}

async function createOrderAndShowPayment(
  chatId: number,
  userId: number,
  p: ProductRow,
  values: Record<string, string>,
  s: SettingsMap,
): Promise<void> {
  const cur = settingString(s, "currency", "دج");
  // 🎟 تطبيق كود الخصم المفعّل (إن وُجد) مرة واحدة
  const user = await getUser(userId);
  const coupon = (user?.state ?? {}) as Record<string, unknown>;
  let amount = Number(p.price ?? 0);
  let couponNote = "";
  const code = typeof coupon.code === "string" ? coupon.code : "";
  if (code && amount > 0) {
    const row = await one<{ kind: string; amount: number; uses: number; max_uses: number; active: boolean }>(
      "SELECT kind, amount, uses, max_uses, active FROM coupons WHERE code = $1 AND active = true",
      [code],
    );
    if (row) {
      const discount = row.kind === "percent" ? Math.round((amount * Number(row.amount)) / 100) : Number(row.amount);
      const next = Math.max(0, amount - discount);
      if (next !== amount) {
        couponNote = `\n🎟 كود <code>${escapeHtml(code)}</code>: خصم ${money(amount - next, cur)}`;
        amount = next;
        await q("UPDATE coupons SET uses = uses + 1 WHERE code = $1", [code]);
      }
    }
    await clearUserState(userId);
  }
  const order = await createOrder({
    userId,
    kind: "product",
    productId: p.id,
    productName: p.name,
    amount,
    currency: cur,
    details: values,
    status: "pending_payment",
  });
  if (couponNote) await sendMessage(chatId, `✅ طُبّق الخصم على طلبك ${order.code}${couponNote}`);
  await showPaymentOptions(chatId, order, s);
}

async function walletsRows(orderId: number, wallets: WalletRow[]): Promise<InlineButton[][]> {
  const rows: InlineButton[][] = wallets.map((w) => [
    b(`${w.emoji} ${w.name} — ${w.account}`, `pw:${orderId}:${w.id}`),
  ]);
  rows.push([b(`❌ إلغاء الطلب`, `cancel:${orderId}`)]);
  return rows;
}

async function showPaymentOptions(chatId: number, order: OrderRow, s: SettingsMap): Promise<void> {
  const wallets = await listWallets(true);
  const cur = settingString(s, "currency", "دج");
  if (!wallets.length) {
    await sendMessage(chatId, `⚠️ لا توجد طرق دفع مضافة حالياً، تواصل مع الدعم.`, kb([[b(`💬 الدعم`, "support")]]));
    return;
  }
  const text = [
    "💳 <b>إتمام الدفع</b>",
    "",
    `🧾 رقم الطلب: <code>${order.code}</code>`,
    `📦 ${escapeHtml(order.product_name)}`,
    order.kind === "usd"
      ? `💵 ${order.usd_amount}$ × ${order.rate} دج = <b>${money(order.amount, cur)}</b>`
      : `💰 المبلغ المطلوب: <b>${money(order.amount, cur)}</b>`,
    "",
    "اختر وسيلة الدفع المناسبة لك 👇",
    "<i>بعد التحويل أرسل صورة الإيصال داخل البوت (نفس المحادثة).</i>",
  ].join("\n");
  await sendMessage(chatId, text, kb(await walletsRows(order.id, wallets)));
}

async function showWalletDetails(chatId: number, orderId: number, walletId: number, s: SettingsMap): Promise<void> {
  const order = await getOrder(orderId);
  const wallets = await listWallets(true);
  const wallet = wallets.find((w) => w.id === walletId);
  if (!order || !wallet) {
    await sendMessage(chatId, `⚠️ بيانات غير صحيحة.`, kb([[b(`🔙 رجوع`, "home")]]));
    return;
  }
  const cur = settingString(s, "currency", "دج");
  await q("UPDATE orders SET payment_method = $2, wallet_id = $3 WHERE id = $1", [
    orderId,
    `${wallet.name}`,
    wallet.id,
  ]);
  const text = [
    `${wallet.emoji} <b>${escapeHtml(wallet.name)}</b>`,
    "",
    `🧾 الطلب: <code>${order.code}</code>`,
    `💰 المبلغ: <b>${money(order.amount, cur)}</b>`,
    "",
    `📮 <b>${escapeHtml(wallet.holder || "العنوان")}:</b>`,
    `<code>${escapeHtml(wallet.account)}</code>`,
    "",
    wallet.instructions ? `<i>${escapeHtml(wallet.instructions)}</i>` : "",
    "",
    "1️⃣ انسخ العنوان من الزر أدناه وحوّل المبلغ.",
    "2️⃣ اضغط زر «تم الدفع» وأرسل صورة الإيصال.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendMessage(
    chatId,
    text,
    kb([
      [{ text: `📋 نسخ العنوان`, copy_text: { text: wallet.account } }],
      [b(`✅ تم الدفع — إرسال الإيصال`, `paid:${order.id}`)],
      [b(`🔄 تغيير وسيلة الدفع`, `pay:${order.id}`)],
    ]),
  );
}

async function askReceipt(chatId: number, order: OrderRow, userId: number, s: SettingsMap): Promise<void> {
  await setUserState(userId, `receipt:${order.id}`, {});
  await sendMessage(
    chatId,
    [
      "📸 <b>أرسل الإيصال الآن</b>",
      "",
      `🧾 الطلب: <code>${order.code}</code>`,
      settingString(s, "receipt_note", ""),
      "",
      "<i>يمكنك إرسال صورة أو ملف PDF — سنتحقق منه بسرعة.</i>",
    ].join("\n"),
    kb([[b(`❌ إلغاء`, `cancel:${order.id}`)]]),
  );
}

async function submitReceipt(
  chatId: number,
  user: UserRow,
  order: OrderRow,
  msg: TgMessage,
  s: SettingsMap,
): Promise<void> {
  const fileId = msg.photo?.at(-1)?.file_id ?? msg.document?.file_id;
  const kind = msg.photo ? "photo" : "document";
  if (!fileId) {
    await sendMessage(chatId, `⚠️ أرسل صورة الإيصال من فضلك.`, kb([[b(`❌ إلغاء`, `cancel:${order.id}`)]]));
    return;
  }
  const updated = await attachReceipt(order.id, fileId, kind);
  await clearUserState(user.tg_id);
  const cur = settingString(s, "currency", "دج");

  await sendMessage(
    chatId,
    [
      "✅ <b>تم استلام إيصالك بنجاح</b>",
      "",
      `🧾 الطلب: <code>${order.code}</code>`,
      `💰 المبلغ: <b>${money(order.amount, cur)}</b>`,
      "⏱ الحالة: <b>قيد التحقق</b>",
      "",
      "<i>سيتم التحقق من الدفع في أقرب وقت — عادةً خلال دقائق.</i>",
      "🔔 سنُعلمك هنا مباشرة بعد المراجعة.",
    ].join("\n"),
    kb([
      [b(`🧾 طلباتي`, "orders")],
      [b(`🏠 القائمة الرئيسية`, "home")],
    ]),
  );

  const caption = [
    "🔔 <b>إيصال دفع جديد بانتظار المراجعة</b>",
    "",
    `🧾 <code>${updated?.code ?? order.code}</code>`,
    `📦 ${escapeHtml(order.product_name)}`,
    order.kind === "usd" ? `💵 ${order.usd_amount}$ (${order.rate} دج/$) = ${money(order.amount, cur)}` : `💰 ${money(order.amount, cur)}`,
    order.payment_method ? `💳 ${escapeHtml(order.payment_method)}` : "",
    `👤 ${mentions(user)} — <code>${user.tg_id}</code>`,
    Object.entries(order.details ?? {}).length
      ? `\n📝 <b>بيانات الزبون:</b>\n${Object.entries(order.details ?? {})
          .map(([k, v]) => `• ${escapeHtml(k)}: <code>${escapeHtml(v)}</code>`)
          .join("\n")}`
      : "",
    order.note ? `\n📄 ${escapeHtml(order.note)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await notifyOwnerPhoto(fileId, caption, kb([
    [b(`✅ قبول الطلب`, `apv:${order.id}`), b(`❌ رفض`, `rej:${order.id}`)],
  ]));
  await log("receipt_submitted", { order: order.code, user: user.tg_id }, "info", String(user.tg_id));
}

async function showUsdIntro(chatId: number, s: SettingsMap): Promise<void> {
  const rates = (Array.isArray(s.usd_rates) ? (s.usd_rates as number[]) : [250, 255]).filter((n) => Number(n) > 0);
  const rows = rates.map((r) => [b(`💵 1$ = ${r} دج`, `usdr:${r}`)]);
  rows.push([b(`🔙 رجوع`, "home")]);
  await sendMessage(
    chatId,
    [
      "💵 <b>بيع الدولار للمالك</b>",
      "",
      "نشتري منك الدولار بأفضل سعر في السوق 💱",
      "",
      ...rates.map((r) => `• <b>1$ = ${r} دج</b>`),
      "",
      `📉 الحد الأدنى: <b>${settingNumber(s, "usd_min", 5)}$</b>`,
      "اختر سعر الصرف 👇",
    ].join("\n"),
    kb(rows),
  );
}

async function usdAskAmount(chatId: number, rate: number, userId: number, s: SettingsMap): Promise<void> {
  await setUserState(userId, `usd:${rate}`, { rate });
  await sendMessage(
    chatId,
    [
      `💵 <b>سعر الصرف المختار: 1$ = ${rate} دج</b>`,
      "",
      `أرسل الكمية التي تريد بيعها بالدولار (رقم فقط).`,
      `مثال: <code>10</code> يعني 10$ = <b>${money(10 * rate, s.currency as string)}</b>`,
      "",
      `📉 الحد الأدنى: ${settingNumber(s, "usd_min", 5)}$`,
    ].join("\n"),
    kb([[b(`❌ إلغاء`, "home")]]),
  );
}

async function supportScreen(chatId: number, s: SettingsMap): Promise<void> {
  const handle = settingString(s, "support_username", "F_Q_Q_T").replace(/^@/, "");
  await sendMessage(
    chatId,
    [
      "💬 <b>الدعم الفني</b>",
      "",
      "فريقنا متواجد لخدمتك في أي وقت ⏱",
      "",
      "• مشكلة في الطلب؟ أرسل رقم الطلب.",
      "• استفسار عن منتج؟ اكتب اسمه.",
      `• أو راسلنا مباشرة: @${handle}`,
    ].join("\n"),
    kb([
      [b(`✍️ اكتب رسالتك للمالك`, "msgowner")],
      [link(`💬 محادثة مباشرة`, `https://t.me/${handle}`)],
      [b(`🔙 رجوع`, "home")],
    ]),
  );
}

async function accountScreen(chatId: number, user: UserRow, s: SettingsMap): Promise<void> {
  await sendMessage(
    chatId,
    [
      "👤 <b>حسابي</b>",
      "",
      `🆔 المعرف: <code>${user.tg_id}</code>`,
      `👤 الاسم: ${mentions(user as unknown as TgUser)}`,
      `📅 عضو منذ: ${shortDate(user.created_at)}`,
      `🧾 عدد الطلبات: <b>${user.orders_count}</b>`,
      `💰 إجمالي الشراء: <b>${money(user.total_spent, settingString(s, "currency", "دج"))}</b>`,
      user.is_blocked ? "\n🔴 حسابك محظور — تواصل مع الدعم." : "",
    ].join("\n"),
    kb([
      [b(`🧾 طلباتي`, "orders"), b(`💬 الدعم`, "support")],
      [b(`🔙 رجوع`, "home")],
    ]),
  );
}

async function myOrders(chatId: number, userId: number, s: SettingsMap): Promise<void> {
  const rows = await userOrders(userId, 8);
  if (!rows.length) {
    await sendMessage(
      chatId,
      "🧾 <b>طلباتي</b>\n\nلا توجد طلبات بعد — ابدأ التسوق الآن 👇",
      kb([[b(`🛍 المتجر`, "home")]]),
    );
    return;
  }
  const buttons: InlineButton[][] = rows.map((o) => [
    b(`${o.status === "approved" || o.status === "delivered" ? G : o.status === "rejected" ? R : Y} ${o.code} — ${o.product_name.slice(0, 22)}`, `ord:${o.id}`),
  ]);
  buttons.push([b(`🏠 القائمة`, "home")]);
  await sendMessage(
    chatId,
    [
      "🧾 <b>طلباتي</b>",
      "",
      `لديك <b>${rows.length}</b> طلب — اضغط على الطلب لرؤية التفاصيل:`,
      "",
      ...rows.map(
        (o) => `${ORDER_STATUS_LABEL[o.status] ?? o.status} — <code>${o.code}</code> — ${money(o.amount, settingString(s, "currency", "دج"))}`,
      ),
    ].join("\n"),
    kb(buttons),
  );
}

/* ───────────────────────── لوحة إدارة البوت ───────────────────────── */

async function adminPanel(chatId: number, s: SettingsMap): Promise<void> {
  const stats = await one<{ users: string; pending: string; revenue: string; today: string }>(
    `SELECT (SELECT count(*) FROM users)::text AS users,
      (SELECT count(*) FROM orders WHERE status='awaiting_review')::text AS pending,
      (SELECT COALESCE(sum(amount),0) FROM orders WHERE status IN ('approved','delivered'))::text AS revenue,
      (SELECT count(*) FROM orders WHERE created_at > now() - interval '24 hours')::text AS today`,
  );
  const text = [
    "🛡 <b>لوحة تحكم البوت</b>",
    "",
    `👥 المستخدمون: <b>${Number(stats?.users ?? 0)}</b>`,
    `🟡 إيصالات بانتظار المراجعة: <b>${Number(stats?.pending ?? 0)}</b>`,
    `🧾 طلبات اليوم: <b>${Number(stats?.today ?? 0)}</b>`,
    `💰 إجمالي المبيعات: <b>${money(stats?.revenue ?? 0, settingString(s, "currency", "دج"))}</b>`,
    "",
    "اختر العملية 👇",
  ].join("\n");
  await sendMessage(
    chatId,
    text,
    kb([
      [b(`📩 الإيصالات المعلّقة`, "adm:pending")],
      [b(`📊 إحصائيات`, "adm:stats"), b(`👥 المستخدمون`, "adm:users")],
      [b(`📢 إذاعة جماعية`, "adm:broadcast")],
      [b(`🧾 آخر الطلبات`, "adm:orders")],
      [
        b(
          `${settingBool(s, "require_subscription", true) ? G : R} اشتراك إجباري`,
          "adm:togsub",
        ),
        b(`${settingBool(s, "maintenance", false) ? R : G} وضع الصيانة`, "adm:togmaint"),
      ],
      [b(`👁 معاينة بوابة الاشتراك`, "adm:gateprev")],
      [b(`🔙 إغلاق`, "home")],
    ]),
  );
}

async function adminStats(chatId: number, s: SettingsMap): Promise<void> {
  const cur = settingString(s, "currency", "دج");
  const totals = await one<{ all: string; week: string; approved: string; users: string }>(
    `SELECT (SELECT count(*) FROM orders)::text AS all,
      (SELECT count(*) FROM orders WHERE created_at > now() - interval '7 days')::text AS week,
      (SELECT COALESCE(sum(amount),0) FROM orders WHERE status IN ('approved','delivered'))::text AS approved,
      (SELECT count(*) FROM users)::text AS users`,
  );
  const top = await q<{ product_name: string; c: string }>(
    "SELECT product_name, count(*)::text AS c FROM orders GROUP BY product_name ORDER BY count(*) DESC LIMIT 5",
  );
  await sendMessage(
    chatId,
    [
      "📊 <b>إحصائيات المتجر</b>",
      "",
      `👥 المستخدمون: <b>${Number(totals?.users ?? 0)}</b>`,
      `🧾 كل الطلبات: <b>${Number(totals?.all ?? 0)}</b>`,
      `🗓 آخر 7 أيام: <b>${Number(totals?.week ?? 0)}</b>`,
      `💰 المبيعات المؤكدة: <b>${money(totals?.approved ?? 0, cur)}</b>`,
      "",
      top.length ? "🔥 <b>الأكثر مبيعاً:</b>" : "",
      ...top.map((r) => `• ${escapeHtml(r.product_name)} — ${r.c}`),
    ]
      .filter(Boolean)
      .join("\n"),
    kb([[b(`🔙 رجوع`, "adm")]]),
  );
}

async function adminUsers(chatId: number, s: SettingsMap): Promise<void> {
  const rows = await q<{ tg_id: string; first_name: string | null; username: string | null; created_at: string }>(
    "SELECT tg_id, first_name, username, created_at::text FROM users ORDER BY created_at DESC LIMIT 12",
  );
  await sendMessage(
    chatId,
    [
      "👥 <b>آخر المستخدمين</b>",
      "",
      rows.length ? "" : "لا يوجد مستخدمون بعد.",
      ...rows.map(
        (r) =>
          `• ${escapeHtml(r.first_name || "-")}${r.username ? ` (@${escapeHtml(r.username)})` : ""} — <code>${r.tg_id}</code> — ${shortDate(r.created_at)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n"),
    kb([
      [b(`👥 إدارة المستخدمين`, "adm:users"), b(`🔙 رجوع`, "adm")],
    ]),
  );
}

async function adminLastOrders(chatId: number, s: SettingsMap): Promise<void> {
  const { rows } = await listOrders({ limit: 10 });
  await sendMessage(
    chatId,
    [
      "🧾 <b>آخر الطلبات</b>",
      "",
      rows.length ? "اضغط على الطلب للمراجعة:" : "لا توجد طلبات بعد.",
    ].join("\n"),
    kb([
      ...rows.map((o) => [
        b(`${o.status === "delivered" || o.status === "approved" ? G : R} ${o.code} — ${money(o.amount, settingString(s, "currency", "دج"))}`, `admo:${o.id}`),
      ]),
      [b(`🔙 رجوع`, "adm")],
    ]),
  );
}

async function adminPending(chatId: number, s: SettingsMap): Promise<void> {
  const { rows } = await listOrders({ status: "review", limit: 10 });
  if (!rows.length) {
    await sendMessage(chatId, "✅ لا توجد إيصالات بانتظار المراجعة.", kb([[b(`🔙 رجوع`, "adm")]]));
    return;
  }
  await sendMessage(
    chatId,
    `🟡 <b>${rows.length} إيصال بانتظار المراجعة</b>\nاختر الطلب للمراجعة:`,
    kb([
      ...rows.map((o) => [
        b(`📩 ${o.code} — ${money(o.amount, settingString(s, "currency", "دج"))}`, `admo:${o.id}`),
      ]),
      [b(`🔙 رجوع`, "adm")],
    ]),
  );
}

async function adminOrderView(chatId: number, orderId: number, s: SettingsMap): Promise<void> {
  const o = await getOrder(orderId);
  if (!o) return;
  const user = await getUser(o.user_id);
  const text = [
    orderSummary(o, s),
    `👤 ${user ? mentions(user as unknown as TgUser) : o.user_id} — <code>${o.user_id}</code>`,
    Object.entries(o.details ?? {}).length
      ? `📝 ${Object.entries(o.details ?? {})
          .map(([k, v]) => `${escapeHtml(k)}: <code>${escapeHtml(v)}</code>`)
          .join(" | ")}`
      : "",
    o.payment_method ? `💳 ${escapeHtml(o.payment_method)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const rows: InlineButton[][] = [];
  if (o.status === "awaiting_review" || o.status === "pending_payment") {
    rows.push([b(`✅ قبول`, `apv:${o.id}`), b(`❌ رفض`, `rej:${o.id}`)]);
  }
  rows.push([b(`🚚 تم التسليم`, `dlv:${o.id}`)]);
  rows.push([b(`🔙 رجوع`, "adm:pending")]);
  if (o.receipt_file_id) {
    await sendPhoto(chatId, { fileId: o.receipt_file_id }, text, kb(rows));
  } else {
    await sendMessage(chatId, `${text}\n\n⚠️ لا يوجد إيصال مرفق.`, kb(rows));
  }
}

/* ───────────────────────── الموجّه ───────────────────────── */

export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    await route(update);
  } catch (err) {
    console.error("[bot] update failed", err);
  }
}

async function route(update: TgUpdate): Promise<void> {
  const s = await allSettings();
  const emojiMap = (s.emoji_map ?? {}) as Record<string, string>;
  if (settingBool(s, "emoji_animated", false) && Object.keys(emojiMap).length) setEmojiMap(emojiMap);

  if (update.callback_query) {
    await onCallback(update.callback_query, s);
    return;
  }
  const msg = update.message ?? update.edited_message;
  if (!msg || !msg.from) return;
  if (msg.chat.type !== "private") return;
  const from = msg.from;
  const user = await upsertUser(from);

  if (user.is_blocked && !isAdminUser(user)) return;

  if (!user.avatar_file_id) {
    void (async () => {
      const fileId = await getUserAvatarFileId(from.id);
      if (fileId) await q("UPDATE users SET avatar_file_id = $2 WHERE tg_id = $1", [from.id, fileId]);
    })();
  }

  if (settingBool(s, "maintenance", false) && !isAdminUser(user)) {
    await sendMessage(msg.chat.id, settingString(s, "maintenance_text", "🛠 صيانة"), kb([[link(`💬 الدعم`, `https://t.me/${settingString(s, "support_username", "F_Q_Q_T")}`)]]));
    return;
  }

  // 🔒 قفل أمني فوري من لوحة التحكم
  if (settingBool(s, "bot_locked", false) && !isAdminUser(user)) {
    await sendMessage(
      msg.chat.id,
      settingString(s, "lock_message", "🛠 المتجر في صيانة سريعة، نرجع بعد قليل 💚"),
      kb([[link(`💬 الدعم`, `https://t.me/${settingString(s, "support_username", "F_Q_Q_T")}`)]]),
    );
    return;
  }

  // 🚫 الكلمات الممنوعة + الحظر التلقائي
  if (!isAdminUser(user) && msg.text) {
    const words = (s.block_words ?? []) as string[];
    const lowered = msg.text.toLowerCase();
    const hit = Array.isArray(words) ? words.find((w) => typeof w === "string" && w && lowered.includes(String(w).toLowerCase())) : undefined;
    if (hit) {
      const limit = Math.max(1, settingNumber(s, "auto_block_after", 3));
      const prev = await one<{ c: string }>(
        "SELECT count(*)::text AS c FROM security_events WHERE user_id = $1 AND kind = 'block_word' AND created_at > now() - interval '1 day'",
        [from.id],
      );
      const strikes = Number(prev?.c ?? 0) + 1;
      await q("INSERT INTO security_events (kind, user_id, detail, severity) VALUES ('block_word',$1,$2,'warn')", [
        from.id,
        `كلمة ممنوعة: ${String(hit).slice(0, 40)}`,
      ]);
      if (strikes >= limit) {
        await q("UPDATE users SET is_blocked = true WHERE tg_id = $1", [from.id]);
        await q("INSERT INTO security_events (kind, user_id, detail, severity) VALUES ('auto_block',$1,'حظر تلقائي بعد تكرار المخالفة','danger')", [from.id]);
        notifyOwnerSecurity(`🚫 حظر تلقائي: ${mentions(from)} (${from.id}) — كرّر كلمة ممنوعة ${strikes} مرات.`);
        await sendMessage(msg.chat.id, "🚫 تم إيقاف حسابك مؤقتاً بسبب مخالفة قواعد الاستخدام.");
        return;
      }
      await sendMessage(msg.chat.id, `⚠️ رسالتك تحتوي كلمة غير مسموحة. تنبيه ${strikes}/${limit} — التكرار يؤدي لإيقاف الحساب.`);
      return;
    }
  }

  // ⚡️ حدّ المعدّل: حماية من الإغراق
  if (!isAdminUser(user) && !rateLimitOk(from.id, settingNumber(s, "rate_limit_per_min", 20))) {
    await sendMessage(msg.chat.id, "⏳ بلاش سرعة! جرب بعد شوي.");
    return;
  }

  const text = (msg.text ?? "").trim();
  const chatId = msg.chat.id;

  // حالات المحادثة أولاً (إيصال / بيانات / كمية دولار …)
  if (user.state && await handleState(user, msg, s, chatId)) return;

  if (text.startsWith("/")) {
    const [cmdRaw, ...rest] = text.split(/\s+/);
    const cmd = cmdRaw.replace(/@.*$/, "").toLowerCase();
    const payload = rest.join(" ").trim();

    if (cmd === "/start") {
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await clearUserState(from.id);
      if (payload.startsWith("p_")) {
        const id = Number(payload.slice(2));
        if (id) {
          await sendProduct(chatId, id, s);
          return;
        }
      }
      if (payload.startsWith("cat_")) {
        const id = Number(payload.slice(4));
        if (id) {
          await sendCategory(chatId, id, s);
          return;
        }
      }
      await sendMainMenu(chatId, s, user, undefined, true);
      return;
    }
    if (cmd === "/shop") {
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await sendShop(chatId, s);
      return;
    }
    if (cmd === "/usd") {
      await showUsdIntro(chatId, s);
      return;
    }
    if (cmd === "/orders") {
      await myOrders(chatId, from.id, s);
      return;
    }
    if (cmd === "/support") {
      await supportScreen(chatId, s);
      return;
    }
    if (cmd === "/account") {
      await accountScreen(chatId, user, s);
      return;
    }
    if (cmd === "/admin") {
      if (!isAdminUser(user)) {
        await sendMessage(chatId, `⚠️ هذا الأمر للمالك فقط.`, kb([[b(`🔙 رجوع`, "home")]]));
        return;
      }
      await adminPanel(chatId, s);
      return;
    }
    if (cmd === "/help") {
      await sendMessage(chatId, helpText(s), kb([[b(`🏠 القائمة`, "home")]]));
      return;
    }
    if (cmd === "/redeem" || cmd === "/cancel") {
      await clearUserState(from.id);
      await sendMainMenu(chatId, s, user);
      return;
    }
    if (cmd === "/reply" && isAdminUser(user)) {
      const [target, ...body] = payload.split(" ");
      const tgId = Number(target);
      if (tgId > 0 && body.length) {
        await sendMessage(tgId, `💬 <b>رسالة من إدارة المتجر</b>\n\n${escapeHtml(body.join(" "))}`);
        await sendMessage(chatId, `تم الإرسال.`);
      } else {
        await sendMessage(chatId, `⚠️ الصيغة: <code>/reply 123456789 نص الرسالة</code>`);
      }
      return;
    }
    if (cmd === "/id") {
      await sendMessage(chatId, `🆔 معرّفك: <code>${from.id}</code>`);
      return;
    }
    if (cmd === "/faq") {
      const rows = await q<{ question: string; answer: string }>(
        "SELECT question, answer FROM faq WHERE active = true ORDER BY sort ASC, id ASC LIMIT 12",
      );
      if (!rows.length) {
        await sendMessage(chatId, "❓ ما زال ما عندنا أسئلة مسجلة — اسأل الدعم مباشرة 👇", kb([[b(`💬 الدعم`, "support")]]));
        return;
      }
      const body = rows.map((r, i) => `${i + 1}️⃣ <b>${escapeHtml(r.question)}</b>\n${escapeHtml(r.answer)}`).join("\n\n");
      await sendMessage(chatId, `❓ <b>الأسئلة الشائعة</b>\n━━━━━━━━━━━━━━━\n${body}`, kb([[b(`💬 الدعم`, "support"), b(`🏠 الرئيسية`, "home")]]));
      return;
    }
    if (cmd === "/reviews") {
      const rows = await q<{ name: string | null; rating: number; body: string | null }>(
        "SELECT name, rating, body FROM reviews WHERE approved = true ORDER BY created_at DESC LIMIT 8",
      );
      if (!rows.length) {
        await sendMessage(chatId, "⭐️ ما زالت ما عندنا تقييمات معتمدة — كن أول من يقيّمنا!", kb([[b(`🛍 المتجر`, "home")]]));
        return;
      }
      const body = rows
        .map((r) => `${"⭐️".repeat(Math.max(1, Math.min(5, r.rating)))}\n<b>${escapeHtml(r.name ?? "زبون")}</b>: ${escapeHtml((r.body ?? "").slice(0, 200))}`)
        .join("\n\n");
      await sendMessage(chatId, `⭐️ <b>آراء زبائننا</b>\n━━━━━━━━━━━━━━━\n${body}`, kb([[b(`🛍 المتجر`, "home")]]));
      return;
    }
    if (cmd === "/coupon") {
      const code = payload.trim().toUpperCase();
      if (!code) {
        await sendMessage(chatId, "🎟 اكتب الكود هكذا: <code>/coupon CHINWI10</code>");
        return;
      }
      const c = await one<{ code: string; kind: string; amount: number; uses: number; max_uses: number; active: boolean; expires_at: string | null }>(
        "SELECT * FROM coupons WHERE code = $1 AND active = true",
        [code],
      );
      const expired = c?.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
      const exhausted = Boolean(c && c.max_uses > 0 && c.uses >= c.max_uses);
      if (!c || expired || exhausted) {
        await sendMessage(chatId, "❌ الكود غير صالح أو منتهي.", kb([[b(`🛍 المتجر`, "home")]]));
        return;
      }
      await setUserState(from.id, "coupon", { code: c.code, kind: c.kind, amount: Number(c.amount) });
      const label = c.kind === "percent" ? `خصم ${c.amount}%` : `خصم ${money(Number(c.amount), settingString(s, "currency", "دج"))}`;
      await sendMessage(
        chatId,
        `🎟 <b>تم تفعيل الكود</b> ${escapeHtml(c.code)}\n✅ ${label} — يُطبَّق على طلبك القادم.`,
        kb([[b(`🛍 تسوّق الآن`, "home")]]),
      );
      return;
    }
    await sendMainMenu(chatId, s, user);
    return;
  }

  // نص حر: بحث في المنتجات أو إرسال للمالك
  if (text.length >= 2) {
    const found = await listProducts({ search: text, activeOnly: true, limit: 6 });
    if (found.length) {
      const rows = found.map((p) => [b(`${priceShort(p, s)}`, `prd:${p.id}`)]);
      rows.push([b(`🏠 القائمة`, "home")]);
      await sendMessage(
        chatId,
        `🔎 نتائج البحث عن «${escapeHtml(text)}»:\nاختر المنتج 👇`,
        kb(rows),
      );
      return;
    }
  }

  await sendMainMenu(chatId, s, user);
}

function helpText(s: SettingsMap): string {
  return [
    "ℹ️ <b>المساعدة</b>",
    "",
    "🛍 <b>/shop</b> — عرض أقسام المتجر",
    "💵 <b>/usd</b> — بيع الدولار للمالك",
    "🧾 <b>/orders</b> — متابعة طلباتك",
    "💬 <b>/support</b> — التواصل مع الدعم",
    "👤 <b>/account</b> — معلومات حسابك",
    "",
    "💡 <b>كيف أشتري؟</b>",
    "1. اختر القسم ثم العرض.",
    "2. أدخل معلوماتك (آيدي اللاعب…).",
    "3. حوّل المبلغ عبر إحدى الوسائل.",
    "4. أرسل صورة الإيصال هنا.",
    "5. يتواصل معك المالك ويُنفّذ الطلب فوراً.",
    "",
    `📞 الدعم: @${settingString(s, "support_username", "F_Q_Q_T").replace(/^@/, "")}`,
  ].join("\n");
}

/* ───────────────────────── الحالات ───────────────────────── */

async function handleState(user: UserRow, msg: TgMessage, s: SettingsMap, chatId: number): Promise<boolean> {
  const state = user.state ?? "";
  const data = (user.state_data ?? {}) as Record<string, unknown>;
  const text = (msg.text ?? "").trim();

  if (state.startsWith("receipt:")) {
    const orderId = Number(state.split(":")[1]);
    const order = await getOrder(orderId);
    if (!order) {
      await clearUserState(user.tg_id);
      await sendMessage(chatId, `⚠️ الطلب غير موجود.`, kb([[b(`🏠 القائمة`, "home")]]));
      return true;
    }
    if (!msg.photo && !msg.document) {
      await sendMessage(
        chatId,
        "📸 من فضلك أرسل <b>صورة الإيصال</b> أو ملف PDF.\n\nللإلغاء اضغط الزر 👇",
        kb([[b(`❌ إلغاء`, `cancel:${orderId}`)]]),
      );
      return true;
    }
    await submitReceipt(chatId, user, order, msg, s);
    return true;
  }

  if (state.startsWith("field:")) {
    const productId = Number(state.split(":")[1]);
    const p = await getProduct(productId);
    if (!p) {
      await clearUserState(user.tg_id);
      await sendMessage(chatId, `⚠️ المنتج غير متوفر.`, kb([[b(`🏠 القائمة`, "home")]]));
      return true;
    }
    const fields = p.fields ?? [];
    let index = Number(data.index ?? 0);
    const values = (data.values ?? {}) as Record<string, string>;
    if (!text) {
      await sendMessage(chatId, `⚠️ أرسل قيمة صحيحة من فضلك.`);
      return true;
    }
    values[fields[index].key] = text.slice(0, 200);
    index += 1;
    if (index < fields.length) {
      await setUserState(user.tg_id, `field:${p.id}`, { productId: p.id, index, values });
      const f = fields[index];
      await sendMessage(
        chatId,
        [
          `🛒 <b>${escapeHtml(p.name)}</b>`,
          "",
          `الخطوة <b>${index + 1}/${fields.length}</b>`,
          f.label,
          f.placeholder ? `<i>${escapeHtml(f.placeholder)}</i>` : "",
        ].filter(Boolean).join("\n"),
        kb([[b(`❌ إلغاء`, "home")]]),
      );
      return true;
    }
    await clearUserState(user.tg_id);
    const labels = Object.fromEntries(fields.map((f) => [f.key, f.label.replace(/^[^\p{L}\p{N}]+/u, "")]));
    const named: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) named[labels[k] ?? k] = v;
    await createOrderAndShowPayment(chatId, Number(user.tg_id), p, named, s);
    return true;
  }

  if (state.startsWith("usd:")) {
    const rate = Number(state.split(":")[1]) || 250;
    const amount = Number(text.replace(/[^\d.,]/g, "").replace(",", "."));
    const min = settingNumber(s, "usd_min", 5);
    if (!Number.isFinite(amount) || amount <= 0) {
      await sendMessage(chatId, `⚠️ أرسل رقماً صحيحاً (مثال: 10).`);
      return true;
    }
    if (amount < min) {
      await sendMessage(chatId, `⚠️ الحد الأدنى ${min}$ — أرسل كمية أكبر.`);
      return true;
    }
    if (amount > 100000) {
      await sendMessage(chatId, `⚠️ الكمية كبيرة جداً، تواصل مع المالك.`);
      return true;
    }
    await clearUserState(user.tg_id);
    const total = Math.round(amount * rate * 100) / 100;
    const order = await createOrder({
      userId: Number(user.tg_id),
      kind: "usd",
      productName: `بيع ${amount}$ للمالك`,
      amount: total,
      currency: settingString(s, "currency", "دج"),
      rate,
      usdAmount: amount,
      status: "pending_payment",
      details: { "الكمية بالدولار": `${amount}$`, "سعر الصرف": `${rate} دج` },
    });
    await showPaymentOptions(chatId, order, s);
    return true;
  }

  if (state === "msgowner") {
    await clearUserState(user.tg_id);
    if (!text) {
      await sendMessage(chatId, `⚠️ اكتب رسالتك أولاً.`);
      return true;
    }
    await notifyOwner(
      [
        "📩 <b>رسالة من زبون</b>",
        "",
        `👤 ${mentions(user as unknown as TgUser)} — <code>${user.tg_id}</code>`,
        "",
        escapeHtml(text).slice(0, 3000),
        "",
        `<i>للرد: /reply ${user.tg_id} نص الرد</i>`,
      ].join("\n"),
      kb([[link(`💬 فتح المحادثة`, `tg://user?id=${user.tg_id}`)]]),
    );
    await sendMessage(
      chatId,
      "✅ <b>وصلت رسالتك للمالك</b>\nسنرد عليك في أقرب وقت 🙏",
      kb([[b(`🏠 القائمة`, "home")]]),
    );
    return true;
  }

  if (state === "broadcast" && isAdminUser(user)) {
    await clearUserState(user.tg_id);
    if (!text) return true;
    const ids = await q<{ tg_id: string }>("SELECT tg_id FROM users WHERE is_blocked = false");
    let sent = 0;
    let failed = 0;
    for (const row of ids) {
      try {
        await sendMessage(row.tg_id, text);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    await q("INSERT INTO broadcasts (body, sent, failed) VALUES ($1,$2,$3)", [text, sent, failed]);
    await sendMessage(chatId, `📢 <b>تم الإرسال</b>\n✅ ${sent} | ❌ ${failed}`, kb([[b(`🔙 رجوع`, "adm")]]));
    return true;
  }

  if (state.startsWith("rej_reason:")) {
    const orderId = Number(state.split(":")[1]);
    await clearUserState(user.tg_id);
    const order = await getOrder(orderId);
    if (!order) return true;
    await setOrderStatus(orderId, "rejected", { adminNote: text || "رفض من الإدارة", reviewedBy: Number(user.tg_id) });
    await sendMessage(
      order.user_id,
      [
        "🔴 <b>تم رفض طلبك</b>",
        "",
        `🧾 <code>${order.code}</code> — ${escapeHtml(order.product_name)}`,
        text ? `\n📝 السبب: ${escapeHtml(text)}` : "",
        "",
        "إذا كنت تعتقد أن هناك خطأ، تواصل مع الدعم 💬",
      ].filter(Boolean).join("\n"),
      kb([
        [b(`💬 الدعم`, "support")],
        [b(`🛒 إعادة المحاولة`, `prd:${order.product_id ?? 0}`)],
      ]),
    );
    await sendMessage(chatId, `تم الرفض وإعلام الزبون.`, kb([[b(`🔙 رجوع`, "adm:pending")]]));
    return true;
  }

  if (state === "admin_add_product" && isAdminUser(user)) {
    // صيغة سريعة: الاسم | السعر | القسم | الوصف
    const [name, priceRaw, catRaw, ...desc] = text.split("|").map((x) => x.trim());
    if (!name) return true;
    await clearUserState(user.tg_id);
    const cats = await listCategories();
    const cat = cats.find((c) => String(c.id) === catRaw || c.name === catRaw) ?? cats[0];
    const price = Number(priceRaw) > 0 ? Number(priceRaw) : null;
    const p = await createProduct({
      name,
      price,
      price_label: price === null ? "تواصل مع المالك" : null,
      category_id: cat?.id ?? null,
      description: desc.join(" | "),
    });
    await sendMessage(chatId, `✅ تمت إضافة <b>${escapeHtml(p.name)}</b> في قسم ${escapeHtml(cat?.name ?? "-")}.`, kb([[b(`🛡 اللوحة`, "adm")]]));
    return true;
  }

  return false;
}

/* ───────────────────────── الأزرار ───────────────────────── */

async function onCallback(cq: TgCallbackQuery, s: SettingsMap): Promise<void> {
  if (cq.from?.id) await q("UPDATE users SET clicks_count = clicks_count + 1 WHERE tg_id = $1", [cq.from.id]).catch(() => null);
  const from = cq.from;
  const chatId = cq.message?.chat.id ?? from.id;
  const user = await upsertUser(from);
  if (user.is_blocked && !isAdminUser(user)) {
    await answerCallback(cq.id, "حسابك محظور", true);
    return;
  }
  await touchUser(from.id);
  const data = cq.data ?? "";
  const [head, a1, a2] = data.split(":");

  switch (head) {
    case "nop": {
      await answerCallback(cq.id, "💡 اضغط على زر الاسم لفتح العرض");
      return;
    }
    case "search": {
      await answerCallback(cq.id);
      await sendSearchPrompt(chatId, s);
      return;
    }
    case "top": {
      await answerCallback(cq.id);
      await sendTop(chatId, s);
      return;
    }
    case "games": {
      await answerCallback(cq.id);
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await sendGamesMenu(chatId, s);
      return;
    }
    case "home": {
      await answerCallback(cq.id);
      await clearUserState(from.id);
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await sendMainMenu(chatId, s, user);
      return;
    }
    case "chk": {
      const channels = await listChannels(true);
      const state = await subscriptionState(from.id, channels);
      if (state.ok && state.unverifiable.length === 0) {
        await answerCallback(cq.id, "✅ تم التحقق — أهلاً بك!", true);
        await clearUserState(from.id);
        await sendMainMenu(chatId, s, user);
      } else if (state.ok) {
        // تعذّر التحقق التلقائي (البوت ليس مشرفاً): محاولة أولى تُرفض، والثانية تفتح + تنبيه للمالك
        const tried = String(user.state ?? "").startsWith("gate:");
        if (tried) {
          await answerCallback(cq.id, "⚠️ تم تجاوز التحقق — تأكد من اشتراكك", true);
          await warnOwnerUnverifiedOnce();
          await clearUserState(from.id);
          await sendMainMenu(chatId, s, user);
        } else {
          await setUserState(from.id, "gate:1", {});
          await answerCallback(cq.id, "⚠️ تأكد من الاشتراك ثم اضغط تحقق مرة أخرى", true);
          await sendSubscriptionGate(chatId, s, state, channels);
          await warnOwnerUnverifiedOnce();
        }
      } else {
        await answerCallback(cq.id, `❌ لم تشترك بعد في: ${state.missing.map((c) => c.title || c.chat).join(", ")}`, true);
        await sendSubscriptionGate(chatId, s, state, channels);
      }
      return;
    }
    case "cat": {
      await answerCallback(cq.id);
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await sendCategory(chatId, Number(a1), s);
      return;
    }
    case "prd": {
      await answerCallback(cq.id);
      await sendProduct(chatId, Number(a1), s);
      return;
    }
    case "buy": {
      await answerCallback(cq.id);
      if (!(await guardSubscription(chatId, from.id, s, user))) return;
      await startPurchase(chatId, Number(a1), from.id, s);
      return;
    }
    case "ask": {
      const p = await getProduct(Number(a1));
      if (!p) return;
      await answerCallback(cq.id, "📩 تم إرسال طلبك للمالك");
      const order = await createOrder({
        userId: from.id,
        kind: "product",
        productId: p.id,
        productName: p.name,
        amount: 0,
        currency: settingString(s, "currency", "دج"),
        status: "awaiting_review",
        note: "طلب تسعير — السعر غير محدد",
        details: { "نوع الطلب": "تسعير منتج" },
      });
      await sendMessage(
        chatId,
        [
          "📩 <b>تم إرسال طلبك للمالك</b>",
          "",
          `🧾 <code>${order.code}</code> — ${escapeHtml(p.name)}`,
          "💰 سيتواصل معك المالك بالسعر النهائي.",
          "",
          "<i>يمكنك أيضاً مراسلة المالك مباشرة من زر الدعم.</i>",
        ].join("\n"),
        kb([
          [b(`💬 الدعم`, "support")],
          [b(`🛍 متابعة التسوق`, "home")],
        ]),
      );
      await notifyOwner(
        [
          "📩 <b>طلب تسعير منتج</b>",
          "",
          `📦 ${escapeHtml(p.name)}`,
          `👤 ${mentions(user as unknown as TgUser)} — <code>${from.id}</code>`,
          `🧾 <code>${order.code}</code>`,
        ].join("\n"),
        kb([
          [link(`💬 مراسلة الزبون`, `tg://user?id=${from.id}`)],
        ]),
      );
      return;
    }
    case "pay": {
      await answerCallback(cq.id);
      const order = await getOrder(Number(a1));
      if (!order) return;
      await showPaymentOptions(chatId, order, s);
      return;
    }
    case "pw": {
      await answerCallback(cq.id);
      await showWalletDetails(chatId, Number(a1), Number(a2), s);
      return;
    }
    case "paid": {
      const order = await getOrder(Number(a1));
      if (!order) return;
      await answerCallback(cq.id, "📸 أرسل الإيصال الآن");
      await askReceipt(chatId, order, from.id, s);
      return;
    }
    case "cancel": {
      const order = await getOrder(Number(a1));
      await answerCallback(cq.id, "تم الإلغاء");
      if (order && order.status === "pending_payment") await setOrderStatus(order.id, "cancelled");
      await clearUserState(from.id);
      await sendMainMenu(chatId, s, user);
      return;
    }
    case "orders": {
      await answerCallback(cq.id);
      await myOrders(chatId, from.id, s);
      return;
    }
    case "ord": {
      await answerCallback(cq.id);
      const o = await getOrder(Number(a1));
      if (!o || Number(o.user_id) !== from.id) return;
      const rows: InlineButton[][] = [];
      if (o.status === "pending_payment") {
        rows.push([b(`💳 إكمال الدفع`, `pay:${o.id}`)]);
        rows.push([b(`❌ إلغاء الطلب`, `cancel:${o.id}`)]);
      }
      if (o.status === "awaiting_review") {
        rows.push([b(`📸 إعادة إرسال الإيصال`, `paid:${o.id}`)]);
      }
      rows.push([b(`💬 الدعم`, "support")]);
      rows.push([b(`🔙 رجوع`, "orders")]);
      const body = [
        orderSummary(o, s),
        Object.entries(o.details ?? {}).length
          ? `\n📝 ${Object.entries(o.details ?? {})
              .map(([k, v]) => `<b>${escapeHtml(k)}</b>: <code>${escapeHtml(v)}</code>`)
              .join("\n")}`
          : "",
        o.note ? `\n📄 ${escapeHtml(o.note)}` : "",
        o.admin_note ? `\n🛡 <i>${escapeHtml(o.admin_note)}</i>` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await sendMessage(chatId, body, kb(rows));
      return;
    }
    case "account": {
      await answerCallback(cq.id);
      await accountScreen(chatId, user, s);
      return;
    }
    case "support": {
      await answerCallback(cq.id);
      await supportScreen(chatId, s);
      return;
    }
    case "help": {
      await answerCallback(cq.id);
      await sendMessage(chatId, helpText(s), kb([[b(`🏠 القائمة`, "home")]]));
      return;
    }
    case "msgowner": {
      await answerCallback(cq.id, "✍️ اكتب رسالتك الآن");
      await setUserState(from.id, "msgowner", {});
      await sendMessage(chatId, "✍️ اكتب رسالتك الآن وسنوصلها للمالك مباشرة.", kb([[b(`🔙 إلغاء`, "support")]]));
      return;
    }
    case "usd": {
      await answerCallback(cq.id);
      await showUsdIntro(chatId, s);
      return;
    }
    case "usdr": {
      await answerCallback(cq.id, `1$ = ${a1} دج`);
      await usdAskAmount(chatId, Number(a1), from.id, s);
      return;
    }
    /* ───── الإدارة ───── */
    case "adm": {
      if (!isAdminUser(user)) {
        await answerCallback(cq.id, "هذا القسم للمالك فقط", true);
        return;
      }
      switch (a1) {
        case "pending":
          await answerCallback(cq.id);
          await adminPending(chatId, s);
          return;
        case "stats":
          await answerCallback(cq.id);
          await adminStats(chatId, s);
          return;
        case "users":
          await answerCallback(cq.id);
          await adminUsers(chatId, s);
          return;
        case "orders":
          await answerCallback(cq.id);
          await adminLastOrders(chatId, s);
          return;
        case "broadcast":
          await answerCallback(cq.id);
          await sendMessage(
            chatId,
            [
              "📢 <b>إذاعة جماعية</b>",
              "",
              "الإذاعة تُرسل من لوحة التحكم مع معاينة وعدّاد وصول.",
              "افتح صفحة الإذاعة من الزر أدناه 👇",
            ].join("\n"),
            kb([
              [b(`📢 قسم الإذاعة`, "adm:broadcast"), b(`🔙 رجوع`, "adm")],
            ]),
          );
          return;
        case "gateprev": {
          await answerCallback(cq.id, "👁 هذه بوابة الزبائن");
          const chans = await listChannels(true);
          const st = await subscriptionState(from.id, chans);
          await sendSubscriptionGate(chatId, s, st, chans);
          return;
        }
        case "togsub": {
          const next = !settingBool(s, "require_subscription", true);
          await q("UPDATE settings SET value = $2::jsonb WHERE key = 'require_subscription'", [JSON.stringify(next)]);
          await answerCallback(cq.id, next ? "🔒 الاشتراك إجباري" : "🔓 الاشتراك اختياري", true);
          await adminPanel(chatId, { ...s, require_subscription: next });
          return;
        }
        case "togmaint": {
          const next = !settingBool(s, "maintenance", false);
          await q("UPDATE settings SET value = $2::jsonb WHERE key = 'maintenance'", [JSON.stringify(next)]);
          await answerCallback(cq.id, next ? "🛠 وضع الصيانة مفعّل" : "✅ المتجر يعمل", true);
          await adminPanel(chatId, { ...s, maintenance: next });
          return;
        }
        default:
          await answerCallback(cq.id);
          await adminPanel(chatId, s);
          return;
      }
    }
    case "admo": {
      if (!isAdminUser(user)) return;
      await answerCallback(cq.id);
      await adminOrderView(chatId, Number(a1), s);
      return;
    }
    case "apv": {
      if (!isAdminUser(user)) return;
      const order = await getOrder(Number(a1));
      if (!order) return;
      await setOrderStatus(order.id, "delivered", { reviewedBy: from.id });
      await answerCallback(cq.id, "✅ تم القبول", true);
      await sendMessage(
        order.user_id,
        [
          "✅ <b>تم تأكيد طلبك بنجاح</b>",
          "",
          `🧾 <code>${order.code}</code> — ${escapeHtml(order.product_name)}`,
          `💰 ${money(order.amount, settingString(s, "currency", "دج"))}`,
          "",
          "شكراً لثقتك بنا 🙏 — نتمنى لك تجربة رائعة!",
          "⭐️ لا تنسَ متابعة قنواتنا للعروض الجديدة.",
        ].join("\n"),
        kb([
          [b(`🛍 طلب جديد`, "home")],
          [b(`💬 الدعم`, "support")],
        ]),
      );
      await sendMessage(chatId, `✅ الطلب <code>${order.code}</code> تم تسليمه وإعلام الزبون.`);
      return;
    }
    case "rej": {
      if (!isAdminUser(user)) return;
      await answerCallback(cq.id, "✍️ أرسل سبب الرفض");
      await setUserState(from.id, `rej_reason:${a1}`, {});
      await sendMessage(
        chatId,
        "✍️ أرسل سبب الرفض (أو أرسل <code>-</code> لرفض بدون سبب):",
        kb([[b(`🔙 إلغاء`, "adm:pending")]]),
      );
      return;
    }
    case "dlv": {
      if (!isAdminUser(user)) return;
      const order = await getOrder(Number(a1));
      if (!order) return;
      await setOrderStatus(order.id, "delivered", { reviewedBy: from.id });
      await answerCallback(cq.id, "🚚 تم التسليم");
      await sendMessage(order.user_id, `🚚 طلبك <code>${order.code}</code> تم تسليمه ✅`);
      return;
    }
    case "togsub": {
      if (!isAdminUser(user)) return;
      const next = !settingBool(s, "require_subscription", true);
      await q("UPDATE settings SET value = $2::jsonb WHERE key = 'require_subscription'", [JSON.stringify(next)]);
      await answerCallback(cq.id, next ? "🔒 الاشتراك إجباري" : "🔓 الاشتراك اختياري", true);
      await adminPanel(chatId, { ...s, require_subscription: next });
      return;
    }
    case "togmaint": {
      if (!isAdminUser(user)) return;
      const next = !settingBool(s, "maintenance", false);
      await q("UPDATE settings SET value = $2::jsonb WHERE key = 'maintenance'", [JSON.stringify(next)]);
      await answerCallback(cq.id, next ? "🛠 وضع الصيانة مفعّل" : "✅ المتجر يعمل", true);
      await adminPanel(chatId, { ...s, maintenance: next });
      return;
    }
    default: {
      await answerCallback(cq.id);
      return;
    }
  }
}

/* ───────────────────────── أدوات للوحة التحكم ───────────────────────── */

export async function broadcastToAll(
  body: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ sent: number; failed: number; blocked: number; total: number; failures: { id: number; error: string }[] }> {
  // نجلب كل المستخدمين مرة واحدة، ونفصل المحظورين بدل إرسال فاشل لهم
  const rows = await q<{ tg_id: string }>("SELECT tg_id FROM users");
  const total = rows.length;
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  const failures: { id: number; error: string }[] = [];

  const CHUNK = 20;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (row) => {
        const id = Number(row.tg_id);
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await sendMessage(id, body);
            sent += 1;
            return;
          } catch (err) {
            const msg = String(err);
            // المحظور/الملغى: لا نعيد المحاولة
            if (/blocked|deactivated|chat not found|user is deactivated/i.test(msg)) {
              blocked += 1;
              await q("UPDATE users SET is_blocked = true WHERE tg_id = $1", [id]).catch(() => null);
              return;
            }
            if (/retry after|429/i.test(msg) && attempt < 2) {
              await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
              continue;
            }
            failed += 1;
            failures.push({ id, error: msg.slice(0, 120) });
            return;
          }
        }
      }),
    );
    onProgress?.(Math.min(total, i + CHUNK), total);
    // تنفّس بين الدفعات (حدود تيليجرام: 30 رسالة/ثانية)
    await new Promise((r) => setTimeout(r, 350));
  }

  await q("INSERT INTO broadcasts (body, sent, failed) VALUES ($1,$2,$3)", [body, sent, failed]);
  await log("broadcast", { sent, failed, blocked, total }, failed ? "warn" : "success", "admin");
  return { sent, failed, blocked, total, failures: failures.slice(0, 20) };
}

export async function sendToUser(tgId: number, body: string): Promise<boolean> {
  try {
    await sendMessage(tgId, body);
    return true;
  } catch {
    return false;
  }
}
