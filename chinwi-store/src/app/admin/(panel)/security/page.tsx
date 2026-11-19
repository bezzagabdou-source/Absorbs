"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Spinner,
  Stat,
  Textarea,
  Toggle,
  apiPost,
  dateTime,
  toast,
  useApi,
} from "@/components/ui";

type SecSettings = {
  bot_locked?: boolean;
  lock_message?: string;
  rate_limit_per_min?: number;
  max_orders_per_hour?: number;
  block_words?: string[];
  auto_block_after?: number;
  anti_fake_receipt?: boolean;
  require_phone_confirm?: boolean;
  security_alert_owner?: boolean;
  maintenance?: boolean;
  require_subscription?: boolean;
  gate_bypass?: string;
};

type Event = { id: number; kind: string; user_id: number | null; detail: string; severity: string; created_at: string };
type Blocked = { tg_id: number; first_name: string | null; username: string | null; created_at: string };

const SEVERITY: Record<string, { tone: "emerald" | "red" | "amber" | "slate"; label: string }> = {
  info: { tone: "slate", label: "معلومة" },
  warn: { tone: "amber", label: "تحذير" },
  danger: { tone: "red", label: "خطر" },
  success: { tone: "emerald", label: "ناجح" },
};

export default function SecurityPage(): React.ReactElement {
  const { data, reload, loading } = useApi<{
    settings: SecSettings;
    events: Event[];
    blocked: Blocked[];
    orders: { day: string; c: number }[];
  }>("security");
  const [form, setForm] = useState<SecSettings>({});
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm(data.settings ?? {});
    setWords(((data.settings?.block_words as string[]) ?? []).join(", "));
  }, [data]);

  const set = (k: keyof SecSettings, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await apiPost("security/save", {
        ...form,
        block_words: words
          .split(/[,،\n]/)
          .map((w) => w.trim())
          .filter(Boolean),
      });
      toast("تم حفظ إعدادات الحماية 🛡");
      reload();
    } catch (err) {
      toast(String((err as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  const lock = async (on: boolean) => {
    await apiPost(on ? "security/lock" : "security/unlock").catch((e) => toast(String(e.message), "err"));
    toast(on ? "🔒 تم قفل البوت — لن يستقبل أحد رسائل" : "🔓 تم فتح البوت");
    reload();
  };

  const unblock = async (id: number) => {
    await apiPost("security/unblock", { user_id: id }).catch(() => null);
    toast("تم فك الحظر");
    reload();
  };

  const clearEvents = async () => {
    await apiPost("security/clear").catch(() => null);
    toast("تم تفريغ سجل الأحداث");
    reload();
  };

  if (loading && !data) return <Spinner label="تحميل مركز الحماية…" />;

  const locked = Boolean(form.bot_locked);

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/30 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">🛡 مركز الحماية</h1>
            <p className="mt-1 text-xs font-bold text-emerald-900/60">
              أدوات تحمي البوت من الخدع والإزعاج: قفل فوري، حدود معدّل، كلمات ممنوعة، حظر تلقائي.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={locked ? "red" : "emerald"}>{locked ? "البوت مقفل" : "البوت يعمل"}</Badge>
            <Btn variant={locked ? "green" : "red"} onClick={() => lock(!locked)}>
              {locked ? "🔓 فتح البوت" : "🔒 قفل البوت فوراً"}
            </Btn>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="حد الرسائل / دقيقة" value={form.rate_limit_per_min ?? 0} icon="⚡️" hint="مقاومة الإزعاج" />
        <Stat label="حد الطلبات / ساعة" value={form.max_orders_per_hour ?? 0} icon="🧾" tone="sky" hint="لكل مستخدم" />
        <Stat label="حظر تلقائي بعد" value={`${form.auto_block_after ?? 0} بلاغات`} icon="🚫" tone="red" hint="إيصالات مزيفة/كلمات" />
        <Stat label="المحظورون" value={data?.blocked.length ?? 0} icon="👤" tone="amber" hint="من لوحة التحكم" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card title="⚙️ ضبط الحماية" subtitle="كل التغييرات تُطبّق فوراً على البوت">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="حد الرسائل في الدقيقة (لكل مستخدم)">
              <Input type="number" value={String(form.rate_limit_per_min ?? 20)} onChange={(e) => set("rate_limit_per_min", Number(e.target.value))} />
            </Field>
            <Field label="حد الطلبات في الساعة">
              <Input type="number" value={String(form.max_orders_per_hour ?? 6)} onChange={(e) => set("max_orders_per_hour", Number(e.target.value))} />
            </Field>
            <Field label="عدد البلاغات قبل الحظر التلقائي">
              <Input type="number" value={String(form.auto_block_after ?? 3)} onChange={(e) => set("auto_block_after", Number(e.target.value))} />
            </Field>
            <Field label="حسابات معفاة من الاشتراك (يوزر/آي دي)">
              <Input dir="ltr" value={String(form.gate_bypass ?? "")} onChange={(e) => set("gate_bypass", e.target.value)} placeholder="@A_B_B_X_N" />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="كلمات ممنوعة (مفصولة بفاصلة) — تُسجّل وتُحظر صاحبها">
              <Textarea rows={2} value={words} onChange={(e) => setWords(e.target.value)} placeholder="كلمة1, كلمة2, رابط مزعج" />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="رسالة القفل">
              <Textarea rows={2} value={String(form.lock_message ?? "")} onChange={(e) => set("lock_message", e.target.value)} />
            </Field>
          </div>

          <div className="mt-4 space-y-2">
            <Toggle checked={Boolean(form.anti_fake_receipt)} onChange={(v) => set("anti_fake_receipt", v)} label="فحص الإيصالات المزيفة" hint="تنبيه عند إيصال مكرر أو صورة غير واضحة" />
            <Toggle checked={Boolean(form.require_phone_confirm)} onChange={(v) => set("require_phone_confirm", v)} label="طلب تأكيد إضافي قبل التسليم" hint="خطوة تأكيد ثانية للطلبات الكبيرة" />
            <Toggle checked={Boolean(form.security_alert_owner)} onChange={(v) => set("security_alert_owner", v)} label="إشعار المالك بكل حدث أمني" />
            <Toggle checked={Boolean(form.require_subscription)} onChange={(v) => set("require_subscription", v)} label="الاشتراك الإجباري مفعّل" />
            <Toggle checked={Boolean(form.maintenance)} onChange={(v) => set("maintenance", v)} label="وضع الصيانة (رسالة بدل البوت)" />
          </div>

          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={busy}>
              {busy ? "…" : "💾 حفظ إعدادات الحماية"}
            </Btn>
            <Btn variant="ghost" onClick={reload}>
              ↻ تحديث
            </Btn>
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title="📜 آخر الأحداث الأمنية"
            subtitle="كل محاولة مشبوهة تُسجّل هنا"
            action={
              <Btn size="sm" variant="ghost" onClick={clearEvents}>
                تفريغ
              </Btn>
            }
          >
            {(data?.events.length ?? 0) === 0 ? (
              <Empty icon="🛡" title="لا أحداث" hint="البوت نظيف — لا محاولات مشبوهة" />
            ) : (
              <div className="max-h-[22rem] space-y-2 overflow-y-auto pe-1">
                {data?.events.map((e) => {
                  const s = SEVERITY[e.severity] ?? SEVERITY.info;
                  return (
                    <div key={e.id} className="flex items-start gap-2 rounded-2xl bg-white/70 p-2.5">
                      <Badge tone={s.tone}>{s.label}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.78rem] font-bold text-emerald-950">{e.kind}</p>
                        <p className="truncate text-[0.68rem] text-emerald-900/55">
                          {e.detail} {e.user_id ? `• ${e.user_id}` : ""}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-[0.62rem] text-emerald-900/40">{dateTime(e.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="🚫 المستخدمون المحظورون" subtitle="افتح الحظر لمن تتأكد أنه زبون حقيقي">
            {(data?.blocked.length ?? 0) === 0 ? (
              <Empty icon="✅" title="لا محظورين" />
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {data?.blocked.map((u) => (
                  <div key={u.tg_id} className="flex items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-emerald-950">{u.first_name ?? "بدون اسم"}</p>
                      <p className="truncate text-[0.65rem] text-emerald-900/50" dir="ltr">
                        {u.username ? `@${u.username}` : u.tg_id}
                      </p>
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => unblock(u.tg_id)}>
                      فك الحظر
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
