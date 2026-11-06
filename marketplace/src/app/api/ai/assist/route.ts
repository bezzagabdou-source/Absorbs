import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { aiAssistInputSchema } from "@/features/ai/schema";
import { assist } from "@/features/ai/service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  return api(request, { auth: true, mutation: true, limit: 12, windowMs: 60000 }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    const input = await readJson(request, aiAssistInputSchema, 8192);
    return ok(await assist(input));
  });
}
