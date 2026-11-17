"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Field, Input, Select, Spinner, Stat, Textarea, apiPost, dateTime, toast, useApi } from "@/components/ui";

type Coupon = {
  id: number;
  code: string;
  kind: "percent" | "fixed";
  amount: number;
  min_amount: number;
  max_uses: number;
  uses: number;
  active: boolean;
  note: string | null;
  expires_at: string | null;
  created_at: string;
};

export default function CouponsPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{ rows: Coupon[]; stats: { count: number; uses: number } }>("coupons");
  const [form, setForm] = useState({ code: "", kind: "percent", amount: "", min_amount: "", max_uses: "", note: "", expires_at: "" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.code.trim()) return toast("اكتب الكود", "err");
    setBusy(true);
    try {
      await apiPost("coupons", {
        ...form,
        amount: Number(form.amount || 0),
        min_amount: Number(form.min_amount || 0),
        max_uses: Number(form.max_uses || 0),
      });
      toast("تم حفظ الكود 🎟");
      setForm({ code: "", kind: "percent", amount: "", min_amount: "", max_uses: "", note: "", expires_at: "" });
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Coupon) => {
    await apiPost(`coupons/${c.id}`, { active: !c.active }).catch(() => null);
    reload();
  };
  const remove = async (c: Coupon) => {
    await apiPost(`coupons/${c.id}/delete`).catch(() => null);
    toast("تم الحذف");
    reload();
  };
  const reset = async (c: Coupon) => {
    await apiPost(`coupons/${c.id}/reset`).catch(() => null);
    toast("تم تصفير الاستخدامات");
    reload();
  };

  if (loading && !data) return <Spinner label="تحميل الأكواد…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-14 -top-16 h-48 w-48 rounded-full bg-amber-300/35 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🎟 أكواد الخصم</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          أنشئ أكواداً بنسبة أو بمبلغ ثابت — يستعملها الزبون بأمر <span dir="ltr" className="font-mono">/coupon CODE</span> في البوت.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="عدد الأكواد" value={data?.stats.count ?? 0} icon="🎟" />
        <Stat label="مرات الاستخدام" value={data?.stats.uses ?? 0} icon="📈" tone="sky" />
        <Stat label="أكواد نشطة" value={data?.rows.filter((c) => c.active).length ?? 0} icon="✅" tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card title="➕ كود جديد">
          <div className="space-y-3">
            <Field label="الكود">
              <Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CHINWI10" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="النوع">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="percent">نسبة %</option>
                  <option value="fixed">مبلغ ثابت</option>
                </Select>
              </Field>
              <Field label="القيمة">
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="10" />
              </Field>
              <Field label="أدنى مبلغ للطلب">
                <Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} placeholder="0" />
              </Field>
              <Field label="أقصى استخدامات (0 = بلا حد)">
                <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <Field label="تاريخ الانتهاء (اختياري)">
              <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </Field>
            <Field label="ملاحظة">
              <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="عرض الافتتاح" />
            </Field>
            <Btn className="w-full" onClick={create} disabled={busy}>
              {busy ? "…" : "💾 حفظ الكود"}
            </Btn>
          </div>
        </Card>

        <Card title="📋 كل الأكواد" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
          {(data?.rows.length ?? 0) === 0 ? (
            <Empty icon="🎟" title="لا أكواد بعد" hint="أنشئ أول كود خصم من اليسار" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>القيمة</th>
                    <th>الاستخدام</th>
                    <th>الحالة</th>
                    <th>أُنشئ</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono text-xs font-black" dir="ltr">
                        {c.code}
                      </td>
                      <td className="whitespace-nowrap text-xs font-bold">
                        {c.kind === "percent" ? `${c.amount}%` : `${c.amount} دج`}
                        {c.min_amount > 0 && <span className="text-[0.6rem] text-emerald-900/45"> (أدنى {c.min_amount})</span>}
                      </td>
                      <td className="text-xs">
                        {c.uses}
                        {c.max_uses > 0 ? ` / ${c.max_uses}` : ""}
                      </td>
                      <td>
                        <Badge tone={c.active ? "emerald" : "slate"}>{c.active ? "نشط" : "موقوف"}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-[0.65rem] text-emerald-900/50">{dateTime(c.created_at)}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Btn size="sm" variant="ghost" onClick={() => toggle(c)}>
                            {c.active ? "إيقاف" : "تشغيل"}
                          </Btn>
                          <Btn size="sm" variant="ghost" onClick={() => reset(c)}>
                            تصفير
                          </Btn>
                          <Btn size="sm" variant="red" onClick={() => remove(c)}>
                            حذف
                          </Btn>
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
    </div>
  );
}
