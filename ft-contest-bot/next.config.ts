import type { NextConfig } from "next";

/**
 * 🗑️ اللوحة القديمة (داخل البوت) تحيّدت نهائياً: كل الإدارة من لوحة ft-panel.
 * كل مسار قديم يتحوّل إلى اللوحة الجديدة بدل صفحة 404 أو لوحة مكرّرة.
 */
const PANEL_URL = (process.env.PANEL_URL || "https://ft-panel-blue.vercel.app").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
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
