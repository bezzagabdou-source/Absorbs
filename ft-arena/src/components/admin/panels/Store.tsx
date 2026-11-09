"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Modal, Spinner, Toggle, api, toast } from "../ui";
import ImageField from "../ImageField";

type R = {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  cost: number;
  stock: number | null;
  image?: string;
  active: boolean;
  delivery: string;
  order: number;
};

const blank: R = {
  id: "",
  emoji: "🎁",
  title: "",
  desc: "",
  cost: 20,
  stock: null,
  image: "",
  active: true,
  delivery: "يُسلّم بعد الموافقة.",
  order: 99,
};

export default function Store() {
  const [list, setList] = useState<R[]>([]);
  const [edit, setEdit] = useState<R | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ rewards: R[] }>("/api/admin/rewards");
      setList(r.rewards);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await api("/api/admin/rewards", { op: "save", id: edit.id || undefined, reward: edit });
      toast("تم الحفظ ✅", "ok");
      setEdit(null);
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function op(action: string, id: string) {
    try {
      await api("/api/admin/rewards", { op: action, id });
      await load();
      toast("تم ✅", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card row-between wrap" style={{ padding: 14 }}>
        <div>
          <h3>🛍️ جوائز المتجر</h3>
          <div className="muted-2" style={{ fontSize: 11.5 }}>كل جائزة تظهر فورًا في البوت</div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>🔄 تحديث</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...blank })}>➕ جائزة جديدة</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {list.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, opacity: r.active ? 1 : 0.55 }}>
            {r.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.image}
                alt={r.title}
                style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 11, marginBottom: 10 }}
              />
            )}
            <div className="row-between">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 22 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{r.title}</div>
                  <div className="muted-2" style={{ fontSize: 11 }}>{r.desc}</div>
                </div>
              </div>
              <span className="badge badge-gold">{r.cost}</span>
            </div>
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="badge badge-muted">
                {r.stock === null ? "∞ متوفر" : `${r.stock} متبقي`}
              </span>
              <div className="row" style={{ gap: 5 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>تعديل</button>
                <button className="btn btn-ghost btn-sm" onClick={() => void op("toggle", r.id)}>
                  {r.active ? "إخفاء" : "إظهار"}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    if (confirm(`حذف «${r.title}»؟`)) void op("delete", r.id);
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div className="card"><Empty text="لا توجد جوائز — أضف أول جائزة." /></div>}

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? "تعديل الجائزة" : "جائزة جديدة"}
        width={620}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? <Spinner /> : "💾 حفظ ونشر"}
            </button>
          </>
        }
      >
        {edit && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <div style={{ width: 80 }}>
                <Field label="رمز">
                  <input className="input center" value={edit.emoji} onChange={(e) => setEdit({ ...edit, emoji: e.target.value.slice(0, 4) })} />
                </Field>
              </div>
              <div className="grow">
                <Field label="اسم الجائزة">
                  <input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="مثال: Netflix شهر" />
                </Field>
              </div>
            </div>
            <Field label="الوصف">
              <textarea className="textarea" rows={2} value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} />
            </Field>
            <div className="row" style={{ gap: 8 }}>
              <div className="grow">
                <Field label="السعر (نقاط)" hint="نتفليكس 20 • Google Play 35 • Coinbase 65-75 • بوت+موقع 100">
                  <input className="input" type="number" value={edit.cost} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="grow">
                <Field label="المخزون" hint="اتركه فارغًا = غير محدود">
                  <input
                    className="input"
                    type="number"
                    value={edit.stock ?? ""}
                    onChange={(e) => setEdit({ ...edit, stock: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
            <Field label="طريقة التسليم (تظهر للمستخدم)">
              <input className="input" value={edit.delivery} onChange={(e) => setEdit({ ...edit, delivery: e.target.value })} />
            </Field>
            <ImageField
              label="صورة الجائزة"
              value={edit.image ?? ""}
              onChange={(url) => setEdit({ ...edit, image: url })}
              promptHint={`بطاقة فاخرة ذهبية لجائزة ${edit.title || "الجائزة"}`}
            />
            <div style={{ marginTop: 12 }}>
              <Toggle on={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="الجائزة مفعّلة في البوت" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
