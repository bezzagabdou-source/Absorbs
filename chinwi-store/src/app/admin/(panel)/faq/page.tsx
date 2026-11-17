"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Field, Input, Spinner, Textarea, toast, useApi } from "@/components/ui";
import { apiPost } from "@/components/ui";

type Item = { id: number; question: string; answer: string; sort: number; active: boolean; hits: number };

export default function FaqPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{ rows: Item[] }>("faq");
  const [form, setForm] = useState({ question: "", answer: "", sort: "50" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.question.trim() || !form.answer.trim()) return toast("املأ السؤال والجواب", "err");
    setBusy(true);
    try {
      await apiPost("faq", { ...form, sort: Number(form.sort || 50) });
      toast("تمت الإضافة ❓");
      setForm({ question: "", answer: "", sort: "50" });
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner label="تحميل الأسئلة…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-300/35 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">❓ الأسئلة الشائعة</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          تظهر للزبون في البوت بأمر <span className="font-mono" dir="ltr">/faq</span> — تقلّل أسئلة الدعم المتكررة.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card title="➕ سؤال جديد">
          <div className="space-y-3">
            <Field label="السؤال">
              <Textarea rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="كم يستغرق الشحن؟" />
            </Field>
            <Field label="الجواب">
              <Textarea rows={4} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="من 5 إلى 30 دقيقة…" />
            </Field>
            <Field label="الترتيب (الأصغر أولاً)">
              <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} />
            </Field>
            <Btn className="w-full" onClick={add} disabled={busy}>
              {busy ? "…" : "💾 إضافة"}
            </Btn>
          </div>
        </Card>

        <Card title="📚 القائمة" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
          {(data?.rows.length ?? 0) === 0 ? (
            <Empty icon="❓" title="لا أسئلة بعد" />
          ) : (
            <div className="space-y-2">
              {data?.rows.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-black text-emerald-950">{r.question}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge tone={r.active ? "emerald" : "slate"}>{r.active ? "ظاهر" : "مخفي"}</Badge>
                      <span className="text-[0.62rem] text-emerald-900/40">👁 {r.hits}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[0.78rem] leading-6 text-emerald-900/70">{r.answer}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <Btn size="sm" variant="ghost" onClick={async () => { await apiPost(`faq/${r.id}`, { active: !r.active }).catch(() => null); reload(); }}>
                      {r.active ? "إخفاء" : "إظهار"}
                    </Btn>
                    <Btn size="sm" variant="red" onClick={async () => { await apiPost(`faq/${r.id}/delete`).catch(() => null); toast("حُذف"); reload(); }}>
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
