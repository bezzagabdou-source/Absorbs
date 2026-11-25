import Page from "@/components/admin/Page";
import AIConsole from "@/components/admin/panels/AIConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "الكونسول الذكي — مسابقات MX" };

export default function AIConsolePage() {
  return (
    <Page tab="ai">
          <AIConsole />
    </Page>
  );
}
