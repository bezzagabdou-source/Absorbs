/**
 * لوحات الأزرار (Inline Keyboards) — تصميم ملوّن بالفئات:
 *   🟢 أخضر = هدايا مجانية   🔵 أزرق = عروض مدفوعة   🔴 أحمر = حذف/إلغاء
 * (أزرار تيليجرام لا تقبل خلفيات ملوّنة داخل الشات — لذلك اللون عبر الإيموجي
 *  + زر «🌐 لوحة الأزرار» يفتح صفحة ويب بأزرار حقيقية بخلفيات زرقاء/خضراء/حمراء.)
 *
 * جميع بيانات الأزرار قصيرة (< 64 بايت).
 */
import { InlineKeyboard } from 'grammy';
import { FREE_GIFTS, PAID_OFFERS, configuredPaidOffer } from '../djezzy/catalog.js';

const webButtons = (publicUrl) => {
  const keyboard = new InlineKeyboard();
  if (publicUrl) {
    keyboard.url('🌐 لوحة أزرار ملوّنة (ويب)', `${publicUrl}/app`).row();
  }
  return keyboard;
};

export function mainMenu({ hasAccount = false, activeMsisdn = null, mode = 'simulation', publicUrl = null } = {}) {
  const keyboard = new InlineKeyboard();

  keyboard.text('📱 إضافة رقم جديد', 'add:start').row();

  if (hasAccount) {
    keyboard.text('🟢 الهدايا المجانية', 'cat:free').row();
    keyboard.text('🔵 العروض المدفوعة', 'cat:paid').row();
    keyboard.text('🔥 تفعيل 6 جيغا جيزي', 'act:6gb').row();
    keyboard.text('🔄 فحص الرصيد والعروض', 'act:overview').row();
  }

  keyboard.text(`⚙️ إدارة الأرقام${activeMsisdn ? ' •' : ''}`, 'acc:menu').row();
  keyboard.text(mode === 'simulation' ? '🧪 وضع المحاكاة' : '🟢 متصل بجيزي', 'info:mode');

  const web = webButtons(publicUrl);
  for (const row of web.inline_keyboard) keyboard.row(...row);

  return keyboard;
}

/** قائمة الهدايا المجانية (أخضر) */
export function freeGiftsMenu({ publicUrl = null } = {}) {
  const keyboard = new InlineKeyboard();
  for (const gift of FREE_GIFTS) {
    keyboard.text(gift.button, `gift:${gift.id}`).row();
  }
  keyboard.text('🔄 فحص الحساب', 'act:overview').row();
  keyboard.text('🏠 القائمة الرئيسية', 'menu:home');
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
    keyboard.text(`🔵 ${offer.name}`, `offer:${offer.code}`).row();
  }

  if (pages > 1) {
    const row = [];
    if (current > 0) row.push(InlineKeyboard.text('◀️ السابق', `offers:page:${current - 1}`));
    if (current < pages - 1) row.push(InlineKeyboard.text('التالي ▶️', `offers:page:${current + 1}`));
    keyboard.row(...row);
  }

  keyboard.text('🏠 القائمة الرئيسية', 'menu:home');
  void publicUrl;
  return keyboard;
}

/** شاشة تأكيد عرض مدفوع (أزرق للتفعيل، أحمر للإلغاء) */
export function confirmOffer(offer) {
  const priceLine = offer.price ? `${offer.price} دج` : 'حسب الباقة';
  return new InlineKeyboard()
    .text(`✅ نعم — فعّل (${priceLine})`, `offer:go:${offer.code}`)
    .row()
    .text('↩️ رجوع للكتالوج', 'cat:paid')
    .row()
    .text('🏠 القائمة الرئيسية', 'menu:home');
}

export function accountsMenu(accounts, activeMsisdn) {
  const keyboard = new InlineKeyboard();

  for (const account of accounts) {
    const check = account.msisdn === activeMsisdn ? '✅ ' : '▫️ ';
    keyboard.text(`${check}${account.label}`, `acc:pick:${account.msisdn}`).row();
  }

  keyboard.text('➕ إضافة رقم', 'add:start').row();
  if (accounts.length > 0) keyboard.text('🗑 حذف رقم', 'acc:remove').row();
  keyboard.text('🏠 القائمة الرئيسية', 'menu:home');
  return keyboard;
}

export function removeMenu(accounts) {
  const keyboard = new InlineKeyboard();
  for (const account of accounts) {
    keyboard.text(`🔴 ${account.label}`, `acc:del:${account.msisdn}`).row();
  }
  keyboard.text('↩️ رجوع', 'acc:menu');
  return keyboard;
}

export function confirmDelete(account) {
  return new InlineKeyboard()
    .text('🔴 نعم، احذف', `acc:del:confirm:${account.msisdn}`)
    .row()
    .text('↩️ إلغاء', 'acc:menu');
}

export function cancelOnly(backTo = 'menu:home') {
  return new InlineKeyboard().text('✖️ إلغاء', backTo);
}

export function afterAction() {
  return new InlineKeyboard()
    .text('🟢 الهدايا المجانية', 'cat:free')
    .text('🔵 العروض', 'cat:paid')
    .row()
    .text('🏠 القائمة الرئيسية', 'menu:home');
}

export function backHome() {
  return new InlineKeyboard().text('🏠 القائمة الرئيسية', 'menu:home');
}

export default {
  mainMenu,
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
