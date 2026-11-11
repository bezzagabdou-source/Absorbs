"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Spinner, Toggle, api, toast } from "../ui";

type Task = {
  id: string;
  emoji: string;
  title: string;
  type: "channel" | "link" | "custom";
  target: string;
  points: number;
  active: boolean;
  repeat: "once" | "daily";
  order: number;
};
type Wheel = { label: string; points: number; weight: number };

export default function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [wheel, setWheel] = useState<Wheel[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ tasks: Task[]; wheel: Wheel[] }>("/api/admin/settings");
      setTasks(r.tasks.sort((a, b) => a.order - b.order));
      setWheel(r.wheel);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function saveTask(t: Task) {
    setBusy(true);
    try {
      await api("/api/admin/tasks", { op: "save", id: t.id, task: t });
      toast("تم الحفظ ✅", "ok");
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api("/api/admin/tasks", { op: "delete", id });
    await load();
  }
  async function addTask() {
    await api("/api/admin/tasks", {
      op: "save",
      task: { emoji: "⭐️", title: "مهمة جديدة", points: 1, type: "custom", target: "", repeat: "once", active: true },
    });
    await load();
  }
  async function saveWheel() {
    setBusy(true);
    try {
      await api("/api/admin/settings", { wheel });
      toast("تم تحديث العجلة 🎡", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h3>✅ المهام</h3>
            <div className="muted-2" style={{ fontSize: 11.5 }}>مهام قنوات، روابط، أو يدوية — كل مهمة تمنح نقاطًا</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={addTask}>➕ مهمة</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {tasks.map((t) => (
            <div key={t.id} className="card-soft" style={{ padding: 12 }}>
              <div className="row">
                <input
                  className="input center"
                  style={{ width: 58 }}
                  value={t.emoji}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, emoji: e.target.value } : x)))}
                />
                <input
                  className="input grow"
                  value={t.title}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, title: e.target.value } : x)))}
                />
                <input
                  className="input"
                  style={{ width: 70 }}
                  type="number"
                  value={t.points}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, points: Number(e.target.value) } : x)))}
                />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <select
                  className="select"
                  style={{ width: 130 }}
                  value={t.type}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, type: e.target.value as Task["type"] } : x)))}
                >
                  <option value="custom">يدوية</option>
                  <option value="channel">قناة</option>
                  <option value="link">رابط</option>
                </select>
                <input
                  className="input grow"
                  placeholder="@channel أو رابط"
                  value={t.target}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, target: e.target.value } : x)))}
                />
                <select
                  className="select"
                  style={{ width: 110 }}
                  value={t.repeat}
                  onChange={(e) => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, repeat: e.target.value as Task["repeat"] } : x)))}
                >
                  <option value="once">مرة</option>
                  <option value="daily">يوميًا</option>
                </select>
              </div>
              <div className="row-between" style={{ marginTop: 10 }}>
                <button
                  className={`toggle`}
                  data-on={t.active}
                  onClick={() => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)))}
                  aria-label="تفعيل"
                />
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-danger btn-sm" onClick={() => void remove(t.id)}>🗑️</button>
                  <button className="btn btn-emerald btn-sm" disabled={busy} onClick={() => void saveTask(t)}>حفظ</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {!tasks.length && <Empty text="لا توجد مهام." />}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <div>
            <h3>🎡 عجلة الحظ — الجوائز والاحتمالات</h3>
            <div className="muted-2" style={{ fontSize: 11.5 }}>الوزن الأعلى = احتمال أكبر. مثال: 30 يعني 30 فرصة نسبية.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveWheel} disabled={busy}>💾 حفظ العجلة</button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {wheel.map((w, i) => (
            <div key={i} className="card-soft" style={{ padding: 10 }}>
              <div className="row">
                <input
                  className="input grow"
                  value={w.label}
                  onChange={(e) => setWheel(wheel.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="input"
                  style={{ width: 70 }}
                  type="number"
                  value={w.points}
                  onChange={(e) => setWheel(wheel.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)))}
                />
                <input
                  className="input"
                  style={{ width: 70 }}
                  type="number"
                  value={w.weight}
                  onChange={(e) => setWheel(wheel.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setWheel(wheel.filter((_, j) => j !== i))}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setWheel([...wheel, { label: "جائزة", points: 1, weight: 10 }])}>
          ➕ قطاع جديد
        </button>
      </div>
    </div>
  );
}
