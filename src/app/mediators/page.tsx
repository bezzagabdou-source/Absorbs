"use client";
import { useEffect, useState } from "react";

const SECTIONS: Record<string, string> = {
  xr: "🛡️ وسطاء XR", bm: "⚔️ وسطاء BM", ft: "🎩 وسطاء FT",
  owners: "👑 وسطاء ومالكين", free: "🎁 مجانيين مؤقتاً", scammers: "🚨 منتحلين",
};

export default function MediatorsPanel() {
  const [data, setData] = useState<any>(null);
  const [cur, setCur] = useState("xr");
  const [form, setForm] = useState({ name: "", username: "", guarantee: "", note: "" });

  const refresh = () => fetch("/api/mediators").then((r) => r.json()).then(setData);
  useEffect(() => { refresh(); }, []);

  const act = async (body: any) => {
    await fetch("/api/mediators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    refresh();
  };

  if (!data) return <div style={{ padding: 40, color: "#fff" }}>جاري التحميل…</div>;
  const total = Object.values(data.sections).reduce((a: number, v: any) => a + v.length, 0);
  const glass: React.CSSProperties = { background: "rgba(255,255,255,.08)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 18, padding: 18, margin: "14px auto", maxWidth: 900, boxShadow: "0 8px 32px rgba(0,0,0,.35)" };
  const btn: React.CSSProperties = { background: "linear-gradient(90deg,#00c853,#00b0ff)", border: 0, color: "#fff", padding: "9px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 700 };
  const input: React.CSSProperties = { padding: 9, borderRadius: 10, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)", color: "#fff", margin: 4 };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", padding: 20, color: "#fff", background: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)" }}>
      <h1 style={{ textAlign: "center" }}>🛡️ لوحة تحكم بوت الوسطاء</h1>
      <div style={glass}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {[["👥 المستخدمين", data.users.length], ["🛡️ الوسطاء", total], ["🚨 منتحلين", data.sections.scammers.length]].map(([l, v]) => (
            <div key={l as string} style={{ flex: 1, minWidth: 140, textAlign: "center", background: "rgba(255,255,255,.1)", borderRadius: 14, padding: 16 }}>
              <b style={{ fontSize: 28, display: "block" }}>{v}</b>{l}
            </div>
          ))}
        </div>
      </div>
      <div style={glass}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {Object.entries(SECTIONS).map(([k, label]) => (
            <button key={k} onClick={() => setCur(k)} style={{ ...btn, background: k === cur ? "linear-gradient(90deg,#00c853,#00b0ff)" : "rgba(255,255,255,.12)" }}>{label}</button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          {(data.sections[cur] || []).map((it: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: 8, borderBottom: "1px solid rgba(255,255,255,.12)", flexWrap: "wrap" }}>
              <span>{it.note} {it.name} — <a style={{ color: "#4fc3f7" }} href={`https://t.me/${(it.username || "").replace("@", "")}`} target="_blank">{it.username}</a> {it.guarantee ? `— ضمانه: ${it.guarantee}` : ""}</span>
              <button onClick={() => act({ action: "del", section: cur, index: i })} style={{ ...btn, background: "linear-gradient(90deg,#ff1744,#ff9100)" }}>حذف</button>
            </div>
          ))}
          {(data.sections[cur] || []).length === 0 && <p>لا يوجد عناصر</p>}
        </div>
        <h3>➕ إضافة عنصر جديد</h3>
        <input style={input} placeholder="الاسم / اللقب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input style={input} placeholder="@username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input style={input} placeholder="الضمان (50$)" value={form.guarantee} onChange={(e) => setForm({ ...form, guarantee: e.target.value })} />
        <input style={input} placeholder="ملاحظة" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button style={btn} onClick={async () => { await act({ action: "add", section: cur, ...form }); setForm({ name: "", username: "", guarantee: "", note: "" }); }}>إضافة</button>
      </div>
    </div>
  );
}
