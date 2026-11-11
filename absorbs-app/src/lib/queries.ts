import type { SupabaseClient } from "@supabase/supabase-js";
import type { DmThread, Message, Post, PostComment, PostRow, Profile } from "./types";

const POST_SELECT = `
  id, author_id, content, image_url, created_at,
  author:profiles!posts_author_id_fkey ( id, username, display_name, bio, avatar_url, cover_url, website, created_at, updated_at ),
  likes ( count ),
  comments ( count )
`;

function mapPost(row: PostRow, myLikes: Set<string>): Post {
  return {
    id: row.id,
    author_id: row.author_id,
    content: row.content,
    image_url: row.image_url,
    created_at: row.created_at,
    author: row.author ?? undefined,
    like_count: row.likes?.[0]?.count ?? 0,
    comment_count: row.comments?.[0]?.count ?? 0,
    liked_by_me: myLikes.has(row.id),
  };
}

async function myLikedPostIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("likes").select("post_id").eq("user_id", userId);
  return new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
}

export async function fetchFeed(supabase: SupabaseClient, userId: string, limit = 30): Promise<Post[]> {
  const [{ data, error }, myLikes] = await Promise.all([
    supabase.from("posts").select(POST_SELECT).order("created_at", { ascending: false }).limit(limit),
    myLikedPostIds(supabase, userId),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as PostRow[]).map((r) => mapPost(r, myLikes));
}

export async function fetchUserPosts(
  supabase: SupabaseClient,
  profileId: string,
  viewerId: string,
): Promise<Post[]> {
  const [{ data, error }, myLikes] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("author_id", profileId)
      .order("created_at", { ascending: false }),
    myLikedPostIds(supabase, viewerId),
  ]);
  if (error) throw error;
  return ((data ?? []) as unknown as PostRow[]).map((r) => mapPost(r, myLikes));
}

export async function fetchLikedPosts(supabase: SupabaseClient, userId: string): Promise<Post[]> {
  const { data: likeRows, error } = await supabase
    .from("likes")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const ids = (likeRows ?? []).map((r: { post_id: string }) => r.post_id);
  if (ids.length === 0) return [];
  const myLikes = new Set(ids);
  const { data, error: postsError } = await supabase.from("posts").select(POST_SELECT).in("id", ids);
  if (postsError) throw postsError;
  const byId = new Map(((data ?? []) as unknown as PostRow[]).map((r) => [r.id, mapPost(r, myLikes)]));
  return ids.map((id) => byId.get(id)).filter((p): p is Post => Boolean(p));
}

export async function fetchSinglePost(supabase: SupabaseClient, postId: string, userId: string): Promise<Post | null> {
  const [{ data, error }, myLikes] = await Promise.all([
    supabase.from("posts").select(POST_SELECT).eq("id", postId).maybeSingle(),
    myLikedPostIds(supabase, userId),
  ]);
  if (error) throw error;
  return data ? mapPost(data as unknown as PostRow, myLikes) : null;
}

/** Refresh just the counters of one post (used after Realtime events). */
export async function fetchPostCounts(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
): Promise<{ like_count: number; comment_count: number; liked_by_me: boolean } | null> {
  const [{ count: likeCount }, { count: commentCount }, { data: mine }] = await Promise.all([
    supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("comments").select("*", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("likes").select("post_id").eq("post_id", postId).eq("user_id", userId).maybeSingle(),
  ]);
  return { like_count: likeCount ?? 0, comment_count: commentCount ?? 0, liked_by_me: Boolean(mine) };
}

export async function fetchComments(supabase: SupabaseClient, postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(
      `id, post_id, author_id, content, created_at,
       author:profiles!comments_author_id_fkey ( id, username, display_name, bio, avatar_url, cover_url, website, created_at, updated_at )`,
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<PostComment & { author: Profile | null }>).map((c) => ({
    ...c,
    author: c.author ?? undefined,
  }));
}

export async function fetchProfileByUsername(supabase: SupabaseClient, username: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("username", username.toLowerCase()).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function fetchFollowStats(
  supabase: SupabaseClient,
  profileId: string,
  viewerId: string,
): Promise<{ followers: number; following: number; is_following: boolean }> {
  const [{ count: followers }, { count: following }, { data: mine }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profileId),
    profileId === viewerId
      ? Promise.resolve({ data: null })
      : supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", profileId).maybeSingle(),
  ]);
  return { followers: followers ?? 0, following: following ?? 0, is_following: Boolean(mine) };
}

/* ───────────────────────── Direct messages ───────────────────────── */

export async function fetchThreads(supabase: SupabaseClient, userId: string): Promise<DmThread[]> {
  const { data, error } = await supabase
    .from("dm_threads")
    .select("*")
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  const threads = (data ?? []) as DmThread[];
  if (threads.length === 0) return [];

  const otherIds = [...new Set(threads.map((t) => (t.user_low === userId ? t.user_high : t.user_low)))];
  const threadIds = threads.map((t) => t.id);
  const [{ data: profiles }, { data: lastMessages }, { data: unread }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", otherIds),
    supabase.from("messages").select("*").in("thread_id", threadIds).order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("thread_id")
      .in("thread_id", threadIds)
      .neq("sender_id", userId)
      .is("read_at", null),
  ]);

  const profileById = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));
  const lastByThread = new Map<string, Message>();
  for (const m of (lastMessages ?? []) as Message[]) {
    if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m);
  }
  const unreadByThread = new Map<string, number>();
  for (const m of (unread ?? []) as { thread_id: string }[]) {
    unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
  }

  return threads.map((t) => ({
    ...t,
    other_user: profileById.get(t.user_low === userId ? t.user_high : t.user_low),
    last_message: lastByThread.get(t.id) ?? null,
    unread_count: unreadByThread.get(t.id) ?? 0,
  }));
}

export async function fetchTotalUnread(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: threads } = await supabase.from("dm_threads").select("id").or(`user_low.eq.${userId},user_high.eq.${userId}`);
  const ids = ((threads ?? []) as { id: string }[]).map((t) => t.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .in("thread_id", ids)
    .neq("sender_id", userId)
    .is("read_at", null);
  return count ?? 0;
}
