"use client";

import { useEffect, useState } from "react";
import { Badge, Btn, Card, Empty, Field, Input, Spinner, Stat, Textarea, Toggle, apiPost, dateTime, toast, useApi } from "@/components/ui";

type Channel = { id: number; chat: string; title: string | null; url: string | null; active: boolean; sort: number };
type GateData = {
  channels: Channel[];
  settings: { require_subscription?: boolean; gate_bypass?: string; maintenance?: boolean; maintenance_text?: string };
};

export default function GatePage(): React.ReactElement {
  const { data, reload, loading } = useApi<GateData>("gate");
  const [bypass, setBypass] = useState("");
  const [required, setRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setBypass(String(data.settings.gate_bypass ?? ""));
    setRequired(Boolean(data.settings.require_subscription));
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await apiPost("security/save", { gate_bypass: bypass, require_subscription: required });
      toast("تم تحديث بوابة الاشتراك 🔒");
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner label="تحميل البوابة…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-sky-400/25 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🔒 بوابة الاشتراك الإجباري</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          يتحقق البوت من اشتراك كل زائر في القنوات التالية عبر <span dir="ltr">getChatMember</span> قبل فتح المتجر.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="قنوات مفعّلة" value={data?.channels.filter((c) => c.active).length ?? 0} icon="📣" />
        <Stat label="الاشتراك الإجباري" value={required ? "مفعّل" : "متوقف"} icon="🔐" tone={required ? "emerald" : "amber"} />
        <Stat label="حسابات معفاة" value={bypass.split(/[,\s]+/).filter(Boolean).length} icon="🎫" tone="violet" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card title="📣 قنوات التحقق" subtitle="أضف البوت مشرفاً في كل قناة ليعمل التحقق تلقائياً" action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}>
          {(data?.channels.length ?? 0) === 0 ? (
            <Empty icon="📣" title="لا قنوات" hint="أضف قناة من صفحة «قنوات الاشتراك»" />
          ) : (
            <div className="space-y-2">
              {data?.channels.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-emerald-950">{c.title || c.chat}</p>
                    <p className="truncate text-[0.68rem] text-emerald-900/50" dir="ltr">
                      {c.chat}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={c.active ? "emerald" : "slate"}>{c.active ? "مفعّلة" : "موقوفة"}</Badge>
                    <a href={c.url || `https://t.me/${c.chat.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="icon-btn h-8 w-8 text-xs">
                      ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="🎫 إعفاءات" subtitle="حسابات تدخل بلا بوابة (المالك، شركاء…)">
            <Toggle checked={required} onChange={setRequired} label="تفعيل الاشتراك الإجباري" />
            <div className="mt-3">
              <Field label="حسابات معفاة — يوزرات أو آي دي، مفصولة بفاصلة">
                <Textarea rows={3} dir="ltr" value={bypass} onChange={(e) => setBypass(e.target.value)} placeholder="@A_B_B_X_N, 123456789" />
              </Field>
            </div>
            <Btn className="mt-3 w-full" onClick={save} disabled={busy}>
              {busy ? "…" : "💾 حفظ"}
            </Btn>
          </Card>

          <Card title="👁 المعاينة" subtitle="هكذا تظهر البوابة للزائر">
            <div className="rounded-2xl bg-white/80 p-3 text-[0.78rem] font-bold leading-6 text-emerald-950">
              🔒 <b>الاشتراك إجباري — خطوة واحدة فقط</b>
              <div className="my-2 h-px bg-emerald-900/10" />
              🎁 باش تستفيد من <b>كل</b> خدمات المتجر، اشترك في القنوات التالية 👇
              <div className="my-1 text-emerald-900/60">📣 {data?.channels[0]?.title ?? "@ft_H_N_O"} — لم تشترك بعد</div>
              <div className="my-1 text-emerald-900/60">📣 {data?.channels[1]?.title ?? "@CHNawaa"} — لم تشترك بعد</div>
              <div className="my-2 h-px bg-emerald-900/10" />
              ⚡️ الاشتراك يمنحك: أسعار خاصة وعروضاً حصرية ودعماً أسرع.
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="btn btn-green w-full">📣 اشترك في القناة</div>
              <div className="btn btn-green w-full">🔄 تحقق من الاشتراك</div>
              <div className="btn btn-red w-full">📞 الدعم</div>
            </div>
            <p className="mt-2 text-[0.65rem] text-emerald-900/45">آخر مزامنة: {dateTime(new Date())}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
