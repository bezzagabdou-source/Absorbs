import Page from "@/components/admin/Page";
import SettingsPanel from "@/components/admin/panels/SettingsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات — مسابقات MX" };

export default function SettingsPanelPage() {
  return (
    <Page tab="settings">
          <SettingsPanel />
    </Page>
  );
}
