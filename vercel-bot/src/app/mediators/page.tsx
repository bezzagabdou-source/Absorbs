"use client";
import { useCallback, useEffect, useState } from "react";

const SECTIONS: Record<string, string> = {
  xr: "🛡️ وسطاء XR", bm: "⚔️ وسطاء BM", ft: "🎩 وسطاء FT",
  owners: "👑 المالكين", free: "🎁 المجانيين", scammers: "🚨 قائمة المحتالين",
};
type Item = { name: string; username: string; guarantee: string; note: string };
type Form = Item;
const emptyForm: Form = { name: "", username: "", guarantee: "", note: "🔹" };
const panel: React.CSSProperties = { background: "rgba(255,255,255,.88)", border: "1px solid #e1eee5", borderRadius: 26, padding: 24, boxShadow: "0 16px 45px #1a573014" };
const greenBtn: React.CSSProperties = { background: "linear-gradient(135deg,#178a52,#26ad6b)", color: "white", border: 0, borderRadius: 999, padding: "12px 20px", fontWeight: 800, cursor: "pointer", boxShadow: "0 7px 18px #178a5230" };
const softBtn: React.CSSProperties = { background: "#eef7f0", color: "#286346", border: "1px solid #d9eadf", borderRadius: 999, padding: "10px 16px", fontWeight: 750, cursor: "pointer" };
const field: React.CSSProperties = { boxSizing: "border-box", padding: "13px 15px", border: "1px solid #dbe9df", background: "#fbfefc", borderRadius: 15, width: "100%", color: "#173b2d", outlineColor: "#33a66b", font: "inherit" };

