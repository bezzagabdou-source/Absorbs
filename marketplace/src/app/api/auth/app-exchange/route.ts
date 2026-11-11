import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, ok, readJson } from "@/lib/server/http";
import { issueSession } from "@/lib/auth/session";
import { AppError } from "@/lib/server/errors";
import { consumeHandoffCode } from "@/lib/server/handoff-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const exchangeSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

/**
 * Redeems a single-use hand-off code for a normal marketplace session.
 * Called by the Android app after the Google flow finished in the browser.
 */
export async function POST(request: NextRequest) {
  return api(request, { mutation: true, limit: 12, windowMs: 60000 }, async () => {
    const { code } = await readJson(request, exchangeSchema, 1024);
    const userId = await consumeHandoffCode(code);
    if (!userId) throw new AppError("handoff_invalid", 401);
    await issueSession(userId);
    return ok({ ok: true });
  });
}
