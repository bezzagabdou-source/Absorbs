"use client";

import { useState } from "react";
import { Badge, Btn, Card, CopyBtn, Spinner, toast, useApi, dateTime } from "@/components/ui";

type Setup = {
  ok: boolean;
  url: string;
  pending: number;
  lastError?: string;
  lastErrorAt?: number;
  expected: string;
  botUsername: string;
  botId: number;
  users: number;
  ownerId: number;
};

export default function SetupPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<Setup>("setup");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup", { method: "POST" }).then((r) => r.json());
      toast(res.ok ? "تم ربط الويبهوك ✅" : `فشل الربط: ${res.info ?? "تحقق من التوكن"}`, res.ok ? "ok" : "err");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  const connected = data && data.url === data.expected && data.url;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-emerald-950">الربط والتشغيل</h1>
        <p className="mt-1 text-xs text-emerald-900/65">حالة الويبهوك، بيانات البوت، وخطوات التشغيل الكاملة</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🔗 حالة الويبهوك (Webhook)">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-emerald-900/10 bg-white/55 px-3 py-2.5">
              <span className="text-xs text-emerald-900/65">الحالة</span>
              <Badge tone={connected ? "emerald" : "red"}>{connected ? "متصل ويعمل ✅" : "غير مربوط"}</Badge>
            </div>
            <div className="rounded-xl border border-emerald-900/10 bg-white/55 px-3 py-2.5">
              <p className="mb-1 text-[0.68rem] text-emerald-900/55">الرابط المسجّل حالياً</p>
              <p className="break-all font-mono text-[0.7rem] text-emerald-700" dir="ltr">
                {data?.url || "—"}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-900/10 bg-white/55 px-3 py-2.5">
              <p className="mb-1 text-[0.68rem] text-emerald-900/55">الرابط المتوقع</p>
              <p className="break-all font-mono text-[0.7rem] text-emerald-900/85" dir="ltr">
                {data?.expected}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={run} disabled={busy}>
                {busy ? "جارٍ الربط…" : "🔗 ربط / إعادة ربط البوت"}
              </Btn>
              <Btn variant="ghost" onClick={reload}>
                🔄 تحديث
              </Btn>
              {data?.expected && <CopyBtn text={data.expected} label="نسخ الرابط" />}
            </div>
            {data?.lastError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[0.7rem] text-rose-600">
                آخر خطأ: {data.lastError} {data.lastErrorAt ? `— ${dateTime(new Date(data.lastErrorAt).toISOString())}` : ""}
              </p>
            )}
            <p className="text-[0.68rem] leading-6 text-emerald-900/55">
              البوت يسجّل الويبهوك تلقائياً عند أول طلب للدالة على Vercel (also عبر cron اليومي). إذا لم يعمل، اضغط الزر أعلاه.
            </p>
          </div>
        </Card>

        <Card title="🤖 بيانات البوت">
          <ul className="space-y-2 text-xs text-emerald-900/85">
            <li className="flex items-center justify-between">
              <span>معرّف البوت</span>
              <span className="font-mono text-emerald-900/65">{data?.botId || "—"}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>اسم المستخدم</span>
              <span className="font-mono text-emerald-700" dir="ltr">
                @{data?.botUsername || "—"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>المستخدمون في قاعدة البيانات</span>
              <span className="font-bold text-emerald-950">{data?.users ?? 0}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>حساب المالك (لإشعارات الطلبات)</span>
              <span className="font-mono text-amber-600">{data?.ownerId || "غير محدد — افتح البوت من حسابك"}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>تحديثات معلّقة</span>
              <span className="text-emerald-900/65">{data?.pending ?? 0}</span>
            </li>
          </ul>
          {data?.botUsername && (
            <a href={`https://t.me/${data.botUsername}`} target="_blank" className="btn btn-green mt-4 w-full text-xs">
              🚀 فتح البوت في تيليجرام
            </a>
          )}
        </Card>

        <Card title="✅ قائمة التشغيل" className="lg:col-span-2">
          <ol className="space-y-2 text-xs leading-6 text-emerald-900/85">
            {[
              ["إضافة البوت مشرفاً في قنوات الاشتراك", "قناة 1 و2 — من صفحة «قنوات الاشتراك» اضغط اختبار"],
              ["فتح البوت من حساب المالك (/start)", "يتعرّف البوت على حسابك تلقائياً ويصلك كل إشعار طلب"],
              ["التأكد من طرق الدفع", "من صفحة «طرق الدفع» — Binance / RedotPay / Bybit / BaridiMob جاهزة"],
              ["تجربة طلب كامل", "اختر منتجاً → ادفع → أرسل إيصالاً → ستصل رسالة للمالك مع أزرار القبول/الرفض"],
              ["تفعيل الذكاء الاصطناعي", "مفاتيح Groq وGemini مربوطة — جرّبه من صفحة «الذكاء الاصطناعي»"],
            ].map(([title, hint], i) => (
              <li key={i} className="flex gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-[0.65rem] font-black text-emerald-700">
                  {i + 1}
                </span>
                <span>
                  <b className="text-emerald-950">{title}</b>
                  <span className="block text-[0.68rem] text-emerald-900/55">{hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
