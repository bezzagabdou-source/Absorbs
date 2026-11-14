// اختبارات الطبقة الوسطية للإيموجي المتحرك — node --test (بلا شبكة)
import test from "node:test";
import assert from "node:assert/strict";
import {
  accentHtml, bareMarkup, buildAttempts, decorateHtml, decorateMarkup, escapeHtml, lookupFrom,
  richFormat, shouldDowngrade, stickerCue, stripTags, acceptedCustomEmoji, acceptedIcons,
} from "../src/lib/emojiLayer.ts";

const MAP = { "🔥": { id: "111" }, "⭐": { id: "222" }, "🎁": { id: "333" }, "✅": { id: "444" }, "🏠": { id: "555" } };
const lookup = lookupFrom(MAP);
const OPTS = { mode: "animated", text: true, icons: true, strip: true, bulk: false, privateChat: true };

test("النص: كل إيموجي في الخريطة يولي tg-emoji، والباقي كما هو", () => {
  const out = decorateHtml("🔥 <b>مرحبا</b> ⭐️ و 🙂", lookup);
  assert.equal(out.count, 2);
  assert.equal(out.text, '<tg-emoji emoji-id="111">🔥</tg-emoji> <b>مرحبا</b> <tg-emoji emoji-id="222">⭐️</tg-emoji> و 🙂');
});

test("النص: ما نلمسوش code/pre ولا tg-emoji موجود ولا خصائص الوسوم", () => {
  const html = '<code>🔥</code> <tg-emoji emoji-id="9">🔥</tg-emoji> <a href="https://t.me/x?start=🔥">🎁</a>';
  const out = decorateHtml(html, lookup);
  assert.equal(out.count, 1);
  assert.ok(out.text.includes("<code>🔥</code>"));
  assert.ok(out.text.includes('href="https://t.me/x?start=🔥"'));
  assert.ok(out.text.includes('<tg-emoji emoji-id="333">🎁</tg-emoji>'));
});

test("النص: حد 100 كيان محترم", () => {
  const out = decorateHtml("🔥".repeat(150), lookup);
  assert.equal(out.count, 90);
});

test("الأزرار: أيقونة + حذف الإيموجي من النص + الحفاظ على اللون والترتيب والبيانات", () => {
  const kb = { inline_keyboard: [[{ text: "🎁 المتجر", callback_data: "shop", style: "success" }, { text: "رجوع", callback_data: "home" }], [{ text: "🙂 بلا ID", url: "https://t.me/x" }]] };
  const out = decorateMarkup(kb, lookup, { strip: true });
  assert.equal(out.icons, 1);
  assert.deepEqual(out.markup.inline_keyboard[0][0], { text: "المتجر", callback_data: "shop", style: "success", icon_custom_emoji_id: "333" });
  assert.deepEqual(out.markup.inline_keyboard[0][1], { text: "رجوع", callback_data: "home" });
  assert.deepEqual(out.markup.inline_keyboard[1][0], { text: "🙂 بلا ID", url: "https://t.me/x" });
  assert.equal(kb.inline_keyboard[0][0].text, "🎁 المتجر", "الأصل ما تبدّلش");
});

test("الأزرار: بلا strip الإيموجي كيبقى في النص؛ وزر فيه غير إيموجي ما كيتخواش", () => {
  const out = decorateMarkup({ inline_keyboard: [[{ text: "🔥 نار", callback_data: "a" }, { text: "🔥", callback_data: "b" }]] }, lookup, { strip: false });
  assert.equal(out.markup.inline_keyboard[0][0].text, "🔥 نار");
  const only = decorateMarkup({ inline_keyboard: [[{ text: "🔥", callback_data: "b" }]] }, lookup, { strip: true });
  assert.equal(only.markup.inline_keyboard[0][0].text, "🔥");
});

