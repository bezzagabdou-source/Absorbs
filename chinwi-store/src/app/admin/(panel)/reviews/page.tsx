"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Field, Input, Spinner, Stat, Textarea, toast, useApi } from "@/components/ui";
import { apiPost } from "@/components/ui";

type Review = {
  id: number;
  name: string | null;
  rating: number;
  body: string | null;
  product_name: string | null;
  approved: boolean;
  created_at: string;
  user_id: number | null;
};

export default function ReviewsPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{ rows: Review[]; stats: { count: number; avg: number } }>("reviews");
  const [form, setForm] = useState({ name: "", rating: "5", body: "", product_name: "" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.body.trim()) return toast("اكتب نص التقييم", "err");
    setBusy(true);
    try {
      await apiPost("reviews", { ...form, rating: Number(form.rating) });
      toast("تمت إضافة التقييم ⭐️");
      setForm({ name: "", rating: "5", body: "", product_name: "" });
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner label="تحميل التقييمات…" />;

  const avg = data?.stats.avg ?? 0;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-16 -top-24 h-56 w-56 rounded-full bg-amber-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">⭐️ تقييمات الزبائن</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          التقييمات المعتمدة تظهر في البوت بأمر <span className="font-mono" dir="ltr">/reviews</span> لبناء ثقة الزبائن.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="تقييمات معتمدة" value={data?.stats.count ?? 0} icon="✅" />
        <Stat label="المعدّل" value={`${avg.toFixed(1)} / 5`} icon="🌟" tone="amber" />
        <Stat label="بانتظار الموافقة" value={data?.rows.filter((r) => !r.approved).length ?? 0} icon="⏳" tone="sky" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card title="➕ إضافة تقييم">
          <div className="space-y-3">
            <Field label="اسم الزبون">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="أمين" />
            </Field>
            <Field label="المنتج">
              <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="100 جوهرة فري فاير" />
            </Field>
            <Field label="النجوم">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, rating: String(n) })}
                    className={`text-2xl transition ${Number(form.rating) >= n ? "opacity-100" : "opacity-25"}`}
                    type="button"
                  >
                    ⭐️
                  </button>
                ))}
              </div>
            </Field>
            <Field label="نص التقييم">
              <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            <Btn className="w-full" onClick={add} disabled={busy}>
              {busy ? "…" : "💾 حفظ"}
            </Btn>
          </div>
        </Card>

        <Card title="📋 كل التقييمات" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
          {(data?.rows.length ?? 0) === 0 ? (
            <Empty icon="⭐️" title="لا تقييمات" hint="أضف أول تقييم أو انتظر تقييمات البوت" />
          ) : (
            <div className="space-y-2">
              {data?.rows.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-emerald-950">
                      {r.name ?? "زبون"} <span className="text-[0.68rem] font-bold text-emerald-900/45">— {r.product_name ?? "عام"}</span>
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs">{"⭐️".repeat(Math.max(1, Math.min(5, r.rating)))}</span>
                      <Badge tone={r.approved ? "emerald" : "amber"}>{r.approved ? "معتمد" : "معلّق"}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-[0.78rem] leading-6 text-emerald-900/70">{r.body}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <Btn size="sm" variant="ghost" onClick={async () => { await apiPost(`reviews/${r.id}`, { approved: !r.approved }).catch(() => null); reload(); }}>
                      {r.approved ? "إلغاء الاعتماد" : "اعتماد"}
                    </Btn>
                    <Btn size="sm" variant="red" onClick={async () => { await apiPost(`reviews/${r.id}/delete`).catch(() => null); toast("حُذف"); reload(); }}>
                      حذف
                    </Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
