import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async redirects() {
    return ["orders", "products", "categories", "wallets", "coupons", "analytics", "search", "tools", "reviews", "faq"].map((section) => ({ source: `/admin/${section}/:path*`, destination: "/admin/contests", permanent: false }));
  },
  images: { unoptimized: true },
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
