import Page from "@/components/admin/Page";
import Users from "@/components/admin/panels/Users";

export const dynamic = "force-dynamic";
export const metadata = { title: "الأعضاء — مسابقات MX" };

export default function UsersPage() {
  return (
    <Page tab="users">
          <Users />
    </Page>
  );
}
