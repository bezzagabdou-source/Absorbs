-- ═══════════════════════════════════════════════════════════════════════════
--  DZ CONNECT — Upgrade v2 (run ONCE after FULL-SETUP.sql, same SQL Editor)
--  Adds: Stories (24h) · Saved posts · Blocks · Verified badges
--  Calls / presence / voice+photo messages need NO migration (Realtime+Storage).
--  Idempotent: safe to paste & Run again.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────── stories (24h)
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  image_url  text not null,
  caption    text check (char_length(caption) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_feed_idx on public.stories (expires_at desc, created_at desc);

create table if not exists public.story_views (
  story_id  uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

-- ─────────────────────────────────────────────── saved posts (bookmarks)
create table if not exists public.saves (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ─────────────────────────────────────────────── blocks (protection)
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

-- ─────────────────────────────────────────────── verified badge
alter table public.profiles add column if not exists is_verified boolean not null default false;
update public.profiles set is_verified = true
where username in ('amine.dz', 'sarah.art', 'yacine_dev', 'nour.ph', 'karim.fit', 'lina.food');

-- ─────────────────────────────────────────────── RLS
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.saves enable row level security;
alter table public.blocks enable row level security;

drop policy if exists "stories_read" on public.stories;
create policy "stories_read" on public.stories
  for select to authenticated using (expires_at > now() or author_id = auth.uid());
drop policy if exists "stories_insert" on public.stories;
create policy "stories_insert" on public.stories
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "stories_delete" on public.stories;
create policy "stories_delete" on public.stories
  for delete to authenticated using (author_id = auth.uid());

drop policy if exists "story_views_read" on public.story_views;
create policy "story_views_read" on public.story_views
  for select to authenticated using (
    viewer_id = auth.uid()
    or exists (select 1 from public.stories s where s.id = story_id and s.author_id = auth.uid())
  );
drop policy if exists "story_views_insert" on public.story_views;
create policy "story_views_insert" on public.story_views
  for insert to authenticated with check (viewer_id = auth.uid());

drop policy if exists "saves_all" on public.saves;
create policy "saves_all" on public.saves
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "blocks_all" on public.blocks;
create policy "blocks_all" on public.blocks
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ─────────────────────────────────────────────── Realtime for stories
do $$
begin
  begin
    alter publication supabase_realtime add table public.stories;
  exception when duplicate_object then null; end;
end $$;

-- Done ✅  Stories, saves, blocks and verified badges are live.
