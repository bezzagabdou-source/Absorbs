"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { VerifiedBadge } from "@/components/social/user-actions";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, SendHorizonal, Share2, Trash2, X } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchComments, fetchPostCounts } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { cn, compactNumber, friendlyError, timeAgoAr } from "@/lib/utils";
import type { Post, PostComment } from "@/lib/types";

/**
 * Post card with:
 * - optimistic like + animated counter (synced live via Supabase Realtime)
 * - double-tap on the image to like (with heart burst)
 * - inline live comments (Realtime INSERT stream)
 */
export function PostCard({
  post,
  onDeleted,
  defaultCommentsOpen = false,
}: {
  post: Post;
  onDeleted?: (postId: string) => void;
  defaultCommentsOpen?: boolean;
}) {
  const { user, profile: me } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [likeCount, setLikeCount] = useState(post.like_count);
  const [liked, setLiked] = useState(post.liked_by_me);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [likeBusy, setLikeBusy] = useState(false);
  const [burst, setBurst] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(Boolean(post.saved_by_me));

  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);

  const syncCounts = useCallback(async () => {
    if (!user) return;
    const counts = await fetchPostCounts(supabase, post.id, user.id).catch(() => null);
    if (counts) {
      setLikeCount(counts.like_count);
      setCommentCount(counts.comment_count);
      setLiked(counts.liked_by_me);
    }
  }, [supabase, post.id, user]);

  /* Realtime: keep counters + open comment list in sync for everyone */
  useEffect(() => {
    const channel = supabase
      .channel(`post-live-${post.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${post.id}` }, syncCounts)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
        async (payload: RealtimePostgresChangesPayload<PostComment>) => {
          syncCounts();
          const row = payload.new as unknown as PostComment;
          if (row.author_id === user?.id) return; // own comment already added optimistically
          const author =
            row.author_id === post.author_id
              ? post.author
              : (await supabase.from("profiles").select("*").eq("id", row.author_id).maybeSingle()).data ?? undefined;
          setComments((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, { ...row, author: author ?? undefined }]));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
        (payload: RealtimePostgresChangesPayload<PostComment>) => {
          syncCounts();
          setComments((prev) => prev.filter((c) => c.id !== (payload.old as unknown as { id: string }).id));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, post.id, post.author, post.author_id, syncCounts, user?.id]);

  const loadComments = useCallback(async () => {
    const rows = await fetchComments(supabase, post.id).catch(() => []);
    setComments(rows);
    setCommentsLoaded(true);
  }, [supabase, post.id]);

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded) loadComments();
  };

  const toggleLike = async (fromDoubleTap = false) => {
    if (!user || likeBusy) return;
    if (liked && fromDoubleTap) return; // double-tap only adds a like
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    if (nextLiked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 820);
    }
    setLikeBusy(true);
    const { error } = nextLiked
      ? await supabase.from("likes").insert({ post_id: post.id, user_id: user.id })
      : await supabase.from("likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    setLikeBusy(false);
    if (error) {
      setLiked(!nextLiked);
      setLikeCount((c) => Math.max(0, c + (nextLiked ? -1 : 1)));
      toast(friendlyError(error, "تعذّر تحديث الإعجاب"), "error");
    }
  };

  const onImageTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) void toggleLike(true);
    lastTapRef.current = now;
  };

  const sendComment = async () => {
    const text = draft.trim();
    if (!text || !user || !me || sending) return;
    setSending(true);
    const optimistic: PostComment = {
      id: `temp-${crypto.randomUUID()}`,
      post_id: post.id,
      author_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      author: me,
    };
    setComments((prev) => [...prev, optimistic]);
    setCommentCount((c) => c + 1);
    setDraft("");
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: post.id, author_id: user.id, content: text })
      .select("id, created_at")
      .single();
    setSending(false);
    if (error) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      setCommentCount((c) => Math.max(0, c - 1));
      toast(friendlyError(error, "تعذّر إرسال التعليق"), "error");
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === optimistic.id ? { ...c, id: data.id, created_at: data.created_at } : c)));
    requestAnimationFrame(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const deletePost = async () => {
    if (!user) return;
    setMenuOpen(false);
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) return toast(friendlyError(error, "تعذّر حذف المنشور"), "error");
    toast("تم حذف المنشور");
    onDeleted?.(post.id);
  };

  const toggleSave = async () => {
    if (!user) return;
    const next = !saved;
    setSaved(next);
    const { error } = next
      ? await supabase.from("saves").insert({ user_id: user.id, post_id: post.id })
      : await supabase.from("saves").delete().eq("user_id", user.id).eq("post_id", post.id);
    if (error) {
      setSaved(!next);
      toast(
        (error as { code?: string }).code === "42P01" || (error as { code?: string }).code === "PGRST205"
          ? "لتفعيل الحفظ: نفّذ upgrade-v2.sql في Supabase"
          : "تعذّر تحديث الحفظ",
        "error",
      );
    } else if (next) toast("تم الحفظ في مجموعتك 🔖");
  };

  const sharePost = async () => {
    const excerpt = encodeURIComponent((post.content ?? "منشور على Dz connect").slice(0, 110));
    const img = post.image_url && post.media_type !== "video" ? `&img=${encodeURIComponent(post.image_url)}` : "";
    const url = `${window.location.origin}/p/${post.id}?t=${excerpt}${img}`;
    try {
      if (navigator.share) await navigator.share({ title: "Dz connect", text: post.content ?? "منشور على Dz connect", url });
      else {
        await navigator.clipboard.writeText(url);
        toast("تم نسخ رابط المنشور");
      }
    } catch {
      /* user cancelled share sheet */
    }
  };

  const isMine = user?.id === post.author_id;

  function renderRichText(text: string) {
    return text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, i) =>
      part.startsWith("#") ? (
        <span
          key={i}
          role="link"
          className="cursor-pointer font-bold text-violet-300 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/explore?q=${encodeURIComponent(part.slice(1))}`);
          }}
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <article className="glass animate-fade-up overflow-hidden rounded-[28px]">
      {/* header */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link href={post.author ? `/u/${post.author.username}` : "#"} className="shrink-0 transition active:scale-95">
          <Avatar profile={post.author} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={post.author ? `/u/${post.author.username}` : "#"} className="block truncate text-[15px] font-bold text-white hover:underline">
            <span className="inline-flex items-center gap-1">{post.author?.display_name ?? "مستخدم Dz connect"}{post.author?.is_verified && <VerifiedBadge className="h-3.5 w-3.5" />}</span>
          </Link>
          <p className="truncate text-xs text-white/45" dir="ltr" style={{ textAlign: "start" }}>
            @{post.author?.username ?? "user"} · {timeAgoAr(post.created_at)}
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="خيارات المنشور"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white active:scale-90"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="glass-strong absolute end-0 top-10 z-20 w-44 animate-bubble-in overflow-hidden rounded-2xl p-1.5">
                <button
                  onClick={sharePost}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm text-white/85 transition hover:bg-white/[0.06]"
                >
                  <Share2 className="h-4 w-4" /> مشاركة المنشور
                </button>
                {isMine && (
                  <button
                    onClick={deletePost}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm text-red-300 transition hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" /> حذف المنشور
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* body */}
      {post.content && (
        <Link href={`/post/${post.id}`} className="block px-4 pt-3">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-white/90">{renderRichText(post.content)}</p>
        </Link>
      )}

      {post.image_url && (
        <div className="relative mt-3 select-none" onClick={onImageTap} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {post.media_type === "video" ? (
            <video src={post.image_url} controls playsInline preload="metadata" className="max-h-[480px] w-full bg-black object-contain" />
          ) : (
            <img src={post.image_url} alt={post.content ?? "صورة منشور"} className="max-h-[430px] w-full object-cover" loading="lazy" />
          )}
          {burst && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Heart className="heart-burst h-24 w-24 fill-red-500 text-red-400 drop-shadow-[0_10px_30px_rgba(244,63,94,0.6)]" />
            </span>
          )}
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          onClick={() => void toggleLike()}
          aria-label={liked ? "إلغاء الإعجاب" : "إعجاب"}
          aria-pressed={liked}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition active:scale-90",
            liked ? "text-red-400" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <Heart key={String(liked)} className={cn("h-[22px] w-[22px]", liked && "animate-heart-pop fill-red-500 text-red-500")} />
          <span className="min-w-5 text-center tabular-nums">{compactNumber(likeCount)}</span>
        </button>

        <button
          onClick={toggleComments}
          aria-expanded={commentsOpen}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition active:scale-90",
            commentsOpen ? "text-cyan-300" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
          )}
        >
          <MessageCircle className="h-[21px] w-[21px]" />
          <span className="min-w-5 text-center tabular-nums">{compactNumber(commentCount)}</span>
          <span className="hidden text-xs font-semibold xs:inline sm:inline">تعليق</span>
        </button>

        <span className="ms-auto flex items-center">
          <button
            onClick={() => void toggleSave()}
            aria-label={saved ? "إلغاء الحفظ" : "حفظ المنشور"}
            aria-pressed={saved}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90 ${
              saved ? "text-amber-300" : "text-white/60 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Bookmark className={`h-5 w-5 ${saved ? "fill-amber-300" : ""}`} />
          </button>
          <button
            onClick={sharePost}
            aria-label="مشاركة"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.05] hover:text-white active:scale-90"
          >
            <Share2 className="h-5 w-5" />
          </button>
        </span>
      </div>

      {/* live comments */}
      {commentsOpen && (
        <div className="animate-fade-up border-t border-white/[0.06] px-4 pb-4 pt-3">
          {!commentsLoaded ? (
            <p className="py-3 text-center text-xs text-white/40">جارٍ تحميل التعليقات…</p>
          ) : comments.length === 0 ? (
            <p className="py-3 text-center text-xs text-white/40">كن أول من يعلّق على هذا المنشور 💬</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5">
                  <Link href={comment.author ? `/u/${comment.author.username}` : "#"} className="mt-0.5 shrink-0">
                    <Avatar profile={comment.author} size="xs" />
                  </Link>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-ts-sm bg-white/[0.045] px-3 py-2 ring-1 ring-white/[0.05]">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="inline-flex items-center gap-1 text-[13px] font-bold text-white">{comment.author?.display_name ?? "مستخدم"}{comment.author?.is_verified && <VerifiedBadge className="h-3 w-3" />}</span>
                      <span className="text-[10px] text-white/35">{timeAgoAr(comment.created_at)}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{comment.content}</p>
                  </div>
                  {(user?.id === comment.author_id || isMine) && (
                    <button
                      aria-label="حذف التعليق"
                      onClick={async () => {
                        const { error } = await supabase.from("comments").delete().eq("id", comment.id);
                        if (!error) {
                          setComments((prev) => prev.filter((c) => c.id !== comment.id));
                          setCommentCount((c) => Math.max(0, c - 1));
                        }
                      }}
                      className="mt-1.5 text-white/30 transition hover:text-red-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div ref={commentsEndRef} />

          <div className="mt-3 flex items-center gap-2">
            <Avatar profile={me} size="xs" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 300))}
              onKeyDown={(e) => e.key === "Enter" && void sendComment()}
              placeholder="اكتب تعليقًا جميلًا…"
              className="input-glass min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm text-white"
              aria-label="كتابة تعليق"
            />
            <button
              onClick={() => void sendComment()}
              disabled={!draft.trim() || sending}
              className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
              aria-label="إرسال التعليق"
            >
              <SendHorizonal className="h-4 w-4 -scale-x-100" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
