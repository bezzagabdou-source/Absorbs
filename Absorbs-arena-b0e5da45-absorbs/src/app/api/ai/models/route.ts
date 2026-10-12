import { json } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";

interface OrModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
}

export interface PublicModel {
  id: string;
  name: string;
  ctx: number;
  free: boolean;
}

let cache: { at: number; list: PublicModel[] } | null = null;
const TTL = 60 * 60 * 1000;

/** Every OpenRouter text model, cached for one hour (one fetch per server instance). */
async function loadModels(): Promise<PublicModel[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  const key = (process.env.OPENROUTER_API_KEY ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      cache: "no-store",
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const data = (await res.json()) as { data?: OrModel[] };
    const list: PublicModel[] = (data.data ?? [])
      .filter((m) => typeof m.id === "string" && /^[\w.\-]+\/[\w.\-:]+$/.test(m.id))
      .filter((m) => {
        const out = m.architecture?.output_modalities;
        return !out || out.includes("text");
      })
      .map((m) => ({
        id: m.id,
        name: (m.name ?? m.id).slice(0, 80),
        ctx: Number(m.context_length ?? 0),
        free: m.id.endsWith(":free") || (Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (list.length > 0) cache = { at: Date.now(), list };
    return list;
  } finally {
    clearTimeout(timer);
  }
}

/** GET — all OpenRouter models for MAX (Pro, including the 7-day trial). */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const prof = await getProfile(user.uid);
    if (prof?.plan !== "pro") return json(403, { code: "PRO_ONLY" });
    const models = await loadModels();
    return json(200, { models });
  } catch (e) {
    console.error("[models]", String(e).slice(0, 160));
    return json(200, { models: cache?.list ?? [] });
  }
}
