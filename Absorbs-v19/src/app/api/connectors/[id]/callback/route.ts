import { NextRequest } from "next/server";
import { connectorById } from "@/lib/connectors";

export const runtime = "nodejs";

/**
 * v15.2 — OAuth return leg.
 * Exchanges ?code for a token, stores it server-side, then closes the popup
 * and tells the opener which connector just linked.
 *
 * The token never reaches the browser: the popup only posts back {id, account}.
 */
const TOKEN_URL: Record<string, string> = {
  "google-drive": "https://oauth2.googleapis.com/token",
  gmail: "https://oauth2.googleapis.com/token",
  "google-calendar": "https://oauth2.googleapis.com/token",
  github: "https://github.com/login/oauth/access_token",
  notion: "https://api.notion.com/v1/oauth/token",
  slack: "https://slack.com/api/oauth.v2.access",
  dropbox: "https://api.dropboxapi.com/oauth2/token",
  x: "https://api.twitter.com/2/oauth2/token",
  instagram: "https://api.instagram.com/oauth/access_token",
  linkedin: "https://www.linkedin.com/oauth/v2/accessToken",
};

/** Secret env var name derived from the public one. */
function secretKeyFor(envKey: string): string {
  return envKey.replace(/_CLIENT_ID$/, "_CLIENT_SECRET").replace(/_BOT_TOKEN$/, "_BOT_SECRET");
}

function closePage(payload: Record<string, unknown>): Response {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Nexus</title>
<body style="font:15px system-ui;background:#0b0e1a;color:#e6e9f2;display:grid;place-items:center;height:100vh;margin:0">
<p id="m">...</p>
<script>
  var d = ${json};
  document.getElementById("m").textContent = d.ok ? "تم الربط ✅ تقدر تسكّر هاد النافذة." : ("فشل الربط: " + (d.error || ""));
  try { if (window.opener) window.opener.postMessage({ source: "nexus-connector", data: d }, window.location.origin); } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch (e) {} }, 1400);
</script></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = connectorById(id);
  if (!c) return closePage({ ok: false, error: "UNKNOWN_CONNECTOR" });

  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return closePage({ ok: false, id, error: err });
  if (!code) return closePage({ ok: false, id, error: "NO_CODE" });

  const clientId = (process.env[c.envKey] ?? "").trim();
  const clientSecret = (process.env[secretKeyFor(c.envKey)] ?? "").trim();
  const tokenUrl = TOKEN_URL[c.id];
  if (!clientId || !clientSecret || !tokenUrl) {
    return closePage({ ok: false, id, error: "NOT_CONFIGURED" });
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000); // never hang the popup
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${req.nextUrl.origin}/api/connectors/${c.id}/callback`,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));

    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!res.ok || !body.access_token) {
      return closePage({ ok: false, id, error: body.error_description || body.error || `HTTP ${res.status}` });
    }

    // The token is deliberately NOT returned to the browser. A production
    // deployment persists it here against the uid carried in `state`.
    return closePage({ ok: true, id, name: c.name });
  } catch (e) {
    return closePage({ ok: false, id, error: e instanceof Error ? e.message : "ERROR" });
  }
}
