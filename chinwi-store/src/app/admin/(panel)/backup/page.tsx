"use client";

import { Badge, Btn, Card, Spinner, Stat, toast, useApi } from "@/components/ui";

type HealthData = {
  counts: { users: string; products: string; orders: string; events: string };
  media: { count: number; size: number };
  db: { connected: boolean; now: string | null };
};

export default function BackupPage(): React.ReactElement {
  const { data, loading } = useApi<HealthData>("health");

  const download = (path: string, name: string) => {
    toast("جاري تحضير الملف…");
    const a = document.createElement("a");
    a.href = `/api/admin/${path}`;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading && !data) return <Spinner label="تحميل…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-12 -top-20 h-52 w-52 rounded-full bg-emerald-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">💾 النسخ الاحتياطي والتصدير</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">خذ نسخة كاملة قبل أي تعديل كبير — ملف JSON لكل الجداول أو SQL جاهز للاستيراد.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="المنتجات" value={data?.counts.products ?? "—"} icon="📦" />
        <Stat label="الطلبات" value={data?.counts.orders ?? "—"} icon="🧾" tone="sky" />
        <Stat label="المستخدمون" value={data?.counts.users ?? "—"} icon="👥" tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="📦 نسخة كاملة" subtitle="كل الجداول مع الإعدادات والطلبات والمستخدمين">
          <div className="space-y-2">
            <button onClick={() => download("export/backup", "chinwi-backup.json")} className="flex w-full items-center justify-between rounded-2xl bg-white/75 px-4 py-3 text-right transition hover:bg-white">
              <span>
                <span className="block text-sm font-black text-emerald-950">💾 نسخة JSON</span>
                <span className="text-[0.68rem] text-emerald-900/55">مناسبة للأرشفة والاستعادة البرمجية</span>
              </span>
              <span className="text-xl">⬇️</span>
            </button>
            <button onClick={() => download("export/sql", "chinwi-backup.sql")} className="flex w-full items-center justify-between rounded-2xl bg-white/75 px-4 py-3 text-right transition hover:bg-white">
              <span>
                <span className="block text-sm font-black text-emerald-950">🗄 نسخة SQL</span>
                <span className="text-[0.68rem] text-emerald-900/55">جمل INSERT جاهزة للاستيراد في Neon</span>
              </span>
              <span className="text-xl">⬇️</span>
            </button>
          </div>
          <div className="mt-3 rounded-2xl bg-emerald-50/80 p-3 text-[0.72rem] font-bold leading-6 text-emerald-900/75">
            🔐 النسخة تحتوي بيانات الزبائن — احفظها في مكان آمن ولا تشاركها.
          </div>
        </Card>

        <Card title="📤 تصدير مخصص">
          <div className="space-y-2">
            {[
              { path: "export/orders", name: "orders.csv", label: "🧾 الطلبات (CSV)", hint: "كل الطلبات مع الحالات والمبالغ" },
              { path: "export/users", name: "users.csv", label: "👥 المستخدمون (CSV)", hint: "قائمة الزبائن للتواصل والتسويق" },
            ].map((row) => (
              <button key={row.path} onClick={() => download(row.path, row.name)} className="flex w-full items-center justify-between rounded-2xl bg-white/75 px-4 py-3 text-right transition hover:bg-white">
                <span>
                  <span className="block text-sm font-black text-emerald-950">{row.label}</span>
                  <span className="text-[0.68rem] text-emerald-900/55">{row.hint}</span>
                </span>
                <span className="text-xl">⬇️</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2">
            <span className="text-[0.72rem] font-bold text-emerald-900/70">حالة القاعدة</span>
            <Badge tone={data?.db.connected ? "emerald" : "red"}>{data?.db.connected ? "متصلة" : "منقطعة"}</Badge>
          </div>
          <Btn className="mt-3 w-full" variant="ghost" onClick={() => download("export/backup", "chinwi-backup.json")}>
            🛡 نسخة سريعة الآن
          </Btn>
        </Card>
      </div>
    </div>
  );
}
