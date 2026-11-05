import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // صور المسابقات تُرفع عبر Server Action — نرفع حد حجم الطلب
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
