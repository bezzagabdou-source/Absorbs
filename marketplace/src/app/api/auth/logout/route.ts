import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { revokeSession } from "@/lib/auth/session";
export async function POST(request: NextRequest) { return api(request, { mutation: true }, async () => { await revokeSession(); return ok({ ok: true }); }); }
