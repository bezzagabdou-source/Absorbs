import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth-context";
import { PwaRegister } from "@/components/pwa";
import { StableViewport } from "@/components/stable-viewport";
import { siteUrl } from "@/lib/site";

const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  alternates: { canonical: "/" },
  applicationName: "برق",
  title: {
    default: "برق — مساعدك اليومي للكتابة والترجمة والدراسة",
    template: "%s | برق",
  },
  description:
    "مساعدك اليومي بالعربية والدارجة والفرنسية — محادثة، أدوات محتوى للتجار، ترجمة، سيرة ذاتية ومساعد دراسة. مجاني كل يوم.",
  keywords: ["الجزائر", "دارجة", "مساعد", "ترجمة", "Algeria", "Barq", "برق"],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "برق",
  },
  openGraph: {
    title: "برق",
    description:
      "مساعدك اليومي بالعربية والدارجة والفرنسية — مجاني كل يوم.",
    siteName: "برق",
    type: "website",
    locale: "ar_DZ",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "برق" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#030712",
  colorScheme: "dark",
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
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
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
