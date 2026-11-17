"use client";

import { Badge, Btn, Card, Spinner, Stat, apiPost, toast, useApi } from "@/components/ui";

type HealthData = {
  site: string;
  db: { connected: boolean; now: string | null; ms: number };
  counts: { users: string; products: string; orders: string; events: string };
  webhook: { url?: string; ok?: boolean; pending?: number; last_error?: string | null } | null;
  ai: { groq: boolean; gemini: boolean; openrouter: boolean };
  emoji: { total?: number; enabled?: boolean; map?: number } | null;
  media: { count: number; size: number };
  runtime: { node: string; uptime: number };
};

function Dot({ ok }: { ok: boolean }): React.ReactElement {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500 pulse-dot" : "bg-rose-500"}`} />;
}

export default function HealthPage(): React.ReactElement {
  const { data, reload, loading } = useApi<HealthData>("health");

  const sync = async () => {
    const res = await apiPost<{ ok: boolean; info?: string }>("setup").catch(() => null);
    toast(res?.ok ? "تم ربط الويبهوك ✅" : `تعذّر الربط: ${res?.info ?? "تحقّق من التوكن"}`, res?.ok ? "ok" : "err");
    reload();
  };

  if (loading && !data) return <Spinner label="فحص النظام…" />;
  const db = data?.db;
  const hook = data?.webhook;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-14 -top-24 h-56 w-56 rounded-full bg-emerald-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🩺 صحة النظام</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">فحص لحظي لكل ما يحتاجه البوت: قاعدة البيانات، الويبهوك، مزوّدو الذكاء الاصطناعي، التخزين.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="قاعدة البيانات" value={db?.connected ? `${db.ms} ms` : "منقطعة"} icon="🗄" tone={db?.connected ? "emerald" : "red"} hint={db?.now ?? ""} />
        <Stat label="الويبهوك" value={hook?.ok ? "مرتبط" : "غير مرتبط"} icon="🔗" tone={hook?.ok ? "emerald" : "red"} hint={hook?.url ?? ""} />
        <Stat label="مزوّدو AI" value={`${Object.values(data?.ai ?? {}).filter(Boolean).length} / 3`} icon="🧠" tone="violet" />
        <Stat label="الوسائط" value={`${data?.media.count ?? 0} ملف`} icon="🖼" tone="sky" hint={`${Math.round((data?.media.size ?? 0) / 1024)} KB`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="✅ الفحوص" subtitle="كل بند أخضر = يعمل">
          <div className="space-y-2">
            {[
              { label: "قاعدة البيانات (Postgres)", ok: Boolean(db?.connected) },
              { label: "الويبهوك مربوط بتليجرام", ok: Boolean(hook?.ok) },
              { label: "Groq (النموذج السريع)", ok: Boolean(data?.ai.groq) },
              { label: "Gemini ( فهم الصور)", ok: Boolean(data?.ai.gemini) },
              { label: "OpenRouter (احتياط)", ok: Boolean(data?.ai.openrouter) },
              { label: "الإيموجي المتحرك", ok: Boolean(data?.emoji?.enabled && (data?.emoji?.total ?? 0) > 0) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[0.8rem] font-bold text-emerald-950">
                  <Dot ok={row.ok} /> {row.label}
                </span>
                <Badge tone={row.ok ? "emerald" : "red"}>{row.ok ? "سليم" : "يحتاج ضبط"}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Btn onClick={reload}>↻ إعادة الفحص</Btn>
            <Btn variant="ghost" onClick={sync}>
              🔗 ربط الويبهوك الآن
            </Btn>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="📦 الأعداد">
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "المستخدمون", v: data?.counts.users },
                { k: "المنتجات", v: data?.counts.products },
                { k: "الطلبات", v: data?.counts.orders },
                { k: "أحداث أمنية", v: data?.counts.events },
              ].map((row) => (
                <div key={row.k} className="rounded-2xl bg-white/70 px-3 py-3 text-center">
                  <p className="text-xl font-black text-emerald-950">{row.v ?? "—"}</p>
                  <p className="text-[0.65rem] font-bold text-emerald-900/55">{row.k}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="🖥 بيئة التشغيل">
            <div className="space-y-1.5 text-[0.75rem] font-bold text-emerald-900/70">
              <p className="flex justify-between">
                <span>الرابط</span>
                <a href={data?.site} className="font-mono text-emerald-700 underline" dir="ltr">
                  {data?.site}
                </a>
              </p>
              <p className="flex justify-between">
                <span>Node</span>
                <span className="font-mono" dir="ltr">
                  {data?.runtime.node}
                </span>
              </p>
              <p className="flex justify-between">
                <span>مدة التشغيل</span>
                <span className="font-mono" dir="ltr">
                  {data?.runtime.uptime}s
                </span>
              </p>
              <p className="flex justify-between">
                <span>آخر خطأ ويبهوك</span>
                <span className="max-w-[55%] truncate text-rose-600">{hook?.last_error || "لا يوجد"}</span>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
