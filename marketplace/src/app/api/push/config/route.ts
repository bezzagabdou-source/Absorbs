import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { pushConfigured } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, {}, async () => ok({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null })); }
