import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "توابل الأصيل | نكهة الأصالة من خيرات الطبيعة",
  description: "اكتشف التوابل والأعشاب الطبيعية والعسل والمنتجات التقليدية في توابل الأصيل، زيامة منصورية، جيجل.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
