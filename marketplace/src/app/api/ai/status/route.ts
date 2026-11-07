import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { aiStatus } from "@/features/ai/service";
export const dynamic = "force-dynamic";
/** Reports whether a server-side AI provider is configured — never the key itself. */
export async function GET(request: NextRequest) {
  return api(request, { limit: 60 }, async () => ok(aiStatus()));
}
