import { NextResponse } from "next/server";
import { probeAi } from "@/lib/ai/provider";

export const runtime = "nodejs";

/** Public health probe for Dz connect ai (booleans only — never the key). */
export async function GET() {
  const probe = await probeAi();
  return NextResponse.json({
    ai: {
      configured: probe.configured,
      reachable: probe.ok,
      provider: probe.provider,
      name: "Dz connect ai",
    },
    timestamp: new Date().toISOString(),
  });
}
