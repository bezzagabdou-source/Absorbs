"use client";

import { Badge, Btn, Card, Empty, Spinner, Stat, dateTime, toast, useApi } from "@/components/ui";

type Media = { id: number; kind: string; file_id: string; mime: string | null; size: number | null; created_at: string };

export default function MediaPage(): React.ReactElement {
  const { data, loading, reload } = useApi<{ rows: Media[]; stats: { count: number; size: number } }>("media");

  if (loading && !data) return <Spinner label="تحميل الوسائط…" />;
  const rows = data?.rows ?? [];

  const copy = async (id: string) => {
    await navigator.clipboard.writeText(id).catch(() => null);
    toast("تم نسخ معرّف الملف");
  };

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full bg-violet-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🖼 الوسائط المرفوعة</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">كل صورة أرسلها الزبائن (إيصالات) أو رفعتها أنت — محفوظة هنا بمعرّفاتها.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="عدد الملفات" value={data?.stats.count ?? 0} icon="🗂" />
        <Stat label="الحجم" value={`${Math.round((data?.stats.size ?? 0) / 1024)} KB`} icon="💾" tone="sky" />
        <Stat label="الصور" value={rows.filter((r) => r.kind === "photo").length} icon="📷" tone="violet" />
      </div>

      <Card title="📋 القائمة" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
        {rows.length === 0 ? (
          <Empty icon="🖼" title="لا ملفات بعد" hint="ستظهر هنا تلقائياً عند إرسال الزبائن لإيصالاتهم" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>النوع</th>
                  <th>المعرّف</th>
                  <th>الحجم</th>
                  <th>التاريخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td className="text-xs text-emerald-900/50">{m.id}</td>
                    <td>
                      <Badge tone="slate">{m.kind}</Badge>
                    </td>
                    <td className="max-w-[14rem] truncate font-mono text-[0.65rem]" dir="ltr">
                      {m.file_id}
                    </td>
                    <td className="text-xs">{m.size ? `${Math.round(m.size / 1024)} KB` : "—"}</td>
                    <td className="whitespace-nowrap text-[0.65rem] text-emerald-900/50">{dateTime(m.created_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Btn size="sm" variant="ghost" onClick={() => copy(m.file_id)}>
                          نسخ
                        </Btn>
                        <a href={`/api/media/${m.id}`} target="_blank" rel="noreferrer" className="btn btn-ghost px-2 py-1 text-xs">
                          عرض
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
