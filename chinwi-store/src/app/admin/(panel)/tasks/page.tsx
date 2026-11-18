"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Field, Input, Spinner, Stat, Textarea, apiPost, toast, useApi } from "@/components/ui";

type Task = { id: number; title: string; note: string | null; done: boolean; priority: number; due_at: string | null; created_at: string };

const PRIORITY: Record<number, { tone: "red" | "amber" | "slate"; label: string }> = {
  1: { tone: "red", label: "عاجلة" },
  2: { tone: "amber", label: "عادية" },
  3: { tone: "slate", label: "لاحقاً" },
};

export default function TasksPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{ rows: Task[] }>("tasks");
  const [form, setForm] = useState({ title: "", note: "", priority: "2", due_at: "" });
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!form.title.trim()) return toast("اكتب عنوان المهمة", "err");
    setBusy(true);
    try {
      await apiPost("tasks", { ...form, priority: Number(form.priority) });
      toast("أُضيفت المهمة 🗒");
      setForm({ title: "", note: "", priority: "2", due_at: "" });
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner label="تحميل المهام…" />;
  const rows = data?.rows ?? [];
  const open = rows.filter((t) => !t.done);

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-emerald-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🗒 مهام المالك</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">قائمة عملك اليومية: تحديث الأسعار، متابعة الإيصالات، الردود المعلّقة.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="مهام مفتوحة" value={open.length} icon="📌" />
        <Stat label="عاجلة" value={open.filter((t) => t.priority === 1).length} icon="🔥" tone="red" />
        <Stat label="منجزة" value={rows.filter((t) => t.done).length} icon="✅" tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card title="➕ مهمة جديدة">
          <div className="space-y-3">
            <Field label="العنوان">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="تحديث أسعار فري فاير" />
            </Field>
            <Field label="تفاصيل">
              <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="الأولوية">
                <select className="field" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="1">عاجلة</option>
                  <option value="2">عادية</option>
                  <option value="3">لاحقاً</option>
                </select>
              </Field>
              <Field label="موعد">
                <Input type="date" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
              </Field>
            </div>
            <Btn className="w-full" onClick={add} disabled={busy}>
              {busy ? "…" : "💾 إضافة"}
            </Btn>
          </div>
        </Card>

        <Card title="📋 المهام" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
          {rows.length === 0 ? (
            <Empty icon="🗒" title="لا مهام" hint="أضف أول مهمة" />
          ) : (
            <div className="space-y-2">
              {rows.map((t) => {
                const p = PRIORITY[t.priority] ?? PRIORITY[2];
                return (
                  <div key={t.id} className={`rounded-2xl p-3 ${t.done ? "bg-white/40" : "bg-white/75"}`}>
                    <div className="flex items-start gap-2">
                      <button
                        onClick={async () => { await apiPost(`tasks/${t.id}/toggle`).catch(() => null); reload(); }}
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-900/20 bg-white"}`}
                        type="button"
                      >
                        {t.done ? "✓" : ""}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-black ${t.done ? "text-emerald-900/40 line-through" : "text-emerald-950"}`}>{t.title}</p>
                        {t.note && <p className="mt-0.5 text-[0.75rem] leading-5 text-emerald-900/60">{t.note}</p>}
                        <div className="mt-1 flex items-center gap-2">
                          <Badge tone={p.tone}>{p.label}</Badge>
                          {t.due_at && <span className="text-[0.62rem] text-emerald-900/45">📅 {new Date(t.due_at).toLocaleDateString("ar-DZ")}</span>}
                        </div>
                      </div>
                      <Btn size="sm" variant="ghost" onClick={async () => { await apiPost(`tasks/${t.id}/delete`).catch(() => null); toast("حُذفت"); reload(); }}>
                        ✕
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
