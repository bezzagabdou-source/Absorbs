/**
 * كتالوج عروض جيزي الحقيقية — أكواد معتمدة فعلياً في واجهة subscription-product.
 *
 *  free  : هدايا مجانية (Walk Win 2GB، هدية QR للممناسبات، بونص الدعوة)
 *  paid  : عروض مدفوعة تُخصم من الرصيد — لا تُفعَّل إلا بتأكيد صريح من المستخدم.
 *
 * الأسعار/الأحجام من كتالوج بوتات جيزي العاملة حالياً (أكواد BTL/DOVINTSPEED…).
 */
import config from '../config.js';

/* ------------------------------ الهدايا المجانية ------------------------------ */
export const FREE_GIFTS = [
  {
    id: 'friday6',
    button: '🔥6G الجمعة — بأي طريقة',
    name: 'هدية6 جيجا (أي وسيلة: باركود QR + Walk Win20000 خطوة)',
    data: '6 GB',
    validity: 'كل جمعة',
    note: 'البوت يجرّب تلقائياً: باركود QR إن وُجد ثم مستوى20000 خطوة — مجاناً100%.',
    kind: 'friday',
  },
  {
    id: 'weekly2go',
    button: '🎁 هدية 2 جيغا — كل أسبوع',
    name: 'هدية 2 جيجا الأسبوعية (Walk Win)',
    data: '2 GB',
    validity: '7 أيام',
    note: 'متاحة مرة كل أسبوع — تُفعَّل بضغطة واحدة.',
    kind: 'walk',
  },
  {
    id: 'promoqr',
    button: '🎀 هدية الجمعة/المناسبة (QR)',
    name: 'هدية ترويجية عبر QR — هدايا الجمعة والمناسبات والمباريات',
    data: 'حسب الحملة',
    validity: 'حسب الحملة',
    note: 'جيزي تُطلق هدايا مجانية في المناسبات (جمعة، مباراة، حملة) — البوت يرسل طلب الهدية الحالي تلقائياً.',
    kind: 'scan',
  },
  {
    id: 'mgm',
    button: '👥 بونص دعوة صديق (MGM)',
    name: 'بونص Member-Get-Member',
    data: 'حسب الحملة',
    validity: 'فوري',
    note: 'أدخل رقم صديق جيزي (07…) واحصلا معاً على بونص الدعوة.',
    kind: 'mgm',
  },
];

/* ------------------------------ العروض المدفوعة ------------------------------ */
/** @type {{code:string,name:string,detail:string,price:number}[]} */
export const PAID_OFFERS = [
  { code: 'BTL500MBDAY', name: '📦 5GB — 90دج / 24 ساعة', detail: 'إنترنت 5GB | 90 دج | 24 ساعة', price: 90 },
  { code: 'BTLINTSPEEDDAY2Go', name: '🏷️ 4GB — 70دج / 24 ساعة', detail: 'إنترنت 4GB | 70 دج | 24 ساعة', price: 70 },
  { code: 'BTL1GBDAY', name: '📦 4GB — 140دج / 24 ساعة', detail: 'إنترنت 4GB | 140 دج | 24 ساعة', price: 140 },
  { code: 'BTL4GBDAY', name: '📦 5GB — 190دج / 24 ساعة', detail: 'إنترنت 5GB | 190 دج | 24 ساعة', price: 190 },
  { code: 'DOVINTSPEEDDAY100MoPRE', name: '📦 300Mo — 30دج / 24 ساعة', detail: 'إنترنت 300Mo | 30 دج | 24 ساعة', price: 30 },
  { code: 'DOVINTSPEEDDAY250MoPRE', name: '📦 600Mo — 50دج / 24 ساعة', detail: 'إنترنت 600Mo | 50 دج | 24 ساعة', price: 50 },
  { code: 'DOVINTSPEEDDAY1GoPRE', name: '📦 2Go — 100دج / 24 ساعة', detail: 'إنترنت 2Go | 100 دج | 24 ساعة', price: 100 },
  { code: 'OFFREJEUNE50', name: '📦 1Go — 50دج / 24 ساعة (عادي)', detail: 'إنترنت 1Go | 50 دج | 24 ساعة', price: 50 },
  { code: 'BTL500MBHOUR', name: '⚡ 1GB — 40دج / ساعة', detail: 'إنترنت 1GB | 40 دج | ساعة واحدة', price: 40 },
  { code: 'DOVINTSPEEDWEEK2GoPRE', name: '📦 4Go — 150دج / 7 أيام', detail: 'إنترنت 4Go | 150 دج | 7 أيام', price: 150 },
  { code: 'DOVINTSPEEDWEEK3GoPRE', name: '📦 10Go — 300دج / 7 أيام', detail: 'إنترنت 10Go | 300 دج | 7 أيام', price: 300 },
  { code: 'BTLDATA2WEEKS', name: '📦 4GB — 400دج / 15 يوم', detail: 'إنترنت 4GB | 400 دج | 15 يوم', price: 400 },
  { code: '2GBMONTH', name: '📦 3GB — 250دج / 30 يوم', detail: 'إنترنت 3GB | 250 دج | 30 يوم', price: 250 },
  { code: 'DOVINTSPEEDMONTH6GoPRE', name: '📦 12Go — 500دج / 30 يوم', detail: 'إنترنت 12Go | 500 دج | 30 يوم', price: 500 },
  { code: 'DOVINTSPEEDMONTH15GoPRE', name: '📦 30Go — 1000دج / 30 يوم', detail: 'إنترنت 30Go | 1000 دج | 30 يوم', price: 1000 },
  { code: 'DOVINTSPEEDMONTH30GoPRE', name: '📦 60Go — 1500دج / 30 يوم', detail: 'إنترنت 60Go | 1500 دج | 30 يوم', price: 1500 },
  { code: '1GBFB3DAYInternet', name: '📘 فيسبوك 1GB — 70دج / 3 أيام', detail: 'Facebook 1GB | 70 دج | 3 أيام', price: 70 },
  { code: 'ImtiyazSurpriseData2hfbPRE', name: '📘 فيسبوك غير محدود — 50دج / 4 ساعات', detail: 'Facebook غير محدود | 50 دج | 4 ساعات', price: 50 },
];

/** الباقة المدفوعة المضبوطة عبر البيئة (زر «6 جيغا») — إن وُجدت تُعرض أولاً */
export function configuredPaidOffer() {
  const code = config.djezzy.paidProductCode;
  if (!code) return null;
  const known = PAID_OFFERS.find((offer) => offer.code === code);
  return known ?? { code, name: `📦 باقة ${code}`, detail: `رمز الباقة: ${code}`, price: null };
}

export function findOffer(code) {
  return PAID_OFFERS.find((offer) => offer.code === code) ?? null;
}

export function findFreeGift(id) {
  return FREE_GIFTS.find((gift) => gift.id === id) ?? null;
}

export default { FREE_GIFTS, PAID_OFFERS, configuredPaidOffer, findOffer, findFreeGift };
