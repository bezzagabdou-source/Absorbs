import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";
import { AdminShell } from "@/components/admin-shell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const store = await cookies();
  if (!verifyToken(store.get(COOKIE_NAME)?.value)) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
