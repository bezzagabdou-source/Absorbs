"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  Crown,
  History,
  LayoutGrid,
  Loader2,
  LogOut,
  MessagesSquare,
  Settings,
  Info,
  SquarePen,
  Coins,
  Wand2,
  Gamepad2,
  Sparkles,
  Gavel,
  Telescope,
  LayoutDashboard,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Credits context — refreshed from /api/user/me                       */
/* ------------------------------------------------------------------ */

/** "62%" or, when empty, "0% · يتجدد بعد 1:12:05" */
export function meterLabel(p: { meterPercent?: number; creditsLeft: number; meterResetAt?: string | null } | null): string {
  if (!p) return "…";
  const pct = Math.round(p.meterPercent ?? p.creditsLeft);
  if (pct > 0 || !p.meterResetAt) return `${pct}%`;
  const ms = Math.max(0, new Date(p.meterResetAt).getTime() - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `0% · يتجدد بعد ${h}:${String(m).padStart(2, "0")}`;
}

export type Profile = {
  plan: "free" | "pro";
  creditsLeft: number;
  dailyLimit: number;
  creditsUsed: number;
  /** free plan: percentage of the 2h time meter left (0-100) and when it refills once empty */
  meterPercent?: number;
  meterResetAt?: string | null;
  planExpiresAt: string | null;
  /** 7-day free trial: plan is "pro" while this is true */
  trial?: boolean;
  trialEndsAt?: string | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    photoUrl: string | null;
    totalRuns: number;
    createdAt: string;
  };
};

type CreditsCtx = {
  profile: Profile | null;
  refresh: () => Promise<void>;
  applyHeaders: (res: Response) => void;
};

const CreditsContext = createContext<CreditsCtx | null>(null);

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits outside provider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/** "v8 PRO" pill shown next to the logo for Pro accounts */
/** "V8 PRO GOLD" pill — a real link to the plan / upgrade page. */
export function ProGoldLink({ className }: { className?: string }) {
  return (
    <Link
      href="/app/upgrade"
      aria-label="V8 PRO GOLD"
      className={cn(
        "flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 transition-all hover:bg-amber-500/20 cursor-pointer",
        className
      )}
    >
      <Sparkles className="h-4 w-4 animate-pulse text-amber-400" />
      <span>V8 PRO GOLD</span>
    </Link>
  );
}

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "pro-shine inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-[#2a1700] shadow-[0_4px_14px_-4px_rgba(251,191,36,0.8),inset_0_1px_0_rgba(255,255,255,0.6)]",
        className
      )}
    >
      <Crown className="h-3 w-3" />
      v8 PRO
    </span>
  );
}

