import type { Metadata } from "next";
import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
