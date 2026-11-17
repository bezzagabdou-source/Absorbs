"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Spinner, Textarea, apiPost, dateTime, toast, useApi, useConfirm } from "@/components/ui";

type Broadcast = { id: number; body: string; sent: number; failed: number; created_at: string };

export default function BroadcastPage(): React.ReactElement {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useApi<{ ok: boolean; rows: Broadcast[]; users: { count: string } }>("broadcasts");
  const { confirm, node } = useConfirm();

  const send = () => {
    if (!text.trim()) return;
    confirm(`سيتم إرسال هذه الرسالة إلى كل المستخدمين (${data?.users?.count ?? "؟"}). متابعة؟`, async () => {
      setBusy(true);
      try {
        const res = await apiPost<{ sent: number; failed: number }>("broadcast", { text });
        toast(`تم الإرسال: ${res.sent} ✅ / ${res.failed} ❌`);
        setText("");
        reload();
      } catch (err) {
        toast((err as Error).message, "err");
      } finally {
        setBusy(false);
      }
    });
  };

  const templates = [
    "🔥 <b>عرض جديد!</b>\nخصم خاص على شحن فري فاير اليوم فقط — ابدأ الآن 👇",
    "👑 <b>CHINWI STORE</b>\nشحن فوري • أسعار لا تُقاوَم • دعم 24/7\nاطلب الآن من القائمة 🛍",
    "💵 <b>نشتري الدولار منك!</b>\nسعر ممتاز — أرسل الكمية داخل البوت 💱",
  ];

  return (
    <div className="space-y-4">
      {node}
      <div>
        <h1 className="text-2xl font-black text-emerald-950">الإذاعة الجماعية</h1>
        <p className="mt-1 text-xs text-emerald-900/65">رسالة واحدة لكل مستخدمي البوت (يدعم HTML: &lt;b&gt; &lt;i&gt; &lt;code&gt; &lt;a&gt;)</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="✍️ الرسالة">
          <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك…" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Btn onClick={send} disabled={busy || !text.trim()}>
              {busy ? "جارٍ الإرسال…" : "📢 إرسال للجميع"}
            </Btn>
            <span className="text-[0.7rem] text-emerald-900/55">{text.length} حرف</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {templates.map((t, i) => (
              <Btn key={i} size="sm" variant="ghost" onClick={() => setText(t)}>
                قالب {i + 1}
              </Btn>
            ))}
          </div>
        </Card>

        <Card title="👁 معاينة" subtitle="كما ستظهر في تيليجرام (تقريباً)">
          <div className="rounded-2xl border border-emerald-900/10 bg-[#17212b] p-3">
            <div
              className="whitespace-pre-wrap rounded-xl bg-[#212d3b] px-3 py-2 text-sm leading-7 text-emerald-900"
              dangerouslySetInnerHTML={{ __html: text.replace(/</g, "&lt;").replace(/&lt;(\/?)(b|i|code|a[^&]*)&gt;/g, "<$1$2>") || "…" }}
            />
          </div>
          <p className="mt-2 text-[0.65rem] text-emerald-900/55">عدد المستلمين المتوقع: {data?.users?.count ?? "…"}</p>
        </Card>
      </div>

      <Card title="📜 سجل الإذاعات">
        {loading && !data ? (
          <Spinner />
        ) : (data?.rows ?? []).length === 0 ? (
          <Empty icon="📢" title="لا إذاعات سابقة" />
        ) : (
          <div className="space-y-2">
            {data!.rows.map((b) => (
              <div key={b.id} className="rounded-xl border border-emerald-900/10 bg-white/55 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-xs text-emerald-900/85">{b.body}</p>
                  <div className="flex shrink-0 gap-1">
                    <Badge tone="emerald">✅ {b.sent}</Badge>
                    {b.failed > 0 && <Badge tone="red">❌ {b.failed}</Badge>}
                  </div>
                </div>
                <p className="mt-1 text-[0.62rem] text-emerald-900/45">{dateTime(b.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
