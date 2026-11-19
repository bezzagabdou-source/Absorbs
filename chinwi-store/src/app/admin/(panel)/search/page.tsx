"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, Card, Empty, Input, Spinner, apiGet, dateTime, money, toast } from "@/components/ui";

type Order = { id: number; code: string; product_name: string; amount: number; status: string; user_id: number; created_at: string };
type User = { tg_id: number; first_name: string | null; username: string | null; is_blocked: boolean; last_seen_at: string };
type Product = { id: number; name: string; price: number | null; category_id: number | null; active: boolean };

export default function SearchPage(): React.ReactElement {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ orders: Order[]; users: User[]; products: Product[] } | null>(null);

  const run = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const res = await apiGet<{ orders: Order[]; users: User[]; products: Product[] }>(`search?q=${encodeURIComponent(q.trim())}`);
      setData(res);
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => term.trim() && run(term), 400);
    return () => clearTimeout(t);
  }, [term]);

  const total = (data?.orders.length ?? 0) + (data?.users.length ?? 0) + (data?.products.length ?? 0);

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-emerald-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🔎 البحث الشامل</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">ابحث في الطلبات، الزبائن والمنتجات في نفس الوقت — برقم الطلب، اسم الزبون، أو اسم المنتج.</p>
        <div className="relative mt-3">
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="اكتب: CH-1042 أو أمين أو 100 جوهرة…"
            className="py-3 text-sm"
          />
        </div>
      </div>

      {busy && <Spinner label="بحث…" />}

      {data && (
        <>
          <p className="text-center text-[0.7rem] font-bold text-emerald-900/50">{total} نتيجة</p>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title={`🧾 الطلبات (${data.orders.length})`}>
              {data.orders.length === 0 ? (
                <Empty icon="🧾" title="لا نتائج" />
              ) : (
                <div className="space-y-2">
                  {data.orders.map((o) => (
                    <a key={o.id} href={`/admin/orders?q=${o.code}`} className="block rounded-2xl bg-white/70 p-3 hover:bg-white">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-emerald-950" dir="ltr">{o.code}</span>
                        <Badge tone={o.status === "delivered" ? "emerald" : o.status === "pending_payment" ? "amber" : "slate"}>{o.status}</Badge>
                      </div>
                      <p className="mt-1 truncate text-[0.72rem] font-bold text-emerald-900/70">{o.product_name}</p>
                      <p className="text-[0.65rem] text-emerald-900/45">{money(o.amount)} • {dateTime(o.created_at)}</p>
                    </a>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`👥 الزبائن (${data.users.length})`}>
              {data.users.length === 0 ? (
                <Empty icon="👥" title="لا نتائج" />
              ) : (
                <div className="space-y-2">
                  {data.users.map((u) => (
                    <a key={u.tg_id} href={`/admin/users?q=${u.tg_id}`} className="block rounded-2xl bg-white/70 p-3 hover:bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-950">{u.first_name ?? "بدون اسم"}</span>
                        {u.is_blocked && <Badge tone="red">محظور</Badge>}
                      </div>
                      <p className="text-[0.65rem] text-emerald-900/50" dir="ltr">{u.username ? `@${u.username}` : u.tg_id}</p>
                      <p className="text-[0.62rem] text-emerald-900/40">آخر ظهور {dateTime(u.last_seen_at)}</p>
                    </a>
                  ))}
                </div>
              )}
            </Card>

            <Card title={`📦 المنتجات (${data.products.length})`}>
              {data.products.length === 0 ? (
                <Empty icon="📦" title="لا نتائج" />
              ) : (
                <div className="space-y-2">
                  {data.products.map((p) => (
                    <a key={p.id} href={`/admin/products?q=${encodeURIComponent(p.name)}`} className="block rounded-2xl bg-white/70 p-3 hover:bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black text-emerald-950">{p.name}</span>
                        <span className="whitespace-nowrap text-[0.7rem] font-black text-amber-600">{p.price === null ? "تواصل" : money(p.price)}</span>
                      </div>
                      <p className="text-[0.62rem] text-emerald-900/45">{p.active ? "ظاهر" : "مخفي"} • #{p.id}</p>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {!data && !busy && (
        <div className="panel p-8 text-center">
          <p className="text-3xl">🔎</p>
          <p className="mt-2 text-sm font-black text-emerald-950">ابدأ الكتابة للبحث الفوري</p>
          <p className="mt-1 text-[0.72rem] text-emerald-900/55">النتائج تظهر تلقائياً بعد 0.4 ثانية من التوقّف عن الكتابة</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {["CH-", "أمين", "جوهرة", "تيك توك"].map((s) => (
              <Btn key={s} size="sm" variant="ghost" onClick={() => setTerm(s)}>
                {s}
              </Btn>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
