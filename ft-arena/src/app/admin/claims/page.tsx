import Page from "@/components/admin/Page";
import Claims from "@/components/admin/panels/Claims";

export const dynamic = "force-dynamic";
export const metadata = { title: "الطلبات — مسابقات MX" };

export default function ClaimsPage() {
  return (
    <Page tab="claims">
          <Claims />
    </Page>
  );
}