export default function MediatorsPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [data, setData] = useState<any>(null);
  const [visitorData, setVisitorData] = useState<any>({ visitors: [], botUsers: [], counts: {} });
  const [tab, setTab] = useState("xr");
  const [visitorTab, setVisitorTab] = useState("bot");
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState({ xr_info: "", bm_info: "", ft_info: "" });
  const [welcome, setWelcome] = useState("");
  const [botName, setBotName] = useState("");
  const [broadcast, setBroadcast] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, v] = await Promise.all([
      fetch("/api/mediators", { cache: "no-store" }),
      fetch("/api/visitors", { cache: "no-store" }),
    ]);
    if (d.status === 401 || v.status === 401) { setAuthenticated(false); return; }
    const [dj, vj] = await Promise.all([d.json(), v.json()]);
    if (!d.ok || !v.ok) throw new Error(dj.error || vj.error || "تعذر تحميل البيانات");
    setData(dj); setVisitorData(vj); setConfigured(true);
    setWelcome(dj.welcome || ""); setBotName(dj.bot_name || "");
    setInfo({ xr_info: JSON.stringify(dj.xr_info || {}, null, 2), bm_info: JSON.stringify(dj.bm_info || {}, null, 2), ft_info: JSON.stringify(dj.ft_info || {}, null, 2) });
  }, []);

  useEffect(() => {
    fetch("/api/admin-auth", { cache: "no-store" }).then((r) => r.json()).then(async (j) => {
      setConfigured(j.configured);
      if (j.authenticated) { setAuthenticated(true); try { await load(); } catch (e: any) { setNotice(e.message); } }
    }).catch(() => setConfigured(false));
  }, [load]);
  useEffect(() => {
    if (!authenticated) return;
    const timer = setInterval(() => load().catch((e: any) => setNotice(e.message)), 12000);
    return () => clearInterval(timer);
  }, [authenticated, load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setLoginError("");
    const res = await fetch("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const j = await res.json();
    if (!res.ok) { setLoginError(j.error || "تعذر تسجيل الدخول"); return; }
    setAuthenticated(true); setPassword("");
    try { await load(); } catch (error: any) { setNotice(error.message || "تعذر الاتصال بقاعدة البيانات"); }
  };
  const act = async (body: any) => {
    setBusy(true); setNotice("");
    try {
      const r = await fetch("/api/mediators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "فشل الحفظ");
      await load(); setNotice("تم الحفظ بنجاح ✅");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };
  const saveInfo = async (key: "xr_info" | "bm_info" | "ft_info") => {
    try { await act({ action: "update_info", key, value: JSON.parse(info[key]) }); }
    catch (e: any) { setNotice(e instanceof SyntaxError ? "صيغة JSON غير صحيحة" : e.message); }
  };
  const deleteVisitor = async (type: "site" | "bot", id: string) => {
    if (!confirm("حذف هذا السجل نهائياً؟")) return;
    const r = await fetch("/api/visitors", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }) });
    const j = await r.json(); if (!r.ok) { setNotice(j.error || "تعذر الحذف"); return; }
    await load(); setNotice("تم حذف السجل ✅");
  };
  const doBroadcast = async () => {
    if (!broadcast.trim() || !confirm(`إرسال الرسالة إلى ${visitorData.botUsers.length} مستخدم في البوت؟`)) return;
    setBusy(true); setNotice("");
    try {
      const r = await fetch("/api/broadcast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: broadcast }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "فشل الإرسال");
      setNotice(`تم الإرسال إلى ${j.sent} مستخدم، تعذر ${j.failed} من أصل ${j.total} ✅`); setBroadcast("");
    } catch (e: any) { setNotice(e.message); }
    finally { setBusy(false); }
  };

  if (!configured) return <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#edf8f0", color: "#173b2d", fontFamily: "system-ui" }}><div style={{ ...panel, maxWidth: 520 }}><h2>إعداد لوحة التحكم</h2><p>أضف متغيري DATABASE_URL و ADMIN_PASSWORD إلى مشروع Vercel ثم أعد النشر.</p></div></main>;
  if (!authenticated) return <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 22, background: "radial-gradient(circle at 10% 10%,#d5f3df,transparent 35%),linear-gradient(135deg,#f7fcf8,#e6f5eb)", color: "#173b2d", fontFamily: "system-ui" }}><form onSubmit={login} style={{ ...panel, width: "min(420px,100%)", boxSizing: "border-box" }}><div style={{ fontSize: 42 }}>🛡️</div><h1 style={{ marginBottom: 6 }}>لوحة الوسطاء</h1><p style={{ color: "#668273", marginTop: 0 }}>سجّل دخولك للوصول إلى الإدارة والإحصائيات</p><input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة مرور الإدارة" style={{ ...field, margin: "16px 0" }} /><button style={{ ...greenBtn, width: "100%" }}>دخول آمن</button>{loginError && <p style={{ color: "#c83737" }}>{loginError}</p>}</form></main>;
  if (!data) return <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f2faf4", color: "#286346", fontFamily: "system-ui" }}><div style={panel}><p>{notice || "جاري تجهيز لوحة الإدارة…"}</p><button style={greenBtn} onClick={() => load().catch((e: any) => setNotice(e.message))}>إعادة المحاولة</button></div></main>;

  const sectionsTotal = Object.values(data.sections || {}).reduce((sum: number, items: any) => sum + items.length, 0);
  const currentItems: Item[] = data.sections?.[tab] || [];
  const filtered = currentItems.map((item, index) => ({ item, index })).filter(({ item }) => `${item.name} ${item.username} ${item.guarantee}`.toLowerCase().includes(search.toLowerCase()));
  const navItems = [{ id: "xr", name: SECTIONS.xr }, { id: "bm", name: SECTIONS.bm }, { id: "ft", name: SECTIONS.ft }, { id: "owners", name: SECTIONS.owners }, { id: "free", name: SECTIONS.free }, { id: "scammers", name: SECTIONS.scammers }, { id: "visitors", name: "👥 الزوار والحسابات" }, { id: "settings", name: "⚙️ إعدادات البوت" }, { id: "broadcast", name: "📣 رسالة جماعية" }];
  const count = visitorData.counts || {};
  const cardStyle: React.CSSProperties = { ...panel, padding: "20px 23px", flex: "1 1 190px" };
  const smallTitle: React.CSSProperties = { margin: "0 0 8px", color: "#678675", fontSize: 14 };
  const saveItem = async () => {
    await act({ action: editing === null ? "add" : "update", section: tab, index: editing, ...form });
    setForm(emptyForm); setEditing(null);
  };

  return <main dir="rtl" style={{ minHeight: "100vh", padding: "24px clamp(14px,3vw,48px) 48px", color: "#183b2d", background: "radial-gradient(ellipse at 0 0,#d9f6e2 0,transparent 32%),radial-gradient(ellipse at 100% 20%,#e8f4d7 0,transparent 30%),linear-gradient(135deg,#f7fcf8,#edf8f1 55%,#f8fcf8)", fontFamily: "system-ui,-apple-system,sans-serif" }}>
    <header style={{ maxWidth: 1440, margin: "0 auto 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
      <div><div style={{ color: "#178a52", fontWeight: 850, letterSpacing: 1 }}>MEDIATORS · ADMIN CENTER</div><h1 style={{ margin: "4px 0", fontSize: "clamp(27px,4vw,42px)" }}>🛡️ مركز التحكم الشامل</h1><span style={{ color: "#718c7d" }}>إدارة الأقسام والزوار وإعدادات البوت من مكان واحد</span></div>
      <button style={softBtn} onClick={async () => { await fetch("/api/admin-auth", { method: "DELETE" }); setAuthenticated(false); }}>خروج آمن ↗</button>
    </header>
    <div className="admin-layout" style={{ maxWidth: 1440, margin: "auto", display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <nav className="admin-nav" aria-label="أقسام لوحة التحكم" style={{ ...panel, flex: "0 0 230px", padding: 14, display: "grid", gap: 7, position: "sticky", top: 14 }}>
        {navItems.map((n) => <button key={n.id} onClick={() => { setTab(n.id); setSearch(""); setEditing(null); setForm(emptyForm); }} style={{ ...(tab === n.id ? greenBtn : softBtn), width: "100%", textAlign: "right", borderRadius: 16, boxShadow: tab === n.id ? greenBtn.boxShadow : "none" }}>{n.name}</button>)}
      </nav>
      <section style={{ flex: "1 1 700px", minWidth: 0, display: "grid", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[{ label: "زوار الموقع", val: count.visitors || 0, icon: "🌐" }, { label: "مشاهدات الصفحات", val: count.page_views || 0, icon: "📈" }, { label: "حسابات تيليغرام", val: count.bot_users || 0, icon: "💬" }, { label: "عناصر الأقسام", val: sectionsTotal, icon: "🛡️" }].map((c) => <article key={c.label} style={cardStyle}><p style={smallTitle}>{c.icon} {c.label}</p><strong style={{ fontSize: 34 }}>{c.val}</strong></article>)}
        </div>
        {notice && <div role="status" style={{ ...panel, padding: 14, color: notice.includes("تعذر") || notice.includes("فشل") ? "#b33939" : "#16834d" }}>{notice}</div>}

        {SECTIONS[tab] && <>
          <div style={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>{SECTIONS[tab]}</h2><p style={{ margin: "5px 0 0", color: "#718c7d" }}>{currentItems.length} عنصر · يمكنك تعديل البيانات أو حذفها</p></div><input style={{ ...field, maxWidth: 300 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔎 بحث بالاسم أو الحساب…" /></div>
          <div style={{ display: "grid", gap: 12 }}>{filtered.map(({ item, index }) => <article key={`${item.username}-${index}`} style={{ ...panel, padding: 18, display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}>
            <div><strong style={{ fontSize: 18 }}>{item.note} {item.name || "بدون اسم"}</strong><div style={{ marginTop: 5, color: "#5d796a" }}>{item.username || "لا يوجد حساب"} {item.guarantee && ` · الضمان ${item.guarantee}`}</div></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={softBtn} onClick={() => { setEditing(index); setForm({ ...emptyForm, ...item }); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>✏️ تعديل</button><button style={{ ...softBtn, color: "#bd4343", background: "#fff1ef", borderColor: "#f4d4ce" }} onClick={() => { if (confirm(`حذف ${item.name || item.username || "هذا العنصر"}؟`)) act({ action: "del", section: tab, index }); }}>🗑️ حذف</button></div>
          </article>)}{filtered.length === 0 && <div style={panel}>لا توجد نتائج مطابقة.</div>}</div>
          <div style={panel}><h3 style={{ marginTop: 0 }}>{editing === null ? "➕ إضافة عنصر جديد" : `✏️ تعديل ${form.name}`}</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
            <input style={field} placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input style={field} placeholder="@username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /><input style={field} placeholder="الضمان" value={form.guarantee} onChange={(e) => setForm({ ...form, guarantee: e.target.value })} /><input style={field} placeholder="إيموجي / ملاحظة" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div><div style={{ display: "flex", gap: 10, marginTop: 13 }}><button disabled={busy} style={greenBtn} onClick={saveItem}>{busy ? "يحفظ…" : editing === null ? "حفظ وإضافة" : "حفظ التعديل"}</button>{editing !== null && <button style={softBtn} onClick={() => { setEditing(null); setForm(emptyForm); }}>إلغاء</button>}</div></div>
        </>}

        {tab === "visitors" && <>
          <div style={panel}><h2 style={{ marginTop: 0 }}>👥 الزوار والحسابات</h2><p style={{ color: "#6e8979" }}>تُحدّث القائمة تلقائياً كل 12 ثانية. زوار الموقع يظهرون كمعرّف متصفح عشوائي بعد موافقتهم؛ حساب تيليغرام يظهر عند بدء البوت فقط. لا نحفظ عنوان IP.</p><div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}><button style={visitorTab === "bot" ? greenBtn : softBtn} onClick={() => setVisitorTab("bot")}>حسابات تيليغرام ({visitorData.botUsers.length})</button><button style={visitorTab === "site" ? greenBtn : softBtn} onClick={() => setVisitorTab("site")}>زيارات الموقع ({visitorData.visitors.length})</button></div></div>
          {visitorTab === "bot" ? <div style={{ display: "grid", gap: 10 }}>{visitorData.botUsers.map((u: any) => <article key={u.id} style={{ ...panel, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>👤 {u.first_name} {u.last_name}</strong><div style={{ color: "#63806f" }}>{u.username ? `@${u.username}` : `Telegram ID: ${u.id}`}</div></div><div style={{ color: "#718c7d", textAlign: "left" }}>بدء البوت {u.starts} مرة<br />آخر ظهور: {new Date(u.last_seen).toLocaleString("ar")}<br /><button style={{ ...softBtn, color: "#bd4343", marginTop: 6 }} onClick={() => deleteVisitor("bot", u.id)}>حذف الحساب</button></div></article>)}{!visitorData.botUsers.length && <div style={panel}>سيظهر الحساب هنا عند ضغط المستخدم على /start في البوت.</div>}</div> : <div style={{ display: "grid", gap: 10 }}>{visitorData.visitors.map((v: any) => <article key={v.id} style={{ ...panel, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}><div><strong>🌐 زائر {v.id.slice(0, 8)}</strong><div style={{ color: "#63806f", overflowWrap: "anywhere" }}>آخر صفحة: {v.last_path} · {v.visits} زيارة</div><small style={{ color: "#82998c" }}>{v.user_agent}</small></div><div style={{ color: "#718c7d", textAlign: "left" }}>{new Date(v.last_seen).toLocaleString("ar")}<br /><button style={{ ...softBtn, color: "#bd4343", marginTop: 6 }} onClick={() => deleteVisitor("site", v.id)}>حذف الزيارة</button></div></article>)}{!visitorData.visitors.length && <div style={panel}>لا توجد زيارات مسجلة بعد. الزوار يختارون «موافق» على رسالة الخصوصية لتفعيل الإحصاء.</div>}</div>}
        </>}

        {tab === "settings" && <>
          <div style={panel}><h2 style={{ marginTop: 0 }}>⚙️ إعدادات ورسالة البوت</h2><label style={{ display: "grid", gap: 8, marginBottom: 15 }}>اسم البوت<input style={field} value={botName} onChange={(e) => setBotName(e.target.value)} /></label><label style={{ display: "grid", gap: 8, marginBottom: 12 }}>رسالة الترحيب<input style={field} value={welcome} onChange={(e) => setWelcome(e.target.value)} /></label><button style={greenBtn} onClick={() => act({ action: "update_setting", key: "bot_name", value: botName }).then(() => act({ action: "update_setting", key: "welcome", value: welcome }))}>حفظ النصوص</button></div>
          {(["xr_info", "bm_info", "ft_info"] as const).map((key) => <div key={key} style={panel}><h3 style={{ marginTop: 0 }}>بيانات {key.replace("_info", "").toUpperCase()}</h3><textarea style={{ ...field, minHeight: 170, fontFamily: "ui-monospace,monospace", direction: "ltr" }} value={info[key]} onChange={(e) => setInfo({ ...info, [key]: e.target.value })} /><button style={{ ...greenBtn, marginTop: 12 }} onClick={() => saveInfo(key)}>حفظ معلومات القسم</button></div>)}
        </>}

        {tab === "broadcast" && <div style={panel}><h2 style={{ marginTop: 0 }}>📣 إرسال رسالة جماعية</h2><p style={{ color: "#718c7d" }}>تُرسل الرسالة إلى حسابات تيليغرام التي بدأت البوت ({visitorData.botUsers.length}). استخدمها للإعلانات المهمة فقط.</p><textarea style={{ ...field, minHeight: 180 }} value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="اكتب الرسالة هنا…" /><button disabled={busy || !broadcast.trim()} style={{ ...greenBtn, marginTop: 14, opacity: busy || !broadcast.trim() ? .6 : 1 }} onClick={doBroadcast}>{busy ? "جارٍ الإرسال…" : "إرسال للجميع"}</button></div>}
      </section>
    </div>
    <style jsx>{`
      @media (max-width: 760px) {
        .admin-layout { display: block !important; }
        .admin-nav { position: static !important; display: flex !important; flex-wrap: nowrap !important; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: auto; margin-bottom: 16px; gap: 8px !important; overscroll-behavior-inline: contain; scrollbar-width: thin; }
        .admin-nav :global(button) { width: auto !important; flex: 0 0 auto; white-space: nowrap; text-align: center !important; }
        .admin-layout > section { width: 100%; }
      }
    `}</style>
  </main>;
}
