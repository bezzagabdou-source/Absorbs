"use client";
import { useCallback, useEffect, useState } from "react";
import { Toasts, toast } from "./ui";
import Overview from "./panels/Overview";
import Users from "./panels/Users";
import Store from "./panels/Store";
import Claims from "./panels/Claims";
import SettingsPanel from "./panels/SettingsPanel";
import BroadcastPanel from "./panels/BroadcastPanel";
import AIConsole from "./panels/AIConsole";
import BotPanel from "./panels/BotPanel";
import ActivityPanel from "./panels/ActivityPanel";
import Contests from "./panels/Contests";
import Library from "./panels/Library";

type Tab =
  | "overview"
  | "users"
  | "store"
  | "claims"
  | "settings"
  | "broadcast"
  | "ai"
  | "bot"
  | "contests"
  | "library"
  | "activity";

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: "overview", icon: "📊", label: "نظرة عامة" },
  { id: "users", icon: "👥", label: "الأعضاء" },
  { id: "store", icon: "🛍️", label: "المتجر" },
  { id: "claims", icon: "📦", label: "الطلبات" },
  { id: "contests", icon: "🏅", label: "المسابقات" },
  { id: "broadcast", icon: "📢", label: "البث الجماعي" },
  { id: "settings", icon: "⚙️", label: "الإعدادات" },
  { id: "bot", icon: "🤖", label: "البوت والتشغيل" },
  { id: "library", icon: "🖼️", label: "المكتبة والصور" },
  { id: "activity", icon: "📈", label: "السجل" },
];

export default function Console() {
  const [tab, setTab] = useState<Tab>("overview");
  const [menu, setMenu] = useState(false);
  const [badges, setBadges] = useState<{ pending: number; store: string }>({ pending: 0, store: "" });

  const refreshBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats?days=7", { cache: "no-store" });
      if (res.status === 401) return location.reload();
      const data = (await res.json()) as { stats?: { pendingClaims: number }; store?: string };
      setBadges({ pending: data.stats?.pendingClaims ?? 0, store: data.store ?? "" });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshBadges();
    const t = setInterval(refreshBadges, 60000);
    return () => clearInterval(t);
  }, [refreshBadges]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    toast("تم تسجيل الخروج", "ok");
    setTimeout(() => location.reload(), 400);
  }

  const title = NAV.find((n) => n.id === tab)?.label ?? "";

  return (
    <div className="shell">
      <Toasts />
      <aside className={`sidebar ${menu ? "open" : ""}`} onClick={() => menu && setMenu(false)}>
        <div className="brand">
          <div className="brand-logo">🏆</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15.5 }}>FT Arena</div>
            <div className="muted-2" style={{ fontSize: 10.5 }}>لوحة التحكم الشاملة</div>
          </div>
        </div>

        <button className="nav-item" onClick={() => setTab("ai")} style={{ marginBottom: 4 }}>
          <span className="ico">🧠</span>
          <span className="grow">الكونسول الذكي</span>
          <span className="badge badge-blue" style={{ fontSize: 9.5, padding: "2px 6px" }}>AI</span>
        </button>
        <div className="nav-sep" />
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${tab === n.id ? "active" : ""}`}
            onClick={() => setTab(n.id)}
          >
            <span className="ico">{n.icon}</span>
            <span className="grow">{n.label}</span>
            {n.id === "claims" && badges.pending > 0 && (
              <span className="badge badge-red" style={{ fontSize: 10, padding: "1px 7px" }}>
                {badges.pending}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginTop: "auto" }}>
          <div className="nav-sep" />
          <div className="card-soft" style={{ padding: 10, fontSize: 11 }}>
            <div className="row" style={{ gap: 7 }}>
              <span className={`dot ${badges.store ? "" : "off"}`} />
              <span className="muted">التخزين: {badges.store || "…"}</span>
            </div>
          </div>
          <button className="nav-item" onClick={logout} style={{ color: "#ff9dab" }}>
            <span className="ico">🚪</span> خروج
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-icon mobile-only" onClick={() => setMenu(true)}>☰</button>
            <div>
              <div className="page-title">{title}</div>
              <div className="page-sub">تحكم كامل في كل تفاصيل البوت — لحظيًا</div>
            </div>
          </div>
          <div className="row">
            <a className="btn btn-ghost btn-sm" href="/" target="_blank">🌐 الموقع</a>
            <button className="btn btn-primary btn-sm" onClick={() => setTab("ai")}>🧠 اطلب من الذكاء</button>
          </div>
        </div>

        {tab === "overview" && <Overview onGoto={setTab} />}
        {tab === "users" && <Users />}
        {tab === "store" && <Store />}
        {tab === "claims" && <Claims onChange={refreshBadges} />}
        {tab === "contests" && <Contests />}
        {tab === "broadcast" && <BroadcastPanel />}
        {tab === "settings" && <SettingsPanel />}
        {tab === "bot" && <BotPanel />}
        {tab === "library" && <Library />}
        {tab === "activity" && <ActivityPanel />}
        {tab === "ai" && <AIConsole />}
      </div>
    </div>
  );
}
