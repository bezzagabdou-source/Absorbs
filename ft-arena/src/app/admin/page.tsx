import { isAdmin } from "@/lib/auth";
import LoginForm from "@/components/admin/LoginForm";
import Console from "@/components/admin/Console";

export const dynamic = "force-dynamic";

export const metadata = { title: "لوحة تحكم FT Arena" };

export default async function AdminPage() {
  const authed = await isAdmin();
  if (!authed) return <LoginForm />;
  return <Console />;
}
