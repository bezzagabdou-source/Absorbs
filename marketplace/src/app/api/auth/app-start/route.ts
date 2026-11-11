import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/env";
import { getSession } from "@/lib/auth/session";
import { createHandoffCode } from "@/lib/server/handoff-schema";

export const dynamic = "force-dynamic";

/**
 * Starts the browser sign-in hand-off for the Android app.
 *
 * Always opened in the user's real browser, never in the app's WebView: Google
 * blocks OAuth inside embedded WebViews (error `disallowed_useragent`). If the
 * browser already holds a session, we hand it straight back to the app; otherwise
 * the visitor signs in and is bounced back here.
 */
export async function GET() {
  const origin = appOrigin();
  const session = await getSession();
  if (session) {
    const code = await createHandoffCode(session.id);
    return NextResponse.redirect(new URL(`/auth/google/return?code=${code}`, origin));
  }
  const login = new URL("/login", origin);
  login.searchParams.set("handoff", "1");
  login.searchParams.set("next", "/auth/google/start");
  return NextResponse.redirect(login);
}
