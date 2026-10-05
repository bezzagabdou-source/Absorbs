import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    // smaller bundles = faster first load
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // v8: no more 404 for Pro / game tools opened from a public or old link
  async redirects() {
    const PRO_IDS =
      "code-review|bug-fixer|code-explainer|code-converter|security-audit|test-writer|game-builder|wallpaper-designer|ui-designer|landing-builder|logo-designer";
    return [
      { source: `/tools/:id(${PRO_IDS})`, destination: "/app/tools/:id", permanent: false },
      { source: `/tool/:id`, destination: "/app/tools/:id", permanent: false },
      { source: `/app/tool/:id`, destination: "/app/tools/:id", permanent: false },
      { source: `/app/games`, destination: "/app/tools/game-builder", permanent: false },
      { source: `/games`, destination: "/app/tools/game-builder", permanent: false },
      { source: `/game-builder`, destination: "/app/tools/game-builder", permanent: false },
      { source: `/arcade`, destination: "/app/arcade", permanent: false },
      { source: `/studio`, destination: "/app/studio", permanent: false },
      { source: `/upgrade`, destination: "/app/upgrade", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
