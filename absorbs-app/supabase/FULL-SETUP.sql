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
-- ═══════════════════════════════════════════════════════════════════════════
--  Absorbs — SEED: demo accounts + posts + likes + comments + follows + DM
--  Run AFTER schema.sql, in the same SQL Editor. Safe to re-run (idempotent).
--
--  Demo logins (same password for all):  Absorbs@2026
--    amine@absorbs.dz · sarah@absorbs.dz · yacine@absorbs.dz
--    nour@absorbs.dz  · karim@absorbs.dz  · lina@absorbs.dz
--
--  ⚠️ Demo content only: delete these accounts before real launch
--     (cleanup snippet at the very bottom of this file).
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public, extensions, auth;

-- ─────────────────────────────────────────────── 1) demo auth users
-- (the handle_new_user trigger auto-creates their public profiles)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'amine@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"amine.dz","display_name":"أمين بن يوسف"}', now() - interval '30 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'sarah@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"sarah.art","display_name":"سارة مرابط"}', now() - interval '28 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'yacine@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"yacine_dev","display_name":"ياسين بلعيد"}', now() - interval '25 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'nour@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"nour.ph","display_name":"نور الهدى قادري"}', now() - interval '22 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
   'karim@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"karim.fit","display_name":"كريم حداد"}', now() - interval '19 days', now()),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated',
   'lina@absorbs.dz', crypt('Absorbs@2026', gen_salt('bf', 10)), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"username":"lina.food","display_name":"لينا بوقرة"}', now() - interval '16 days', now())
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id, id, id::text,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users
where email like '%@absorbs.dz'
on conflict (id) do nothing;

-- ─────────────────────────────────────────────── 2) polish demo profiles (avatars + bios)
update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/men/32.jpg',
  bio = 'مصور هاوٍ من وهران 📸 نحب نشارك لحظاتي معاكم'
where username = 'amine.dz';

update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/women/44.jpg',
  bio = 'رسامة رقمية ✏️ فن، ألوان، وقهوة'
where username = 'sarah.art';

update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/men/75.jpg',
  bio = 'مطور ويب Full-Stack 💻 نبني منتجات من الجزائر للعالم'
where username = 'yacine_dev';

update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/women/65.jpg',
  bio = 'مصورة فوتوغرافية 📷 القصبة والعاصمة القديمة عشقي'
where username = 'nour.ph';

update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/men/41.jpg',
  bio = 'مدرب لياقة 🏃‍♂️ كل يوم خطوة أقرب لهدفك'
where username = 'karim.fit';

update public.profiles set
  avatar_url = 'https://randomuser.me/api/portraits/women/21.jpg',
  bio = 'طباخة شغوفة 🍲 وصفات جزائرية أصيلة بلمسة عصرية'
where username = 'lina.food';

-- ─────────────────────────────────────────────── 3) demo posts (text + photos)
insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000001', p.id,
       'وهران اليوم كانت تحفة 🌅 البحر، النسيم، والقهوة على الكورنيش… وش رايكم في الصورة؟',
       'https://picsum.photos/seed/absorbs-oran/900/700', now() - interval '2 hours'
from public.profiles p where p.username = 'amine.dz'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000002', p.id,
       'أخيرًا كمّلت اللوحة الجديدة 🎨 ثلاث أسابيع من الشغل… التفاصيل الصغيرة هي لي تصنع الفرق',
       'https://picsum.photos/seed/absorbs-art/900/700', now() - interval '4 hours'
from public.profiles p where p.username = 'sarah.art'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000003', p.id,
       'اليوم أطلقت خاصية الـ Realtime في مشروعي 🚀 الرسالة توصل في أقل من ثانية. السر؟ WebSockets + تصميم صح من الأول، بلا اختصارات.',
       null, now() - interval '6 hours'
from public.profiles p where p.username = 'yacine_dev'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000004', p.id,
       'القصبة في الصباح الباكر لها سحر ما يتوصفش 🏛️ كل زقاق يحكي قصة…',
       'https://picsum.photos/seed/absorbs-casbah/900/700', now() - interval '9 hours'
