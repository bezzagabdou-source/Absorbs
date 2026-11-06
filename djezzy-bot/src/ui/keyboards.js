/** لوحات الأزرار (Inline Keyboards) — بيانات الأزرار كلها قصيرة (< 64 بايت) */
import { InlineKeyboard } from 'grammy';

export function mainMenu({ hasAccount = false, activeMsisdn = null, mode = 'simulation' } = {}) {
  const keyboard = new InlineKeyboard();

  keyboard.text('📱 إضافة رقم جديد', 'add:start').row();

  if (hasAccount) {
    keyboard
      .text('🔥 تفعيل 6 جيغا جيزي', 'act:6gb')
      .row()
      .text('🎁 هدية 2 جيغا الأسبوعية', 'act:gift:weekly')
      .row()
      .text('🎁 استلام كل الهدايا المتاحة', 'act:gift:all')
      .row()
      .text('🔄 فحص الرصيد والعروض', 'act:overview')
      .row();
  }

  keyboard.text(`⚙️ إدارة الأرقام${activeMsisdn ? ' •' : ''}`, 'acc:menu').row();
  keyboard.text(mode === 'simulation' ? '🧪 وضع المحاكاة' : '🟢 متصل بجيزي', 'info:mode');

  return keyboard;
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
    keyboard.text(`🗑 ${account.label}`, `acc:del:${account.msisdn}`).row();
  }
  keyboard.text('↩️ رجوع', 'acc:menu');
  return keyboard;
}

export function confirmDelete(account) {
  return new InlineKeyboard()
    .text('✅ نعم، احذف', `acc:del:confirm:${account.msisdn}`)
    .row()
    .text('↩️ إلغاء', 'acc:menu');
}

export function cancelOnly(backTo = 'menu:home') {
  return new InlineKeyboard().text('✖️ إلغاء', backTo);
}

export function afterAction() {
  return new InlineKeyboard()
    .text('🔥 تفعيل 6 جيغا', 'act:6gb')
    .text('🎁 الهدايا', 'act:gift:all')
    .row()
    .text('🏠 القائمة الرئيسية', 'menu:home');
}

export function backHome() {
  return new InlineKeyboard().text('🏠 القائمة الرئيسية', 'menu:home');
}

export default { mainMenu, accountsMenu, removeMenu, confirmDelete, cancelOnly, afterAction, backHome };
