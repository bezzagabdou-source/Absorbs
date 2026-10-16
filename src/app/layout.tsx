import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

/* Self-hosted fonts (src/fonts) — zero network dependency at build or runtime. */
const plexArabic = localFont({
  src: [
    { path: "../fonts/plex-arabic-400.woff2", weight: "400" },
    { path: "../fonts/plex-arabic-500.woff2", weight: "500" },
    { path: "../fonts/plex-arabic-600.woff2", weight: "600" },
    { path: "../fonts/plex-arabic-700.woff2", weight: "700" },
  ],
  variable: "--font-plex-arabic",
  display: "swap",
});

const plexLatin = localFont({
  src: [
    { path: "../fonts/plex-latin-400.woff2", weight: "400" },
    { path: "../fonts/plex-latin-500.woff2", weight: "500" },
    { path: "../fonts/plex-latin-600.woff2", weight: "600" },
    { path: "../fonts/plex-latin-700.woff2", weight: "700" },
  ],
  variable: "--font-plex-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nexus AI — مساعدك الذكي",
    template: "%s · Nexus AI",
  },
  description: "Nexus — واجهة ذكاء اصطناعي مستقبلية. محادثة سيّالة، كود، أفكار، وإبداع بلا حدود.",
  applicationName: "Nexus AI",
  icons: [{ url: "/icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#04050c" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6ff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Applies the persisted theme before first paint — no flash, no flicker. */
const themeBoot = `(function(){try{var t=localStorage.getItem("nexus-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${plexArabic.variable} ${plexLatin.variable} antialiased`}>
        <div className="nx-stage" aria-hidden />
        {children}
      </body>
    </html>
  );
}
