"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Eye, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { useStartChat } from "@/components/social/user-actions";
import { Avatar } from "@/components/ui/avatar";
import { cn, compressImage, isSchemaMissing, timeAgoAr } from "@/lib/utils";
import type { Profile, Story } from "@/lib/types";

interface StoryGroup {
  author: Profile;
  stories: Story[];
  allViewed: boolean;
}

/** Instagram-style stories row + fullscreen viewer. Needs upgrade-v2.sql (hides itself gracefully without it). */
export function StoriesRow({ blockedIds }: { blockedIds?: Set<string> }) {
  const { user, profile: me } = useAuth();
  const { toast } = useToast();
  const { startChat } = useStartChat();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [available, setAvailable] = useState(true);
  const [viewer, setViewer] = useState<{ group: number; index: number } | null>(null);
  const [preview, setPreview] = useState<{ file: File; url: string; caption: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("stories")
      .select(
        `id, author_id, image_url, caption, created_at, expires_at,
         author:profiles!stories_author_id_fkey ( id, username, display_name, bio, avatar_url, cover_url, website, is_verified, created_at, updated_at )`,
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(120);
    if (error) {
      if (isSchemaMissing(error)) setAvailable(false);
      return;
    }
    const rows = ((data ?? []) as unknown as Array<Story & { author: Profile | null }>).filter(
      (r) => r.author && !blockedIds?.has(r.author_id),
    );
    const { data: views } = await supabase.from("story_views").select("story_id").eq("viewer_id", user.id);
    const viewedSet = new Set(((views ?? []) as { story_id: string }[]).map((v) => v.story_id));

    const byAuthor = new Map<string, StoryGroup>();
    for (const row of rows) {
      const story: Story = { ...row, author: row.author ?? undefined, viewed_by_me: viewedSet.has(row.id) };
      const group = byAuthor.get(row.author_id);
      if (group) group.stories.push(story);
      else if (row.author) byAuthor.set(row.author_id, { author: row.author, stories: [story], allViewed: false });
    }
    const list = [...byAuthor.values()].map((g) => ({
      ...g,
      stories: [...g.stories].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
      allViewed: g.stories.every((s) => s.viewed_by_me || s.author_id === user.id),
    }));
    list.sort((a, b) => {
      if (a.author.id === user.id) return -1;
      if (b.author.id === user.id) return 1;
      if (a.allViewed !== b.allViewed) return a.allViewed ? 1 : -1;
      return +new Date(b.stories[0].created_at) - +new Date(a.stories[0].created_at);
    });
    setGroups(list);
  }, [supabase, user, blockedIds]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("stories-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const openViewer = (groupIdx: number) => {
    const group = groups[groupIdx];
    if (!group) return;
    const firstUnviewed = group.stories.findIndex((s) => !s.viewed_by_me && s.author_id !== user?.id);
    setViewer({ group: groupIdx, index: firstUnviewed === -1 ? 0 : firstUnviewed });
  };

  const current = viewer ? groups[viewer.group]?.stories[viewer.index] : undefined;

  /* mark viewed */
  useEffect(() => {
    if (!current || !user || current.author_id === user.id || current.viewed_by_me) return;
    supabase
      .from("story_views")
      .insert({ story_id: current.id, viewer_id: user.id })
      .then(() => {
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            stories: g.stories.map((s) => (s.id === current.id ? { ...s, viewed_by_me: true } : s)),
            allViewed: g.stories.every((s) => s.viewed_by_me || s.id === current.id || s.author_id === user.id),
          })),
        );
      });
  }, [current, supabase, user]);

  /* auto-advance */
  useEffect(() => {
    if (!viewer) return;
    const t = setTimeout(() => advance(1), 5200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const advance = (dir: 1 | -1) => {
    setViewer((v) => {
      if (!v) return v;
      const group = groups[v.group];
      if (!group) return null;
      const nextIndex = v.index + dir;
      if (nextIndex < group.stories.length && nextIndex >= 0) return { group: v.group, index: nextIndex };
      const nextGroup = v.group + dir;
      if (nextGroup < 0 || nextGroup >= groups.length) return null;
      return { group: nextGroup, index: dir === 1 ? 0 : groups[nextGroup].stories.length - 1 };
    });
  };

  const publishStory = async () => {
    if (!preview || !user || publishing) return;
    setPublishing(true);
    try {
      const blob = await compressImage(preview.file, 1400, 0.85);
      const path = `${user.id}/story-${crypto.randomUUID()}.jpg`;
      const { error: upError } = await supabase.storage.from("post-images").upload(path, blob, { contentType: "image/jpeg" });
      if (upError) throw upError;
      const url = supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("stories").insert({
        author_id: user.id,
        image_url: url,
        caption: preview.caption.trim() || null,
      });
      if (error) throw error;
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      toast("تم نشر قصتك — تختفي بعد 24 ساعة ⏳");
      void load();
    } catch (err) {
      toast(isSchemaMissing(err as { code?: string }) ? "فعّل القصص: نفّذ upgrade-v2.sql في Supabase" : "تعذّر نشر القصة", "error");
    } finally {
      setPublishing(false);
    }
  };

  const deleteStory = async (story: Story) => {
    await supabase.from("stories").delete().eq("id", story.id);
    setViewer(null);
    void load();
    toast("تم حذف القصة");
  };

  if (!available) return null;

  const myGroupIdx = groups.findIndex((g) => g.author.id === user?.id);

  return (
    <section className="animate-fade-up" aria-label="القصص">
      <div className="no-scrollbar -mx-3.5 flex gap-4 overflow-x-auto px-4 pb-1 pt-1">
        {/* add mine */}
        <button onClick={() => fileRef.current?.click()} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
          <span className="relative">
            <Avatar profile={me} size="lg" />
            <span className="btn-primary absolute -bottom-0.5 -end-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-[#0B0F1D]">
              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          </span>
          <span className="w-full truncate text-[11px] font-semibold text-white/70">قصتك</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPreview({ file, url: URL.createObjectURL(file), caption: "" });
            e.target.value = "";
          }}
        />

        {groups.map((group, idx) =>
          group.author.id === user?.id ? null : (
            <button key={group.author.id} onClick={() => openViewer(idx)} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "rounded-full p-[2.5px]",
                  group.allViewed ? "bg-white/20" : "ring-conic",
                )}
              >
                <span className="block rounded-full bg-[#0B0F1D] p-[2px]">
                  <Avatar profile={group.author} size="lg" />
                </span>
              </span>
              <span className="w-full truncate text-[11px] font-semibold text-white/70">{group.author.display_name.split(" ")[0]}</span>
            </button>
          ),
        )}
        {myGroupIdx >= 0 && (
          <span className="sr-only">لديك قصة منشورة — افتحها من بروفايلك أو أعد نشر صورة جديدة من قصتك</span>
        )}
      </div>

      {/* ── publish preview ── */}
      {preview && (
        <div className="keep-dark fixed inset-0 z-[95] flex flex-col bg-black/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <h3 className="flex items-center gap-2 font-black text-white">
              <Camera className="h-5 w-5 text-indigo-300" /> قصة جديدة
            </h3>
            <button
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
              aria-label="إلغاء"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mx-auto mt-4 aspect-[9/16] max-h-[62dvh] w-auto max-w-[92vw] overflow-hidden rounded-[28px] ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt="معاينة القصة" className="h-full w-full object-cover" />
            {preview.caption && (
              <p className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/55 px-3 py-2 text-center text-sm font-bold text-white backdrop-blur">
                {preview.caption}
              </p>
            )}
          </div>
          <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-4">
            <input
              value={preview.caption}
              onChange={(e) => setPreview({ ...preview, caption: e.target.value.slice(0, 120) })}
              placeholder="أضف تعليقًا على القصة…"
              className="input-glass min-w-0 flex-1 rounded-full px-4 py-3 text-sm text-white"
            />
            <button onClick={() => void publishStory()} disabled={publishing} className="btn-primary shrink-0 rounded-full px-5 py-3 text-sm font-black text-white">
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "نشر القصة"}
            </button>
          </div>
        </div>
      )}

      {/* ── fullscreen viewer ── */}
      {viewer && current && (
        <div className="keep-dark fixed inset-0 z-[96] flex flex-col bg-black" role="dialog" aria-label="عارض القصص">
          {/* progress */}
          <div className="flex gap-1.5 px-3 pt-[max(0.8rem,env(safe-area-inset-top))]">
            {groups[viewer.group].stories.map((s, i) => (
              <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <span
                  key={i === viewer.index ? current.id : s.id}
                  className={cn("block h-full w-full origin-left rounded-full bg-white", i < viewer.index && "scale-x-100", i > viewer.index && "scale-x-0")}
                  style={
                    i === viewer.index
                      ? { animation: "storybar 5.2s linear forwards", transformOrigin: "left" }
                      : undefined
                  }
                />
              </span>
            ))}
          </div>

          {/* header */}
          <div className="flex items-center gap-2.5 px-4 py-3">
            <Avatar profile={groups[viewer.group].author} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{groups[viewer.group].author.display_name}</p>
              <p className="text-[11px] text-white/50">{timeAgoAr(current.created_at)} · تختفي بعد 24 ساعة</p>
            </div>
            {current.author_id === user?.id && (
              <button onClick={() => void deleteStory(current)} aria-label="حذف القصة" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setViewer(null)} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* media + tap zones */}
          <div className="relative flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.image_url} alt={current.caption ?? "قصة"} className="absolute inset-0 h-full w-full object-contain" />
            <button aria-label="السابق" onClick={() => advance(-1)} className="absolute inset-y-0 start-0 flex w-1/3 items-center justify-start ps-2 text-white/0">
              <ChevronRight className="h-8 w-8" />
            </button>
            <button aria-label="التالي" onClick={() => advance(1)} className="absolute inset-y-0 end-0 flex w-1/3 items-center justify-end pe-2 text-white/0">
              <ChevronLeft className="h-8 w-8" />
            </button>
            {current.caption && (
              <p className="absolute inset-x-4 bottom-5 rounded-3xl bg-black/55 px-4 py-3 text-center text-[15px] font-bold leading-7 text-white backdrop-blur">
                {current.caption}
              </p>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center gap-2 px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-2">
            {current.author_id === user?.id ? (
              <StoryViewers supabase={supabase} storyId={current.id} />
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-xs text-white/60">
                  <Eye className="h-4 w-4" /> قصة {groups[viewer.group].author.display_name.split(" ")[0]}
                </span>
                <button
                  onClick={() => {
                    const author = groups[viewer.group].author;
                    setViewer(null);
                    void startChat(author);
                  }}
                  className="btn-primary ms-auto rounded-full px-5 py-2.5 text-sm font-bold text-white"
                >
                  رد برسالة خاصة
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StoryViewers({ supabase, storyId }: { supabase: ReturnType<typeof createClient>; storyId: string }) {
  const [viewers, setViewers] = useState<Profile[]>([]);
  useEffect(() => {
    supabase
      .from("story_views")
      .select("viewer:profiles!story_views_viewer_id_fkey ( id, username, display_name, avatar_url )")
      .eq("story_id", storyId)
      .then(({ data }: { data: Array<{ viewer: Profile | null }> | null }) => {
        setViewers((data ?? []).map((r) => r.viewer).filter((v): v is Profile => Boolean(v)));
      });
  }, [supabase, storyId]);

  if (viewers.length === 0) return <span className="text-xs text-white/50">لم يشاهدها أحد بعد — شارك بروفايلك ليصلك الجمهور</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="flex -space-x-2 space-x-reverse">
        {viewers.slice(0, 4).map((v) => (
          <Avatar key={v.id} profile={v} size="xs" className="ring-2 ring-black" />
        ))}
      </span>
      <span className="text-xs font-semibold text-white/75">شاهدها {viewers.length} {viewers.length === 1 ? "شخص" : "أشخاص"}</span>
    </div>
  );
}
