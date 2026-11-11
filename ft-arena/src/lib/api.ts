import { NextResponse } from "next/server";
import { isAdmin } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export async function guard(): Promise<NextResponse | null> {
  if (!(await isAdmin())) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
  return null;
}

export const bad = (error: string, status = 400) => json({ ok: false, error }, status);

export function safeDetail(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 400);
}
