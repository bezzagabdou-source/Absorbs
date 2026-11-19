import VisitorTracker from "./VisitorTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body style={{ margin: 0 }}><VisitorTracker />{children}</body></html>;
}
