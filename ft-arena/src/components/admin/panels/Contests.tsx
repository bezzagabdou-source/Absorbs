"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Modal, Spinner, api, toast } from "../ui";

type C = {
  id: string;
  title: string;
  desc: string;
  prize: string;
  winnersCount: number;
  endsAt: string;
  status: string;
  winners?: { userId: number; name: string; points: number }[];
};

const blank: C = {
  id: "",
  title: "",
  desc: "",
  prize: "جائزة",
  winnersCount: 3,
  endsAt: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16),
  status: "active",
};

export default function Contests() {
  const [list, setList] = useState<C[]>([]);
  const [edit, setEdit] = useState<C | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ contests: C[] }>("/api/admin/contests");
      setList(r.contests);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      await api("/api/admin/contests", {
        op: "save",
        id: edit.id || undefined,
        contest: { ...edit, endsAt: new Date(edit.endsAt).toISOString() },
      });
      toast("تم الحفظ ✅", "ok");
      setEdit(null);
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card row-between wrap" style={{ padding: 14 }}>
        <div>
          <h3>🏅 المسابقات</h3>
          <div className="muted-2" style={{ fontSize: 11.5 }}>تظهر مباشرة للمستخدمين في البوت</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...blank })}>➕ مسابقة</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {list.map((c) => (
          <div key={c.id} className="card" style={{ padding: 14, opacity: c.status === "active" ? 1 : 0.6 }}>
            <div className="row-between">
              <h3 style={{ fontSize: 15 }}>{c.title}</h3>
              <span className={`badge ${c.status === "active" ? "badge-green" : "badge-muted"}`}>
                {c.status === "active" ? "نشطة" : "منتهية"}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{c.desc}</p>
            <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
              <span className="badge badge-gold">🎁 {c.prize}</span>
              <span className="badge badge-muted">👑 {c.winnersCount} فائز</span>
              <span className="badge badge-blue">⏳ {new Date(c.endsAt).toLocaleDateString("ar-DZ")}</span>
            </div>
            {c.winners && (
              <div className="card-soft" style={{ padding: 8, marginTop: 8 }}>
                {c.winners.map((w, i) => (
                  <div key={w.userId} className="row-between" style={{ fontSize: 11.5 }}>
                    <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {w.name}</span>
                    <span className="gold">{w.points}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...c, endsAt: new Date(c.endsAt).toISOString().slice(0, 16) })}>تعديل</button>
              {c.status === "active" && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (!confirm("إنهاء المسابقة وتثبيت الفائزين؟")) return;
                    await api("/api/admin/contests", { op: "end", id: c.id });
                    await load();
                  }}
                >
                  🏁 إنهاء
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (!confirm("حذف؟")) return;
                  await api("/api/admin/contests", { op: "delete", id: c.id });
                  await load();
                }}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div className="card"><Empty text="لا توجد مسابقات." /></div>}

      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.id ? "تعديل المسابقة" : "مسابقة جديدة"}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>إلغاء</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "💾 حفظ"}</button>
          </>
        }
      >
        {edit && (
          <>
            <Field label="العنوان"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="الوصف"><textarea className="textarea" rows={3} value={edit.desc} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></Field>
            <div className="row">
              <Field label="الجائزة"><input className="input" value={edit.prize} onChange={(e) => setEdit({ ...edit, prize: e.target.value })} /></Field>
              <Field label="عدد الفائزين"><input className="input" type="number" value={edit.winnersCount} onChange={(e) => setEdit({ ...edit, winnersCount: Number(e.target.value) })} /></Field>
            </div>
            <Field label="تاريخ الانتهاء">
              <input className="input" type="datetime-local" value={edit.endsAt} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