test("السلّم: 4 درجات مرتّبة والأخيرة نص خام آمن", () => {
  const payload = { chat_id: 5, parse_mode: "HTML", text: "🔥 <b>أهلا</b>", reply_markup: { inline_keyboard: [[{ text: "🏠 الرئيسية", callback_data: "home", style: "primary" }]] } };
  const a = buildAttempts("sendMessage", payload, lookup, OPTS);
  assert.deepEqual(a.map((x) => x.level), [0, 1, 2, 3]);
  assert.ok(a[0].payload.text.includes("tg-emoji") && a[0].payload.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id === "555");
  assert.equal(a[0].payload.reply_markup.inline_keyboard[0][0].style, "primary");
  assert.ok(a[1].payload.text.includes("tg-emoji"));
  assert.equal(a[1].payload.reply_markup.inline_keyboard[0][0].text, "🏠 الرئيسية");
  assert.equal(a[1].payload.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, undefined);
  assert.deepEqual(a[2].payload, payload);
  assert.equal(a[3].payload.text, "🔥 أهلا");
  assert.equal(a[3].payload.parse_mode, undefined);
  assert.equal(a[3].payload.reply_markup.inline_keyboard[0][0].style, undefined);
});

test("السلّم: نص خام (بث) كيتهرّب ويتحوّل لـHTML، والأصل كيبقى احتياط", () => {
  const payload = { chat_id: 5, text: "عرض <جديد> & 🔥", __ctx: "bulk" };
  const a = buildAttempts("sendMessage", payload, lookup, { ...OPTS, bulk: true });
  assert.equal(a[0].payload.parse_mode, "HTML");
  assert.equal(a[0].payload.text, 'عرض &lt;جديد&gt; &amp; <tg-emoji emoji-id="111">🔥</tg-emoji>');
  assert.equal(a[0].payload.__ctx, undefined, "المفتاح الداخلي ما يمشيش لتيليجرام");
  assert.equal(a.at(-1).payload.text, "عرض <جديد> & 🔥");
  assert.equal(a.at(-1).payload.parse_mode, undefined);
});

test("السلّم: وضع plain ما كيبدّل والو؛ والقدرات المطفية محترمة", () => {
  const payload = { chat_id: 5, parse_mode: "HTML", text: "🔥 نص", reply_markup: { inline_keyboard: [[{ text: "🎁 x", callback_data: "s" }]] } };
  const plain = buildAttempts("sendMessage", payload, lookup, { ...OPTS, mode: "plain" });
  assert.deepEqual(plain[0].payload, payload);
  const noIcons = buildAttempts("sendMessage", payload, lookup, { ...OPTS, icons: false });
  assert.equal(noIcons[0].icons, 0);
  assert.equal(noIcons[0].payload.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, undefined);
  const noText = buildAttempts("sendMessage", payload, lookup, { ...OPTS, text: false });
  assert.ok(!noText[0].payload.text.includes("tg-emoji"));
  assert.equal(noText[0].icons, 1);
});

test("السلّم: كابشن الصورة و editMessageMedia و answerCallbackQuery", () => {
  const photo = buildAttempts("sendPhoto", { chat_id: 5, photo: "x", parse_mode: "HTML", caption: "🎁 جائزة" }, lookup, OPTS);
  assert.ok(photo[0].payload.caption.includes('emoji-id="333"'));
  const media = buildAttempts("editMessageMedia", { chat_id: 5, message_id: 1, media: { type: "photo", media: "x", caption: "🔥", parse_mode: "HTML" } }, lookup, OPTS);
  assert.ok(media[0].payload.media.caption.includes('emoji-id="111"'));
  const cb = buildAttempts("answerCallbackQuery", { callback_query_id: "1", text: "<b>تمّ</b> ✅" }, lookup, OPTS);
  assert.equal(cb.length, 1);
  assert.equal(cb[0].payload.text, "تمّ ✅");
});

test("السلّم: MarkdownV2 أو entities ما كيتلمسوش في النص", () => {
  const a = buildAttempts("sendMessage", { chat_id: 5, parse_mode: "MarkdownV2", text: "🔥 *x*" }, lookup, OPTS);
  assert.equal(a[0].payload.text, "🔥 *x*");
});

