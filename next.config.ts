import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // keep native/server-only packages out of the webpack bundle:
  // `pg` ships native bindings — bundling it is the #1 cause of broken builds.
  serverExternalPackages: ["pg"],
  experimental: {
    // smaller bundles = faster first load
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // v20: the final-fixed app is a single chat shell — keep only the redirects
  // that actually exist (the old /app/* tool routes were removed in this build)
  async redirects() {
    return [
      // standalone legal page (public/privacy.html): privacy, terms, data deletion
      { source: "/privacy", destination: "/privacy.html", permanent: true },
      { source: "/terms", destination: "/privacy.html#terms", permanent: true },
    ];
  },
  // optional: serve Firebase's auth handler from our own domain (see firebase-config.ts)
  async rewrites() {
    if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY !== "1") return [];
    const host = `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "mohtal-9b1d3"}.firebaseapp.com`;
    return [
      { source: "/__/auth/:path*", destination: `https://${host}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `https://${host}/__/firebase/:path*` },
    ];
  },
  async headers() {
    return [
      {
        // security headers for every page (no CSP: it could break inline scripts / previews)
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
        headers: [{ key: "Content-Type", value: "application/json" }, { key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
