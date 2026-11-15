import Page from "@/components/admin/Page";
import Library from "@/components/admin/panels/Library";

export const dynamic = "force-dynamic";
export const metadata = { title: "المكتبة والصور — مسابقات MX" };

export default function LibraryPage() {
  return (
    <Page tab="library">
          <Library />
    </Page>
  );
}
