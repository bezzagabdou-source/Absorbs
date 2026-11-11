import Page from "@/components/admin/Page";
import ActivityPanel from "@/components/admin/panels/ActivityPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "السجل — مسابقات MX" };

export default function ActivityPanelPage() {
  return (
    <Page tab="activity">
          <ActivityPanel />
    </Page>
  );
}
