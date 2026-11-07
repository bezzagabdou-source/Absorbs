import type { MetadataRoute } from "next";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
export default async function manifest(): Promise<MetadataRoute.Manifest> { const locale = await getLocale(); return { id: "/", name: `DZ Exchange · ${translate(locale, "brandTag")}`, short_name: "DZ Exchange", description: translate(locale, "heroDescription"), start_url: "/", scope: "/", display: "standalone", background_color: "#f6f7f3", theme_color: "#f6f7f3", icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ], categories: ["shopping", "lifestyle"], lang: locale, dir: locale === "ar" ? "rtl" : "ltr" }; }
