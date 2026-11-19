"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Field,
  Input,
  Spinner,
  Textarea,
  Toggle,
  apiPost,
  toast,
  useApi,
} from "@/components/ui";

type SettingsData = {
  ok: boolean;
  settings: Record<string, unknown>;
  ai: { groq: boolean; gemini: boolean; openrouter: boolean };
  emoji: { enabled: boolean; count: number };
  site: string;
  owner: string;
};

export default function SettingsPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<SettingsData>("settings");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [emojiSet, setEmojiSet] = useState("");
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const key of [
        "store_name",
        "store_tagline",
        "currency",
        "announcement",
        "welcome_text",
        "support_username",
        "owner_username",
        "require_subscription",
        "gate_bypass",
        "banner_image",
        "maintenance",
        "maintenance_text",
        "receipt_note",
        "usd_min",
        "show_unpriced",
        "orders_open",
        "theme",
      ]) {
        if (form[key] !== undefined) payload[key] = form[key];
      }
      const rates = String(form.usd_rates_raw ?? (Array.isArray(form.usd_rates) ? (form.usd_rates as number[]).join(", ") : ""))
        .split(/[,،\s]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      payload.usd_rates = rates.length ? rates : [250, 255];
      await apiPost("settings", payload);
      toast("تم حفظ الإعدادات ✅");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pwd.next !== pwd.confirm) {
      toast("كلمتا السر غير متطابقتين", "err");
      return;
    }
    try {
      await apiPost("password", { current: pwd.current, next: pwd.next });
      toast("تم تغيير كلمة السر ✅");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">الإعدادات</h1>
          <p className="mt-1 text-xs text-emerald-900/65">تحكم كامل في هوية المتجر، التشغيل، الأمان والإيموجي المتحرك</p>
        </div>
        <Btn onClick={save} disabled={saving}>
          {saving ? "جارٍ الحفظ…" : "💾 حفظ التغييرات"}
        </Btn>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="🏪 هوية المتجر">
          <div className="space-y-3">
            <Field label="اسم المتجر">
              <Input value={String(form.store_name ?? "")} onChange={(e) => set("store_name", e.target.value)} />
            </Field>
            <Field label="الشعار النصي">
              <Input value={String(form.store_tagline ?? "")} onChange={(e) => set("store_tagline", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="العملة">
                <Input value={String(form.currency ?? "دج")} onChange={(e) => set("currency", e.target.value)} />
              </Field>
              <Field label="يوزر الدعم (بدون @)">
                <Input value={String(form.support_username ?? "")} onChange={(e) => set("support_username", e.target.value)} dir="ltr" />
              </Field>
            </div>
            <Field label="يوزر المالك (لاستلام إشعارات الطلبات)">
              <Input value={String(form.owner_username ?? "")} onChange={(e) => set("owner_username", e.target.value)} dir="ltr" />
            </Field>
            <Field label="الشريط الإعلاني في البوت">
              <Input value={String(form.announcement ?? "")} onChange={(e) => set("announcement", e.target.value)} />
            </Field>
            <Field label="حسابات معفاة من الاشتراك الإجباري (يوزرات أو آي دي، مفصولة بفاصلة)">
              <Input
                value={String(form.gate_bypass ?? "")}
                onChange={(e) => set("gate_bypass", e.target.value)}
                dir="ltr"
                placeholder="@A_B_B_X_N"
              />
            </Field>
            <Field label="صورة البانر في رسالة الترحيب (مسار أو رابط)">
              <Input value={String(form.banner_image ?? "")} onChange={(e) => set("banner_image", e.target.value)} dir="ltr" />
            </Field>
            <Field label="رسالة الترحيب (HTML مسموح)">
              <Textarea rows={4} value={String(form.welcome_text ?? "")} onChange={(e) => set("welcome_text", e.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="⚙️ التشغيل">
            <div className="space-y-2">
              <Toggle
                checked={Boolean(form.require_subscription)}
                onChange={(v) => set("require_subscription", v)}
                label="الاشتراك الإجباري في القنوات"
                hint="عند التعطيل يستطيع الجميع استخدام البوت"
              />
              <Toggle
                checked={Boolean(form.maintenance)}
                onChange={(v) => set("maintenance", v)}
                label="وضع الصيانة"
                hint="يمنع الزبائن من استخدام المتجر مؤقتاً"
              />
              <Toggle checked={Boolean(form.orders_open ?? true)} onChange={(v) => set("orders_open", v)} label="استقبال الطلبات" />
              <Field label="رسالة الصيانة">
                <Input value={String(form.maintenance_text ?? "")} onChange={(e) => set("maintenance_text", e.target.value)} />
              </Field>
              <Field label="ملاحظة إرسال الإيصال">
                <Input value={String(form.receipt_note ?? "")} onChange={(e) => set("receipt_note", e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card title="💵 أسعار بيع الدولار">
            <div className="grid grid-cols-2 gap-3">
              <Field label="الأسعار (مفصولة بفاصلة)" hint="مثال: 250, 255">
                <Input
                  value={String(
                    form.usd_rates_raw ??
                      (Array.isArray(form.usd_rates) ? (form.usd_rates as number[]).join(", ") : "250, 255"),
                  )}
                  onChange={(e) => set("usd_rates_raw", e.target.value)}
                  dir="ltr"
                />
              </Field>
              <Field label="الحد الأدنى ($)">
                <Input
                  type="number"
                  value={Number(form.usd_min ?? 5)}
                  onChange={(e) => set("usd_min", Number(e.target.value))}
                />
              </Field>
            </div>
          </Card>
        </div>

        <Card title="✨ الإيموجي المتحرك" subtitle="اختياري — يتطلب يوزرنيم مشترى من Fragment ليعمل على البوت">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={data?.emoji.enabled ? "emerald" : "slate"}>
                {data?.emoji.enabled ? "مفعّل" : "معطّل"}
              </Badge>
              <span className="text-xs text-emerald-900/65">{data?.emoji.count ?? 0} إيموجي في المكتبة</span>
              <Btn
                size="sm"
                variant="ghost"
                className="mr-auto"
                onClick={async () => {
                  try {
                    const res = await apiPost<{ enabled: boolean }>("emoji/toggle", { enabled: !data?.emoji.enabled });
                    toast(res.enabled ? "تم التفعيل" : "تم التعطيل");
                    reload();
                  } catch (err) {
                    toast((err as Error).message, "err");
                  }
                }}
              >
                {data?.emoji.enabled ? "تعطيل" : "تفعيل"}
              </Btn>
            </div>
            <Field label="استيراد حزمة إيموجي" hint="انسخ رابط الحزمة من تيليجرام: t.me/addemoji/NAME أو الاسم فقط">
              <div className="flex gap-2">
                <Input value={emojiSet} onChange={(e) => setEmojiSet(e.target.value)} placeholder="t.me/addemoji/PremiumEmoji" dir="ltr" />
                <Btn
                  onClick={async () => {
                    try {
                      const res = await apiPost<{ count: number; setName: string }>("emoji/sync", { set: emojiSet });
                      toast(`تم استيراد ${res.count} إيموجي من ${res.setName}`);
                      setEmojiSet("");
                      reload();
                    } catch (err) {
                      toast((err as Error).message, "err");
                    }
                  }}
                  disabled={!emojiSet.trim()}
                >
                  استيراد
                </Btn>
              </div>
            </Field>
            <p className="text-[0.68rem] leading-6 text-emerald-900/55">
              إذا رفض تيليجرام الإيموجي المتحرك يرسل البوت الرسالة بإيموجي عادي تلقائياً — لا يتم فقدان أي رسالة.
            </p>
          </div>
        </Card>

        <Card title="🔐 الأمان">
          <div className="space-y-3">
            <Field label="كلمة السر الحالية">
              <Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الجديدة">
                <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
              </Field>
              <Field label="تأكيد الجديدة">
                <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
              </Field>
            </div>
            <Btn variant="red" onClick={changePassword} disabled={!pwd.current || pwd.next.length < 6}>
              🔑 تغيير كلمة السر
            </Btn>
            <p className="text-[0.68rem] leading-6 text-emerald-900/55">
              كلمة السر مخزّنة بتشفير scrypt. في حال فقدانها استخدم متغيّر البيئة <code>ADMIN_PASSWORD</code> في Vercel.
            </p>
          </div>
        </Card>

        <Card title="🔌 حالة الربط">
          <ul className="space-y-2 text-xs text-emerald-900/85">
            <li className="flex items-center justify-between">
              <span>قاعدة البيانات (Neon)</span>
              <Badge tone="emerald">متصلة</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Groq (ذكاء سريع)</span>
              <Badge tone={data?.ai.groq ? "emerald" : "slate"}>{data?.ai.groq ? "مفتاح موجود" : "بدون مفتاح"}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>Gemini (رؤية وتحليل)</span>
              <Badge tone={data?.ai.gemini ? "emerald" : "slate"}>{data?.ai.gemini ? "مفتاح موجود" : "بدون مفتاح"}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>OpenRouter (احتياط)</span>
              <Badge tone={data?.ai.openrouter ? "emerald" : "slate"}>{data?.ai.openrouter ? "مفتاح موجود" : "بدون مفتاح"}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>الموقع</span>
              <span className="text-[0.68rem] text-emerald-900/55" dir="ltr">
                {data?.site}
              </span>
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/api/admin/export/orders" className="btn btn-ghost text-xs">
              ⬇️ تصدير الطلبات
            </a>
            <a href="/api/admin/export/backup" className="btn btn-green text-xs">
              💾 نسخة احتياطية JSON
            </a>
            <a href="/api/admin/export/sql" className="btn btn-green text-xs">
              🗄 نسخة احتياطية SQL
            </a>
            <a href="/api/admin/export/users" className="btn btn-ghost text-xs">
              ⬇️ تصدير المستخدمين
            </a>
            <a href="/api/health" target="_blank" className="btn btn-ghost text-xs">
              ❤️ فحص الصحة
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
