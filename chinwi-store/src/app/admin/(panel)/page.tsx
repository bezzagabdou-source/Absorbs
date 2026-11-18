"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  Bars,
  Btn,
  Card,
  Empty,
  Spinner,
  Stat,
  apiPost,
  dateTime,
  money,
  relative,
  toast,
  useApi,
} from "@/components/ui";

type Stats = {
  users: number;
  users_today: number;
  active_24h: number;
  blocked: number;
  orders: number;
  orders_today: number;
  pending: number;
  revenue: number;
  revenue_today: number;
  revenue_month: number;
  usd_volume: number;
  products: number;
  categories: number;
  conversion: number;
  series: { day: string; revenue: number; orders: number; users: number }[];
  status_breakdown: Record<string, number>;
  top_products: { name: string; orders: number; revenue: number }[];
};

type Order = {
  id: number;
  code: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  product_name: string;
  amount: string;
  status: string;
  kind: string;
  created_at: string;
  payment_method: string | null;
};

type Dash = {
  ok: boolean;
  stats: Stats;
  orders: Order[];
  logs: { id: number; level: string; action: string; details: Record<string, unknown>; created_at: string; actor: string | null }[];
  users: { tg_id: string; username: string | null; first_name: string | null; avatar_file_id: string | null; created_at: string }[];
  pending: number;
};

const STATUS: Record<string, { label: string; tone: "amber" | "emerald" | "red" | "slate" }> = {
  pending_payment: { label: "بانتظار الدفع", tone: "amber" },
  awaiting_review: { label: "قيد التحقق", tone: "amber" },
  approved: { label: "مقبول", tone: "emerald" },
  delivered: { label: "تم التسليم", tone: "emerald" },
  rejected: { label: "مرفوض", tone: "red" },
  cancelled: { label: "ملغى", tone: "slate" },
};

function levelIcon(level: string): string {
  if (level === "success") return "🟢";
  if (level === "warn") return "🟡";
  if (level === "error") return "🔴";
  return "⚪️";
}

