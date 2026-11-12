"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Heart, MessageCircle, Play, Volume2, VolumeX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchVideoPosts } from "@/lib/queries";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/types";

/** Full-screen vertical Reels feed (snap scroll, autoplay in view). */
export default function ReelsPage() {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [videos, setVideos] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [muted, setMuted] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());

  useEffect(() => {
    if (!user) return;
    fetchVideoPosts(supabase, user.id)
      .then((v) => {
        setVideos(v);
        setLiked(new Set(v.filter((p) => p.liked_by_me).map((p) => p.id)));
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [supabase, user]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLVideoElement;
          const id = el.dataset.postId;
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            setActiveId(id ?? null);
            el.muted = muted;
            void el.play().catch(() => {});
          } else {
            el.pause();
          }
        }
      },
      { threshold: [0.6] },
    );
    videoRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [videos, muted]);

  const toggleLike = async (post: Post) => {
    if (!user) return;
    const has = liked.has(post.id);
    const next = new Set(liked);
    if (has) next.delete(post.id);
    else next.add(post.id);
    setLiked(next);
    if (has) await supabase.from("likes").delete().eq("user_id", user.id).eq("post_id", post.id);
    else await supabase.from("likes").insert({ user_id: user.id, post_id: post.id });
  };

  if (loading) return <FullPageLoader label="جارٍ تحميل الريلز…" />;
  if (unavailable) {
    return (
      <EmptyState icon={<Clapperboard className="h-6 w-6" />} title="الريلز تُفعَّل قريبًا" description="نفّذ upgrade-v3.sql في Supabase لتفعيل منشورات الفيديو والريلز.">
        <Link href="/feed" className="btn-primary rounded-full px-5 py-2.5 text-sm font-bold text-white">عودة للخلاصة</Link>
      </EmptyState>
    );
  }
  if (videos.length === 0) {
    return (
      <EmptyState icon={<span className="text-2xl">🎬</span>} title="لا فيديوهات بعد — كن أول نجم ريلز!" description="انشر أول فيديو قصير من المؤلّف في الخلاصة بزر «فيديو» وسيظهر هنا بملء الشاشة.">
        <Link href="/feed" className="btn-primary rounded-full px-5 py-2.5 text-sm font-bold text-white">انشر فيديو الآن</Link>
      </EmptyState>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex items-center justify-between px-1">
        <h1 className="flex items-center gap-2 text-[22px] font-black text-slate-900">
          <Clapperboard className="h-6 w-6 text-indigo-300" /> ريلز Dz connect
        </h1>
        <button
          onClick={() => setMuted((m) => !m)}
          className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/70 ring-1 ring-white/10"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {muted ? "الصوت مقفل" : "الصوت شغال"}
        </button>
      </div>

      <div className="-mx-3.5 h-[calc(100dvh-13.5rem)] snap-y snap-mandatory overflow-y-auto">
        {videos.map((post) => (
          <article key={post.id} className="relative h-full snap-start snap-always overflow-hidden media-stage">
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(post.id, el);
                else videoRefs.current.delete(post.id);
              }}
              data-post-id={post.id}
              src={post.image_url ?? undefined}
              loop
              playsInline
              muted={muted}
              preload="metadata"
              className="h-full w-full object-contain"
              onClick={(e) => {
                const el = e.currentTarget;
                if (el.paused) void el.play().catch(() => {});
                else el.pause();
              }}
            />
            {activeId !== post.id && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#171038]/45 text-white backdrop-blur">
                  <Play className="h-7 w-7 fill-white" />
                </span>
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4 pt-16">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={post.author ? `/u/${post.author.username}` : "#"} className="pointer-events-auto flex items-center gap-2">
                    <Avatar profile={post.author} size="sm" />
                    <span className="truncate text-sm font-bold text-white">{post.author?.display_name}</span>
                  </Link>
                  {post.content && <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/90">{post.content}</p>}
                </div>
                <div className="pointer-events-auto flex flex-col items-center gap-3">
                  <button onClick={() => void toggleLike(post)} aria-label="إعجاب" className="flex flex-col items-center gap-0.5 text-white">
                    <span className={cn("flex h-11 w-11 items-center justify-center rounded-full backdrop-blur transition active:scale-90", liked.has(post.id) ? "bg-red-500 text-white" : "bg-white/15")}>
                      <Heart className={cn("h-5 w-5", liked.has(post.id) && "fill-white")} />
                    </span>
                    <span className="text-[11px] font-bold tabular-nums">{post.like_count + (liked.has(post.id) && !post.liked_by_me ? 1 : 0)}</span>
                  </button>
                  <Link href={`/post/${post.id}`} aria-label="التعليقات" className="flex flex-col items-center gap-0.5 text-white">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <span className="text-[11px] font-bold tabular-nums">{post.comment_count}</span>
                  </Link>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/35">مرّر للأعلى لمشاهدة المزيد · اضغط على الفيديو للإيقاف/التشغيل</p>
    </div>
  );
}
