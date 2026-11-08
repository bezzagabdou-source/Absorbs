import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";
import Shell, { type Tab } from "./Shell";

/** صفحة قسم مستقل: تتحقق من الجلسة ثم ترسم القالب مع المحتوى المطلوب */
export default async function Page({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  const authed = await isAdmin();
  if (!authed) return <LoginForm />;
  return <Shell tab={tab}>{children}</Shell>;
}
