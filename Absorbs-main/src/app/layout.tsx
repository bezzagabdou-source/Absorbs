import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth-context";
import { PwaRegister } from "@/components/pwa";
import { StableViewport } from "@/components/stable-viewport";
import { ChunkGuard } from "@/components/chunk-guard";
import { siteUrl } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/**
 * v17 — self-hosted IBM Plex Sans Arabic (woff2 vendored in `src/fonts`).
 * Why: `next/font/google` downloads the font at BUILD time. When Google Fonts is
 * slow or blocked, the whole Vercel build fails and nothing deploys. Vendoring the
 * files makes the build hermetic (zero network), removes a render-blocking third
 * party, and the subsets are split by unicode-range so a Latin-only page never
 * downloads the Arabic file.
 */
/* next/font/local takes no `unicodeRange` per source, and Next reads this call
 * statically (a computed `src` fails the whole build). So the two subsets are
 * declared as two families, every value written long-hand, and the browser does
 * per-character fallback: Latin glyphs resolve in the Latin face, Arabic script
 * falls through to the Arabic face. */
const plexArabic = localFont({
  variable: "--font-plex-arabic",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Tahoma", "sans-serif"],
  adjustFontFallback: "Arial",
  src: [
    { path: "../fonts/plex-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/plex-arabic-700.woff2", weight: "700", style: "normal" },
  ],
});

const plexLatin = localFont({
  variable: "--font-plex-latin",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Tahoma", "sans-serif"],
  adjustFontFallback: "Arial",
  src: [
    { path: "../fonts/plex-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/plex-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/plex-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/plex-latin-700.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: "/" },
  applicationName: "Nexus AI",
  title: {
    default: "Nexus AI v8.4 — مساعدك اليومي للكتابة والترجمة والدراسة",
    template: "%s | Nexus AI v8.4",
  },
  description:
    "مساعدك اليومي بالعربية والدارجة والفرنسية — محادثة، أدوات محتوى للتجار، ترجمة، سيرة ذاتية ومساعد دراسة. مجاني كل يوم.",
  keywords: ["الجزائر", "دارجة", "مساعد", "ترجمة", "Algeria", "Nexus AI v8.4", "Nexus AI v8.4"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/nexus-icon.svg", type: "image/svg+xml" },
      { url: "/icons/nexus-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/nexus-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/nexus-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/nexus-apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nexus AI",
  },
  openGraph: {
    title: "Nexus AI v8.4",
    description:
      "مساعدك اليومي بالعربية والدارجة والفرنسية — مجاني كل يوم.",
    siteName: "Nexus AI v8.4",
    type: "website",
    locale: "ar_DZ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Nexus AI v8.4" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#f7f8fc",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" data-theme="lumen" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${plexLatin.variable} ${plexArabic.variable} antialiased`}>
        <div className="aurora" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
        <PwaRegister />
        <StableViewport />
        <ChunkGuard />
      </body>
    </html>
  );
}
