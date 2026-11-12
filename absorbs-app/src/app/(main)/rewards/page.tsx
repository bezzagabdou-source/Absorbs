"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Flame, Gift, Hash, Medal, Swords, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchTrending } from "@/lib/queries";
import { InviteCard } from "@/components/social/invite-card";
import { PostCard } from "@/components/feed/post-card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import { cn, isSchemaMissing } from "@/lib/utils";
import type { Challenge, Post, Profile } from "@/lib/types";

/** Rewards hub: active hashtag challenges, leaderboard, and Algeria trends. */
export default function RewardsPage() {
  const { user, profile: me } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [leaders, setLeaders] = useState<Profile[]>([]);
  const [hashtags, setHashtags] = useState<Array<{ tag: string; count: number }>>([]);
  const [challengePosts, setChallengePosts] = useState<Record<string, Post[]>>({});
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: ch, error }, { data: lb }, trending] = await Promise.all([
        supabase.from("challenges").select("*").order("ends_at", { ascending: true }),
        supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, points").order("points", { ascending: false }).limit(15),
        fetchTrending(supabase, user.id).catch(() => ({ hashtags: [], topPosts: [] as Post[] })),
      ]);
      if (error && isSchemaMissing(error)) setUnavailable(true);
      setChallenges(((ch ?? []) as Challenge[]).filter((c) => +new Date(c.ends_at) > Date.now()));
      setLeaders((lb ?? []) as unknown as Profile[]);
      setHashtags(trending.hashtags);
      const byTag: Record<string, Post[]> = {};
      for (const c of (ch ?? []) as Challenge[]) {
        byTag[c.hashtag] = trending.topPosts.filter((p) => (p.content ?? "").includes(`#${c.hashtag}`));
      }
      setChallengePosts(byTag);
      setLoading(false);
    })();
  }, [supabase, user]);

  const joinChallenge = (challenge: Challenge) => {
    try {
      localStorage.setItem("dz-draft", `#${challenge.hashtag} `);
    } catch {}
    window.location.href = "/feed?compose=1";
  };

  if (loading) return <FullPageLoader label="جارٍ تحميل التحديات والمكافآت…" />;

  return (
    <div className="animate-fade-up space-y-5">
      <div className="px-1">
        <h1 className="flex items-center gap-2 text-[22px] font-black text-slate-900">
          <Trophy className="h-6 w-6 text-amber-600" /> التحديات والمكافآت
        </h1>
        <p className="mt-1 text-sm text-slate-900/50">اربح نقاطًا من نشاطك ودعواتك، ونافس في تحديات الهاشتاغ الأسبوعية.</p>
      </div>

      <InviteCard />

      {/* trending hashtags */}
      {hashtags.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-slate-900">
            <Flame className="h-4 w-4 text-orange-400" /> رائج الآن في الجزائر 🇩🇿
          </h2>
          <div className="no-scrollbar -mx-3.5 flex gap-2 overflow-x-auto px-4 pb-1">
            {hashtags.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/explore?q=${encodeURIComponent(tag)}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-l from-orange-400/15 to-red-500/10 px-3.5 py-2 text-[13px] font-bold text-orange-200 ring-1 ring-orange-300/20 transition hover:from-orange-400/25 active:scale-95"
              >
                <Hash className="h-3.5 w-3.5" />
                {tag}
                <span className="text-[10px] font-black text-orange-300/70">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* challenges */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 px-1 text-sm font-black text-slate-900">
          <Swords className="h-4 w-4 text-violet-600" /> تحديات نشطة
        </h2>
        {unavailable ? (
          <EmptyState icon={<Swords className="h-6 w-6" />} title="التحديات تُفعَّل قريبًا" description="نفّذ upgrade-v3.sql في Supabase لتفعيل التحديات والمجموعات والدعوات." />
        ) : challenges.length === 0 ? (
          <EmptyState icon={<Trophy className="h-6 w-6" />} title="لا تحديات نشطة الآن" description="تحديات جديدة قادمة قريبًا — جهّز كاميرتك!" />
        ) : (
          challenges.map((challenge) => {
            const entries = [...(challengePosts[challenge.hashtag] ?? [])].sort((a, b) => b.like_count - a.like_count);
            const daysLeft = Math.max(0, Math.ceil((+new Date(challenge.ends_at) - Date.now()) / 86400000));
            return (
              <article key={challenge.id} className="glass overflow-hidden rounded-[28px]">
                <div className="relative p-4">
                  <div className="pointer-events-none absolute -top-10 end-0 h-28 w-28 rounded-full bg-violet-400/15 blur-[45px]" />
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-[11px] font-black text-violet-600 ring-1 ring-violet-300/25" dir="ltr">
                        #{challenge.hashtag}
                      </span>
                      <span className="text-[11px] font-bold text-slate-900/40">متبقّي {daysLeft} {daysLeft === 1 ? "يوم" : "أيام"}</span>
                      {challenge.prize && <span className="ms-auto flex items-center gap-1 text-[11px] font-bold text-amber-600"><Gift className="h-3.5 w-3.5" /> {challenge.prize.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim()}</span>}
                    </div>
                    <h3 className="mt-2 font-black text-slate-900">{challenge.title}</h3>
                    {challenge.description && <p className="mt-1 text-[13px] leading-6 text-slate-900/55">{challenge.description}</p>}
                    <button onClick={() => joinChallenge(challenge)} className="btn-primary mt-3 rounded-full px-5 py-2.5 text-sm font-bold text-slate-900">
                      شارك في التحدي
                    </button>
                  </div>
                </div>
                {entries.length > 0 && (
                  <div className="space-y-3 border-t border-slate-900/[0.06] p-3">
                    <p className="px-1 text-xs font-bold text-slate-900/45">🏅 المتصدّرون الآن ({entries.length})</p>
                    {entries.slice(0, 3).map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* leaderboard */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-slate-900">
          <Medal className="h-4 w-4 text-amber-600" /> لوحة الشرف — أبطال النقاط
        </h2>
        <ol className="glass divide-y divide-slate-900/[0.05] rounded-[26px] px-2 py-1">
          {leaders.map((leader, i) => (
            <li key={leader.id}>
              <Link href={`/u/${leader.username}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-slate-900/[0.04]">
                <span
                  className={cn(
                    "w-7 text-center text-sm font-black tabular-nums",
                    i === 0 ? "text-amber-600" : i === 1 ? "text-slate-200" : i === 2 ? "text-orange-300" : "text-slate-900/35",
                  )}
                >
                  {i + 1}
                </span>
                <Avatar profile={leader} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                  {leader.display_name}
                  {leader.id === me?.id && <span className="ms-1.5 rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-black text-violet-600">أنت</span>}
                </span>
                <span className="text-sm font-black tabular-nums text-amber-600">{leader.points ?? 0} ⭐</span>
              </Link>
            </li>
          ))}
          {leaders.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-900/40">ستظهر هنا أول الأبطال بعد تفعيل v3</li>}
        </ol>
      </section>
    </div>
  );
}
