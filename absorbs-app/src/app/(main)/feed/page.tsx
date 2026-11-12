"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Newspaper } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchFeed } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { Clapperboard, Sparkles, Trophy, UsersRound } from "lucide-react";
import { SetupNotice } from "@/components/feed/setup-notice";
import { StoriesRow } from "@/components/feed/stories";
import { InstallButton } from "@/components/pwa/install-button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader, PostSkeleton } from "@/components/ui/feedback";
import { isSchemaMissing } from "@/lib/utils";
import type { Post } from "@/lib/types";

export default function FeedPage() {
  const { user, profile } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [posts, setPosts] = useState<Post[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const blockedRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const feed = await fetchFeed(supabase, user.id);
      setPosts(feed.filter((p) => !blockedRef.current.has(p.author_id)));
      setSchemaMissing(false);
    } catch (err) {
      if (isSchemaMissing(err as { code?: string; message?: string })) setSchemaMissing(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    load();
    if (!user) return;
    supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .then(({ data }: { data: { blocked_id: string }[] | null }) => {
        const set = new Set((data ?? []).map((b) => b.blocked_id));
        blockedRef.current = set;
        setBlockedIds(set);
      });

    /* Realtime: brand-new posts from anyone appear at the top instantly */
    const channel = supabase
      .channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload: RealtimePostgresChangesPayload<{ id: string; author_id: string }>) => {
        const row = payload.new as { id: string; author_id: string };
        if (row.author_id === user.id) return; // mine was added optimistically by Composer
        if (blockedRef.current.has(row.author_id)) return; // blocked author
        const fresh = await fetchFeed(supabase, user.id, 1).catch(() => []);
        // fetchFeed(1) returns newest overall; refetch precise single post instead if needed
        if (fresh[0]?.id === row.id) {
          setPosts((prev) => (prev.some((p) => p.id === row.id) ? prev : [fresh[0], ...prev]));
        } else {
          load();
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts" }, (payload: RealtimePostgresChangesPayload<{ id: string }>) => {
        const old = payload.old as { id: string };
        setPosts((prev) => prev.filter((p) => p.id !== old.id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, load]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "صباح الخير";
    if (h < 18) return "نهارك سعيد";
    return "مساء الخير";
  };

  return (
    <div className="space-y-4">
      {/* greeting */}
      <div className="animate-fade-up flex items-end justify-between px-1 pt-1">
        <div>
          <p className="text-xs font-semibold text-slate-900/45">{greeting()}،</p>
          <h1 className="mt-0.5 text-[22px] font-black text-slate-900">{profile?.display_name ?? "صديقي"} ✨</h1>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          className="glass rounded-full px-3.5 py-2 text-xs font-bold text-slate-900/75 transition hover:bg-slate-900/10 active:scale-95"
        >
          {refreshing ? "جارٍ التحديث…" : "تحديث ↻"}
        </button>
      </div>

      {schemaMissing && <SetupNotice />}
      <InstallButton />

      <StoriesRow blockedIds={blockedIds} />

      {/* greeting hero */}
      <section className="keep-dark relative overflow-hidden rounded-[28px] bg-gradient-to-l from-indigo-600 via-violet-600 to-indigo-700 p-4 text-white shadow-[0_20px_44px_rgba(99,102,241,0.35)]">
        <div className="pointer-events-none absolute -top-16 end-6 h-40 w-40 rounded-full bg-white/20 blur-[50px]" />
        <div className="pointer-events-none absolute -bottom-20 start-10 h-36 w-36 rounded-full bg-cyan-300/25 blur-[45px]" />
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white/70">{new Date().getHours() < 12 ? "صباح الخير" : new Date().getHours() < 18 ? "نهارك سعيد" : "مساء الخير"}{profile ? `، ${profile.display_name.split(" ")[0]}` : ""}</p>
            <h2 className="mt-0.5 text-lg font-black leading-7">وش رايك تشارك لحظة من يومك اليوم؟</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/18 px-3 py-1.5 text-xs font-black text-white ring-1 ring-white/25 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Dz connect ai جاهز يساعدك
              </span>
              <Link href="/rewards" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-black text-indigo-700 shadow-lg transition active:scale-95">
                <Trophy className="h-3.5 w-3.5" /> {profile?.points ?? 0} نقطة — ادعُ واربح
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* feature tiles — gradient icon tiles, no emoji */}
      <div className="animate-fade-up grid grid-cols-3 gap-2.5">
        {[
          { href: "/reels", label: "ريلز", sub: "فيديوهات قصيرة", tile: "tile-violet", Icon: Clapperboard },
          { href: "/groups", label: "مجتمعات", sub: "ولايات واهتمامات", tile: "tile-sky", Icon: UsersRound },
          { href: "/rewards", label: "تحديات", sub: "نقاط وجوائز", tile: "tile-amber", Icon: Trophy },
        ].map(({ href, label, sub, tile, Icon }) => (
          <Link key={href} href={href} className="glass lift flex flex-col items-center gap-1.5 rounded-[24px] px-2 py-3.5 text-center">
            <span className={`icon-tile ${tile} h-11 w-11 rounded-[15px]`}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-black text-slate-900">{label}</span>
            <span className="text-[10.5px] font-semibold text-slate-900/45">{sub}</span>
          </Link>
        ))}
      </div>

      <Composer
        onPosted={(post) => {
          setPosts((prev) => [post, ...prev]);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <div className="flex items-center gap-2 px-1 pt-1">
        <Flame className="h-4 w-4 text-orange-300" />
        <h2 className="text-sm font-black text-slate-900">أحدث المنشورات</h2>
        <span className="h-px flex-1 bg-slate-900/[0.06]" />
        <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
          </span>
          مباشر
        </span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : schemaMissing ? null : posts.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-6 w-6" />}
          title="الـ Feed هادئ الآن… كن أول من ينشر!"
          description="انشر أول منشور لك من الأعلى، أو ادعُ أصدقاءك بالاسم لتبدأ المحادثات والمنشورات الحيّة."
        >
          <Link href="/explore" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-slate-900">
            اكتشف الأشخاص
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
          ))}
          <p className="py-4 text-center text-xs text-slate-900/30">وصلت إلى نهاية الخلاصة — عد قريبًا للمزيد 🌙</p>
        </div>
      )}

      {loading && posts.length === 0 && <FullPageLoader label="جارٍ تحميل الخلاصة…" />}
    </div>
  );
}
