"use client";

import { useEffect, useState } from "react";
import {
  ANIMATED_EMOJI_CSS,
  ANIMATED_EMOJIS,
  animatedEmojiSnippet,
} from "@/lib/animated-emoji";
import { Badge, Btn, Card, CopyBtn, Field, Input, Spinner, Stat, Toggle, apiGet, apiPost, toast } from "@/components/ui";

type EmojiStats = { enabled: boolean; count: number };

export default function EmojiPage(): React.ReactElement {
  const [stats, setStats] = useState<EmojiStats | null>(null);
  const [set, setSet] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await apiGet<EmojiStats>("emoji").catch(() => null);
    setStats(res);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const sync = async () => {
    if (!set.trim()) return toast("اكتب اسم حزمة الإيموجي أو رابط t.me/addemoji/…", "err");
    setBusy(true);
    const res = await apiPost<{ ok: boolean; count: number; setName: string }>("emoji/sync", { set }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast(`تم ربط ${res.count} إيموجي متحرك من ${res.setName} ✅`);
      void load();
    } else toast("تعذّر الربط — تأكد أن الحزمة موجودة والبوت يعرفها", "err");
  };

  const toggle = async (enabled: boolean) => {
    const res = await apiPost<EmojiStats>("emoji/toggle", { enabled }).catch(() => null);
    if (res) {
      setStats(res);
      toast(enabled ? "تم تفعيل الإيموجي المتحرك في الرسائل والأزرار" : "تم إيقاف الإيموجي المتحرك");
    }
  };

  if (loading) return <Spinner label="جاري تحميل الإيموجيات…" />;

  return (
    <div className="fade-in space-y-4">
      <style dangerouslySetInnerHTML={{ __html: ANIMATED_EMOJI_CSS }} />

      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-fuchsia-300/40 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-4xl">
            {ANIMATED_EMOJIS.slice(0, 6).map((e) => (
              <span key={e.id} dangerouslySetInnerHTML={{ __html: e.html }} />
            ))}
          </div>
          <div>
            <h1 className="text-2xl font-black text-emerald-950">✨ إيموجي متحرك (HTML)</h1>
            <p className="mt-1 text-xs font-bold text-emerald-900/60">
              12 إيموجي متحرك مبني بـ SVG + CSS فقط — بدون صور وبدون مكتبات. انسخه والصقه في أي صفحة أو رسالة ويب.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="إيموجي متحرك جاهز" value={`${ANIMATED_EMOJIS.length}`} icon="✨" tone="violet" hint="SVG + CSS" />
        <Stat
          label="إيموجي مربوط بتليجرام"
          value={stats?.enabled ? `${stats.count}` : "موقوف"}
          icon="🔗"
          tone={stats?.enabled ? "emerald" : "amber"}
          hint="custom emoji"
        />
        <Stat label="حجم الرمز" value="~1 KB" icon="📦" tone="sky" hint="بدون صور" />
        <Stat label="متوافق" value="كل المتصفحات" icon="🧩" tone="emerald" hint="CSS keyframes" />
      </div>

      <Card title="🖼 المعرض" subtitle="اضغط «نسخ HTML» وضع الرمز في أي صفحة — سيتحرك فوراً">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ANIMATED_EMOJIS.map((e) => (
            <div
              key={e.id}
              className="flex flex-col items-center gap-2 rounded-3xl border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-white to-emerald-50 shadow-inner">
                <span className="h-14 w-14" dangerouslySetInnerHTML={{ __html: e.html }} />
              </span>
              <p className="text-sm font-black text-emerald-950">
                {e.label} {e.name}
              </p>
              <CopyBtn text={animatedEmojiSnippet(e.id)} label="نسخ HTML" />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🔗 اربط حزمة إيموجي متحرك بتليجرام" subtitle="حزمة تعمل داخل الرسائل والأزرار (custom emoji)">
          <div className="space-y-3">
            <Field label="اسم الحزمة أو رابطها">
              <Input
                value={set}
                onChange={(ev) => setSet(ev.target.value)}
                placeholder="t.me/addemoji/PremiumEmoji أو PremiumEmoji"
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={sync} disabled={busy}>
                {busy ? "جاري الربط…" : "🔗 ربط الحزمة"}
              </Btn>
              <Toggle checked={Boolean(stats?.enabled)} onChange={toggle} label="تفعيل في الرسائل" />
            </div>
            <p className="rounded-2xl bg-amber-50/80 p-3 text-[0.72rem] font-bold leading-relaxed text-amber-900">
              ⚠️ شرط تيليجرام: الإيموجي المتحرك داخل نص الرسالة يعمل فقط إذا كان البوت مملوكاً لحساب Premium أو
              يوزرنيم مشترى من Fragment. بدون ذلك يظهر الإيموجي عادي (بدون حركة) — والبوت لا يتعطّل أبداً.
            </p>
          </div>
        </Card>

        <Card title="📢 أين تُستخدم؟" subtitle="مدمجة فعلياً في اللوحة والرسائل">
          <ul className="space-y-2 text-[0.8rem] font-bold text-emerald-900/85">
            <li className="rounded-2xl bg-white/70 px-3 py-2">🎛 رأس صفحات اللوحة (هذه الصفحة + صفحة AI + الصحة).</li>
            <li className="rounded-2xl bg-white/70 px-3 py-2">
              💬 رسائل البوت: إيموجي عادي + إيموجي متحرك عند ربط حزمة (يُطبّق تلقائياً على الأزرار).
            </li>
            <li className="rounded-2xl bg-white/70 px-3 py-2">
              🧠 ردود الذكاء الاصطناعي: تُرسل عبر <code>parse_mode=HTML</code> مع الحفاظ على الرموز.
            </li>
            <li className="rounded-2xl bg-white/70 px-3 py-2">
              🌐 صفحات الويب: المعرض أعلاه HTML خالص — انسخه إلى أي صفحة أو إعلان.
            </li>
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={stats?.enabled ? "emerald" : "amber"}>
              {stats?.enabled ? `مفعّل — ${stats.count} رمز` : "غير مربوط بتليجرام بعد"}
            </Badge>
            <Badge tone="violet">HTML دائم العمل</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
