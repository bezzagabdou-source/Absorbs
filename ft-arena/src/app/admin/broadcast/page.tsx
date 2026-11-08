import Page from "@/components/admin/Page";
import BroadcastPanel from "@/components/admin/panels/BroadcastPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "البث الجماعي — مسابقات MX" };

export default function BroadcastPanelPage() {
  return (
    <Page tab="broadcast">
          <BroadcastPanel />
    </Page>
  );
}
