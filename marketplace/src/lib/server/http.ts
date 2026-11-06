import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { getSession, requireActor, sameOrigin, type SessionUser } from "@/lib/auth/session";
import { withActor } from "@/db";
import { checkRateLimit } from "./rate-limit";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 16384): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError("json_required", 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new AppError("payload_too_large", 413);
  if (!request.body) throw new AppError("invalid_input", 400);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new AppError("payload_too_large", 413); } chunks.push(value); }
    return schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
  } catch (error) { if (error instanceof SyntaxError) throw new AppError("invalid_json", 400); throw error; }
  finally { reader.releaseLock(); }
}
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) return ok({ error: { code: error.code, fields: error.fields } }, error.status);
  if (error instanceof ZodError) return ok({ error: { code: "invalid_input", fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join(".") || "form", [issue.message]])) } }, 400);
  console.error(JSON.stringify({ event: "request_failed", name: error instanceof Error ? error.name : "UnknownError" }));
  return ok({ error: { code: "service_unavailable" } }, 503);
}
type Options = { auth?: boolean; roles?: SessionUser["role"][]; mutation?: boolean; limit?: number; windowMs?: number };
export async function api(request: NextRequest, options: Options, handler: (actor: SessionUser | null) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    if (options.mutation) sameOrigin(request);
    const actor = options.auth ? await requireActor() : await getSession();
    if (options.roles && (!actor || !options.roles.includes(actor.role))) throw new AppError("forbidden", 403);
    const identity = actor?.id ?? (process.env.TRUST_PROXY_HEADERS === "true" ? request.headers.get("x-real-ip") : null) ?? "shared-anonymous";
    const rate = await checkRateLimit(`${request.nextUrl.pathname}:${request.method}:${identity}`, options.limit ?? (options.mutation ? 20 : 120), options.windowMs ?? 60000);
    if (!rate.allowed) return NextResponse.json({ error: { code: "rate_limited" } }, { status: 429, headers: { "Retry-After": String(rate.retryAfter), "Cache-Control": "no-store" } });
    return await handler(actor);
  } catch (error) { return errorResponse(error); }
}
export async function publicQuery<T>(fn: Parameters<typeof withActor<T>>[1]): Promise<T> { return withActor(null, fn); }

