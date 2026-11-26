import Link from "next/link";

export default function DashboardPage(): React.ReactElement {
  return (
    <main className="space-y-6 p-4">
      <h1 className="text-2xl font-black">🏆 لوحة المسابقات والبطولات</h1>
      <p>إدارة المسابقات، النقاط، الإحالات والمشاركين.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white" href="/admin/contests">🎉 المسابقات والنقاط</Link>
        <Link className="rounded-xl bg-slate-700 px-5 py-3 font-bold text-white" href="/admin/users">👥 المشاركون</Link>
        <Link className="rounded-xl bg-slate-700 px-5 py-3 font-bold text-white" href="/admin/channels">📣 قنوات الاشتراك</Link>
      </div>
    </main>
  );
}
