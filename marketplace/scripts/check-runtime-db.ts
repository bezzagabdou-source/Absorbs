import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { Pool } from "pg";
async function main() {
  const url = process.env.DATABASE_URL; if (!url) throw new Error("DATABASE_URL required");
  const schema = process.env.DB_SCHEMA || "public";
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public`, connectionTimeoutMillis: 10000 });
  try {
    const identity = await pool.query("select current_user as user, current_schema() as schema");
    const result = await pool.query("select (select count(*) from wilayas) as wilayas, (select count(*) from categories) as categories");
    const rate = await pool.query("select * from consume_rate_limit($1, $2, $3)", ["db-check-runtime", 10, 60000]);
    console.log(JSON.stringify({ event: "runtime_db_check", ok: true, ...identity.rows[0], ...result.rows[0], rateLimit: rate.rows[0]?.allowed === true }));
  } catch (error) {
    const e = error as { code?: string; message?: string };
    console.error(JSON.stringify({ event: "runtime_db_check_failed", code: e.code, message: e.message?.slice(0, 200) }));
    process.exitCode = 1;
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(JSON.stringify({ event: "runtime_db_check_failed", name: error instanceof Error ? error.name : "UnknownError" })); process.exitCode = 1; });
