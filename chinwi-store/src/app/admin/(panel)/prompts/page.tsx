"use client";

import { useState } from "react";
import { Badge, Btn, Card, Field, Textarea, apiPost, toast } from "@/components/ui";

type Prompt = { id: string; group: string; icon: string; title: string; body: string };

const PROMPTS: Prompt[] = [
  { id: "report", group: "تحليل", icon: "📊", title: "تقرير مبيعات شامل", body: "حلّل مبيعاتي: أفضل 5 منتجات، أسوأ 3 منتجات، متوسط قيمة الطلب، وأنشط الساعات. أعطني 3 قرارات عملية بالأرقام." },
  { id: "pricing", group: "تحليل", icon: "💸", title: "مراجعة الأسعار", body: "راجع أسعار كل الأقسام وقارنها بالمنافسين في الجزائر، واقترح تعديلات دقيقة (بالدينار) لأكثر المنتجات ربحية." },
  { id: "churn", group: "تحليل", icon: "👥", title: "زبائن معرّضون للفقدان", body: "من هم الزبائن الذين اشتروا سابقاً ولم يرجعوا منذ 14 يوماً؟ واقترح رسالة استرجاع لكل واحد." },
  { id: "security", group: "حماية", icon: "🛡", title: "تقرير أمني", body: "افحص الأحداث الأمنية والإيصالات المشبوهة والحسابات المكررة، واقترح إجراءات فورية." },
  { id: "fake", group: "حماية", icon: "🕵️", title: "كشف إيصال مزيف", body: "أرسل لك صورة إيصال — قل لي إن كان حقيقياً أم معدّلاً، مع الأدلة من الصورة." },
  { id: "broadcast", group: "تسويق", icon: "📢", title: "إذاعة نهاية الأسبوع", body: "اكتب رسالة إذاعية قصيرة بنكهة جزائرية لعروض نهاية الأسبوع، مع إيموجي وأزرار مقترحة." },
  { id: "offers", group: "تسويق", icon: "🔥", title: "5 عروض جديدة", body: "اقترح 5 عروض (حزمة منتجات + سعر) ترفع متوسط الطلب، وقدر الربح لكل عرض." },
  { id: "name", group: "محتوى", icon: "✍️", title: "أسماء منتجات جذابة", body: "أعد صياغة أسماء كل منتجات قسم فري فاير بأسلوب يبيع أكثر (بدون تغيير الأسعار)." },
  { id: "faqfill", group: "محتوى", icon: "❓", title: "ملء الأسئلة الشائعة", body: "أضف 8 أسئلة شائعة واقعية عن الشحن والدفع ومدة التسليم مع أجوبة قصيرة." },
  { id: "prices", group: "تنفيذ", icon: "➕", title: "استيراد قائمة أسعار من صورة", body: "سأرسل صورة قائمة أسعار — استخرج كل منتج وسعر وأضفهم في القسم المناسب." },
  { id: "raise", group: "تنفيذ", icon: "⬆️", title: "رفع أسعار قسم 5%", body: "رفّع كل أسعار قسم فري فاير بنسبة 5%." },
  { id: "lock", group: "تنفيذ", icon: "🔒", title: "قفل الطلبات مؤقتاً", body: "اقفل البوت الآن وأرسل للزبائن رسالة صيانة قصيرة، ثم أبلغني." },
];

const GROUPS = ["الكل", "تحليل", "حماية", "تسويق", "محتوى", "تنفيذ"];

export default function PromptsPage(): React.ReactElement {
  const [group, setGroup] = useState("الكل");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (text: string) => {
    setBusy(true);
    try {
      const res = await apiPost<{ reply: string; actions: { type: string }[] }>("ai/chat", { text, history: [] });
      toast(`رد شينوي AI: ${String(res.reply).slice(0, 90)}…`);
      if (res.actions?.length) {
        await apiPost("ai/apply", { actions: res.actions });
        toast(`نُفِّذت ${res.actions.length} عملية ✅`);
      }
      location.href = "/admin/ai";
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  const list = PROMPTS.filter((p) => group === "الكل" || p.group === group);

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-14 -top-24 h-56 w-56 rounded-full bg-amber-300/40 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🧩 مكتبة البرومتات</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">
          عشرات الأوامر الجاهزة التي تنفّذها «شينوي AI» بضغطة واحدة — تحليل، حماية، تسويق، وتنفيذ مباشر على البوت.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full bg-white/70 p-1">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`rounded-full px-3 py-1.5 text-[0.72rem] font-black transition ${group === g ? "bg-emerald-500 text-white shadow" : "text-emerald-900/60 hover:bg-white"}`}
            type="button"
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <div key={p.id} className="panel panel-hover flex flex-col p-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl">{p.icon}</span>
              <Badge tone="slate">{p.group}</Badge>
            </div>
            <p className="mt-2 text-sm font-black text-emerald-950">{p.title}</p>
            <p className="mt-1 flex-1 text-[0.72rem] leading-6 text-emerald-900/60">{p.body}</p>
            <Btn className="mt-3 w-full" disabled={busy} onClick={() => run(p.body)}>
              ▶️ تشغيل
            </Btn>
          </div>
        ))}
      </div>

      <Card title="✍️ برومبت مخصص" subtitle="اكتب أمرك بلغتك — شينوي AI يفهمه وينفّذه">
        <div className="space-y-3">
          <Field label="أمرك">
            <Textarea
              rows={3}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="مثال: أضف منتج 2200 جوهرة بسعر 4200 في فري فاير، وأذع للزبائن أن العرض متوفر الليلة فقط"
            />
          </Field>
          <Btn onClick={() => custom.trim() && run(custom.trim())} disabled={busy || !custom.trim()}>
            🚀 أرسل إلى شينوي AI
          </Btn>
        </div>
      </Card>
    </div>
  );
}
