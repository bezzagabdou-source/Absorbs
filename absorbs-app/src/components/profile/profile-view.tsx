"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, Link2, Loader2, MessageCircle, UserCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchFollowStats, fetchLikedPosts, fetchSavedPosts, fetchUserPosts } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { PostCard } from "@/components/feed/post-card";
import { BlockButton, FollowButton, VerifiedBadge, useStartChat } from "@/components/social/user-actions";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PostSkeleton } from "@/components/ui/feedback";
import { FollowListModal } from "@/components/profile/follow-list-modal";
import { compactNumber } from "@/lib/utils";
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
  const [followModal, setFollowModal] = useState<"followers" | "following" | null>(null);

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
        <div className="relative h-32 overflow-hidden bg-gradient-to-l from-indigo-600 via-violet-600 to-fuchsia-600">
          {/* decorative glow orbs + dot constellation */}
          <div className="absolute -top-10 start-8 h-36 w-36 rounded-full bg-cyan-300/40 blur-2xl" />
          <div className="absolute -bottom-12 end-6 h-40 w-40 rounded-full bg-fuchsia-400/45 blur-2xl" />
          <div className="absolute top-6 end-24 h-20 w-20 rounded-full bg-white/25 blur-xl" />
          <svg className="absolute inset-0 h-full w-full opacity-40" aria-hidden="true">
            <defs>
              <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.6" fill="rgba(255,255,255,0.7)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
          {profile.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1020]/70 via-transparent to-transparent" />
        </div>
        <div className="relative px-4 pb-4">
          <div className="-mt-14 flex items-end justify-between gap-3">
            <div className="relative">
              <Avatar profile={profile} size="2xl" className="ring-4 ring-white shadow-[0_16px_36px_rgba(20,26,48,0.35)]" />
              {profile.is_verified && (
                <span className="absolute -bottom-1.5 -end-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-sky-200">
                  <VerifiedBadge className="h-5 w-5" />
                </span>
              )}
            </div>
            {!isMine && (
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => void startChat(profile)}
                  disabled={busyId === profile.id}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-violet-700 shadow-md ring-1 ring-violet-200 transition hover:bg-violet-50 active:scale-90"
                  aria-label={`مراسلة ${profile.display_name}`}
                >
                  {busyId === profile.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
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

          <h1 className="mt-3 flex items-center gap-1.5 text-[23px] font-black leading-8 text-slate-900">
            {profile.display_name}
            {profile.is_verified && <VerifiedBadge className="h-5 w-5" />}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-600" dir="ltr" style={{ textAlign: "start" }}>
              @{profile.username}
            </p>
            {typeof profile.points === "number" && profile.points > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800 ring-1 ring-amber-300/70">
                ⭐ {compactNumber(profile.points)} نقطة
              </span>
            )}
          </div>
          {profile.bio && <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">{profile.bio}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-800 ring-1 ring-indigo-200/80">
              <CalendarDays className="h-3.5 w-3.5" /> انضم في {joined}
            </span>
            {profile.website && (
              <a
                href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800 ring-1 ring-emerald-200/80 transition hover:bg-emerald-100"
                dir="ltr"
              >
                <Link2 className="h-3.5 w-3.5" /> {profile.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat icon={<FileText className="h-4 w-4 text-indigo-500" />} label="منشور" value={posts.length} tone="text-indigo-700" />
            <button type="button" onClick={() => setFollowModal("followers")} className="block transition active:scale-95">
              <Stat icon={<Users className="h-4 w-4 text-violet-500" />} label="متابِع" value={stats.followers} tone="text-violet-700" />
            </button>
            <button type="button" onClick={() => setFollowModal("following")} className="block transition active:scale-95">
              <Stat icon={<UserCheck className="h-4 w-4 text-emerald-600" />} label="أتابعه" value={stats.following} tone="text-emerald-700" />
            </button>
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
              <Link href="/feed" className="btn-primary mt-2 rounded-full px-5 py-2.5 text-sm font-bold text-white">
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

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="h-full rounded-3xl border border-indigo-100/80 bg-white/85 px-3 py-3 text-center shadow-[0_6px_18px_rgba(79,70,229,0.08)] ring-1 ring-white/70">
      <p className="flex items-center justify-center gap-1.5 text-lg font-black tabular-nums leading-6">
        {icon}
        <span className={tone}>{compactNumber(value)}</span>
      </p>
      <p className="mt-1 text-[11px] font-semibold text-slate-600">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2.5 text-sm font-bold transition ${
        active
          ? "bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-[0_10px_24px_rgba(109,40,217,0.35)]"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}
