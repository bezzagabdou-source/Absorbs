import { NextResponse } from "next/server";
import { SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminConfigured } from "@/lib/supabase/admin";

/**
 * GET /api/health — deployment diagnostics.
 * NEVER returns any key value — only booleans about configuration state.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "dz-connect",
    version: "1.0.0",
    supabase: {
      url: SUPABASE_URL,
      publishableKeyConfigured: isSupabaseConfigured,
      // true once the FULL secret key (not the truncated placeholder) is set server-side
      secretKeyConfigured: isAdminConfigured(),
    },
    timestamp: new Date().toISOString(),
  });
}