from public.profiles p where p.username = 'nour.ph'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000005', p.id,
       'نصيحة اليوم 💪 ما تستناش الدافع، ابنِ العادة. 20 دقيقة حركة كل يوم خير من 3 سوايع مرة في الأسبوع.',
       null, now() - interval '12 hours'
from public.profiles p where p.username = 'karim.fit'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000006', p.id,
       'كسكس الجمعة على الأصول 🍲 بخضرة السوق وزيت الزيتون تاع البلاد… العائلة كاملة تجمعت اليوم ❤️',
       'https://picsum.photos/seed/absorbs-food/900/700', now() - interval '1 day'
from public.profiles p where p.username = 'lina.food'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000007', p.id,
       'سؤال لأصحاب الخبرة: وشنو هي أفضل طريقة باش تبقى منتج وانت خدام من الدار؟ أنا جرّبت تقنية 25 دقيقة تركيز + 5 راحة وبدات تعطي نتيجة 👌',
       null, now() - interval '1 day 3 hours'
from public.profiles p where p.username = 'yacine_dev'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000008', p.id,
       'مكتبي الجديد واجد أخيرًا 🖥️ إضاءة دافئة، شاشة واحدة كبيرة، وبساطة في كلش. وين تفضلوا تخدموا: مكتب ولا كافي؟',
       'https://picsum.photos/seed/absorbs-desk/900/700', now() - interval '2 days'
from public.profiles p where p.username = 'yacine_dev'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000009', p.id,
       '«النجاح ما يجيش صدفة، ييجي من خطوات صغيرة تتكرر كل يوم» 🌙 مساؤكم هادئ جميعًا',
       null, now() - interval '2 days 5 hours'
from public.profiles p where p.username = 'nour.ph'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000010', p.id,
       'جري 8 كم هذا الصباح قبل الشروق 🏃‍♂️ الهواء نقي والمدينة نائمة… أحسن بداية لليوم',
       'https://picsum.photos/seed/absorbs-run/900/700', now() - interval '3 days'
from public.profiles p where p.username = 'karim.fit'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000011', p.id,
       'سر صغير من مطبخي 🤫 رشة قرفة في صلصة الطماطم تبدل الطعم كامل… جربوها وقولولي',
       null, now() - interval '3 days 4 hours'
from public.profiles p where p.username = 'lina.food'
on conflict (id) do nothing;

insert into public.posts (id, author_id, content, image_url, created_at)
select 'b0000000-0000-4000-8000-000000000012', p.id,
       'أهلًا بالجميع في Absorbs 👋 أنا أمين، مصور من وهران. هنا نشارك الصور، الأفكار، والضحك… مرحبا بيكم كاملين!',
       null, now() - interval '4 days'
from public.profiles p where p.username = 'amine.dz'
on conflict (id) do nothing;

-- ─────────────────────────────────────────────── 4) likes (realistic matrix)
insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '20 minutes'
from public.posts post
join public.profiles fan on fan.username in ('sarah.art', 'yacine_dev', 'nour.ph', 'karim.fit', 'lina.food')
where post.id = 'b0000000-0000-4000-8000-000000000001'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '35 minutes'
from public.posts post
join public.profiles fan on fan.username in ('amine.dz', 'nour.ph', 'lina.food', 'yacine_dev')
where post.id = 'b0000000-0000-4000-8000-000000000002'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '15 minutes'
from public.posts post
join public.profiles fan on fan.username in ('amine.dz', 'sarah.art', 'karim.fit')
where post.id = 'b0000000-0000-4000-8000-000000000003'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '50 minutes'
from public.posts post
join public.profiles fan on fan.username in ('amine.dz', 'sarah.art', 'yacine_dev', 'karim.fit', 'lina.food')
where post.id = 'b0000000-0000-4000-8000-000000000004'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '25 minutes'
from public.posts post
join public.profiles fan on fan.username in ('amine.dz', 'nour.ph')
where post.id = 'b0000000-0000-4000-8000-000000000005'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '45 minutes'
from public.posts post
join public.profiles fan on fan.username in ('amine.dz', 'sarah.art', 'nour.ph', 'yacine_dev', 'karim.fit')
where post.id = 'b0000000-0000-4000-8000-000000000006'
on conflict do nothing;

