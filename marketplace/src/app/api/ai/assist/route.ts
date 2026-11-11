import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { api, ok, readJson } from "@/lib/server/http";
import { withActor } from "@/db";
import { AppError } from "@/lib/server/errors";
import { aiAssistInputSchema } from "@/features/ai/schema";
import { assist, aiStatus } from "@/features/ai/service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const factsQuerySchema = z.object({ q: z.string().trim().max(100).default("") }).strict();

type CategoryRow = { name_ar: string; name_en: string; name_fr: string; listings: number };

/**
 * Aggregate-only facts for the assistant: public listing counts, the busiest
 * categories and a price range for the searched keywords. No user, offer,
 * message or contact row is ever read here.
 */
async function loadFacts(query: string) {
  const empty = { listingCount: undefined as number | undefined, categories: [] as CategoryRow[], priceHint: null as { min: number; max: number; sample: number } | null };
  try {
    return await withActor(null, async (tx) => {
      const totals = await tx.execute(sql`select count(*)::int as listings from products where status = 'active'`);
      const listingCount = Number((totals.rows[0] as { listings?: number } | undefined)?.listings ?? 0);

      const categories = await tx.execute(sql`
        select c.name_ar, c.name_en, c.name_fr, count(p.id)::int as listings
        from categories c join products p on p.category_id = c.id and p.status = 'active'
        group by c.id, c.name_ar, c.name_en, c.name_fr
        order by listings desc, c.sort_order asc
        limit 5
      `);

      let priceHint: { min: number; max: number; sample: number } | null = null;
      if (query) {
        const price = await tx.execute(sql`
          select min(price_dzd)::float8 as min_price, max(price_dzd)::float8 as max_price, count(*)::int as sample
          from products
          where status = 'active' and search_vector @@ plainto_tsquery('simple', ${query})
        `);
        const row = price.rows[0] as { min_price: number | null; max_price: number | null; sample: number } | undefined;
        if (row && row.sample > 0 && row.min_price && row.max_price) priceHint = { min: row.min_price, max: row.max_price, sample: row.sample };
      }

      return { listingCount, categories: categories.rows as CategoryRow[], priceHint };
    });
  } catch {
    // The assistant must still answer when the database is briefly unavailable.
    return empty;
  }
}

export async function GET(request: NextRequest) {
  return api(request, {}, async () => ok(aiStatus()));
}

export async function POST(request: NextRequest) {
  return api(request, { auth: true, mutation: true, limit: 20, windowMs: 60000 }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    const input = await readJson(request, aiAssistInputSchema, 8192);
    const parsedFacts = factsQuerySchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
    const query = parsedFacts.success ? parsedFacts.data.q : input.mode === "search" ? input.prompt.slice(0, 100) : "";
    const facts = await loadFacts(query);
    const locale = input.locale;
    const result = await assist(input, fetch, {
      listingCount: facts.listingCount,
      categories: facts.categories.map((category) => category[`name_${locale}` as "name_ar" | "name_en" | "name_fr"]),
      priceHint: facts.priceHint,
    });
    return ok(result);
  });
}
