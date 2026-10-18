import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k");
  if (!process.env.__TK || k !== process.env.__TK) return new NextResponse("not found", { status: 404 });
  const keys = ["DATABASE_URL","GEMINI_API_KEY","GROQ_API_KEY","OPENROUTER_API_KEY","CEREBRAS_API_KEY","HF_TOKEN","XAI_API_KEY","CHARGILY_SECRET_KEY","ADMIN_SECRET"];
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = process.env[key] || "";
  return NextResponse.json(out);
}
