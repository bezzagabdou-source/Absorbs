-- ═══════════════════════════════════════════════════════════════════════════
--  Absorbs — Complete Supabase schema (run ONCE in the SQL Editor)
--  Dashboard → SQL Editor → New query → paste this whole file → Run
--  Creates: profiles · posts · likes · comments · follows · DM threads/messages
--           + RLS policies + auth trigger + storage buckets + Realtime + RPC
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────── profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio         text check (char_length(bio) <= 160),
  avatar_url  text,
  cover_url   text,
  website     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────── posts
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text check (char_length(content) <= 500),
  image_url  text,
  created_at timestamptz not null default now(),
  constraint posts_needs_content check (content is not null or image_url is not null)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

-- ─────────────────────────────────────────────── likes
create table if not exists public.likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists likes_user_idx on public.likes (user_id, created_at desc);

-- ─────────────────────────────────────────────── comments
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

-- ─────────────────────────────────────────────── follows
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- ─────────────────────────────────────────────── direct messages
create table if not exists public.dm_threads (
  id              uuid primary key default gen_random_uuid(),
  user_low        uuid not null references public.profiles (id) on delete cascade,
  user_high       uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  constraint dm_threads_ordered check (user_low < user_high),
  constraint dm_threads_unique_pair unique (user_low, user_high)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.dm_threads (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists messages_unread_idx on public.messages (thread_id) where read_at is null;

-- ═══════════════════════════════════════════════ helper: am I in this thread?
create or replace function public.is_thread_participant(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_threads t
    where t.id = p_thread and (t.user_low = auth.uid() or t.user_high = auth.uid())
  );
$$;

-- ═══════════════════════════════════════════════ auth trigger → profile row
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  suffix int := 0;
begin
  base_username := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  ));
  base_username := regexp_replace(base_username, '[^a-z0-9_.]', '_', 'g');
  if char_length(base_username) < 3 then
    base_username := base_username || 'user';
  end if;
  base_username := substr(base_username, 1, 20);

  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := substr(base_username, 1, 15) || '_' || substr(md5(random()::text), 1, 4 + least(suffix, 3));
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), candidate)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════ profiles.updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════ thread last_message_at
create or replace function public.bump_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_thread on public.messages;
create trigger messages_bump_thread
  after insert on public.messages
  for each row execute function public.bump_thread();

-- ═══════════════════════════════════════════════ RPC: get or create 1-to-1 thread
create or replace function public.get_or_create_thread(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  low uuid;
  high uuid;
  thread_id uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_other is null or p_other = me then raise exception 'invalid_peer'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'peer_not_found';
  end if;

  low := least(me, p_other);
  high := greatest(me, p_other);

  insert into public.dm_threads (user_low, user_high)
  values (low, high)
  on conflict (user_low, user_high) do nothing;

  select id into thread_id from public.dm_threads
  where user_low = low and user_high = high;

  return thread_id;
end;
$$;

revoke all on function public.get_or_create_thread(uuid) from public;
grant execute on function public.get_or_create_thread(uuid) to authenticated;

-- ═══════════════════════════════════════════════ Row Level Security
alter table public.profiles   enable row level security;
alter table public.posts      enable row level security;
alter table public.likes      enable row level security;
alter table public.comments   enable row level security;
alter table public.follows    enable row level security;
alter table public.dm_threads enable row level security;
alter table public.messages   enable row level security;

-- profiles: everyone signed-in can discover people; you edit only yourself
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete to authenticated using (id = auth.uid());

-- posts
drop policy if exists "posts_read" on public.posts;
create policy "posts_read" on public.posts
  for select to authenticated using (true);
drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "posts_update" on public.posts;
create policy "posts_update" on public.posts
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "posts_delete" on public.posts;
create policy "posts_delete" on public.posts
  for delete to authenticated using (author_id = auth.uid());

-- likes
drop policy if exists "likes_read" on public.likes;
create policy "likes_read" on public.likes
  for select to authenticated using (true);
drop policy if exists "likes_insert" on public.likes;
create policy "likes_insert" on public.likes
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "likes_delete" on public.likes;
create policy "likes_delete" on public.likes
  for delete to authenticated using (user_id = auth.uid());

-- comments (deletable by comment author or post owner)
drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments
  for select to authenticated using (true);
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- follows
drop policy if exists "follows_read" on public.follows;
create policy "follows_read" on public.follows
  for select to authenticated using (true);
drop policy if exists "follows_insert" on public.follows;
create policy "follows_insert" on public.follows
  for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists "follows_delete" on public.follows;
create policy "follows_delete" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

-- dm_threads: only the two participants
drop policy if exists "threads_read" on public.dm_threads;
create policy "threads_read" on public.dm_threads
  for select to authenticated using (user_low = auth.uid() or user_high = auth.uid());
drop policy if exists "threads_insert" on public.dm_threads;
create policy "threads_insert" on public.dm_threads
  for insert to authenticated with check (user_low = auth.uid() or user_high = auth.uid());

-- messages: participants only; receiver may mark as read
drop policy if exists "messages_read" on public.messages;
create policy "messages_read" on public.messages
  for select to authenticated using (public.is_thread_participant(thread_id));
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.is_thread_participant(thread_id)
  );
drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update to authenticated
  using (public.is_thread_participant(thread_id) and sender_id <> auth.uid())
  with check (public.is_thread_participant(thread_id) and sender_id <> auth.uid());
drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages
  for delete to authenticated using (sender_id = auth.uid());

-- ═══════════════════════════════════════════════ Storage buckets (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read" on storage.objects
  for select to public using (bucket_id in ('avatars', 'post-images'));

drop policy if exists "storage_upload_own" on storage.objects;
create policy "storage_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_update_own" on storage.objects;
create policy "storage_update_own" on storage.objects
  for update to authenticated using (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage_delete_own" on storage.objects;
create policy "storage_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id in ('avatars', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ═══════════════════════════════════════════════ Realtime (live feed, likes, comments, DMs)
do $$
begin
  begin
    alter publication supabase_realtime add table public.posts;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.likes;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.comments;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.dm_threads;
  exception when duplicate_object then null; end;
end $$;

-- REPLICA IDENTITY FULL so DELETE events carry the full old row (feed/comment cleanup)
alter table public.posts replica identity full;
alter table public.comments replica identity full;
alter table public.likes replica identity full;
alter table public.messages replica identity full;

-- Done ✅  Create two accounts from the app, then try: post, like, comment,
-- and message each other by @username — everything updates in realtime.
