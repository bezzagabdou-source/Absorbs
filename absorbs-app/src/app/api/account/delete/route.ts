import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/account/delete
 *
 * Permanently deletes the signed-in user's account.
 * This is the ONE place the SECRET key is used — and only here on the server,
 * via `createAdminClient()` (which reads SUPABASE_SECRET_KEY from server env).
 * The key never reaches the browser. If the full secret key has not been
 * configured yet, we degrade gracefully: remove the public profile row (RLS
 * allows deleting your own) and ask the client to sign out ("soft" mode).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    // Secret key not configured (it was shared truncated) — soft delete fallback.
    await supabase.from("profiles").delete().eq("id", user.id);
    return NextResponse.json({
      ok: true,
      mode: "soft",
      note: "Profile removed. To fully delete the Auth user, set the complete SUPABASE_SECRET_KEY in Vercel env vars.",
    });
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: "full" });
}
