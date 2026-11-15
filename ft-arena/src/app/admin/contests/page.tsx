import Page from "@/components/admin/Page";
import Contests from "@/components/admin/panels/Contests";

export const dynamic = "force-dynamic";
export const metadata = { title: "المسابقات — مسابقات MX" };

export default function ContestsPage() {
  return (
    <Page tab="contests">
          <Contests />
    </Page>
  );
}
