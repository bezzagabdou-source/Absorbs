import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser, getProfile } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureUser(user);
    const profile = await getProfile(user.uid);
    return json(200, { profile });
  } catch (e) {
    return serverError("me", e, "DB");
  }
}
