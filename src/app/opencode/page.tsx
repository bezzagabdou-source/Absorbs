import type { Metadata, Viewport } from "next";
import { OpenCodeDashboard } from "@/components/opencode/dashboard";

export const metadata: Metadata = {
  title: "لوحة تحكم OpenCode",
  description:
    "تحكم بـ OpenCode وتحدث معه من هاتفك — واجهة داكنة Mobile-first متصلة بسيرفر OpenCode عبر Next.js API.",
  applicationName: "OpenCode Dashboard",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OpenCode",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080b",
};

export default function OpenCodeDashboardPage() {
  return <OpenCodeDashboard />;
}
