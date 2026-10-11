import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { TOOLS } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/v11`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 },
    ...TOOLS.map((t) => ({
      url: `${base}/tools/${t.id}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${base}/privacy.html`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.3 },
    { url: `${base}/help`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${base}/report`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.2 },
    { url: `${base}/activity`, lastModified: now, changeFrequency: "daily" as const, priority: 0.2 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 },
  ];
}