insert into public.likes (post_id, user_id, created_at)
select post.id, fan.id, post.created_at + interval '30 minutes'
from public.posts post
join public.profiles fan on fan.username in ('sarah.art', 'lina.food', 'karim.fit', 'nour.ph', 'amine.dz')
where post.id in ('b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000010')
on conflict do nothing;

-- ─────────────────────────────────────────────── 5) comments (lively threads)
insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000001', post.id, fan.id, 'صورة رائعة 😍 وهران دايمًا تبهرنا', post.created_at + interval '22 minutes'
from public.posts post join public.profiles fan on fan.username = 'sarah.art'
where post.id = 'b0000000-0000-4000-8000-000000000001' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000002', post.id, fan.id, 'الكورنيش قبل الغروب شيء آخر… يعطيك الصحة أمين', post.created_at + interval '40 minutes'
from public.posts post join public.profiles fan on fan.username = 'nour.ph'
where post.id = 'b0000000-0000-4000-8000-000000000001' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000003', post.id, fan.id, 'الألوان متناسقة بشكل جميل 🎨 كمّلي، عندك مستقبل كبير', post.created_at + interval '1 hour'
from public.posts post join public.profiles fan on fan.username = 'amine.dz'
where post.id = 'b0000000-0000-4000-8000-000000000002' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000004', post.id, fan.id, 'مبروك الإطلاق 🚀 الـ Realtime يبدل تجربة المستخدم كاملة', post.created_at + interval '30 minutes'
from public.posts post join public.profiles fan on fan.username = 'karim.fit'
where post.id = 'b0000000-0000-4000-8000-000000000003' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000006', post.id, fan.id, 'ريحة الكسكس وصلت حتى لعندي 😄 بصحتكم', post.created_at + interval '55 minutes'
from public.posts post join public.profiles fan on fan.username = 'amine.dz'
where post.id = 'b0000000-0000-4000-8000-000000000006' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000007', post.id, fan.id, 'أنا نخدم بتقنية مشابهة ونزيد نسكر الإشعارات 📵 الفرق واضح', post.created_at + interval '1 hour 10 minutes'
from public.posts post join public.profiles fan on fan.username = 'sarah.art'
where post.id = 'b0000000-0000-4000-8000-000000000007' on conflict (id) do nothing;

insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000008', post.id, fan.id, 'مرحبا بيك أمين 👋 بداية موفقة، متابعك من الآن', post.created_at + interval '2 hours'
from public.posts post join public.profiles fan on fan.username = 'yacine_dev'
where post.id = 'b0000000-0000-4000-8000-000000000012' on conflict (id) do nothing;

-- fix comment 5 author (real fan instead of placeholder guard)
insert into public.comments (id, post_id, author_id, content, created_at)
select 'c0000000-0000-4000-8000-000000000009', post.id, fan.id, 'نفس النصيحة غيرت حياتي 👌 العادة قبل الدافع', post.created_at + interval '48 minutes'
from public.posts post join public.profiles fan on fan.username = 'nour.ph'
where post.id = 'b0000000-0000-4000-8000-000000000005' on conflict (id) do nothing;

-- ─────────────────────────────────────────────── 6) follows (small social graph)
insert into public.follows (follower_id, following_id, created_at)
select a.id, b.id, now() - interval '5 days'
from public.profiles a, public.profiles b
where (a.username, b.username) in (
  ('amine.dz','sarah.art'), ('amine.dz','nour.ph'), ('amine.dz','yacine_dev'),
  ('sarah.art','amine.dz'), ('sarah.art','lina.food'),
  ('yacine_dev','amine.dz'), ('yacine_dev','sarah.art'),
  ('nour.ph','amine.dz'), ('nour.ph','sarah.art'),
  ('karim.fit','amine.dz'), ('karim.fit','yacine_dev'),
  ('lina.food','sarah.art'), ('lina.food','nour.ph')
)
on conflict do nothing;

