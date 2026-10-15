import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nexus AI — مساعدك الذكي",
    template: "%s · Nexus AI",
  },
  description:
    "Nexus — واجهة ذكاء اصطناعي مستقبلية. محادثة سيّالة، كود، أفكار، وإبداع بلا حدود.",
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
      <body className={`${inter.variable} ${plexArabic.variable} antialiased`}>
        <div className="nx-stage" aria-hidden />
        {children}
      </body>
    </html>
  );
}
