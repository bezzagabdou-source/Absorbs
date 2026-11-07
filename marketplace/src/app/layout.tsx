import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MarketplaceShell } from "@/components/marketplace/MarketplaceShell";
import { getLocale } from "@/lib/i18n/server";
import { direction } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/dictionaries";
import { getReferenceData } from "@/features/catalog/queries";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> { const locale = await getLocale(); return { title: { default: `DZ Exchange · ${translate(locale, "brandTag")}`, template: "%s · DZ Exchange" }, description: translate(locale, "heroDescription"), applicationName: "DZ Exchange", appleWebApp: { capable: true, statusBarStyle: "default", title: "DZ Exchange" }, formatDetection: { telephone: false } }; }
export const viewport: Viewport = { themeColor: "#f6f7f3", width: "device-width", initialScale: 1 };
export default async function RootLayout({ children }: { children: ReactNode }) { const locale = await getLocale(); let reference; try { reference = await getReferenceData(); } catch { reference = { categories: [], wilayas: [] }; } return <html data-scroll-behavior="smooth" lang={locale} dir={direction(locale)} suppressHydrationWarning><body><MarketplaceShell locale={locale} reference={reference}>{children}</MarketplaceShell></body></html>; }
