import { pool } from "@/db";

/**
 * Idempotent bootstrap (same approach as Absorbs): creates the tables on first use, so a fresh
 * database works right after deploy — no `drizzle-kit push` needed. Safe on an existing Absorbs
 * database: every statement is "if not exists" and only two nullable/defaulted columns are added.
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
alter table barq.users add column if not exists provider text not null default 'password';
alter table barq.users add column if not exists password_hash text;
alter table barq.users add column if not exists email_verified boolean not null default false;
alter table barq.users add column if not exists login_count integer not null default 0;
alter table barq.users add column if not exists last_login_at timestamptz;
alter table barq.users add column if not exists meter_used_ms bigint not null default 0;
alter table barq.users add column if not exists trial_ends_at timestamptz;
alter table barq.users add column if not exists phone text;
alter table barq.users add column if not exists country text;
alter table barq.users add column if not exists failed_attempts integer not null default 0;
alter table barq.users add column if not exists locked_until timestamptz;
alter table barq.users add column if not exists terms_at timestamptz;

create table if not exists barq.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table barq.conversations add column if not exists model text not null default 'nexus-core';
create index if not exists conv_user_idx on barq.conversations (user_id, updated_at);

create table if not exists barq.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references barq.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table barq.messages add column if not exists model text;
create index if not exists msg_conv_idx on barq.messages (conversation_id, created_at);

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

create table if not exists barq.promo_codes (
  code text primary key,
  plan text not null default 'pro',
  days integer not null default 30,
  max_uses integer not null default 100,
  used integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists barq.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references barq.users(id) on delete cascade,
  token_hash text not null unique,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on barq.sessions (user_id);
`;

const g = globalThis as typeof globalThis & { __nexusSchemaReady?: Promise<void> };

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
  if (!g.__nexusSchemaReady) {
    g.__nexusSchemaReady = run().catch((e) => {
      g.__nexusSchemaReady = undefined;
      throw e;
    });
  }
  return g.__nexusSchemaReady;
}