test("التخصيص: إيموجي واحد مناسب للرسائل اللي بلا إيموجي فقط، وفي الخاص فقط", () => {
  assert.equal(accentHtml("<b>مبروك</b> ربحت").text, "🎉 <b>مبروك</b> ربحت");
  assert.equal(accentHtml("🔥 مبروك").added, 0);
  assert.equal(accentHtml("نص عادي بلا معنى خاص").added, 0);
  const group = buildAttempts("sendMessage", { chat_id: -100, parse_mode: "HTML", text: "مبروك" }, lookup, { ...OPTS, privateChat: false });
  assert.equal(group[0].payload.text, "مبروك");
});

test("إعادة المحاولة: غير أخطاء المحتوى 400", () => {
  assert.equal(shouldDowngrade({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }), true);
  assert.equal(shouldDowngrade({ ok: false, error_code: 400, description: "Bad Request: DOCUMENT_INVALID" }), true);
  assert.equal(shouldDowngrade({ ok: false, error_code: 400, description: "Bad Request: chat not found" }), false);
  assert.equal(shouldDowngrade({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }), false);
  assert.equal(shouldDowngrade({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }), false);
  assert.equal(shouldDowngrade({ ok: false, error_code: 429, description: "Too Many Requests" }), false);
  assert.equal(shouldDowngrade({ ok: false, uncertain: true }), false);
  assert.equal(shouldDowngrade({ ok: true }), false);
});

test("الخطة البديلة: تنسيق غني + إشارة الملصق + ألوان تلقائية", () => {
  const rich = richFormat("🏆 المسابقات\n\nسطر 1\nسطر 2");
  assert.ok(rich.startsWith("<b>🏆 المسابقات</b>\n━"));
  assert.ok(rich.endsWith("<blockquote>سطر 1\nسطر 2</blockquote>"));
  assert.equal(richFormat("سطر واحد"), "سطر واحد");
  assert.equal(richFormat("<b>عنوان\nمكسور</b>\nx\ny"), "<b>عنوان\nمكسور</b>\nx\ny");
  assert.deepEqual(stickerCue("🎉 <b>مبروك</b>").slice(0, 1), ["🎉"]);
  assert.deepEqual(stickerCue("نقاطك: 3"), []);
  const styled = decorateMarkup({ inline_keyboard: [[{ text: "✅ تأكيد", callback_data: "a" }, { text: "❌ إلغاء", callback_data: "b", style: "primary" }]] }, null, { styles: true });
  assert.equal(styled.markup.inline_keyboard[0][0].style, "success");
  assert.equal(styled.markup.inline_keyboard[0][1].style, "primary", "اللون الأصلي ما كيتبدّلش");
  const st = buildAttempts("sendMessage", { chat_id: 5, parse_mode: "HTML", text: "🏆 عنوان\n\nأ\nب" }, lookup, { ...OPTS, mode: "stickers" });
  assert.ok(st[0].payload.text.includes("<blockquote>") && !st[0].payload.text.includes("tg-emoji"));
});

test("أدوات: escape / strip / قراءة جواب تيليجرام", () => {
  assert.equal(escapeHtml("<a&b>"), "&lt;a&amp;b&gt;");
  assert.equal(stripTags("<b>x</b> &lt;y&gt; &amp;"), "x <y> &");
  assert.deepEqual(bareMarkup({ inline_keyboard: [[{ text: "x", style: "danger", icon_custom_emoji_id: "1", callback_data: "c" }]] }), { inline_keyboard: [[{ text: "x", callback_data: "c" }]] });
  assert.deepEqual(acceptedCustomEmoji({ entities: [{ type: "bold" }, { type: "custom_emoji", custom_emoji_id: "7" }] }), ["7"]);
  assert.deepEqual(acceptedIcons({ reply_markup: { inline_keyboard: [[{ text: "a", icon_custom_emoji_id: "9" }, { text: "b" }]] } }), ["9"]);
});
