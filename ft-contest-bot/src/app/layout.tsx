import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "بوت مسابقات FT — اجمع الجهات واربح الحساب",
  description:
    "بوت تيليغرام لمسابقات FT: كل مسابقة لها عدد جهات مطلوب، وأول من يكمل العدد يربح الحساب تلقائياً.",
};

export const viewport: Viewport = {
  themeColor: "#060a13",
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
