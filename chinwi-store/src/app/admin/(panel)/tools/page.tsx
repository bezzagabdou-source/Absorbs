"use client";

import { useState } from "react";
import { Badge, Btn, Card, Field, Input, Select, Spinner, Stat, Textarea, apiPost, toast, useApi } from "@/components/ui";

type HealthData = { counts: { users: string; products: string; orders: string }; db: { connected: boolean }; webhook: { ok?: boolean } | null };

export default function ToolsPage(): React.ReactElement {
  const { data, loading } = useApi<HealthData>("health");
  const [broadcast, setBroadcast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [product, setProduct] = useState({ name: "", price: "", category_id: "" });
  const { data: cats } = useApi<{ categories: { id: number; name: string }[] }>("categories");

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    try {
      await fn();
      toast(okMsg);
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(null);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return toast("اكتب نص الإذاعة", "err");
    setBusy("air");
    try {
      const res = await apiPost<{ sent: number; failed: number; blocked?: number; total?: number }>("broadcast", { text: broadcast });
      setResult(`✅ نُشر: ${res.sent} — فشل: ${res.failed} — محظورون/محذوفون: ${res.blocked ?? 0} من ${res.total ?? "؟"}`);
      toast("تمت الإذاعة 🚀");
      setBroadcast("");
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(null);
    }
  };

  const addProduct = async () => {
    if (!product.name.trim()) return toast("اكتب اسم المنتج", "err");
    setBusy("prod");
    try {
      await apiPost("products", {
        name: product.name,
        price: product.price ? Number(product.price) : null,
        category_id: product.category_id ? Number(product.category_id) : undefined,
      });
      toast("أُضيف المنتج منتج 📦");
      setProduct({ name: "", price: "", category_id: "" });
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <Spinner label="تحميل الأدوات…" />;

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-16 -top-24 h-56 w-56 rounded-full bg-teal-300/45 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🧰 أدوات المالك السريعة</h1>
        <p className="relative mt-1 text-xs font-bold text-emerald-900/60">كل ما تحتاجه في شاشة واحدة: إضافة منتج، إذاعة جماعية بدون فشل، وفحوص البوت.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="المنتجات" value={data?.counts.products ?? "—"} icon="📦" />
        <Stat label="المستخدمون" value={data?.counts.users ?? "—"} icon="👥" tone="violet" />
        <Stat label="الويبهوك" value={data?.webhook?.ok ? "مرتبط" : "غير مرتبط"} icon="🔗" tone={data?.webhook?.ok ? "emerald" : "red"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="📢 إذاعة جماعية مضمونة" subtitle="إعادة محاولة تلقائية + تخطّي المحظورين + تقرير دقيق">
          <Field label="نص الرسالة (HTML مسموح)">
            <Textarea rows={5} value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="🔥 عروض الليلة: خصم 10% على تيك توك — استعمل كود CHINWI10" />
          </Field>
          <div className="mt-3 flex items-center gap-2">
            <Btn onClick={sendBroadcast} disabled={busy === "air" || !broadcast.trim()}>
              {busy === "air" ? "جارٍ الإرسال…" : `🚀 إرسال إلى ${data?.counts.users ?? 0} مستخدم`}
            </Btn>
            <Badge tone="emerald">لا يفشل</Badge>
          </div>
          {result && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-[0.72rem] font-bold text-emerald-800">{result}</p>}
        </Card>

        <div className="space-y-4">
          <Card title="➕ إضافة منتج سريع">
            <div className="space-y-2">
              <Field label="الاسم">
                <Input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} placeholder="1080 جوهرة فري فاير" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="السعر (اتركه فارغاً = تواصل مع المالك)">
                  <Input type="number" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} />
                </Field>
                <Field label="القسم">
                  <Select value={product.category_id} onChange={(e) => setProduct({ ...product, category_id: e.target.value })}>
                    <option value="">— بدون —</option>
                    {(cats?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Btn className="w-full" onClick={addProduct} disabled={busy === "prod"}>
                {busy === "prod" ? "…" : "📦 إضافة"}
              </Btn>
            </div>
          </Card>

          <Card title="⚡️ إجراءات فورية">
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="ghost" disabled={busy === "hook"} onClick={() => run("hook", () => apiPost("setup"), "تم ربط الويبهوك ✅")}>
                🔗 ربط الويبهوك
              </Btn>
              <Btn variant="ghost" disabled={busy === "lock"} onClick={() => run("lock", () => apiPost("security/lock"), "تم قفل البوت 🔒")}>
                🔒 قفل البوت
              </Btn>
              <Btn variant="green" disabled={busy === "unlock"} onClick={() => run("unlock", () => apiPost("security/unlock"), "تم فتح البوت 🔓")}>
                🔓 فتح البوت
              </Btn>
              <Btn variant="ghost" onClick={() => (location.href = "/api/admin/export/backup")}>
                💾 نسخة احتياطية
              </Btn>
            </div>
            <p className="mt-2 text-[0.65rem] leading-5 text-emerald-900/45">
              الإجراءات تُسجَّل في السجلات باسمك، ويمكن التراجع عنها من مركز الحماية.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
