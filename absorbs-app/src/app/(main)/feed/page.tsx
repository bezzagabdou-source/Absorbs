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
import { SetupNotice } from "@/components/feed/setup-notice";
import { InstallButton } from "@/components/pwa/install-button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader, PostSkeleton } from "@/components/ui/feedback";
import { isSchemaMissing } from "@/lib/utils";
import type { Post, Profile } from "@/lib/types";

export default function FeedPage() {
  const { user, profile } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const feed = await fetchFeed(supabase, user.id);
      setPosts(feed);
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
      .from("profiles")
      .select("*")
      .neq("id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }: { data: Profile[] | null }) => setPeople(data ?? []));

    /* Realtime: brand-new posts from anyone appear at the top instantly */
    const channel = supabase
      .channel("feed-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, async (payload: RealtimePostgresChangesPayload<{ id: string; author_id: string }>) => {
        const row = payload.new as { id: string; author_id: string };
        if (row.author_id === user.id) return; // mine was added optimistically by Composer
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
          <p className="text-xs font-semibold text-white/45">{greeting()}،</p>
          <h1 className="mt-0.5 text-[22px] font-black text-white">{profile?.display_name ?? "صديقي"} ✨</h1>
        </div>
        <button
          onClick={() => {
            setRefreshing(true);
            load();
          }}
          className="glass rounded-full px-3.5 py-2 text-xs font-bold text-white/75 transition hover:bg-white/10 active:scale-95"
        >
          {refreshing ? "جارٍ التحديث…" : "تحديث ↻"}
        </button>
      </div>

      {schemaMissing && <SetupNotice />}
      <InstallButton />

      {/* people strip (real members — entry point to profiles & DMs) */}
      {people.length > 0 && (
        <section className="animate-fade-up">
          <div className="no-scrollbar -mx-3.5 flex gap-4 overflow-x-auto px-4 pb-1 pt-1">
            {people.map((person) => (
              <Link key={person.id} href={`/u/${person.username}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
                <span className="rounded-full bg-gradient-to-tr from-violet-500 via-fuchsia-500 to-cyan-400 p-[2.5px]">
                  <span className="block rounded-full bg-[#0a0b1e] p-[2px]">
                    <Avatar profile={person} size="lg" />
                  </span>
                </span>
                <span className="w-full truncate text-[11px] font-semibold text-white/70">{person.display_name.split(" ")[0]}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Composer
        onPosted={(post) => {
          setPosts((prev) => [post, ...prev]);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <div className="flex items-center gap-2 px-1 pt-1">
        <Flame className="h-4 w-4 text-orange-300" />
        <h2 className="text-sm font-black text-white">أحدث المنشورات</h2>
        <span className="h-px flex-1 bg-white/[0.06]" />
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
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
          <Link href="/explore" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-white">
            اكتشف الأشخاص
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
          ))}
          <p className="py-4 text-center text-xs text-white/30">وصلت إلى نهاية الخلاصة — عد قريبًا للمزيد 🌙</p>
        </div>
      )}

      {loading && posts.length === 0 && <FullPageLoader label="جارٍ تحميل الخلاصة…" />}
    </div>
  );
}
