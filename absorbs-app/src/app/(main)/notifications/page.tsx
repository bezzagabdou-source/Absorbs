"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellRing, Heart, MessageCircle, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import { timeAgoAr } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NOTIF_SEEN_KEY = "dzconnect-notif-seen";

interface ActivityItem {
  id: string;
  type: "like" | "comment" | "follow";
  actor: Profile | null;
  post_id: string | null;
  text: string | null;
  created_at: string;
}

/** Derived activity feed (likes/comments on my posts + new followers) — no extra table needed. */
export default function NotificationsPage() {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: myPosts } = await supabase.from("posts").select("id").eq("author_id", user.id).limit(200);
      const postIds = ((myPosts ?? []) as { id: string }[]).map((p) => p.id);

      const [likes, comments, follows] = await Promise.all([
        postIds.length
          ? supabase
              .from("likes")
              .select("post_id, created_at, actor:profiles!likes_user_id_fkey ( id, username, display_name, avatar_url, is_verified )")
              .in("post_id", postIds)
              .neq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [] }),
        postIds.length
          ? supabase
              .from("comments")
              .select("id, post_id, content, created_at, actor:profiles!comments_author_id_fkey ( id, username, display_name, avatar_url, is_verified )")
              .in("post_id", postIds)
              .neq("author_id", user.id)
              .order("created_at", { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [] }),
        supabase
          .from("follows")
          .select("created_at, actor:profiles!follows_follower_id_fkey ( id, username, display_name, avatar_url, is_verified )")
          .eq("following_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;
      const merged: ActivityItem[] = [
        ...(((likes.data ?? []) as unknown as Array<{ post_id: string; created_at: string; actor: Profile | null }>).map((l, i) => ({
          id: `like-${l.post_id}-${i}`,
          type: "like" as const,
          actor: l.actor,
          post_id: l.post_id,
          text: null,
          created_at: l.created_at,
        }))),
        ...(((comments.data ?? []) as unknown as Array<{ id: string; post_id: string; content: string; created_at: string; actor: Profile | null }>).map((c) => ({
          id: `comment-${c.id}`,
          type: "comment" as const,
          actor: c.actor,
          post_id: c.post_id,
          text: c.content,
          created_at: c.created_at,
        }))),
        ...(((follows.data ?? []) as unknown as Array<{ created_at: string; actor: Profile | null }>).map((f, i) => ({
          id: `follow-${i}-${f.created_at}`,
          type: "follow" as const,
          actor: f.actor,
          post_id: null,
          text: null,
          created_at: f.created_at,
        }))),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      setItems(merged.slice(0, 60));
      setLoading(false);
      try {
        localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString());
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user]);

  const iconFor = (type: ActivityItem["type"]) =>
    type === "like" ? (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-400 ring-1 ring-red-400/25">
        <Heart className="h-4 w-4 fill-red-400" />
      </span>
    ) : type === "comment" ? (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400/12 text-cyan-600 ring-1 ring-cyan-300/25">
        <MessageCircle className="h-4 w-4" />
      </span>
    ) : (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-400/12 text-indigo-600 ring-1 ring-indigo-300/25">
        <UserPlus className="h-4 w-4" />
      </span>
    );

  const labelFor = (item: ActivityItem) =>
    item.type === "like" ? "أعجب بمنشورك" : item.type === "comment" ? "علّق على منشورك" : "بدأ بمتابعتك";

  return (
    <div className="space-y-4">
      <div className="animate-fade-up px-1 pt-1">
        <h1 className="flex items-center gap-2 text-[22px] font-black text-slate-900">
          <BellRing className="h-6 w-6 text-indigo-600" /> الإشعارات
        </h1>
        <p className="mt-1 text-sm text-slate-900/50">كل تفاعلات أصدقائك معك — إعجابات وتعاليق ومتابعون جدد.</p>
      </div>

      {loading ? (
        <FullPageLoader label="جارٍ تحميل الإشعارات…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="لا إشعارات بعد"
          description="عند إعجاب أحد بمنشوراتك أو تعليقه عليها أو متابعتك، سيظهر هنا فورًا."
        />
      ) : (
        <ul className="stagger space-y-2.5">
          {items.map((item) => {
            const href = item.post_id ? `/post/${item.post_id}` : item.actor ? `/u/${item.actor.username}` : "#";
            return (
              <li key={item.id}>
                <Link href={href} className="glass flex items-center gap-3 rounded-[24px] p-3 transition hover:bg-slate-900/[0.05] active:scale-[0.99]">
                  {iconFor(item.type)}
                  <Avatar profile={item.actor} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900/85">
                      <b className="text-slate-900">{item.actor?.display_name ?? "مستخدم"}</b> {labelFor(item)}
                    </span>
                    {item.text && <span className="mt-0.5 block truncate text-[13px] text-slate-900/50">“{item.text}”</span>}
                    <span className="mt-0.5 block text-[11px] text-slate-900/35">{timeAgoAr(item.created_at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
