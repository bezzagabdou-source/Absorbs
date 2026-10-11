import { NextRequest } from "next/server";
import { CONNECTORS } from "@/lib/connectors";
import { verifyRequest } from "@/lib/server-auth";

export const runtime = "nodejs";

/** Reports which connectors this deployment actually has credentials for. */
export async function GET(req: NextRequest) {
  const user = await verifyRequest(req).catch(() => null);
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const configured: Record<string, boolean> = {};
  for (const c of CONNECTORS) {
    configured[c.id] = Boolean((process.env[c.envKey] ?? "").trim());
  }
  return Response.json({ configured });
}
