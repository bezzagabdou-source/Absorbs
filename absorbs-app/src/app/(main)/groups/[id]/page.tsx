"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, LogIn, LogOut, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { fetchGroupPosts } from "@/lib/queries";
import { Composer } from "@/components/feed/composer";
import { PostCard } from "@/components/feed/post-card";
import { EmptyState, FullPageLoader, PostSkeleton } from "@/components/ui/feedback";
import { cn, isSchemaMissing } from "@/lib/utils";
import type { Group, Post } from "@/lib/types";

/** Group room: members + dedicated post stream (posts with group_id). */
export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [groupId, setGroupId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    params.then((p) => setGroupId(p.id));
  }, [params]);

  const load = useCallback(async () => {
    if (!user || !groupId) return;
    const { data: g, error } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
    if (error) {
      if (isSchemaMissing(error)) setUnavailable(true);
      setLoading(false);
      return;
    }
    if (!g) {
      setLoading(false);
      return;
    }
    const [{ count }, { data: membership }] = await Promise.all([
      supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId),
      supabase.from("group_members").select("group_id").eq("group_id", groupId).eq("user_id", user.id).maybeSingle(),
    ]);
    setGroup({ ...(g as Group), member_count: count ?? 0, joined: Boolean(membership) });
    try {
      setPosts(await fetchGroupPosts(supabase, user.id, groupId));
    } catch {
      setPosts([]);
    }
    setLoading(false);
  }, [supabase, user, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleJoin = async () => {
    if (!user || !group) return;
    if (group.joined) {
      await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", user.id);
      setGroup({ ...group, joined: false, member_count: Math.max(0, (group.member_count ?? 1) - 1) });
      toast("غادرت المجموعة");
    } else {
      const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id });
      if (!error) {
        setGroup({ ...group, joined: true, member_count: (group.member_count ?? 0) + 1 });
        toast(`أهلًا بك في ${group.name} 🎉`);
      }
    }
  };

  if (loading) return <FullPageLoader label="جارٍ فتح المجموعة…" />;
  if (unavailable) {
    return (
      <EmptyState icon={<UsersRound className="h-6 w-6" />} title="المجتمعات غير مفعّلة بعد" description="نفّذ upgrade-v3.sql في Supabase لتفعيلها.">
        <Link href="/groups" className="btn-primary rounded-full px-5 py-2.5 text-sm font-bold text-white">كل المجتمعات</Link>
      </EmptyState>
    );
  }
  if (!group) {
    return (
      <EmptyState icon={<span className="text-2xl">🔍</span>} title="المجموعة غير موجودة" description="ربما حُذفت أو الرابط غير صحيح.">
        <Link href="/groups" className="btn-primary rounded-full px-5 py-2.5 text-sm font-bold text-white">تصفح المجتمعات</Link>
      </EmptyState>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Link href="/groups" className="flex items-center gap-1.5 text-sm font-bold text-white/60 transition hover:text-white">
        <ArrowRight className="h-4 w-4" /> كل المجتمعات
      </Link>

      <section className="glass relative overflow-hidden rounded-[28px] p-5">
        <div className="pointer-events-none absolute -top-14 end-0 h-40 w-40 rounded-full bg-indigo-400/20 blur-[60px]" />
        <div className="relative flex items-start gap-3.5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-indigo-400/30 to-cyan-500/25 text-4xl ring-1 ring-white/15">
            {group.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-white">{group.name}</h1>
            <p className="mt-0.5 text-xs text-white/50">
              {group.member_count ?? 0} عضو{group.wilaya ? ` · ولاية ${group.wilaya}` : ""}
            </p>
            {group.description && <p className="mt-2 text-sm leading-6 text-white/70">{group.description}</p>}
          </div>
          <button
            onClick={() => void toggleJoin()}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition active:scale-95",
              group.joined ? "bg-white/[0.07] text-white/75 ring-1 ring-white/10" : "btn-primary text-white",
            )}
          >
            {group.joined ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {group.joined ? "مغادرة" : "انضم"}
          </button>
        </div>
      </section>

      {group.joined ? (
        <Composer groupId={group.id} onPosted={(post) => setPosts((prev) => [post, ...prev])} />
      ) : (
        <p className="glass rounded-[22px] px-4 py-3.5 text-center text-sm text-white/60">انضم إلى المجموعة لتتمكن من النشر فيها ✍️</p>
      )}

      {posts.length === 0 ? (
        <EmptyState icon={<span className="text-2xl">💬</span>} title="لا منشورات في هذه المجموعة بعد" description="كن أول من يفتح النقاش هنا!" />
      ) : (
        <div className="stagger space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
