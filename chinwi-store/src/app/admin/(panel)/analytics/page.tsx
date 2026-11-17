"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Spinner, Stat, money, useApi } from "@/components/ui";

type Point = { day: string; orders: number; revenue: number };
type Health = { need?: string };

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الدفع",
  awaiting_review: "بانتظار المراجعة",
  processing: "قيد التنفيذ",
  delivered: "تم التسليم",
  cancelled: "ملغاة",
  rejected: "مرفوضة",
};

export default function AnalyticsPage(): React.ReactElement {
  const [days, setDays] = useState(30);
  const { data, loading } = useApi<{
    series: Point[];
    top: { product_name: string; orders: number; revenue: number }[];
    statuses: { status: string; c: number }[];
    kinds: { kind: string; c: number }[];
    hours: { h: number; c: number }[];
    usersSeries: { day: string; c: number }[];
    totals: Record<string, number>;
  }>(`analytics?days=${days}`);

  if (loading && !data) return <Spinner label="جاري حساب التحليلات…" />;

  const series = data?.series ?? [];
  const maxOrders = Math.max(1, ...series.map((p) => p.orders));
  const maxRevenue = Math.max(1, ...series.map((p) => p.revenue));
  const totalOrders = series.reduce((a, p) => a + p.orders, 0);
  const totalRevenue = series.reduce((a, p) => a + p.revenue, 0);
  const hours = data?.hours ?? [];
  const maxHour = Math.max(1, ...hours.map((h) => h.c));
  const statusMax = Math.max(1, ...(data?.statuses ?? []).map((s) => s.c));

  const spark = (values: number[], w = 260, h = 54): string => {
    if (!values.length) return "";
    const max = Math.max(1, ...values);
    return values
      .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 6) - 3}`)
      .join(" ");
  };

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-16 -top-24 h-56 w-56 rounded-full bg-sky-300/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">📈 التحليلات</h1>
            <p className="mt-1 text-xs font-bold text-emerald-900/60">أداء المتجر خلال آخر {days} يوماً — طلبات، مبيعات، أفضل المنتجات.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-white/70 p-1">
            {[7, 14, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-full px-3 py-1 text-xs font-black transition ${days === d ? "bg-emerald-500 text-white shadow" : "text-emerald-900/60 hover:bg-white"}`}
                type="button"
              >
                {d}ي
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="طلبات الفترة" value={totalOrders} icon="🧾" />
        <Stat label="مبيعات الفترة" value={money(totalRevenue)} icon="💰" tone="amber" />
        <Stat label="متوسط الطلب" value={money(totalOrders ? Math.round(totalRevenue / totalOrders) : 0)} icon="📊" tone="sky" />
        <Stat label="زبائن جدد (14ي)" value={(data?.usersSeries ?? []).reduce((a, p) => a + p.c, 0)} icon="👥" tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="🧾 الطلبات يومياً" subtitle={`أعلى يوم: ${maxOrders} طلب`}>
          <div className="flex h-44 items-end gap-1 rounded-2xl bg-white/50 p-3">
            {series.map((p) => (
              <div key={p.day} className="group relative flex-1">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-300 transition-all group-hover:from-emerald-700"
                  style={{ height: `${Math.max(4, (p.orders / maxOrders) * 150)}px` }}
                  title={`${p.day}: ${p.orders} طلب`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[0.6rem] font-bold text-emerald-900/40">
            <span>{series[0]?.day}</span>
            <span>{series[series.length - 1]?.day}</span>
          </div>
        </Card>

        <Card title="💰 المبيعات يومياً" subtitle="مجموع مبالغ الطلبات">
          <svg viewBox="0 0 260 54" className="h-40 w-full">
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polyline points={spark(series.map((p) => p.revenue))} fill="none" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <polygon points={`0,54 ${spark(series.map((p) => p.revenue))} 260,54`} fill="url(#rev)" />
          </svg>
          <div className="flex items-center justify-between text-[0.65rem] font-bold text-emerald-900/50">
            <span>أعلى يوم: {money(maxRevenue)}</span>
            <Badge tone="amber">الإجمالي {money(totalRevenue)}</Badge>
          </div>
        </Card>

        <Card title="🏆 أفضل المنتجات">
          {(data?.top.length ?? 0) === 0 ? (
            <Empty icon="🏆" title="لا بيانات بعد" />
          ) : (
            <div className="space-y-2">
              {data?.top.map((p, i) => (
                <div key={`${p.product_name}-${i}`} className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-[0.65rem] font-black text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-emerald-950">{p.product_name}</span>
                  <span className="whitespace-nowrap text-[0.65rem] font-bold text-emerald-900/55">{p.orders} طلب</span>
                  <span className="whitespace-nowrap text-[0.65rem] font-black text-amber-600">{money(p.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="📊 حالات الطلبات">
            <div className="space-y-2">
              {(data?.statuses ?? []).map((s) => (
                <div key={s.status}>
                  <div className="mb-1 flex justify-between text-[0.7rem] font-bold text-emerald-900/70">
                    <span>{STATUS_LABEL[s.status] ?? s.status}</span>
                    <span>{s.c}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/70">
                    <div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400" style={{ width: `${(s.c / statusMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="⏰ أنشط الساعات">
            <div className="flex h-24 items-end gap-0.5">
              {Array.from({ length: 24 }, (_, h) => {
                const c = hours.find((x) => x.h === h)?.c ?? 0;
                return <div key={h} className="flex-1 rounded-t bg-gradient-to-t from-sky-500 to-sky-300" style={{ height: `${Math.max(3, (c / maxHour) * 88)}px` }} title={`${h}:00 — ${c}`} />;
              })}
            </div>
            <div className="mt-1 flex justify-between text-[0.6rem] text-emerald-900/40">
              <span>00</span>
              <span>12</span>
              <span>23</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
