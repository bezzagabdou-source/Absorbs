import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * 🔒 PRIVILEGED server-only client (uses SUPABASE_SECRET_KEY).
 *
 * Rules:
 * - Imported ONLY from Route Handlers / Server Actions (`import "server-only"`
 *   makes the build fail if it ever leaks into a Client Component).
 * - Never expose this key to the browser and never prefix it with NEXT_PUBLIC_.
 * - Used for operations that legitimately bypass RLS, e.g. permanently
 *   deleting an auth user in `/api/account/delete`.
 *
 * The key pasted in chat was truncated ("sb_secret_t7uws..."), so until the
 * full key is pasted into `.env.local` / Vercel env vars, this returns null
 * and callers must degrade gracefully (see the delete-account route).
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.includes("REPLACE_WITH_FULL_KEY")) return null;

  return createSupabaseClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const isAdminConfigured = () => createAdminClient() !== null;
