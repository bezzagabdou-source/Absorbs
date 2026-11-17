"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Toaster, apiGet, apiPost, toast } from "@/components/ui";

type NavItem = { href: string; label: string; icon: string; badge?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "القيادة",
    items: [
      { href: "/admin", label: "لوحة القيادة", icon: "📊", badge: true },
      { href: "/admin/analytics", label: "التحليلات", icon: "📈" },
      { href: "/admin/orders", label: "الطلبات", icon: "🧾", badge: true },
      { href: "/admin/tasks", label: "مهام المالك", icon: "🗒" },
      { href: "/admin/activity", label: "الأشخاص النشطون", icon: "👀" },
      { href: "/admin/search", label: "البحث الشامل", icon: "🔎" },
      { href: "/admin/tools", label: "أدوات سريعة", icon: "🧰" },
    ],
  },
  {
    title: "المتجر",
    items: [
      { href: "/admin/products", label: "المنتجات", icon: "📦" },
      { href: "/admin/categories", label: "الأقسام", icon: "🗂" },
      { href: "/admin/wallets", label: "طرق الدفع", icon: "💳" },
      { href: "/admin/coupons", label: "أكواد الخصم", icon: "🎟" },
    ],
  },
  {
    title: "الزبائن",
    items: [
      { href: "/admin/users", label: "المستخدمون", icon: "👥" },
      { href: "/admin/reviews", label: "التقييمات", icon: "⭐️" },
      { href: "/admin/faq", label: "الأسئلة الشائعة", icon: "❓" },
    ],
  },
  {
    title: "الحماية",
    items: [
      { href: "/admin/security", label: "مركز الحماية", icon: "🛡" },
      { href: "/admin/gate", label: "بوابة الاشتراك", icon: "🔒" },
      { href: "/admin/channels", label: "قنوات الاشتراك", icon: "📣" },
      { href: "/admin/logs", label: "سجل النشاطات", icon: "📜" },
    ],
  },
  {
    title: "الذكاء الاصطناعي",
    items: [
      { href: "/admin/ai", label: "شينوي AI", icon: "🧠" },
      { href: "/admin/prompts", label: "مكتبة البرومتات", icon: "🧩" },
      { href: "/admin/keys", label: "مفاتيح AI", icon: "🔑" },
      { href: "/admin/emoji", label: "إيموجي متحرك", icon: "✨" },
    ],
  },
  {
    title: "النظام",
    items: [
      { href: "/admin/broadcast", label: "الإذاعة الجماعية", icon: "📢" },
      { href: "/admin/health", label: "صحة النظام", icon: "🩺" },
      { href: "/admin/backup", label: "النسخ الاحتياطي", icon: "💾" },
      { href: "/admin/media", label: "الوسائط", icon: "🖼" },
      { href: "/admin/setup", label: "الربط والتشغيل", icon: "🔗" },
      { href: "/admin/settings", label: "الإعدادات", icon: "⚙️" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

type SessionInfo = { store?: string; site?: string; botUsername?: string; owner?: string };

export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo>({});
  const [pending, setPending] = useState(0);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    apiGet<SessionInfo & { ok: boolean }>("session")
      .then(setSession)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiGet<{ pending: number }>("dashboard")
        .then((d) => alive && setPending(d.pending ?? 0))
        .catch(() => {});
    load();
    const id = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pathname]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const logout = async () => {
    await apiPost("logout").catch(() => {});
    toast("تم تسجيل الخروج 👋");
    router.push("/admin/login");
  };

  const botLink = session.botUsername ? `https://t.me/${session.botUsername}` : `https://t.me/${session.owner ?? "F_Q_Q_T"}`;
  const current = ALL.find((i) => (i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href)));

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.label.includes(term) || i.href.includes(term)) })).filter(
      (g) => g.items.length > 0,
    );
  }, [query]);

  return (
    <div className="relative min-h-screen lg:flex">
      <Toaster />

      {/* هالات زجاجية في الخلفية */}
      <div className="aurora-blob" style={{ width: 420, height: 420, top: -90, right: -60, background: "rgba(16,185,129,.45)" }} />
      <div className="aurora-blob" style={{ width: 380, height: 380, bottom: -120, left: -80, background: "rgba(56,189,248,.4)", animationDelay: "3s" }} />
      <div className="aurora-blob" style={{ width: 300, height: 300, top: "45%", left: "55%", background: "rgba(244,114,182,.28)", animationDelay: "6s" }} />

      {/* الشريط الجانبي الزجاجي */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[19rem] border-l border-white/70 bg-white/80 backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0 shadow-2xl" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* الشعار في سقف اللوحة */}
          <div className="relative overflow-hidden border-b border-white/70 px-4 py-5">
            <div className="absolute -left-10 -top-12 h-32 w-32 rounded-full bg-emerald-300/40 blur-2xl" />
            <Link href="/admin" className="relative flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/catalog/logo.png"
                alt="CHINWI STORE"
                className="h-14 w-14 rounded-2xl border border-white/80 object-cover shadow-lg shadow-emerald-500/25"
              />
              <div className="min-w-0">
                <p className="truncate text-base font-black gradient-text">{session.store ?? "CHINWI STORE"}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[0.68rem] font-bold text-emerald-900/60">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
                  لوحة تحكم شاملة
                </p>
              </div>
            </Link>
          </div>

          {/* بحث */}
          <div className="px-3 pt-3">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن صفحة…"
                className="field pe-9 text-[0.8rem]"
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-emerald-900/40">🔎</span>
            </div>
          </div>

          {/* التنقل */}
          <nav className="mt-2 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
            {filtered.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 px-2 text-[0.62rem] font-black uppercase tracking-widest text-emerald-900/35">
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group flex items-center gap-2.5 rounded-2xl px-3 py-2 text-[0.83rem] font-bold transition ${
                          active
                            ? "bg-gradient-to-l from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
                            : "text-emerald-900/75 hover:bg-white hover:text-emerald-950 hover:shadow-sm"
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl text-sm ${active ? "bg-white/25" : "bg-white/80"}`}>
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && pending > 0 && item.href === "/admin/orders" && (
                          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[0.6rem] font-black text-white">{pending}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* تذييل الشريط */}
          <div className="border-t border-white/70 p-3">
            <a
              href={botLink}
              target="_blank"
              rel="noreferrer"
              className="mb-2 flex items-center justify-between rounded-2xl bg-gradient-to-l from-emerald-500/15 to-teal-500/10 px-3 py-2 text-[0.78rem] font-black text-emerald-800 hover:from-emerald-500/25"
            >
              <span>فتح البوت في تيليجرام</span>
              <span>↗</span>
            </a>
            <button onClick={logout} className="btn btn-red w-full py-2 text-[0.78rem]">
              🚪 تسجيل الخروج
            </button>
          </div>
        </div>
      </aside>

      {/* المحتوى */}
      <div className="relative z-10 min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-2">
            <button className="icon-btn lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="القائمة">
              ☰
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-emerald-950">
                {current?.icon} {current?.label ?? "لوحة التحكم"}
              </p>
              <p className="truncate text-[0.66rem] font-bold text-emerald-900/45">
                {now.toLocaleDateString("ar-DZ", { weekday: "long", day: "numeric", month: "long" })} • {now.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <Link href="/admin/ai" className="btn btn-ghost hidden py-1.5 text-[0.75rem] sm:inline-flex">
              🧠 اسأل شينوي AI
            </Link>
            <Link href="/admin/security" className="icon-btn" title="مركز الحماية">
              🛡
            </Link>
            <a href={botLink} target="_blank" rel="noreferrer" className="icon-btn" title="البوت">
              ✈️
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
