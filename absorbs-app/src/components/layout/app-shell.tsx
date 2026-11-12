"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Compass, Home, MessageCircle, Plus, Sparkles, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchTotalUnread } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/feed", label: "الرئيسية", icon: Home },
  { href: "/explore", label: "اكتشف", icon: Compass },
  { href: "/messages", label: "الرسائل", icon: MessageCircle },
  { href: "/profile", label: "حسابي", icon: UserRound },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const inChatRoom = /^\/messages\/.+/.test(pathname);
  const inPostDetail = pathname.startsWith("/post/");

  /* live unread-messages badge (initial fetch + realtime refresh) */
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let cancelled = false;
    const refresh = async () => {
      const total = await fetchTotalUnread(supabase, user.id).catch(() => 0);
      if (!cancelled) setUnread(total);
    };
    refresh();
    const channel = supabase
      .channel("nav-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, pathname]);

  /* activity (notifications) badge: likes/comments/follows newer than last seen */
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      let seen = "";
      try {
        seen = localStorage.getItem("dzconnect-notif-seen") ?? "";
      } catch {}
      const since = seen || new Date(0).toISOString();
      const { data: myPosts } = await supabase.from("posts").select("id").eq("author_id", user.id).limit(200);
      const ids = ((myPosts ?? []) as { id: string }[]).map((p) => p.id);
      const [likes, comments, follows] = await Promise.all([
        ids.length
          ? supabase.from("likes").select("*", { count: "exact", head: true }).in("post_id", ids).neq("user_id", user.id).gt("created_at", since)
          : Promise.resolve({ count: 0 }),
        ids.length
          ? supabase.from("comments").select("*", { count: "exact", head: true }).in("post_id", ids).neq("author_id", user.id).gt("created_at", since)
          : Promise.resolve({ count: 0 }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id).gt("created_at", since),
      ]);
      if (!cancelled) setNotifCount(Math.min(99, (likes.count ?? 0) + (comments.count ?? 0) + (follows.count ?? 0)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  const goCompose = () => {
    if (pathname !== "/feed") router.push("/feed?compose=1");
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="aurora aurora-app relative min-h-dvh">
      {/* desktop ambience copy (only visible on wide screens, beside the phone column) */}
      <aside className="pointer-events-none fixed top-0 z-0 hidden h-full w-[calc(50%-290px)] flex-col justify-center ps-14 pe-6 min-[1100px]:flex">
        <span className="logo-mark h-16 w-16 rounded-[22px] text-2xl">A</span>
        <h1 className="mt-6 text-5xl font-black leading-[1.15] text-white">
          Dz connect
          <span className="text-gradient block">تواصل… بلا حدود</span>
        </h1>
        <p className="mt-4 max-w-sm text-base leading-8 text-white/55">
          منشورات حيّة، إعجابات فورية، ومحادثات خاصة لحظية — بتجربة هاتف فاخرة تعمل كتطبيق حقيقي أينما كنت.
        </p>
        <div className="mt-8 flex flex-wrap gap-2 text-xs text-white/60">
          {["⚡ Realtime", "💬 رسائل خاصة", "📱 PWA قابل للتثبيت", "🔒 Supabase RLS"].map((chip) => (
            <span key={chip} className="glass rounded-full px-3 py-1.5">{chip}</span>
          ))}
        </div>
      </aside>

      {/* phone column */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[480px] flex-col border-white/[0.06] bg-[#070713]/60 shadow-[0_0_80px_rgba(0,0,0,0.6)] backdrop-blur-sm sm:border-x">
        {/* top glass bar */}
        <header className="sticky top-0 z-40">
          <div className="glass-nav mx-3 mt-[max(0.6rem,env(safe-area-inset-top))] flex items-center justify-between rounded-[22px] px-3.5 py-2.5">
            <Link href="/feed" className="flex items-center gap-2.5">
              <span className="logo-mark h-9 w-9 rounded-xl text-sm">A</span>
              <span className="text-[17px] font-black tracking-tight text-white">
                Dz connect <Sparkles className="mb-0.5 inline h-3.5 w-3.5 text-teal-200" />
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/80 transition hover:bg-white/10 active:scale-95"
                aria-label="الإشعارات"
              >
                <Bell className="h-5 w-5" />
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 px-1 text-[10px] font-bold text-white shadow-lg">
                    {notifCount > 9 ? "+9" : notifCount}
                  </span>
                )}
              </Link>
              <Link
                href="/messages"
                className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05] text-white/80 transition hover:bg-white/10 active:scale-95"
                aria-label="الرسائل"
              >
                <MessageCircle className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-emerald-600 px-1 text-[10px] font-bold text-white shadow-lg">
                    {unread > 9 ? "+9" : unread}
                  </span>
                )}
              </Link>
              <Link href="/profile" aria-label="بروفايلي" className="transition active:scale-95">
                <Avatar profile={profile} size="sm" ring />
              </Link>
            </div>
          </div>
        </header>

        <main className={cn("flex-1 px-3.5 pt-4", inChatRoom ? "pb-3" : "pb-32")}>{children}</main>

        {/* floating Dz connect ai orb (Meta AI style) */}
        {!pathname.startsWith("/ai") && !inChatRoom && (
          <Link
            href="/ai"
            aria-label="Dz connect ai — المساعد الذكي"
            className="group fixed bottom-[calc(6.4rem+env(safe-area-inset-bottom))] start-4 z-40 flex items-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 p-[13px] text-white shadow-[0_16px_40px_rgba(20,184,166,0.5)] ring-1 ring-white/30 transition active:scale-90"
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/25" />
            <Sparkles className="relative h-6 w-6" />
          </Link>
        )}

        {/* floating glass bottom navigation (hidden inside a chat room for a native feel) */}
        {!inChatRoom && !inPostDetail && (
          <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
            <div className="glass-nav relative flex items-end justify-between rounded-[30px] px-2.5 py-2">
              {TABS.slice(0, 2).map((tab) => (
                <NavItem key={tab.href} {...tab} active={pathname === tab.href || pathname.startsWith(`${tab.href}/`)} badge={0} />
              ))}

              {/* center compose FAB */}
              <button
                onClick={goCompose}
                aria-label="منشور جديد"
                className="btn-primary -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-[#070713]"
              >
                <Plus className="h-7 w-7" strokeWidth={2.6} />
              </button>

              {TABS.slice(2).map((tab) => (
                <NavItem
                  key={tab.href}
                  {...tab}
                  active={pathname === tab.href || pathname.startsWith(`${tab.href}/`)}
                  badge={tab.href === "/messages" ? unread : 0}
                />
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badge: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex w-[62px] flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold transition active:scale-95",
        active ? "text-white" : "text-white/45 hover:text-white/75",
      )}
    >
      {active && <span className="absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-500/25 to-emerald-500/10 ring-1 ring-white/10" />}
      <span className="relative">
        <Icon className={cn("h-[22px] w-[22px]", active && "text-teal-200")} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -end-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {badge > 9 ? "+9" : badge}
          </span>
        )}
      </span>
      <span className="relative">{label}</span>
    </Link>
  );
}
