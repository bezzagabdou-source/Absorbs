import type { Metadata } from "next";
import "./panel.css";

export const metadata: Metadata = {
  title: "لوحة التحكم — FT",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Admin2Layout({ children }: { children: React.ReactNode }) {
  return <div className="a2">{children}</div>;
}
