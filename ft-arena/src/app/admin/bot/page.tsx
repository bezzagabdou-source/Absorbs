import Page from "@/components/admin/Page";
import BotPanel from "@/components/admin/panels/BotPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "البوت والتشغيل — مسابقات MX" };

export default function BotPanelPage() {
  return (
    <Page tab="bot">
          <BotPanel />
    </Page>
  );
}
