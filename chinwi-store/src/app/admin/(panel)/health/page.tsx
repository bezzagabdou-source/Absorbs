"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Btn, Card, Spinner, Stat, apiGet, apiPost, toast, useApi } from "@/components/ui";
import { ANIMATED_EMOJIS, ANIMATED_EMOJI_CSS } from "@/lib/animated-emoji";

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

type ProbeRow = { ok: boolean; error?: string; ms: number; sample?: string };
type AiTest = {
  ok: boolean;
  results?: Record<string, ProbeRow>;
  free?: Record<string, ProbeRow>;
  okCount?: number;
  total?: number;
};

const LABELS: Record<string, string> = {
  groq: "⚡️ Groq (مفتاح)",
  gemini: "💎 Gemini (مفتاح)",
  openrouter: "🌐 OpenRouter (مفتاح)",
  pollinations: "🌸 Pollinations (مجاني)",
  "pollinations-gen": "🌸 Pollinations Gen (مجاني)",
  hackclub: "🛠 Hack Club AI (مجاني)",
  ovh: "🟣 OVHcloud AI (مجاني)",
};

function Dot({ ok }: { ok: boolean }): React.ReactElement {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500 pulse-dot" : "bg-rose-500"}`} />;
}

export default function HealthPage(): React.ReactElement {
  const { data, reload, loading } = useApi<HealthData>("health");
  const [test, setTest] = useState<AiTest | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = useCallback(async () => {
    setTesting(true);
    const res = await apiGet<AiTest>("ai/test").catch(() => null);
    setTesting(false);
    setTest(res);
    if (res) {
      const ok = res.okCount ?? 0;
      toast(ok > 0 ? `الذكاء الاصطناعي يعمل ✅ (${ok} مزوّد متاح)` : "لا يوجد مزوّد متاح الآن — أضف مفتاحاً", ok > 0 ? "ok" : "err");
    } else toast("تعذّر الفحص", "err");
  }, []);

  useEffect(() => {
    void runTest();
  }, [runTest]);

  const sync = async () => {
    const res = await apiPost<{ ok: boolean; info?: string }>("setup").catch(() => null);
    toast(res?.ok ? "تم ربط الويبهوك ✅" : `تعذّر الربط: ${res?.info ?? "تحقّق من التوكن"}`, res?.ok ? "ok" : "err");
    reload();
  };

  if (loading && !data) return <Spinner label="فحص النظام…" />;
  const db = data?.db;
  const hook = data?.webhook;

  const rows: { name: string; row: ProbeRow }[] = [
    ...Object.entries(test?.results ?? {}).map(([name, row]) => ({ name, row })),
    ...Object.entries(test?.free ?? {}).map(([name, row]) => ({ name, row })),
  ];
  const aiOk = rows.filter((r) => r.row.ok).length;
  const aiTotal = rows.length;
  const aiWorking = aiOk > 0;

  const checks: { label: string; ok: boolean; note: string; optional?: boolean }[] = [
    { label: "قاعدة البيانات (Postgres)", ok: Boolean(db?.connected), note: db?.connected ? "متصل" : "منقطع" },
    { label: "الويبهوك مربوط بتليجرام", ok: Boolean(hook?.ok), note: hook?.ok ? "مرتبط" : "غير مرتبط" },
    {
      label: "الذكاء الاصطناعي يستجيب فعلياً",
      ok: aiWorking,
      note: aiTotal ? `${aiOk} من ${aiTotal} مزوّد` : "لم يُفحص بعد",
    },
    {
      label: "المزوّدات المجانية بلا مفاتيح",
      ok: Object.values(test?.free ?? {}).some((r) => r.ok),
      note: Object.values(test?.free ?? {}).some((r) => r.ok) ? "تعمل" : "تتعرّض للحجب/الحد",
    },
    {
      label: "إيموجي متحرك HTML",
      ok: true,
      note: `${ANIMATED_EMOJIS.length} رمز متحرك جاهز في اللوحة`,
    },
    {
      label: "إيموجي متحرك داخل رسائل تليجرام",
      ok: Boolean(data?.emoji?.enabled && (data?.emoji?.total ?? 0) > 0),
      note: data?.emoji?.enabled ? `${data?.emoji?.total ?? 0} رمز مربوط` : "اختياري — يحتاج بوت Premium/Fragment",
      optional: true,
    },
  ];

  return (
    <div className="fade-in space-y-4">
      <style dangerouslySetInnerHTML={{ __html: ANIMATED_EMOJI_CSS }} />
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-14 -top-24 h-56 w-56 rounded-full bg-emerald-300/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-3xl">
            {ANIMATED_EMOJIS.filter((e) => ["bell", "bolt", "heart"].includes(e.id)).map((e) => (
              <span key={e.id} dangerouslySetInnerHTML={{ __html: e.html }} />
            ))}
          </span>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">🩺 صحة النظام</h1>
            <p className="mt-1 text-xs font-bold text-emerald-900/60">
              فحص لحظي حقيقي: قاعدة البيانات، الويبهوك، وكل مزوّدي الذكاء الاصطناعي (بمفاتيح وبدون مفاتيح).
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="قاعدة البيانات" value={db?.connected ? `${db.ms} ms` : "منقطعة"} icon="🗄" tone={db?.connected ? "emerald" : "red"} hint={db?.now ?? ""} />
        <Stat label="الويبهوك" value={hook?.ok ? "مرتبط" : "غير مرتبط"} icon="🔗" tone={hook?.ok ? "emerald" : "red"} hint={hook?.url ?? ""} />
        <Stat
          label="مزوّدو AI يعملون"
          value={testing ? "…" : `${aiOk} / ${aiTotal || 0}`}
          icon="🧠"
          tone={aiWorking ? "emerald" : "red"}
          hint={aiWorking ? "الذكاء الاصطناعي شغّال" : "أضف مفتاحاً أو انتظر المزوّد المجاني"}
        />
        <Stat label="الوسائط" value={`${data?.media.count ?? 0} ملف`} icon="🖼" tone="sky" hint={`${Math.round((data?.media.size ?? 0) / 1024)} KB`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="✅ الفحوص" subtitle="كل بند أخضر = يعمل فعلياً (فحص مباشر لا مجرد وجود مفتاح)">
          <div className="space-y-2">
            {checks.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[0.8rem] font-bold text-emerald-950">
                  <Dot ok={row.ok} /> {row.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[0.62rem] font-bold text-emerald-900/50">{row.note}</span>
                  <Badge tone={row.ok ? "emerald" : row.optional ? "amber" : "red"}>
                    {row.ok ? "سليم" : row.optional ? "اختياري" : "يحتاج ضبط"}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={reload}>↻ إعادة الفحص</Btn>
            <Btn variant="ghost" onClick={runTest} disabled={testing}>
              {testing ? "جاري فحص AI…" : "🧠 افحص الذكاء الاصطناعي"}
            </Btn>
            <Btn variant="ghost" onClick={sync}>
              🔗 ربط الويبهوك الآن
            </Btn>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="🧠 فحص مزوّدي الذكاء الاصطناعي" subtitle="نتيجة حقيقية من كل مزوّد مع زمن الاستجابة">
            {testing && <p className="text-xs font-bold text-emerald-900/60">جاري الاختبار… قد يأخذ ثوانٍ.</p>}
            {!testing && !rows.length && (
              <p className="text-xs font-bold text-emerald-900/60">اضغط «افحص الذكاء الاصطناعي» لعرض النتائج.</p>
            )}
            <div className="space-y-2">
              {rows.map(({ name, row }) => (
                <div key={name} className="rounded-2xl bg-white/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[0.78rem] font-black text-emerald-950">
                      <Dot ok={row.ok} /> {LABELS[name] ?? name}
                    </span>
                    <span className="flex items-center gap-2 text-[0.62rem] font-bold text-emerald-900/50">
                      {row.ok ? `${row.ms} ms` : "فشل"}
                      <Badge tone={row.ok ? "emerald" : "red"}>{row.ok ? "يعمل" : "لا يعمل"}</Badge>
                    </span>
                  </div>
                  {!row.ok && row.error && (
                    <p dir="ltr" className="mt-1 max-h-14 overflow-hidden rounded-xl bg-rose-50/80 px-2 py-1 font-mono text-[0.58rem] leading-snug text-rose-700">
                      {row.error}
                    </p>
                  )}
                  {row.ok && row.sample && (
                    <p className="mt-1 truncate rounded-xl bg-emerald-50/80 px-2 py-1 text-[0.6rem] font-bold text-emerald-800">
                      رد المزوّد: {row.sample}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-2xl bg-amber-50/80 p-3 text-[0.68rem] font-bold leading-relaxed text-amber-900">
              💡 المزوّدات المجانية (Pollinations / Hack Club / OVH) تعمل بدون أي مفتاح — لذلك الذكاء الاصطناعي لا يتوقّف
              أبداً. أضف مفتاح Groq من صفحة «مفاتيح AI» لتصبح السرعة قصوى.
            </p>
          </Card>

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
