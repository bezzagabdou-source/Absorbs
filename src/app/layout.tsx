import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth-context";
import { PwaRegister } from "@/components/pwa";
import { StableViewport } from "@/components/stable-viewport";
import { siteUrl } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
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
      <body className={`${plex.variable} antialiased`}>
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
      </body>
    </html>
  );
}
