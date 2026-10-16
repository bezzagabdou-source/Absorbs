import { backendName, resolveBackend } from "@/lib/repo";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness + which storage backend is active. */
export async function GET() {
  const backend = await resolveBackend().catch(() => "memory");
  return Response.json({ ok: true, backend: backendName() === "pending" ? backend : backendName(), time: new Date().toISOString() });
}
