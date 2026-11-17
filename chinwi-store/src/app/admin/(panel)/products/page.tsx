"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  SearchBox,
  Select,
  Spinner,
  Textarea,
  Toggle,
  apiPost,
  money,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type ProductField = { key: string; label: string; placeholder?: string; required?: boolean };

type Product = {
  id: number;
  category_id: number | null;
  category_name: string | null;
  name: string;
  description: string;
  price: string | null;
  price_label: string | null;
  image_url: string | null;
  image_file_id: string | null;
  active: boolean;
  featured: boolean;
  sort: number;
  fields: ProductField[];
  stock: number | null;
  badge: string | null;
  sold: number;
};

type Category = { id: number; name: string; emoji: string; section: string };

type Response = { ok: boolean; products: Product[]; categories: Category[] };

const EMPTY: Partial<Product> = {
  name: "",
  description: "",
  price: null,
  price_label: "",
  category_id: null,
  badge: "",
  sort: 99,
  stock: null,
  active: true,
  featured: false,
  fields: [],
};

export default function ProductsPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const { data, error, loading, reload } = useApi<Response>("products");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulk, setBulk] = useState<{ percent: string; category: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, node } = useConfirm();

  const products = useMemo(() => {
    let rows = data?.products ?? [];
    if (category) rows = rows.filter((p) => String(p.category_id) === category);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(needle) || (p.description ?? "").toLowerCase().includes(needle));
    }
    return rows;
  }, [data, category, search]);

  const categories = data?.categories ?? [];

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast("اسم المنتج مطلوب", "err");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description ?? "",
        price: editing.price === null || editing.price === "" ? null : Number(editing.price),
        price_label: editing.price_label ?? "",
        category_id: editing.category_id ?? null,
        image_url: editing.image_url ?? "",
        badge: editing.badge ?? "",
        sort: Number(editing.sort ?? 99),
        stock: editing.stock === null || editing.stock === undefined || String(editing.stock) === "" ? null : Number(editing.stock),
        active: editing.active ?? true,
        featured: editing.featured ?? false,
        fields: editing.fields ?? [],
      };
      if (editing.id) await apiPost(`products/${editing.id}`, payload);
      else await apiPost("products", payload);
      toast(editing.id ? "تم تحديث المنتج ✅" : "تمت إضافة المنتج ✅");
      setEditing(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiPost<{ url: string }>("upload", form);
      setEditing((prev) => (prev ? { ...prev, image_url: res.url } : prev));
      toast("تم رفع الصورة ✅");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      await apiPost(`products/${p.id}`, { active: !p.active });
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const duplicate = async (p: Product) => {
    try {
      await apiPost("products", {
        name: `${p.name} (نسخة)`,
        description: p.description,
        price: p.price,
        price_label: p.price_label,
        category_id: p.category_id,
        image_url: p.image_url,
        badge: p.badge,
        sort: p.sort,
        fields: p.fields,
        active: false,
      });
      toast("تم إنشاء نسخة (غير مفعّلة)");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const updateField = (index: number, patch: Partial<ProductField>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const fields = [...(prev.fields ?? [])];
      fields[index] = { ...fields[index], ...patch };
      return { ...prev, fields };
    });
  };

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">المنتجات</h1>
          <p className="mt-1 text-xs text-slate-400">
            {products.length} منتج — تحكم كامل في الأسعار، الصور، الحقول المطلوبة والظهور
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/ai" className="btn btn-ghost text-xs">
            🧠 استيراد بالصورة
          </Link>
          <Btn variant="ghost" onClick={() => setBulk({ percent: "", category: "" })}>
            📈 تعديل أسعار جماعي
          </Btn>
          <Btn onClick={() => setEditing({ ...EMPTY, category_id: categories[0]?.id ?? null })}>➕ منتج جديد</Btn>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <SearchBox value={search} onChange={setSearch} placeholder="ابحث باسم المنتج…" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto py-1.5 text-xs">
            <option value="">كل الأقسام</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </Select>
          <Btn variant="ghost" onClick={reload}>
            🔄
          </Btn>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-300">{error}</p>
        ) : products.length === 0 ? (
          <Empty icon="📦" title="لا منتجات" hint="أضف منتجك الأول أو استورد قائمة أسعار بالصورة من صفحة الذكاء الاصطناعي" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>القسم</th>
                  <th>السعر</th>
                  <th>الحقول</th>
                  <th>مبيعات</th>
                  <th>الظهور</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/40 text-sm">
                          {p.image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            "🎁"
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1">
                            <span className="max-w-[13rem] truncate text-xs font-bold text-white">{p.name}</span>
                            {p.featured && <span title="مميز">⭐️</span>}
                          </span>
                          <span className="block max-w-[15rem] truncate text-[0.62rem] text-slate-500">
                            {p.badge || p.description || `#${p.id}`}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[0.7rem] text-slate-400">{p.category_name ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs font-black text-emerald-400">
                      {p.price !== null ? money(p.price) : <span className="text-amber-300">{p.price_label || "سعر خاص"}</span>}
                    </td>
                    <td className="text-[0.68rem] text-slate-400">{p.fields?.length ?? 0}</td>
                    <td className="text-[0.68rem] text-slate-400">{p.sold}</td>
                    <td>
                      <button onClick={() => toggleActive(p)}>
                        <Badge tone={p.active ? "emerald" : "red"}>{p.active ? "ظاهر" : "مخفي"}</Badge>
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Btn size="sm" variant="ghost" onClick={() => setEditing({ ...p })}>
                          ✏️
                        </Btn>
                        <Btn size="sm" variant="ghost" onClick={() => duplicate(p)} title="نسخ">
                          ⧉
                        </Btn>
                        <Btn
                          size="sm"
                          variant="red"
                          onClick={() =>
                            confirm(`حذف المنتج «${p.name}» نهائياً؟`, async () => {
                              try {
                                await apiPost(`products/${p.id}/delete`);
                                toast("تم الحذف");
                                reload();
                              } catch (err) {
                                toast((err as Error).message, "err");
                              }
                            })
                          }
                        >
                          🗑
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* محرر المنتج */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `تعديل المنتج #${editing.id}` : "منتج جديد"}
        wide
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Btn>
            <Btn onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ…" : "💾 حفظ المنتج"}
            </Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المنتج">
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="مثال: 1080 جوهرة فري فاير" />
              </Field>
              <Field label="القسم">
                <Select
                  value={editing.category_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">بدون قسم</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="السعر (دج)" hint="اتركه فارغاً إذا السعر غير محدد">
                <Input
                  type="number"
                  value={editing.price ?? ""}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : (e.target.value as unknown as string) })}
                  placeholder="320"
                />
              </Field>
              <Field label="نص بديل للسعر">
                <Input value={editing.price_label ?? ""} onChange={(e) => setEditing({ ...editing, price_label: e.target.value })} placeholder="تواصل مع المالك" />
              </Field>
              <Field label="شارة (Badge)">
                <Input value={editing.badge ?? ""} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} placeholder="🔥 الأكثر طلباً" />
              </Field>
            </div>

            <Field label="الوصف">
              <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="تفاصيل قصيرة تظهر في البطاقة" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="صورة المنتج (رابط أو رفع)">
                <div className="flex gap-2">
                  <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="/catalog/pes.jpg" />
                  <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? "…" : "📤"}
                  </Btn>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الترتيب">
                  <Input type="number" value={editing.sort ?? 99} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} />
                </Field>
                <Field label="المخزون (اختياري)">
                  <Input
                    type="number"
                    value={editing.stock ?? ""}
                    onChange={(e) => setEditing({ ...editing, stock: e.target.value === "" ? null : (e.target.value as unknown as number) })}
                  />
                </Field>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label="ظاهر في المتجر" />
              <Toggle checked={editing.featured ?? false} onChange={(v) => setEditing({ ...editing, featured: v })} label="مميز ⭐️" />
            </div>

            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-200">الحقول المطلوبة من الزبون</p>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      fields: [...(editing.fields ?? []), { key: "player_id", label: "🆔 آيدي اللاعب", placeholder: "123456789", required: true }],
                    })
                  }
                >
                  ➕ حقل
                </Btn>
              </div>
              <p className="mt-1 text-[0.65rem] text-slate-500">
                مثال: آيدي اللاعب، اسم المستخدم… يسألها البوت قبل إنشاء الطلب.
              </p>
              <div className="mt-2 space-y-2">
                {(editing.fields ?? []).map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
                    <Input value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} placeholder="key" />
                    <Input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="التسمية" />
                    <Btn
                      size="sm"
                      variant="red"
                      onClick={() =>
                        setEditing({ ...editing, fields: (editing.fields ?? []).filter((_, idx) => idx !== i) })
                      }
                    >
                      🗑
                    </Btn>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* تعديل أسعار جماعي */}
      <Modal
        open={Boolean(bulk)}
        onClose={() => setBulk(null)}
        title="تعديل أسعار جماعي"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setBulk(null)}>
              إلغاء
            </Btn>
            <Btn
              variant="red"
              onClick={async () => {
                try {
                  const res = await apiPost<{ count: number }>("products/bulk", {
                    percent: Number(bulk?.percent ?? 0),
                    category_id: bulk?.category ? Number(bulk.category) : null,
                  });
                  toast(`تم تعديل ${res.count} منتج`);
                  setBulk(null);
                  reload();
                } catch (err) {
                  toast((err as Error).message, "err");
                }
              }}
            >
              تطبيق
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="نسبة التغيير %" hint="مثال: 5 لزيادة 5% أو -10 لتخفيض 10%">
            <Input type="number" value={bulk?.percent ?? ""} onChange={(e) => setBulk((b) => (b ? { ...b, percent: e.target.value } : b))} placeholder="5" />
          </Field>
          <Field label="القسم (اختياري)">
            <Select value={bulk?.category ?? ""} onChange={(e) => setBulk((b) => (b ? { ...b, category: e.target.value } : b))}>
              <option value="">كل الأقسام</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-[0.7rem] text-amber-300">⚠️ ينطبق فقط على المنتجات التي لها سعر محدد.</p>
        </div>
      </Modal>
    </div>
  );
}
