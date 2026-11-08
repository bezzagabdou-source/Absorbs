import Page from "@/components/admin/Page";
import Overview from "@/components/admin/panels/Overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "نظرة عامة — مسابقات MX" };

export default function OverviewPage() {
  return (
    <Page tab="overview">
          <Overview />
    </Page>
  );
}
