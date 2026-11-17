"use client";

import { useRef, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  Toggle,
  apiPost,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type Category = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  section: string;
  description: string;
  image_url: string | null;
  sort: number;
  active: boolean;
  products_count: number;
};

const SECTIONS = [
  { key: "games", label: "🎮 ألعاب" },
  { key: "services", label: "⭐️ خدمات" },
  { key: "digital", label: "🗂 منتجات رقمية" },
];

export default function CategoriesPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<{ ok: boolean; categories: Category[] }>("categories");
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, node } = useConfirm();

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast("اسم القسم مطلوب", "err");
      return;
    }
    try {
      const payload = {
        name: editing.name,
        emoji: editing.emoji ?? "📦",
        section: editing.section ?? "games",
        description: editing.description ?? "",
        image_url: editing.image_url ?? "",
        sort: Number(editing.sort ?? 99),
        active: editing.active ?? true,
        slug: editing.slug,
      };
      if (editing.id) await apiPost(`categories/${editing.id}`, payload);
      else await apiPost("categories", payload);
      toast("تم الحفظ ✅");
      setEditing(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiPost<{ url: string }>("upload", form);
      setEditing((prev) => (prev ? { ...prev, image_url: res.url } : prev));
      toast("تم رفع الصورة");
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setUploading(false);
    }
  };

  const categories = data?.categories ?? [];

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">الأقسام</h1>
          <p className="mt-1 text-xs text-emerald-900/65">أقسام المتجر كما تظهر في أزرار البوت — أضف/عدّل/رتّب</p>
        </div>
        <Btn onClick={() => setEditing({ name: "", emoji: "📦", section: "games", active: true, sort: 99 })}>
          ➕ قسم جديد
        </Btn>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : categories.length === 0 ? (
        <Empty icon="🗂" title="لا أقسام" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => (
            <Card key={c.id} className="!p-0 overflow-hidden">
              <div className="relative h-28 bg-white/65">
                {c.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={c.image_url} alt={c.name} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="grid h-full place-items-center text-4xl opacity-50">{c.emoji}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1118] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3">
                  <p className="text-sm font-black text-emerald-950">
                    {c.emoji} {c.name}
                  </p>
                  <Badge tone={c.active ? "emerald" : "red"}>{c.active ? "ظاهر" : "مخفي"}</Badge>
                </div>
              </div>
              <div className="p-3">
                <p className="line-clamp-2 min-h-[2rem] text-[0.7rem] text-emerald-900/65">{c.description || "بدون وصف"}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[0.68rem] text-emerald-900/55">
                    {c.products_count} منتج • {SECTIONS.find((s) => s.key === c.section)?.label ?? c.section}
                  </span>
                  <div className="flex gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => setEditing({ ...c })}>
                      ✏️
                    </Btn>
                    <Btn
                      size="sm"
                      variant="red"
                      onClick={() =>
                        confirm(`حذف القسم «${c.name}» وكل منتجاته؟`, async () => {
                          try {
                            await apiPost(`categories/${c.id}/delete`);
                            toast("تم حذف القسم");
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل القسم" : "قسم جديد"}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Btn>
            <Btn onClick={save}>💾 حفظ</Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
              <Field label="إيموجي">
                <Input value={editing.emoji ?? ""} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} />
              </Field>
              <Field label="اسم القسم">
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="فري فاير" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="النوع">
                <Select value={editing.section ?? "games"} onChange={(e) => setEditing({ ...editing, section: e.target.value })}>
                  {SECTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="الترتيب">
                <Input type="number" value={editing.sort ?? 99} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="الوصف">
              <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="صورة القسم (تظهر في البوت والموقع)">
              <div className="flex gap-2">
                <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="/catalog/freefire.jpg" />
                <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "…" : "📤"}
                </Btn>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </Field>
            <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label="ظاهر في المتجر" />
          </div>
        )}
      </Modal>
    </div>
  );
}
