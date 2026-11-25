"use client";

import { useMemo, useState } from "react";
import { Badge, Btn, Card, Empty, Spinner, Stat, apiPost, dateTime, relative, toast, useApi } from "@/components/ui";

type Row = {
  tg_id: number;
  first_name: string | null;
  username: string | null;
  avatar_file_id: string | null;
  is_blocked: boolean;
  messages_count: number;
  clicks_count: number;
  last_seen_at: string;
  created_at: string;
  orders_count: number;
  spent: number;
};

export default function ActivityPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{ rows: Row[]; totals: Record<string, string> }>("activity");
  const [tab, setTab] = useState<"active" | "all" | "blocked" | "new">("active");
  const [busy, setBusy] = useState<number | null>(null);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (tab === "active") return all.filter((r) => Date.now() - new Date(r.last_seen_at).getTime() < 24 * 3600_000);
    if (tab === "blocked") return all.filter((r) => r.is_blocked);
    if (tab === "new") return all.filter((r) => Date.now() - new Date(r.created_at).getTime() < 48 * 3600_000);
    return all;
  }, [data, tab]);

  const block = async (r: Row) => {
    setBusy(r.tg_id);
    await apiPost(`users/${r.tg_id}`, { action: r.is_blocked ? "unban" : "ban", reason: "من صفحة النشاط" }).catch((e) => toast(String(e.message), "err"));
    toast(r.is_blocked ? "تم فك الحظر" : "تم الحظر");
    reload();
    setBusy(null);
  };

  const ping = async (r: Row) => {
    setBusy(r.tg_id);
    await apiPost(`users/${r.tg_id}`, { action: "message", text: "👋 رسالة من إدارة CHINWI STORE" }).catch(() => null);
    toast("أُرسلت الرسالة");
    setBusy(null);
  };

  if (loading && !data) return <Spinner label="تحميل النشاط…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full bg-sky-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">👀 الأشخاص النشطون</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">من دخل اليوم، عدد رسائله، عدد ضغطاته على الأزرار، وكم صرف عندك.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="إجمالي المستخدمين" value={data?.totals.users ?? "0"} icon="👥" />
        <Stat label="نشطون 24 ساعة" value={data?.totals.active_day ?? "0"} icon="🔥" tone="emerald" />
        <Stat label="نشطون 7 أيام" value={data?.totals.active_week ?? "0"} icon="📅" tone="sky" />
        <Stat label="إجمالي الرسائل" value={data?.totals.messages ?? "0"} icon="💬" tone="violet" />
        <Stat label="ضغطات الأزرار" value={data?.totals.clicks ?? "0"} icon="🖱" tone="amber" />
      </div>

      <Card
        title="👥 القائمة"
        action={
          <div className="flex gap-1 rounded-full bg-white/70 p-1">
            {[
              { id: "active", label: "نشطون" },
              { id: "new", label: "جدد" },
              { id: "all", label: "الكل" },
              { id: "blocked", label: "محظورون" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`rounded-full px-3 py-1 text-[0.7rem] font-black transition ${tab === t.id ? "bg-emerald-500 text-white" : "text-emerald-900/60 hover:bg-white"}`}
                type="button"
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <Empty icon="👤" title="لا أحد في هذه القائمة" />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.tg_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/70 p-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 text-sm font-black text-emerald-700">
                  {r.first_name?.slice(0, 1) ?? "؟"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-emerald-950">
                    {r.first_name ?? "بدون اسم"} {r.is_blocked && <Badge tone="red">محظور</Badge>}
                  </p>
                  <p className="truncate text-[0.66rem] text-emerald-900/50" dir="ltr">
                    {r.username ? `@${r.username}` : r.tg_id} • آخر ظهور {relative(r.last_seen_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[0.65rem] font-bold">
                  <span className="rounded-full bg-white px-2 py-1 text-emerald-800">💬 {Number(r.messages_count)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-emerald-800">🖱 {Number(r.clicks_count)}</span>
                  <span className="rounded-full bg-white px-2 py-1 text-emerald-800">🧾 {r.orders_count}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">💰 {Math.round(Number(r.spent)).toLocaleString("ar-DZ")} دج</span>
                </div>
                <div className="flex gap-1">
                  <Btn size="sm" variant="ghost" onClick={() => ping(r)} disabled={busy === r.tg_id}>
                    ✉️
                  </Btn>
                  <Btn size="sm" variant={r.is_blocked ? "green" : "red"} onClick={() => block(r)} disabled={busy === r.tg_id}>
                    {r.is_blocked ? "فك" : "حظر"}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-center text-[0.66rem] text-emerald-900/40">
        آخر تحديث: {dateTime(new Date())} — تُحدَّث العدادات تلقائياً مع كل رسالة أو ضغطة زر.
      </p>
    </div>
  );
}
