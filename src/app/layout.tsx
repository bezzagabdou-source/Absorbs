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
    default: "Nexus AI — مساعدك اليومي للكتابة والترجمة والدراسة",
    template: "%s | Nexus AI",
  },
  description:
    "مساعدك اليومي بالعربية والدارجة والفرنسية — محادثة، أدوات محتوى للتجار، ترجمة، سيرة ذاتية ومساعد دراسة. مجاني كل يوم.",
  keywords: ["الجزائر", "دارجة", "مساعد", "ترجمة", "Algeria", "Nexus AI"],
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
    statusBarStyle: "black-translucent",
    title: "Nexus AI",
  },
  openGraph: {
    title: "Nexus AI",
    description:
      "مساعدك اليومي بالعربية والدارجة والفرنسية — مجاني كل يوم.",
    siteName: "Nexus AI",
    type: "website",
    locale: "ar_DZ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Nexus AI" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#181816",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
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
