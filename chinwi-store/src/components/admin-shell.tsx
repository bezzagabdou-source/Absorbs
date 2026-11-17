"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster, apiGet, apiPost, toast } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "لوحة القيادة", icon: "📊" },
  { href: "/admin/orders", label: "الطلبات", icon: "🧾" },
  { href: "/admin/users", label: "المستخدمون", icon: "👥" },
  { href: "/admin/products", label: "المنتجات", icon: "📦" },
  { href: "/admin/categories", label: "الأقسام", icon: "🗂" },
  { href: "/admin/wallets", label: "طرق الدفع", icon: "💳" },
  { href: "/admin/channels", label: "قنوات الاشتراك", icon: "🔒" },
  { href: "/admin/ai", label: "الذكاء الاصطناعي", icon: "🧠" },
  { href: "/admin/broadcast", label: "الإذاعة", icon: "📢" },
  { href: "/admin/setup", label: "الربط والتشغيل", icon: "🔗" },
  { href: "/admin/logs", label: "السجلات", icon: "📜" },
  { href: "/admin/settings", label: "الإعدادات", icon: "⚙️" },
];

type SessionInfo = { store?: string; site?: string; botUsername?: string; owner?: string };

export function AdminShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo>({});
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  const logout = async () => {
    await apiPost("logout").catch(() => {});
    toast("تم تسجيل الخروج");
    router.push("/admin/login");
  };

  const botLink = session.botUsername ? `https://t.me/${session.botUsername}` : `https://t.me/${session.owner ?? "F_Q_Q_T"}`;

  return (
    <div className="min-h-screen lg:flex">
      <Toaster />

      {/* الشريط الجانبي */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 border-l border-white/8 bg-[#070b10]/95 backdrop-blur-xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-white/8 px-4 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-xl font-black text-black shadow-lg shadow-emerald-500/30">
              C
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{session.store ?? "CHINWI STORE"}</p>
              <p className="text-[0.68rem] text-emerald-400">لوحة التحكم الشاملة</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 lg:hidden"
            >
              ✕
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
            {NAV.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    active
                      ? "bg-emerald-500/15 text-emerald-300 shadow-[inset_0_0_0_1px_rgba(34,197,94,0.25)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.href === "/admin/orders" && pending > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[0.62rem] font-black text-white">
                      {pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-white/8 p-3">
            <a href="/" target="_blank" className="btn btn-ghost w-full text-xs">
              🌐 زيارة المتجر
            </a>
            <a href={botLink} target="_blank" className="btn btn-green w-full text-xs">
              🚀 فتح البوت
            </a>
            <button onClick={logout} className="btn btn-red w-full text-xs">
              🚪 تسجيل الخروج
            </button>
            <p className="pt-1 text-center text-[0.62rem] text-slate-600">CHINWI STORE v1.0 • Vercel + Neon</p>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      {/* المحتوى */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-[#05070b]/80 px-4 py-3 backdrop-blur-xl">
          <button
            onClick={() => setOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 lg:hidden"
            aria-label="القائمة"
          >
            ☰
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
            <span>متصل</span>
            {session.site && <span className="hidden text-slate-600 sm:inline">• {session.site.replace(/^https?:\/\//, "")}</span>}
          </div>
          <div className="mr-auto flex items-center gap-2">
            {pending > 0 && (
              <Link
                href="/admin/orders?status=review"
                className="chip border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              >
                🟡 {pending} إيصال بانتظار المراجعة
              </Link>
            )}
            <Link href="/admin/ai" className="btn btn-ghost px-3 py-1.5 text-xs">
              🧠 المساعد الذكي
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
