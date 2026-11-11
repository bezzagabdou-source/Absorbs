import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ToastProvider } from "@/components/ui/feedback";
import { RegisterSW } from "@/components/pwa/register-sw";

export const metadata: Metadata = {
  title: { default: "Absorbs — تواصل بلا حدود", template: "%s · Absorbs" },
  description: "منشورات حيّة، إعجابات فورية، ورسائل خاصة لحظية — تجربة تواصل اجتماعي فاخرة تعمل كتطبيق حقيقي على هاتفك.",
  applicationName: "Absorbs",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Absorbs" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "ar_DZ",
    siteName: "Absorbs",
    title: "Absorbs — تواصل بلا حدود",
    description: "منشورات حيّة، إعجابات فورية، ورسائل خاصة لحظية.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070713",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
            <RegisterSW />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