-- ─────────────────────────────────────────────── 7) a demo DM conversation (amine ↔ sarah)
insert into public.dm_threads (id, user_low, user_high, created_at, last_message_at)
select 'd0000000-0000-4000-8000-000000000001',
       least(a.id, b.id), greatest(a.id, b.id),
       now() - interval '1 day', now() - interval '3 hours'
from public.profiles a, public.profiles b
where a.username = 'amine.dz' and b.username = 'sarah.art'
on conflict (id) do nothing;

insert into public.messages (id, thread_id, sender_id, content, created_at, read_at)
select 'e0000000-0000-4000-8000-000000000001', t.id, a.id, 'سارة، شفتي صورتك الأخيرة؟ الألوان خيالية 🎨', now() - interval '1 day', now() - interval '23 hours'
from public.dm_threads t, public.profiles a
where t.id = 'd0000000-0000-4000-8000-000000000001' and a.username = 'amine.dz'
on conflict (id) do nothing;

insert into public.messages (id, thread_id, sender_id, content, created_at, read_at)
select 'e0000000-0000-4000-8000-000000000002', t.id, a.id, 'شكرًا أمين! خدمت عليها بزاف… وانت صورتك تاع وهران أجمل 🌅', now() - interval '23 hours', now() - interval '22 hours'
from public.dm_threads t, public.profiles a
where t.id = 'd0000000-0000-4000-8000-000000000001' and a.username = 'sarah.art'
on conflict (id) do nothing;

insert into public.messages (id, thread_id, sender_id, content, created_at, read_at)
select 'e0000000-0000-4000-8000-000000000003', t.id, a.id, 'لازم نديرو جلسة تصوير + رسم مشتركة قريبًا، وش رايك؟', now() - interval '3 hours', null
from public.dm_threads t, public.profiles a
where t.id = 'd0000000-0000-4000-8000-000000000001' and a.username = 'amine.dz'
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  CLEANUP (run this before real launch to remove ALL demo content):
--
--    delete from auth.users where email like '%@absorbs.dz';
--
--  Profiles, posts, likes, comments, follows and messages are removed
--  automatically by ON DELETE CASCADE. External demo images (picsum /
--  randomuser) are only URLs — nothing was uploaded to your Storage.
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
--  Dz connect — Upgrade v2 (run ONCE after FULL-SETUP.sql, same SQL Editor)
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
-- ═══════════════════════════════════════════════════════════════════════════
--  Dz connect — Upgrade v3 (run ONCE after upgrade-v2.sql, same SQL Editor)
--  Adds: Groups/Communities · Video posts (Reels) · Invites & Points ·
--        Challenges (hashtag contests). Idempotent: safe to Run again.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────── video posts (reels)
alter table public.posts add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));

-- ─────────────────────────────────────────────── groups / communities
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  emoji       text not null default '🇩🇿',
  wilaya      text,
  description text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.posts add column if not exists group_id uuid references public.groups (id) on delete cascade;
create index if not exists posts_group_idx on public.posts (group_id, created_at desc);
create index if not exists posts_video_idx on public.posts (created_at desc) where media_type = 'video';

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
drop policy if exists "groups_read" on public.groups;
create policy "groups_read" on public.groups for select to authenticated using (true);
drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "gm_read" on public.group_members;
create policy "gm_read" on public.group_members for select to authenticated using (true);
drop policy if exists "gm_write" on public.group_members;
create policy "gm_write" on public.group_members for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────── invites & points
alter table public.profiles add column if not exists invite_code text;
alter table public.profiles add column if not exists invited_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists points int not null default 0;
update public.profiles
set invite_code = 'dz-' || regexp_replace(lower(username), '[^a-z0-9]+', '', 'g')
where invite_code is null;
create unique index if not exists profiles_invite_code_key on public.profiles (invite_code);