function FullLoader({ label }: { label: string }) {
  return (
    <div className="grid min-h-[var(--app-h,100dvh)] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size={56} withText={false} />
        <p className="flex items-center gap-2 text-sm font-bold text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
          {label}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, dir } = useI18n();
  const { user, loading, signOut, authFetch } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/user/me");
      if (res.ok) {
        const data = (await res.json()) as { profile: Profile | null };
        if (data.profile) setProfile(data.profile);
      }
    } catch {
      /* offline etc. */
    }
  }, [authFetch]);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  // free plan: keep the percentage meter live (it drains while the user works, refills after the reset time)
  useEffect(() => {
    if (!user || profile?.plan === "pro") return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [user, profile?.plan, refresh]);

  const applyHeaders = useCallback((res: Response) => {
    const left = res.headers.get("x-credits-remaining");
    if (left !== null) {
      setProfile((p) => (p ? { ...p, creditsLeft: Number(left) } : p));
    }
  }, []);

  const ctxValue = useMemo(
    () => ({ profile, refresh, applyHeaders }),
    [profile, refresh, applyHeaders]
  );

  if (loading || !user) return <FullLoader label={t.common.loading} />;

  const nav: { href: string; label: string; icon: typeof Crown; exact: boolean; desktopOnly?: boolean }[] = [
    { href: "/app", label: t.app.chat, icon: MessagesSquare, exact: true },
    { href: "/app/council", label: "المجلس", icon: Gavel, exact: true },
    { href: "/app/research", label: "البحث", icon: Telescope, exact: true },
    { href: "/app/tools", label: t.app.tools, icon: LayoutGrid, exact: false },
    { href: "/app/studio", label: "الاستوديو", icon: Wand2, exact: true },
    { href: "/app/arcade", label: "الأركيد", icon: Gamepad2, exact: true, desktopOnly: true },
    { href: "/app/history", label: t.app.history, icon: History, exact: true },
    { href: "/app/upgrade", label: t.app.upgrade, icon: Crown, exact: true },
    { href: "/app/settings", label: t.app.settings, icon: Settings, exact: true },
  ];

  const mobileNav = nav.filter((n) => !n.desktopOnly);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const creditsPct = profile
    ? profile.plan === "pro"
      ? 100
      : Math.max(
          0,
          Math.min(100, (profile.creditsLeft / profile.dailyLimit) * 100)
        )
    : 0;

  return (
    <CreditsContext.Provider value={ctxValue}>
      <div
        dir={dir}
        data-app-shell
        className="app-frame flex flex-col overflow-hidden lg:ps-72"
      >
        {/* ---------------- desktop sidebar ---------------- */}
        <aside className="fixed inset-y-0 start-0 z-40 hidden w-72 flex-col border-e border-white/6 bg-ink-950/90 p-5 lg:flex">
          <div className="mb-7 flex items-center justify-between gap-2 px-1">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={38} />
            </Link>
            {profile?.plan === "pro" && <ProGoldLink />}
          </div>

          <Link
            href="/app"
            onClick={() => window.dispatchEvent(new Event("barq:new-chat"))}
            className="btn-primary mb-6 w-full py-3 text-sm"
          >
            <SquarePen className="h-4.5 w-4.5" />
            {t.app.newChat}
          </Link>

          <nav className="flex flex-col gap-1.5">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                  isActive(item.href, item.exact)
                    ? "bg-gradient-to-l from-brand-500/35 to-brand-500/5 text-white ring-1 ring-brand-400/30"
                    : "text-slate-400 hover:bg-brand-500/10 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5",
                    isActive(item.href, item.exact) && "text-gold-400"
                  )}
                />
                {item.label}
                {item.href === "/app/upgrade" && profile?.plan !== "pro" && (
                  <span className="ms-auto rounded-md bg-gradient-to-b from-gold-200 to-gold-500 px-1.5 py-0.5 text-[9px] font-black text-[#2a1700]">
                    PRO
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="mt-auto space-y-3.5">
            {/* credits card */}
            <div className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Coins className="h-3.5 w-3.5 text-aqua-400" />
                  {profile?.plan === "pro"
                    ? t.app.unlimited
                    : meterLabel(profile)}
                </span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-black",
                    profile?.plan === "pro"
                      ? "bg-gradient-to-b from-gold-200 to-gold-500 text-[#2a1700]"
                      : "bg-white/10 text-slate-300"
                  )}
                >
                  {profile?.trial ? "تجربة 7 أيام" : profile?.plan === "pro" ? t.app.proBadge : t.app.freePlanTag}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 via-aqua-400 to-gold-400 transition-all duration-500"
                  style={{ width: `${creditsPct}%` }}
                />
              </div>
              {profile?.plan !== "pro" && (
                <Link
                  href="/app/upgrade"
                  className="btn-gold mt-3 w-full gap-1.5 !rounded-xl !py-2 text-xs"
                >
                  <Crown className="h-3.5 w-3.5" />
                  {t.app.upgradeNow}
                </Link>
              )}
            </div>

            {/* user row */}
            <div className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
              <UserAvatar
                name={profile?.user.displayName ?? user.displayName}
                photo={profile?.user.photoUrl ?? user.photoURL}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-white">
                  {profile?.user.displayName ?? user.displayName ?? "Nexus AI v8.4"}
                </p>
                <p className="truncate text-[11px] text-slate-500" dir="ltr">
                  {user.email}
                </p>
              </div>
              <ThemeToggle />
              <LanguageSwitcher compact />
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.replace("/");
                }}
                title={t.app.signOut}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* mobile: NO top bar (more screen for the chat). Sub-pages only get a tiny floating back button. */}
        {pathname !== "/app" && (
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.replace("/app");
            }}
            aria-label="رجوع"
            className="fixed start-2.5 top-[max(0.5rem,env(safe-area-inset-top))] z-40 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-ink-950/80 text-slate-200 shadow-lg backdrop-blur transition active:scale-90 lg:hidden"
          >
            <ChevronRight className="h-5 w-5 rtl:rotate-0 ltr:rotate-180" />
          </button>
        )}

        {/* ---------------- content ---------------- */}
        <main className="scroll-y min-h-0 min-w-0 flex-1">
          <VerifyEmailBanner />
          {children}
        </main>

        {/* ---------------- v12: ONE bottom button ---------------- */}
        <div className="v12-dock lg:hidden">
          <Link
            href={pathname === "/app/hub" ? "/app" : "/app/hub"}
            aria-label="المركز"
            className="v12-dock-btn"
          >
            {pathname === "/app/hub" ? (
              <>
                <MessagesSquare className="h-[18px] w-[18px] text-[var(--v12-accent-2)]" />
                رجوع للمحادثة
              </>
            ) : (
              <>
                <span className="v12-dock-dot" />
                <LayoutDashboard className="h-[18px] w-[18px]" />
                المركز
              </>
            )}
          </Link>
        </div>
      </div>
      <CommandPalette />
    </CreditsContext.Provider>
  );
}

export function UserAvatar({
  name,
  photo,
  size = 36,
}: {
  name: string | null;
  photo: string | null;
  size?: number;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name ?? "user"}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = (name ?? "B").trim().charAt(0).toUpperCase() || "B";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-gold-400 font-bold text-ink-950"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

/** Small helper displayed when AI key or quota errors happen */
export function InlineNotice({
  kind,
  text,
}: {
  kind: "warn" | "error" | "info";
  text: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border px-4 py-3.5 text-sm font-bold",
        kind === "warn" &&
          "border-amber-400/25 bg-amber-500/10 text-amber-200",
        kind === "error" && "border-rose-400/25 bg-rose-500/10 text-rose-200",
        kind === "info" && "border-aqua-400/25 bg-aqua-400/10 text-aqua-300"
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
