import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // keep these server-only packages out of the webpack bundle:
  // `pg` ships native bindings, `sharp` is a native image binary —
  // bundling either one is the #1 cause of broken Vercel builds.
  serverExternalPackages: ["pg", "sharp"],
  experimental: {
    // smaller bundles = faster first load
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // v8: no more 404 for Pro / game tools opened from a public or old link
  async redirects() {
    const PRO_IDS =
      "code-review|bug-fixer|code-explainer|code-converter|security-audit|test-writer|game-builder|wallpaper-designer|ui-designer|landing-builder|logo-designer";
    return [
      // standalone legal site (public/privacy.html): privacy, terms, data deletion, everything in one page
      { source: "/privacy", destination: "/privacy.html", permanent: true },
      { source: "/terms", destination: "/privacy.html#terms", permanent: true },
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
        // safe security headers for every page (no CSP: it could break inline scripts / previews)
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // popup sign-in (Firebase) keeps working with allow-popups
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
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
