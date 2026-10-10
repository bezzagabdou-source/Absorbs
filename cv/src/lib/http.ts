/** Shared helpers for API route handlers. */

export function json(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Logs the real error server-side and returns a generic body (never leaks internals). */
export function serverError(tag: string, e: unknown, code = "ERROR"): Response {
  console.error(`[${tag}]`, e);
  return json(500, { code });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Short error text that is safe to show (API keys / long tokens stripped). */
export function safeDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]")
    .replace(/postgres(ql)?:\/\/\S+/gi, "[db-url]")
    .slice(0, 240);
}