export default function DashboardPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<Dash>("dashboard");
  const [busy, setBusy] = useState<number | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  const act = async (id: number, status: string) => {
    setBusy(id);
    try {
      await apiPost(`orders/${id}`, { status });
      toast(status === "rejected" ? "تم رفض الطلب" : "تم قبول الطلب وإعلام الزبون");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const runSetup = async () => {
    setSetupBusy(true);
    try {
      const res = await apiPost<{ ok: boolean; url: string }>("setup");
      toast(res.ok ? "تم ربط الويبهوك بنجاح ✅" : "تعذّر الربط — تحقق من التوكن", res.ok ? "ok" : "err");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSetupBusy(false);
    }
  };

  if (loading && !data) return <Spinner label="جاري تحميل لوحة القيادة…" />;
  if (error && !data)
    return (
      <Card title="تعذّر التحميل">
        <p className="text-sm text-rose-600">{error}</p>
        <div className="mt-3">
          <Btn onClick={reload}>🔄 إعادة المحاولة</Btn>
        </div>
      </Card>
    );

  const stats = data!.stats;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">لوحة القيادة</h1>
          <p className="mt-1 text-xs text-emerald-900/65">نظرة شاملة على المتجر، الطلبات والمستخدمين — تُحدَّث تلقائياً</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={reload}>
            🔄 تحديث
          </Btn>
          <Btn onClick={runSetup} disabled={setupBusy}>
            {setupBusy ? "…" : "🔗 تفعيل البوت"}
          </Btn>
        </div>
      </div>

      {stats.pending > 0 && (
        <Link
          href="/admin/orders?status=review"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 transition hover:bg-amber-500/15"
        >
          <span className="text-sm font-bold text-amber-200">
            🟡 لديك <b>{stats.pending}</b> إيصال بانتظار المراجعة — راجعها الآن لتسريع التسليم
          </span>
          <span className="text-xs text-amber-600">فتح الطلبات ←</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المستخدمين" value={stats.users.toLocaleString("en-US")} hint={`+${stats.users_today} اليوم • ${stats.active_24h} نشط`} icon="👥" />
        <Stat label="إجمالي الطلبات" value={stats.orders.toLocaleString("en-US")} hint={`${stats.orders_today} اليوم • تحويل ${stats.conversion}%`} icon="🧾" tone="sky" />
        <Stat label="المبيعات المؤكدة" value={money(stats.revenue)} hint={`اليوم ${money(stats.revenue_today)}`} icon="💰" tone="emerald" />
        <Stat label="حجم الدولار" value={`${stats.usd_volume.toLocaleString("en-US")} $`} hint={`هذا الشهر ${money(stats.revenue_month)}`} icon="💵" tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="📈 المبيعات — آخر 14 يوم" subtitle="الأعمدة تمثّل إجمالي المبيعات المؤكدة يومياً">
          {stats.series.length ? <Bars data={stats.series} /> : <Empty title="لا توجد بيانات بعد" />}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-emerald-900/[0.06] pt-3 text-center">
            <div>
              <p className="text-[0.7rem] text-emerald-900/55">مبيعات الشهر</p>
              <p className="text-sm font-black text-emerald-600">{money(stats.revenue_month)}</p>
            </div>
            <div>
              <p className="text-[0.7rem] text-emerald-900/55">قيد التحقق</p>
              <p className="text-sm font-black text-amber-600">{stats.status_breakdown.awaiting_review ?? 0}</p>
            </div>
            <div>
              <p className="text-[0.7rem] text-emerald-900/55">مرفوضة</p>
              <p className="text-sm font-black text-rose-500">{stats.status_breakdown.rejected ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card title="⭐️ الأكثر مبيعاً" subtitle="حسب عدد الطلبات المؤكدة">
          {stats.top_products.length ? (
            <ul className="space-y-2.5">
              {stats.top_products.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-xs font-black text-emerald-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-emerald-900">{p.name}</span>
                    <span className="block text-[0.65rem] text-emerald-900/55">{p.orders} طلب</span>
                  </span>
                  <span className="shrink-0 text-xs font-black text-emerald-600">{money(p.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="📦" title="لا مبيعات بعد" hint="شارك رابط البوت مع زبائنك لتبدأ أول طلب" />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="🧾 آخر الطلبات"
          subtitle="مراجعة سريعة — قبول أو رفض بضغطة واحدة"
          action={
            <Link href="/admin/orders" className="btn btn-ghost px-3 py-1.5 text-xs">
              الكل ←
            </Link>
          }
        >
          {data!.orders.length ? (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>الزبون</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data!.orders.map((o) => {
                    const st = STATUS[o.status] ?? { label: o.status, tone: "slate" as const };
                    return (
                      <tr key={o.id}>
                        <td>
                          <span className="block font-mono text-[0.72rem] text-emerald-700">{o.code}</span>
                          <span className="block max-w-[10rem] truncate text-xs text-emerald-900/85">{o.product_name}</span>
                        </td>
                        <td className="text-xs text-emerald-900/85">
                          {o.username ? `@${o.username}` : o.first_name || o.user_id}
                          <span className="block text-[0.62rem] text-emerald-900/45">{o.user_id}</span>
                        </td>
                        <td className="whitespace-nowrap text-xs font-black text-emerald-950">{money(o.amount)}</td>
                        <td>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap text-[0.68rem] text-emerald-900/55">{relative(o.created_at)}</td>
                        <td>
                          <div className="flex gap-1">
                            {o.status === "awaiting_review" && (
                              <>
                                <Btn size="sm" disabled={busy === o.id} onClick={() => act(o.id, "delivered")}>
                                  ✅
                                </Btn>
                                <Btn size="sm" variant="red" disabled={busy === o.id} onClick={() => act(o.id, "rejected")}>
                                  ❌
                                </Btn>
                              </>
                            )}
                            <Link href={`/admin/orders?focus=${o.id}`} className="btn btn-ghost px-2 py-1 text-xs">
                              👁
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="🧾" title="لا طلبات حتى الآن" hint="أول طلب سيظهر هنا مباشرة مع إشعار في تيليجرام" />
          )}
        </Card>

        <div className="space-y-4">
          <Card title="👥 آخر المنضمين" subtitle="أحدث 6 مستخدمين">
            {data!.users.length ? (
              <ul className="space-y-2">
                {data!.users.map((u) => (
                  <li key={u.tg_id} className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-emerald-900/10 bg-white/65 text-xs">
                      {u.avatar_file_id ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={`/api/avatar/${u.tg_id}`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (u.first_name?.[0] ?? "👤")
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-emerald-900">
                        {u.first_name || "بدون اسم"} {u.username ? `· @${u.username}` : ""}
                      </span>
                      <span className="block text-[0.62rem] text-emerald-900/45">{relative(u.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="👤" title="لا مستخدمين بعد" />
            )}
          </Card>

          <Card title="📜 آخر النشاطات">
            <ul className="space-y-2">
              {data!.logs.slice(0, 7).map((l) => (
                <li key={l.id} className="flex gap-2 text-[0.7rem]">
                  <span>{levelIcon(l.level)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-emerald-900/85">{l.action}</span>
                    <span className="block text-[0.6rem] text-emerald-900/45">{dateTime(l.created_at)}</span>
                  </span>
                </li>
              ))}
              {!data!.logs.length && <p className="text-xs text-emerald-900/55">لا سجلات بعد.</p>}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/admin/products", icon: "📦", t: "إدارة المنتجات", d: `${stats.products} منتج` },
          { href: "/admin/users", icon: "👥", t: "المستخدمون", d: `${stats.users} حساب` },
          { href: "/admin/ai", icon: "🧠", t: "المساعد الذكي", d: "تحكم كامل بالمتجر" },
          { href: "/admin/broadcast", icon: "📢", t: "إذاعة جماعية", d: "رسالة لكل الزبائن" },
        ].map((q) => (
          <Link key={q.href} href={q.href} className="panel panel-hover p-4">
            <p className="text-xl">{q.icon}</p>
            <p className="mt-1 text-xs font-extrabold text-emerald-950">{q.t}</p>
            <p className="text-[0.65rem] text-emerald-900/55">{q.d}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
