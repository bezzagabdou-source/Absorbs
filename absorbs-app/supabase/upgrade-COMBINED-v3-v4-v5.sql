-- ═══════════════════════════════════════════════════════════════════
--  Dz connect — تحديث شامل واحد (v3 + v4 + v5) — الصق كل هذا النص
--  في Supabase ← SQL Editor ← New query ثم اضغط Run مرة واحدة فقط.
--  آمن تمامًا: كل الجمل Idempotent (لا ضرر إن شغّلته من جديد).
-- ═══════════════════════════════════════════════════════════════════

-- ═══ v3: فيديو (ريلز) + مجموعات + دعوات ونقاط + تحديات ═══

alter table public.posts add column if not exists media_type text not null default 'image'
  check (media_type in ('image', 'video'));

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
    update public.profiles set points = points + 25 where id = v_inviter;
    update public.profiles set points = points + 10 where id = auth.uid();
  end if;
end $$;
grant execute on function public.award_referral(text) to authenticated;

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

-- ═══ v4: إبلاغات (سياسة المحتوى) + حذف الحساب نهائيًا ═══

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user','ai','story')),
  target_id   text not null,
  reason      text not null check (char_length(reason) between 2 and 120),
  details     text check (char_length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ═══ v5: الردود على التعليقات + فهارس + رسائل فورية ═══

alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists likes_post_idx on public.likes (post_id);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at asc);

-- ═══ تم ✅ ريلز ومجموعات ونقاط وتحديات وإبلاغ وحذف حساب وردود التعليقات مفعّلة ═══
