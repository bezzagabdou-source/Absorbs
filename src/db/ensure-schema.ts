import { pool } from "@/db";

/**
 * Idempotent bootstrap: creates the tables/indexes if they don't exist yet, so a
 * fresh database works right after the first deploy — no `drizzle-kit push` needed.
 * Mirrors src/db/schema.ts (keep both in sync when you change the schema).
 */
const DDL = `
create schema if not exists barq;

create table if not exists barq.users (
  id text primary key,
  email text not null,
  display_name text,
  photo_url text,
  locale text not null default 'ar',
  plan text not null default 'free',
  plan_expires_at timestamptz,
  credits_used integer not null default 0,
  usage_day text,
  total_runs integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists barq.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conv_user_idx on barq.conversations (user_id, updated_at);

create table if not exists barq.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references barq.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists msg_conv_idx on barq.messages (conversation_id, created_at);

create table if not exists barq.tool_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  tool text not null,
  title text not null default '',
  input text not null,
  output text not null,
  created_at timestamptz not null default now()
);
create index if not exists runs_user_idx on barq.tool_runs (user_id, created_at);

create table if not exists barq.orders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  plan text not null default 'pro',
  period text not null default 'monthly',
  amount_dzd integer not null,
  status text not null default 'pending',
  provider text not null default 'chargily',
  provider_ref text,
  created_at timestamptz not null default now()
);
create index if not exists orders_user_idx on barq.orders (user_id);

alter table barq.users add column if not exists provider text not null default 'password';
alter table barq.users add column if not exists email_verified boolean not null default false;
alter table barq.users add column if not exists login_count integer not null default 0;
alter table barq.users add column if not exists pref_tier text not null default 'v6';
alter table barq.users add column if not exists last_login_at timestamptz;
alter table barq.users add column if not exists meter_used_ms bigint not null default 0;
alter table barq.users add column if not exists meter_reset_at timestamptz;
alter table barq.users add column if not exists meter_last_at timestamptz;
alter table barq.users add column if not exists trial_ends_at timestamptz;
update barq.users set trial_ends_at = now() + interval '7 days' where trial_ends_at is null;

create table if not exists barq.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  content text not null,
  source text not null default 'user',
  created_at timestamptz not null default now()
);
create index if not exists mem_user_idx on barq.ai_memories (user_id, created_at);

create table if not exists barq.projects (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  title text not null default '',
  html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proj_user_idx on barq.projects (user_id, updated_at);

create table if not exists barq.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  kind text not null default 'login',
  provider text not null default 'password',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists login_user_idx on barq.login_events (user_id, created_at);

create table if not exists barq.push_subs (
  endpoint text primary key,
  p256dh text,
  auth text,
  user_id text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create table if not exists barq.game_saves (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  game text not null,
  slot text not null default 'auto',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists game_saves_uq on barq.game_saves (user_id, game, slot);

create table if not exists barq.promo_codes (
  code text primary key,
  plan text not null default 'pro',
  days integer not null default 30,
  max_uses integer not null default 100,
  used integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

`;

const g = globalThis as typeof globalThis & {
  __barqSchemaReady?: Promise<void>;
};

async function run(): Promise<void> {
  try {
    await pool.query(DDL);
  } catch (first) {
    // two cold instances can race on CREATE TABLE — one retry is enough
    await new Promise((r) => setTimeout(r, 300));
    try {
      await pool.query(DDL);
    } catch {
      throw first;
    }
  }
}

/** Runs once per server instance; a failed attempt is retried on the next call. */
export function ensureSchema(): Promise<void> {
  if (!g.__barqSchemaReady) {
    g.__barqSchemaReady = run().catch((e) => {
      g.__barqSchemaReady = undefined;
      throw e;
    });
  }
  return g.__barqSchemaReady;
}
