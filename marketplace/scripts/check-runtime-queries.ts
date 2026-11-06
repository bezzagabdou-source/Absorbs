import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { getReferenceData, searchListings } from "../src/features/catalog/queries";
import { getPool } from "../src/db";
async function main() {
  try {
    const reference = await getReferenceData();
    const listings = await searchListings({ q: "", sort: "newest", limit: 1 });
    console.log(JSON.stringify({ event: "runtime_queries_check", ok: true, categories: reference.categories.length, wilayas: reference.wilayas.length, listings: listings.total }));
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(JSON.stringify({ event: "runtime_queries_check_failed", code: e.code, message: e.message?.slice(0, 400) }));
    process.exitCode = 1;
  } finally { await getPool().end(); }
}
main().catch((error) => { console.error(JSON.stringify({ event: "runtime_queries_check_failed", name: error instanceof Error ? error.name : "UnknownError" })); process.exitCode = 1; });
