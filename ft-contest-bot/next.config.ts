import type { NextConfig } from "next";

/**
 * 🗑️ اللوحة القديمة (داخل البوت) تحيّدت نهائياً: كل الإدارة من لوحة ft-panel.
 * كل مسار قديم يتحوّل إلى اللوحة الجديدة بدل صفحة 404 أو لوحة مكرّرة.
 */
const PANEL_URL = (process.env.PANEL_URL || "https://ft-panel-blue.vercel.app").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  // ⚠️ المستودع فيه package-lock.json في الجذر وفـ ft-contest-bot كمان، وNext كان
  // كيتخبّط في تحديد جذر الـ tracing (تحذير في كل build). كنحدّدوه صراحة.
  outputFileTracingRoot: __dirname,
  typescript: {
    // الفشل في الأنواع كيوقف النشر — وهذا هو المطلوب (بناء نظيف دايماً)
    ignoreBuildErrors: false,
  },
  async redirects() {
    return [
      { source: "/admin", destination: PANEL_URL, permanent: false },
      { source: "/admin/:path*", destination: PANEL_URL, permanent: false },
      { source: "/admin2", destination: PANEL_URL, permanent: false },
      { source: "/admin2/:path*", destination: PANEL_URL, permanent: false },
    ];
  },
  experimental: {
    serverActions: {
      // صور المسابقات تُرفع عبر Server Action — نرفع حد حجم الطلب
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
