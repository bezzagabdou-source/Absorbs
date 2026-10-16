import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { ensureUser, profileOf } from "@/lib/usage";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the signed-in user's plan / trial status (drives the Pro badge + locked models). */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureSchema();
    return json(200, { user: profileOf(await ensureUser(user)) });
  } catch (e) {
    return serverError("user-me", e, "DB");
  }
}
