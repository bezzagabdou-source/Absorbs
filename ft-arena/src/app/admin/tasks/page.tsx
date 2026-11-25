import Page from "@/components/admin/Page";
import TasksPanel from "@/components/admin/panels/TasksPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "المهام — مسابقات MX" };

export default function TasksPage() {
  return (
    <Page tab="tasks">
      <TasksPanel />
    </Page>
  );
}