create or replace function public.award_referral(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_inviter uuid;
begin
  if auth.uid() is null or p_code is null or length(trim(p_code)) < 3 then return; end if;
  select id into v_inviter from public.profiles where invite_code = lower(trim(p_code)) limit 1;
  if v_inviter is null or v_inviter = auth.uid() then return; end if;
  update public.profiles set invited_by = v_inviter
  where id = auth.uid() and invited_by is null;
  if found then
    update public.profiles set points = points + 25 where id = v_inviter;  -- inviter reward
    update public.profiles set points = points + 10 where id = auth.uid(); -- welcome bonus
  end if;
end $$;
grant execute on function public.award_referral(text) to authenticated;

-- points for activity (running as trigger = table owner, bypasses RLS safely)
create or replace function public.bump_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'posts' then
    update public.profiles set points = points + 3 where id = new.author_id;
  elsif tg_table_name = 'likes' then
    update public.profiles p set points = points + 1
    from public.posts po where po.id = new.post_id and p.id = po.author_id and po.author_id <> new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_points_posts on public.posts;
create trigger trg_points_posts after insert on public.posts for each row execute function public.bump_points();
drop trigger if exists trg_points_likes on public.likes;
create trigger trg_points_likes after insert on public.likes for each row execute function public.bump_points();

-- ─────────────────────────────────────────────── challenges (hashtag contests)
create table if not exists public.challenges (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  hashtag     text not null,
  description text,
  prize       text,
  ends_at     timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);
alter table public.challenges enable row level security;
drop policy if exists "challenges_read" on public.challenges;
create policy "challenges_read" on public.challenges for select to authenticated using (true);

-- ─────────────────────────────────────────────── seed: starter communities
insert into public.groups (name, emoji, wilaya, description, created_by)
select v.name, v.emoji, v.wilaya, v.description, (select id from public.profiles where username = 'amine.dz')
from (values
  ('الجزائر العاصمة', '🏙️', 'الجزائر', 'كل ما يخص العاصمة: أخبار، صور، فعاليات وأماكن.', null),
  ('وهران الباهية', '🌊', 'وهران', 'وهران وأهلها: البحر، الموسيقى وحياة المدينة.', null),
  ('قسنطينة الجسور', '🌉', 'قسنطينة', 'مدينة الجسور المعلقة والتراث العريق.', null),
  ('عشاق التصوير', '📸', null, 'شارك أجمل صورك من كل ولايات الوطن وتعلّم من المحترفين.', null),
  ('المطبخ الجزائري', '🍲', null, 'كسكس، شخشوخة، رشتة وحلويات تقليدية من مطابخنا.', null),
  ('كرة القدم DZ', '⚽', null, 'الخضر، البطولة المحلية وكل أخبار الكرة الجزائرية.', null),
  ('الدراسة والجامعة', '🎓', null, 'دروس، ملخصات ونصائح للطلاب الجامعيين.', null)
) as v(name, emoji, wilaya, description, _x)
where not exists (select 1 from public.groups g where g.name = v.name);

insert into public.challenges (title, hashtag, description, prize, ends_at)
select 'أجمل صورة من ولايتي', 'ولايتي_الأجمل', 'انشر أجمل صورة من ولايتك مع الهاشتاغ #ولايتي_الأجمل — أكثر منشور يحصل على إعجابات يفوز!', 'شارة بطل التحدي + 500 نقطة 🏆', now() + interval '7 days'
where not exists (select 1 from public.challenges where hashtag = 'ولايتي_الأجمل');
insert into public.challenges (title, hashtag, description, prize, ends_at)
select 'أكلات بلادي', 'أكلات_بلادي', 'شارك طبختك الجزائرية المفضلة مع #أكلات_بلادي وخلي الجمهور يقرر!', 'شارة الشاف + 300 نقطة 👨‍🍳', now() + interval '10 days'
where not exists (select 1 from public.challenges where hashtag = 'أكلات_بلادي');

-- Done ✅  Groups, reels, invites/points and challenges are live.
