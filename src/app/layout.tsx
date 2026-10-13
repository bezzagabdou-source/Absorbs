import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Fonts are self-hosted (no request to Google on every visit — faster first paint,
// works offline, and no third-party connection from the visitor's browser).
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";

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
      <body className="antialiased">
        <div className="nx-stage" aria-hidden />
        {children}
      </body>
    </html>
  );
}
