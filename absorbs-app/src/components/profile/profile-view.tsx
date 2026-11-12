"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Link2, Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchFollowStats, fetchLikedPosts, fetchSavedPosts, fetchUserPosts } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { PostCard } from "@/components/feed/post-card";
import { BlockButton, FollowButton, VerifiedBadge, useStartChat } from "@/components/social/user-actions";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PostSkeleton } from "@/components/ui/feedback";
import { compactNumber, gradientFor } from "@/lib/utils";
import type { Post, Profile } from "@/lib/types";

/** Shared profile header + posts (used by /profile and /u/[username]). */
export function ProfileView({ profile, children }: { profile: Profile; children?: React.ReactNode }) {
  const { user } = useAuth();
  const { startChat, busyId } = useStartChat();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const isMine = user?.id === profile.id;

  const [posts, setPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<"posts" | "liked" | "saved">("posts");
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ followers: 0, following: 0, is_following: false });

  const loadStats = useCallback(async () => {
    if (!user) return;
    const s = await fetchFollowStats(supabase, profile.id, user.id).catch(() => null);
    if (s) setStats(s);
  }, [supabase, profile.id, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [mine, statsResult] = await Promise.all([
          fetchUserPosts(supabase, profile.id, user.id),
          fetchFollowStats(supabase, profile.id, user.id),
        ]);
        if (cancelled) return;
        setPosts(mine);
        setStats(statsResult);
        if (isMine) {
          setLikedPosts(await fetchLikedPosts(supabase, user.id).catch(() => []));
          setSavedPosts(await fetchSavedPosts(supabase, user.id).catch(() => []));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, profile.id, user, isMine]);

  const joined = new Date(profile.created_at).toLocaleDateString("ar-DZ", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* cover + identity card */}
      <section className="glass animate-fade-up overflow-hidden rounded-[30px]">
        <div className={`relative h-28 bg-gradient-to-l ${gradientFor(profile.username)}`}>
          {profile.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.cover_url} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1020]/85 via-transparent to-black/10" />
        </div>
        <div className="relative px-4 pb-4">
          <div className="-mt-10 flex items-end justify-between gap-3">
            <Avatar profile={profile} size="2xl" ring className="ring-4 ring-[#0C1428]" />
            {!isMine && (
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => void startChat(profile)}
                  disabled={busyId === profile.id}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/[0.07] text-slate-900 ring-1 ring-slate-900/15 transition hover:bg-slate-900/[0.12] active:scale-90"
                  aria-label={`مراسلة ${profile.display_name}`}
                >
                  {busyId === profile.id ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
                </button>
                <BlockButton target={profile} />
                <FollowButton
                  targetId={profile.id}
                  initialFollowing={stats.is_following}
                  onChange={(f) => {
                    setStats((s) => ({ ...s, is_following: f, followers: Math.max(0, s.followers + (f ? 1 : -1)) }));
                    void loadStats;
                  }}
                />
              </div>
            )}
          </div>

          <h1 className="mt-3 flex items-center gap-1.5 text-[21px] font-black leading-7 text-slate-900">{profile.display_name}{profile.is_verified && <VerifiedBadge className="h-5 w-5" />}</h1>
          <p className="text-sm text-slate-900/45" dir="ltr" style={{ textAlign: "start" }}>
            @{profile.username}
          </p>
          {profile.bio && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900/75">{profile.bio}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-900/45">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> انضم في {joined}
            </span>
            {profile.website && (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-semibold text-cyan-600 hover:underline"
                dir="ltr"
              >
                <Link2 className="h-3.5 w-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-slate-900/[0.07] rounded-3xl bg-slate-900/[0.03] py-3 ring-1 ring-slate-900/[0.05]">
            <Stat label="منشور" value={posts.length} />
            <Stat label="متابِع" value={stats.followers} />
            <Stat label="أتابعه" value={stats.following} />
          </div>
        </div>
      </section>

      {children}

      {/* tabs (liked tab only visible on my own profile) */}
      <div className="glass flex rounded-full p-1">
        <TabButton active={tab === "posts"} onClick={() => setTab("posts")} label={isMine ? "منشوراتي" : "المنشورات"} />
        {isMine && <TabButton active={tab === "liked"} onClick={() => setTab("liked")} label="أعجبني" />}
        {isMine && <TabButton active={tab === "saved"} onClick={() => setTab("saved")} label="المحفوظة 🔖" />}
      </div>

      {loading ? (
        <PostSkeleton />
      ) : tab === "posts" ? (
        posts.length === 0 ? (
          <EmptyState
            icon={<span className="text-xl">📝</span>}
            title={isMine ? "لا منشورات بعد — شارك أول لحظة!" : "لا منشورات بعد"}
            description={isMine ? "منشوراتك ستظهر هنا وتُبث مباشرة في خلاصات أصدقائك." : "عندما ينشر هذا المستخدم شيئًا سيظهر هنا."}
          >
            {isMine && (
              <Link href="/feed" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-slate-900">
                إنشاء منشور
              </Link>
            )}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
            ))}
          </div>
        )
      ) : tab === "saved" ? (
        savedPosts.length === 0 ? (
          <EmptyState icon={<span className="text-xl">🔖</span>} title="لا منشورات محفوظة بعد" description="اضغط أيقونة 🔖 في أي منشور لحفظه هنا في مجموعتك الخاصة." />
        ) : (
          <div className="space-y-4">
            {savedPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )
      ) : likedPosts.length === 0 ? (
        <EmptyState icon={<span className="text-xl">🤍</span>} title="لم تعجب بأي منشور بعد" description="المنشورات التي تضغط قلبها ستُحفظ هنا لتصل إليها بسرعة." />
      ) : (
        <div className="space-y-4">
          {likedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-black tabular-nums text-slate-900">{compactNumber(value)}</p>
      <p className="text-[11px] font-medium text-slate-900/45">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2.5 text-sm font-bold transition ${
        active ? "bg-gradient-to-l from-indigo-500/80 to-indigo-500/80 text-slate-900 shadow-lg" : "text-slate-900/50 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}
