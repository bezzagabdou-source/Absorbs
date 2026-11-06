/** أدوات مساعدة: تنسيق التواريخ، تأخير، مهلة زمنية */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** تنفيذ وعد مع حدّ زمني أقصى (يمنع تعليق الدالة على Vercel) */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`انتهت المهلة: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export const isExpired = (expiresAt, skewSeconds = 60) =>
  !expiresAt || Date.now() + skewSeconds * 1000 >= Number(expiresAt);

export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  try {
    return new Intl.DateTimeFormat('ar-DZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Algiers',
    }).format(new Date(Number(timestamp)));
  } catch {
    return new Date(Number(timestamp)).toISOString();
  }
}

export function formatRelative(timestamp) {
  if (!timestamp) return '—';
  const diff = Date.now() - Number(timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

/** هروب HTML لرسائل تيليجرام */
export const escapeHtml = (text) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
