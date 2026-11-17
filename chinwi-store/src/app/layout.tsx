import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHINWI STORE — متجر الشحن والمنتجات الرقمية",
  description:
    "أسرع متجر شحن ألعاب ومنتجات رقمية في الجزائر: فري فاير، eFootball، تيك توك كوينز، تيليجرام بريميوم، حسابات AI وأفلام… أسعار لا تُقاوَم وخدمة 24/7.",
  keywords: ["شحن فري فاير", "جواهر", "تيليجرام بريميوم", "تيك توك كوينز", "متجر رقمي الجزائر", "CHINWI STORE"],
  openGraph: {
    title: "CHINWI STORE — متجر الشحن الأول في الجزائر",
    description: "شحن فوري • أسعار منافسة • خدمة 24/7",
    images: ["/catalog/freefire.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
