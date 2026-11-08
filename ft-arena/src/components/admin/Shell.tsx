"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toasts, toast } from "./ui";
import Brand from "./Brand";

export type Tab =
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
  | "tasks"
  | "activity";

/** كل قسم له صفحة مستقلة بمسارها الخاص */
export const ROUTES: Record<Tab, string> = {
  overview: "/admin",
  users: "/admin/users",
  store: "/admin/store",
  claims: "/admin/claims",
  contests: "/admin/contests",
  broadcast: "/admin/broadcast",
  settings: "/admin/settings",
  bot: "/admin/bot",
  library: "/admin/library",
  tasks: "/admin/tasks",
  activity: "/admin/activity",
  ai: "/admin/ai",
};

export const NAV: { id: Tab; icon: string; label: string; hint: string }[] = [
  { id: "overview", icon: "📊", label: "نظرة عامة", hint: "المؤشرات والرسوم" },
  { id: "users", icon: "👥", label: "الأعضاء", hint: "بحث وتعديل وحظر" },
  { id: "store", icon: "🛍️", label: "المتجر", hint: "الجوائز والأسعار" },
  { id: "claims", icon: "📦", label: "الطلبات", hint: "مراجعة وتسليم" },
  { id: "contests", icon: "🏅", label: "المسابقات", hint: "جوائز وفائزون" },
  { id: "broadcast", icon: "📢", label: "البث الجماعي", hint: "رسائل للجميع" },
  { id: "tasks", icon: "✅", label: "المهام", hint: "مهام النقاط اليومية" },
  { id: "settings", icon: "⚙️", label: "الإعدادات", hint: "النقاط والنصوص" },
  { id: "bot", icon: "🤖", label: "البوت والتشغيل", hint: "الاتصال والـwebhook" },
  { id: "library", icon: "🖼️", label: "المكتبة والصور", hint: "رفع وتوليد" },
  { id: "activity", icon: "📈", label: "السجل", hint: "كل الأحداث" },
];

/** أهم 5 أقسام للوصول السريع من شريط الهاتف السفلي */
const QUICK: { id: Tab; icon: string }[] = [
  { id: "overview", icon: "📊" },
  { id: "users", icon: "👥" },
  { id: "ai", icon: "🧠" },
  { id: "claims", icon: "📦" },
  { id: "store", icon: "🛍️" },
];

export default function Shell({ tab, children }: { tab: Tab; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [badges, setBadges] = useState<{ pending: number; store: string }>({ pending: 0, store: "" });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/stats?days=7", { cache: "no-store" });
        if (res.status === 401) return location.reload();
        const data = (await res.json()) as { stats?: { pendingClaims: number }; store?: string };
        if (alive) setBadges({ pending: data.stats?.pendingClaims ?? 0, store: data.store ?? "" });
      } catch {
        /* تجاهل */
      }
    }
    void load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // إغلاق القائمة عند تغيير الصفحة
  useEffect(() => setMenu(false), [pathname]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    toast("تم تسجيل الخروج", "ok");
    setTimeout(() => location.reload(), 400);
  }

  const current = NAV.find((n) => n.id === tab);
  const title = current?.label ?? "";
  const hint = current?.hint ?? "";

  return (
    <div className="shell">
      <Toasts />
      {menu && <div className="scrim" onClick={() => setMenu(false)} aria-hidden="true" />}

      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          <Brand />
          <div>
            <div style={{ fontWeight: 900, fontSize: 15.5 }}>مسابقات MX</div>
            <div className="muted-2" style={{ fontSize: 10.5 }}>
              لوحة التحكم
            </div>
          </div>
        </div>

        <Link href={ROUTES.ai} className={`nav-item ${tab === "ai" ? "active" : ""}`} style={{ marginBottom: 4 }}>
          <span className="ico">🧠</span>
          <span className="grow">الكونسول الذكي</span>
          <span className="badge badge-blue" style={{ fontSize: 9.5, padding: "2px 6px" }}>
            AI
          </span>
        </Link>

        <div className="nav-sep" />
        {NAV.map((n) => (
          <Link key={n.id} href={ROUTES[n.id]} className={`nav-item ${tab === n.id ? "active" : ""}`}>
            <span className="ico">{n.icon}</span>
            <span className="grow">{n.label}</span>
            {n.id === "claims" && badges.pending > 0 && (
              <span className="badge badge-red" style={{ fontSize: 10, padding: "1px 7px" }}>
                {badges.pending}
              </span>
            )}
          </Link>
        ))}

        <div style={{ marginTop: "auto" }}>
          <div className="nav-sep" />
          <div className="card-soft hide-xs" style={{ padding: 10, fontSize: 11 }}>
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
          <div className="row" style={{ minWidth: 0 }}>
            <button
              className="btn btn-ghost btn-icon mobile-only"
              onClick={() => setMenu(true)}
              aria-label="فتح القائمة"
            >
              ☰
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="page-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {title}
              </div>
              <div className="page-sub">{hint || "تحكم كامل في كل تفاصيل البوت — لحظيًا"}</div>
            </div>
          </div>
          <div className="row hide-xs">
            <a className="btn btn-ghost btn-sm" href="/" target="_blank" rel="noreferrer">
              🌐 الموقع
            </a>
            <Link className="btn btn-primary btn-sm" href={ROUTES.ai}>
              🧠 اطلب من الذكاء
            </Link>
          </div>
        </div>

        {children}
      </div>

      <nav className="tabbar" aria-label="تنقل سريع">
        {QUICK.map((q) => (
          <Link
            key={q.id}
            href={ROUTES[q.id]}
            className={tab === q.id ? "active" : ""}
            aria-current={tab === q.id ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            <span className="ico">{q.icon}</span>
            {q.id === "overview"
              ? "الرئيسية"
              : q.id === "users"
                ? "الأعضاء"
                : q.id === "ai"
                  ? "الذكاء"
                  : q.id === "claims"
                    ? "الطلبات"
                    : "المتجر"}
          </Link>
        ))}
        <button onClick={() => setMenu(true)} aria-label="المزيد">
          <span className="ico">☰</span>
          المزيد
        </button>
      </nav>
    </div>
  );
}
