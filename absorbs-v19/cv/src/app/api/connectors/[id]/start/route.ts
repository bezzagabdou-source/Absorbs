import { NextRequest } from "next/server";
import { connectorById } from "@/lib/connectors";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Begins an OAuth round trip. Returns {url} when the deployment is configured,
 * otherwise {error:"NOT_CONFIGURED"} so the UI can explain instead of hanging.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await verifyRequest(req).catch(() => null);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const c = connectorById(id);
  if (!c) return Response.json({ error: "UNKNOWN" }, { status: 404 });

  if (!rateLimit(`conn:${user.uid}`, 20, 60_000).ok) {
    return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const clientId = (process.env[c.envKey] ?? "").trim();
  if (!clientId) return Response.json({ error: "NOT_CONFIGURED", envKey: c.envKey }, { status: 200 });

  const origin = req.nextUrl.origin;
  const redirect = `${origin}/api/connectors/${c.id}/callback`;
  const state = Buffer.from(`${user.uid}:${Date.now()}`).toString("base64url");

  const AUTH: Partial<Record<string, string>> = {
    "google-drive": "https://accounts.google.com/o/oauth2/v2/auth",
    gmail: "https://accounts.google.com/o/oauth2/v2/auth",
    "google-calendar": "https://accounts.google.com/o/oauth2/v2/auth",
    github: "https://github.com/login/oauth/authorize",
    notion: "https://api.notion.com/v1/oauth/authorize",
    slack: "https://slack.com/oauth/v2/authorize",
    dropbox: "https://www.dropbox.com/oauth2/authorize",
    x: "https://twitter.com/i/oauth2/authorize",
    instagram: "https://api.instagram.com/oauth/authorize",
    linkedin: "https://www.linkedin.com/oauth/v2/authorization",
  };

  const base = AUTH[c.id];
  if (!base) return Response.json({ error: "NOT_CONFIGURED", envKey: c.envKey }, { status: 200 });

  const url = new URL(base);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (c.scopes.length) url.searchParams.set("scope", c.scopes.join(" "));
  url.searchParams.set("access_type", "offline");

  return Response.json({ url: url.toString() });
}
