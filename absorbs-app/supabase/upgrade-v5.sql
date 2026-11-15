-- ═══════════════════════════════════════════════════════════════════════════
-- Dz connect — UPGRADE v5 (run ONCE in Supabase SQL Editor, after v2/v3/v4)
-- Adds threaded comment replies for the native Compose app (v3.0.0).
-- Safe to re-run: every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- Comment replies: a comment may answer another comment on the same post.
alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

-- Make sure direct messages stream over Supabase Realtime (native chat).
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- Helpful feed/profile indexes (no-ops if they already exist).
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists likes_post_idx on public.likes (post_id);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at asc);
