/**
 * Supabase public configuration.
 *
 * The URL + Publishable key are PUBLIC by design (they identify the project,
 * they do not grant access — every table is protected by Row Level Security).
 * Env vars take precedence; the pre-filled fallbacks below make the app run
 * instantly with zero setup, exactly as provided by the project owner.
 *
 * The SECRET key is intentionally NOT present in this file: it must never
 * reach the browser. It is read only on the server in `admin.ts`.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mcgnmjnzibjtjazcmwkd.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_U5FgvU0_00dRb5uOC9ee1Q_IHfwhbwp";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
