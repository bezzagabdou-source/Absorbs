-- ═══════════════════════════════════════════════════════════════════
-- Dz connect — upgrade v4 (store compliance: reports + account deletion)
-- Run ONCE in the Supabase SQL Editor. Safe to paste as-is.
-- ═══════════════════════════════════════════════════════════════════

-- ── Content / user / AI reports (Google Play UGC + AI policy) ──────
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
-- No select/update/delete policies for users: only the dashboard (service role) reads reports.

-- ── Account deletion (Google Play: in-app deletion path) ───────────
-- Deleting the auth.users row cascades to profiles and all user content.
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
