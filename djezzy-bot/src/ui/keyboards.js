/**
 * لوحات الأزرار — ألوان حقيقية عبر Bot API 9.4 (style):
 *   🟢 success (أخضر) = هدايا/إضافة   🔵 primary (أزرق) = تنقل/عروض   🔴 danger (أحمر) = حذف/إلغاء
 * + قائمة رد ملوّنة ثابتة أسفل الشات (مثل صورة YASSER SHOPE).
 */
import { InlineKeyboard, Keyboard } from 'grammy';
import { FREE_GIFTS, PAID_OFFERS, configuredPaidOffer } from '../djezzy/catalog.js';

const webButtons = (publicUrl) => {
  const keyboard = new InlineKeyboard();
  if (publicUrl) {
    keyboard.url('🌐 لوحة أزرار ملوّنة (ويب)', `${publicUrl}/app`).row();
  }
  return keyboard;
};

/** قائمة رد ملوّنة ثابتة (green/blue/red) — تظهر أسفل الشات دائماً */
export function mainReplyKeyboard() {
  return new Keyboard()
    .text('👤 ملفي').success()
    .text('🎁 الهدايا').success()
    .row()
    .text('💳 العروض').primary()
    .text('💰 الرصيد').primary()
    .row()
    .text('🤝 إحالة صديق').primary()
    .text('ℹ️ المساعدة').primary()
    .row()
    .text('🗑️ حذف رقمي').danger()
    .row()
    .resized(true)
    .persistent(true);
}

export function mainMenu({ hasAccount = false, activeMsisdn = null, mode = 'simulation', publicUrl = null } = {}) {
  const keyboard = new InlineKeyboard();

  keyboard.text('📱 إضافة رقم جديد', 'add:start').success().row();

  if (hasAccount) {
    keyboard.text('🟢 الهدايا المجانية', 'cat:free').success().row();
    keyboard.text('🔵 العروض المدفوعة', 'cat:paid').primary().row();
    keyboard.text('🔥 تفعيل 6 جيغا جيزي', 'act:6gb').primary().row();
    keyboard.text('🔄 فحص الرصيد والعروض', 'act:overview').primary().row();
  }

  keyboard.text(`⚙️ إدارة الأرقام${activeMsisdn ? ' •' : ''}`, 'acc:menu').primary().row();
  keyboard.text(mode === 'simulation' ? '🧪 وضع المحاكاة' : '🟢 متصل بجيزي', 'info:mode').primary();

  const web = webButtons(publicUrl);
  for (const row of web.inline_keyboard) keyboard.row(...row);

  return keyboard;
}

/** قائمة الهدايا المجانية (أخضر) */
export function freeGiftsMenu({ publicUrl = null } = {}) {
  const keyboard = new InlineKeyboard();
  for (const gift of FREE_GIFTS) {
    keyboard.text(gift.button, `gift:${gift.id}`).success().row();
  }
  keyboard.text('🔄 فحص الحساب', 'act:overview').primary().row();
  keyboard.text('🏠 القائمة الرئيسية', 'menu:home').primary();
  void publicUrl;
  return keyboard;
}

/** قائمة العروض المدفوعة (أزرق) — مقسّمة لصفحات صغيرة */
export function paidOffersMenu(page = 0, { publicUrl = null } = {}) {
  const configured = configuredPaidOffer();
  const offers = configured
    ? [configured, ...PAID_OFFERS.filter((offer) => offer.code !== configured.code)]
    : PAID_OFFERS;

  const PER_PAGE = 8;
  const pages = Math.max(1, Math.ceil(offers.length / PER_PAGE));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = offers.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const keyboard = new InlineKeyboard();
  for (const offer of slice) {
    keyboard.text(`🔵 ${offer.name}`, `offer:${offer.code}`).primary().row();
  }

  if (pages > 1) {
    const row = [];
    if (current > 0) row.push(InlineKeyboard.text('◀️ السابق', `offers:page:${current - 1}`));
    if (current < pages - 1) row.push(InlineKeyboard.text('التالي ▶️', `offers:page:${current + 1}`));
    if (row.length) keyboard.row(...row);
  }

  keyboard.text('🏠 القائمة الرئيسية', 'menu:home').primary();
  void publicUrl;
  return keyboard;
}

/** شاشة تأكيد عرض مدفوع (أخضر للتفعيل، أحمر للإلغاء) */
export function confirmOffer(offer) {
  const priceLine = offer.price ? `${offer.price} دج` : 'حسب الباقة';
  return new InlineKeyboard()
    .text(`✅ نعم — فعّل (${priceLine})`, `offer:go:${offer.code}`)
    .success()
    .row()
    .text('↩️ رجوع للكتالوج', 'cat:paid')
    .primary()
    .row()
    .text('🏠 القائمة الرئيسية', 'menu:home')
    .primary();
}

export function accountsMenu(accounts, activeMsisdn) {
  const keyboard = new InlineKeyboard();

  for (const account of accounts) {
    const check = account.msisdn === activeMsisdn ? '✅ ' : '▫️ ';
    keyboard.text(`${check}${account.label}`, `acc:pick:${account.msisdn}`).primary().row();
  }

  keyboard.text('➕ إضافة رقم', 'add:start').success().row();
  if (accounts.length > 0) keyboard.text('🗑 حذف رقم', 'acc:remove').danger().row();
  keyboard.text('🏠 القائمة الرئيسية', 'menu:home').primary();
  return keyboard;
}

export function removeMenu(accounts) {
  const keyboard = new InlineKeyboard();
  for (const account of accounts) {
    keyboard.text(`🔴 ${account.label}`, `acc:del:${account.msisdn}`).danger().row();
  }
  keyboard.text('↩️ رجوع', 'acc:menu').primary();
  return keyboard;
}

export function confirmDelete(account) {
  return new InlineKeyboard()
    .text('🔴 نعم، احذف', `acc:del:confirm:${account.msisdn}`)
    .danger()
    .row()
    .text('↩️ إلغاء', 'acc:menu')
    .primary();
}

export function cancelOnly(backTo = 'menu:home') {
  return new InlineKeyboard().text('✖️ إلغاء', backTo).danger();
}

export function afterAction() {
  return new InlineKeyboard()
    .text('🟢 الهدايا المجانية', 'cat:free')
    .success()
    .text('🔵 العروض', 'cat:paid')
    .primary()
    .row()
    .text('🏠 القائمة الرئيسية', 'menu:home')
    .primary();
}

export function backHome() {
  return new InlineKeyboard().text('🏠 القائمة الرئيسية', 'menu:home').primary();
}

export default {
  mainMenu,
  mainReplyKeyboard,
  freeGiftsMenu,
  paidOffersMenu,
  confirmOffer,
  accountsMenu,
  removeMenu,
  confirmDelete,
  cancelOnly,
  afterAction,
  backHome,
};
