import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const nextConfig: NextConfig = {
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  poweredByHeader: false,
  allowedDevOrigins: process.env.NODE_ENV === "development" ? ["*.e2b.app"] : [],
  async headers() { return [
    { source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ...(process.env.NODE_ENV !== "development" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: `${process.env.NODE_ENV === "development" ? "frame-ancestors 'self' https://*.e2b.app" : "frame-ancestors 'none'"}; base-uri 'self'; object-src 'none'; form-action 'self'` },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] },
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    { source: "/DZ-Exchange.apk", headers: [
      { key: "Content-Type", value: "application/vnd.android.package-archive" },
      { key: "Content-Disposition", value: 'attachment; filename="DZ-Exchange.apk"' },
      { key: "Cache-Control", value: "public, max-age=300" },
    ] },
  ]; },
};
export default nextConfig;
