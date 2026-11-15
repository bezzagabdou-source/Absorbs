-- ═══════════════════════════════════════════════════════════════════════════
--  Dz connect — UPGRADE v6 (run ONCE in Supabase SQL Editor, after v5)
--  Adds: 🔔 Real notifications (table + triggers + RLS) · 😂 Post reactions
--        🔒 Column-lock for is_verified/points (only SQL owner may grant them)
--        ✅ Verified badge for @gym
--  Safe to re-run: every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Verified badge for the account behind the screenshot (@gym) ──────────
update public.profiles set is_verified = true where username = 'gym';

-- ── 2) Column privileges: nobody can self-grant verified/points anymore ──────
revoke update (is_verified, points, invited_by, invite_code) on public.profiles from authenticated;

-- ── 3) Notifications table ──────────────────────────────────────────────────
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete cascade,
  type         text not null check (type in ('like','comment','reply','follow','message','reaction','verify')),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  body         text check (char_length(body) <= 140),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notifications_read"   on public.notifications;
create policy "notifications_read"   on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications for delete to authenticated using (recipient_id = auth.uid());
-- (no INSERT policy for regular users — only the security-definer triggers below create rows)

-- ── 4) Post reactions (6 emojis, one per user per post) ─────────────────────
create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

alter table public.post_reactions enable row level security;
drop policy if exists "post_reactions_read"   on public.post_reactions;
create policy "post_reactions_read"   on public.post_reactions for select to authenticated using (true);
drop policy if exists "post_reactions_write"  on public.post_reactions;
create policy "post_reactions_write"  on public.post_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "post_reactions_update" on public.post_reactions;
create policy "post_reactions_update" on public.post_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "post_reactions_delete" on public.post_reactions;
create policy "post_reactions_delete" on public.post_reactions for delete to authenticated using (user_id = auth.uid());

-- ── 5) Triggers → notifications ─────────────────────────────────────────────
create or replace function public.notify_on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (v_author, new.user_id, 'like', new.post_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_post_author   uuid;
  v_parent_author uuid;
begin
  select author_id into v_post_author from public.posts where id = new.post_id;

  if new.parent_id is not null then
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id then
      insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id, body)
      values (v_parent_author, new.author_id, 'reply', new.post_id, new.id, left(new.content, 140));
    end if;
  end if;

  if v_post_author is not null and v_post_author <> new.author_id
     and v_post_author is distinct from v_parent_author then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id, body)
    values (v_post_author, new.author_id, 'comment', new.post_id, new.id, left(new.content, 140));
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.follower_id <> new.following_id then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows
  for each row execute function public.notify_on_follow();

create or replace function public.notify_on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_peer uuid;
  v_body text;
begin
  select case when t.user_low = new.sender_id then t.user_high else t.user_low end
    into v_peer
    from public.dm_threads t where t.id = new.thread_id;

  if v_peer is null then return new; end if;

  v_body := case
    when new.content like '[image]%' then '📷 صورة'
    when new.content like '[voice]%' then '🎙️ رسالة صوتية'
    when new.content like '[call|%'  then '📞 مكالمة'
    else left(new.content, 80)
  end;

  insert into public.notifications (recipient_id, actor_id, type, body)
  values (v_peer, new.sender_id, 'message', v_body);
  return new;
end $$;
drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message after insert on public.messages
  for each row execute function public.notify_on_message();

create or replace function public.notify_on_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select author_id into v_author from public.posts where id = new.post_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, body)
    values (v_author, new.user_id, 'reaction', new.post_id, new.emoji);
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_reaction on public.post_reactions;
create trigger trg_notify_reaction after insert on public.post_reactions
  for each row execute function public.notify_on_reaction();

-- Verified flip → congratulate the user
create or replace function public.notify_on_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.is_verified, false) = false and coalesce(new.is_verified, false) = true then
    insert into public.notifications (recipient_id, type, body)
    values (new.id, 'verify', 'تهانينا! تم توثيق حسابك ✔');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_verify on public.profiles;
create trigger trg_notify_verify after update of is_verified on public.profiles
  for each row execute function public.notify_on_verify();

-- ── 6) Realtime for the new tables ──────────────────────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.notifications;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_reactions;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comments;            exception when duplicate_object then null; end;
end $$;

-- ── 7) Helpful indexes ───────────────────────────────────────────────────────
create index if not exists notifications_actor_idx on public.notifications (actor_id, created_at desc);

-- Done ✅  Run order: schema.sql → FULL-SETUP.sql → upgrade-v2 → v3 → v4 → v5 → THIS FILE
