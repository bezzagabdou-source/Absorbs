import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
async function main() {
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL required");
const pool = new Pool({ connectionString: url });
try {
  const runtimePassword = process.env.DB_RUNTIME_PASSWORD;
  const workerPassword = process.env.DB_WORKER_PASSWORD;
  if (!runtimePassword || !workerPassword || runtimePassword.length < 24 || workerPassword.length < 24) throw new Error("Strong DB_RUNTIME_PASSWORD and DB_WORKER_PASSWORD (24+ chars) required");
  const escape = (v: string) => v.replace(/'/g, "''");
  for (const [role, password] of [["dz_runtime", runtimePassword], ["dz_push_worker", workerPassword]]) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${escape(password)}'; ELSE ALTER ROLE ${role} PASSWORD '${escape(password)}'; END IF; END $$;`);
    await pool.query(`GRANT CONNECT ON DATABASE ${JSON.stringify((await pool.query("select current_database() as name")).rows[0].name)} TO ${role}`);
  }
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.query(await readFile("./docs/rls-policies.sql", "utf8"));
  console.log("Schema, RLS, grants and worker policies applied.");
} finally { await pool.end(); }

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
