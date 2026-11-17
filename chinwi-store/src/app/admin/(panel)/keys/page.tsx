"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, Card, Field, Input, Spinner, Stat, apiGet, apiPost, toast } from "@/components/ui";

type TestResult = Record<string, { ok: boolean; error?: string; ms: number }>;
type Status = {
  providers: { groq: boolean; gemini: boolean; openrouter: boolean };
  keys: { groq: string; gemini: string; openrouter: string };
  envKeys: { groq: boolean; gemini: boolean; openrouter: boolean };
};

const PROVIDERS: { id: "groq" | "gemini" | "openrouter"; name: string; icon: string; hint: string; link: string }[] = [
  { id: "groq", name: "Groq", icon: "⚡️", hint: "الأسرع — llama-3.3-70b", link: "https://console.groq.com/keys" },
  { id: "gemini", name: "Gemini", icon: "💎", hint: "يفهم الصور — gemini-2.5-flash", link: "https://aistudio.google.com/apikey" },
  { id: "openrouter", name: "OpenRouter", icon: "🌐", hint: "احتياط — نماذج متعددة", link: "https://openrouter.ai/keys" },
];

export default function KeysPage(): React.ReactElement {
  const [status, setStatus] = useState<Status | null>(null);
  const [tests, setTests] = useState<TestResult | null>(null);
  const [form, setForm] = useState({ groq: "", gemini: "", openrouter: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await apiGet<Status & { ok: boolean }>("ai/status").catch(() => null);
    if (res) setStatus(res);
  };

  useEffect(() => {
    load();
    apiGet<{ results: TestResult }>("ai/test")
      .then((r) => setTests(r.results))
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiPost<{ results: TestResult }>("ai/keys", form);
      setTests(res.results);
      const ok = Object.values(res.results ?? {}).filter((r) => r.ok).length;
      toast(ok ? `تم الحفظ — ${ok} مزوّد يعمل ✅` : "تم الحفظ لكن المفاتيح لا تعمل ❌", ok ? "ok" : "err");
      setForm({ groq: "", gemini: "", openrouter: "" });
      load();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await apiGet<{ results: TestResult }>("ai/test");
      setTests(res.results);
      const ok = Object.values(res.results).filter((r) => r.ok).length;
      toast(`${ok} مزوّد يعمل من 3`);
    } finally {
      setBusy(false);
    }
  };

  const okCount = tests ? Object.values(tests).filter((r) => r.ok).length : 0;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-16 -top-24 h-56 w-56 rounded-full bg-violet-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🔑 مفاتيح الذكاء الاصطناعي</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          الصق مفاتيحك هنا ليشتغل «وحش AI» بالكامل. الكود يجرّب المزوّدين بالتوازي ويأخذ الأسرع، وإن فشلوا جميعاً يعمل العقل المحلي ولا يرفض أي طلب.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map((p) => {
          const r = tests?.[p.id];
          const on = Boolean(status?.providers[p.id]);
          return (
            <div key={p.id} className="panel panel-hover p-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{p.icon}</span>
                <Badge tone={r?.ok ? "emerald" : on ? "amber" : "red"}>{r?.ok ? "يعمل" : on ? "مفتاح موجود" : "ناقص"}</Badge>
              </div>
              <p className="mt-2 text-sm font-black text-emerald-950">{p.name}</p>
              <p className="text-[0.66rem] text-emerald-900/50">{p.hint}</p>
              <p className="mt-1 text-[0.62rem] text-emerald-900/45">{r ? (r.ok ? `${r.ms} ms ✅` : r.error?.slice(0, 60)) : "لم يُفحص"}</p>
              <a href={p.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[0.68rem] font-bold text-emerald-700 underline">
                احصل على مفتاح ↗
              </a>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card title="➕ إضافة / تحديث المفاتيح" subtitle="تُخزَّن في قاعدة البيانات وتتقدّم على متغيرات البيئة">
          <div className="space-y-3">
            {PROVIDERS.map((p) => (
              <Field key={p.id} label={`مفتاح ${p.name} ${status?.keys[p.id] ? `— الحالي ${status.keys[p.id]}` : ""}`}>
                <Input
                  dir="ltr"
                  type="password"
                  value={form[p.id]}
                  onChange={(e) => setForm({ ...form, [p.id]: e.target.value })}
                  placeholder={p.id === "groq" ? "gsk_..." : p.id === "gemini" ? "AIza..." : "sk-or-v1-..."}
                />
              </Field>
            ))}
            <div className="flex gap-2">
              <Btn onClick={save} disabled={busy || !Object.values(form).some(Boolean)}>
                {busy ? "…" : "💾 حفظ واختبار"}
              </Btn>
              <Btn variant="ghost" onClick={test} disabled={busy}>
                🧪 فحص المزوّدين
              </Btn>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="📊 الحالة">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="مزوّدون يعملون" value={`${okCount} / 3`} icon="✅" tone={okCount ? "emerald" : "red"} />
              <Stat label="عقل محلي" value="يعمل دائماً" icon="🧠" tone="violet" />
            </div>
            <ul className="mt-3 space-y-1.5 text-[0.72rem] font-bold leading-6 text-emerald-900/65">
              <li>⚡️ المزوّدون يُجرَّبون بالتوازي — أول رد يفوز (أسرع).</li>
              <li>🛟 لو فشلوا كلهم: العقل المحلي ينفّذ الأوامر بدون إنترنت.</li>
              <li>🖼 الصور تُقرأ بـ Gemini (يحتاج مفتاح Gemini صالح).</li>
              <li>🔒 المفاتيح لا تظهر كاملة في الواجهة أبداً.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
