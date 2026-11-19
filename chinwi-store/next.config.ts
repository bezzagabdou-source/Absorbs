import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: { unoptimized: true },
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
