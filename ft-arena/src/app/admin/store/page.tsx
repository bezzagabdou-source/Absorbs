import Page from "@/components/admin/Page";
import Store from "@/components/admin/panels/Store";

export const dynamic = "force-dynamic";
export const metadata = { title: "المتجر — مسابقات MX" };

export default function StorePage() {
  return (
    <Page tab="store">
          <Store />
    </Page>
  );
}
