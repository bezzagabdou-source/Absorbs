/**
 * نقطة الدخول الوحيدة على Vercel (Serverless Function).
 * كل المسارات (/webhook, /health, /api/setup …) تُوجَّه إلى هذا الملف
 * عبر vercel.json، فلا حاجة إلى أي إعداد إضافي.
 */
import { createApp } from './app.js';

const app = createApp();

export default function handler(req, res) {
  return app(req, res);
}

// إعدادات دالة Vercel (Node.js runtime)
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};
