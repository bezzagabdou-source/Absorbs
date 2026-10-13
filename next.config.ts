import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // `pg` ships native bindings — bundling it is the #1 cause of broken Vercel builds
  serverExternalPackages: ["pg"],
  experimental: {
    // smaller bundles = faster first load
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  // optional: serve Firebase's auth handler from our own domain (see src/lib/firebase-config.ts)
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
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // keeps Firebase popup sign-in working
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
