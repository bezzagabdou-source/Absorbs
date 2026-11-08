import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FT Arena — لوحة تحكم البوت",
  description:
    "FT Arena: بوت تيليجرام احترافي للمسابقات والنقاط + لوحة تحكم متكاملة مع كونسول ذكاء اصطناعي.",
  applicationName: "FT Arena",
  openGraph: {
    title: "FT Arena — نقاط، إحالات، وجوائز حقيقية",
    description: "اجمع النقاط من الإحالات والهدية اليومية والعجلة… وحوّلها إلى جوائز.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#070a10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
