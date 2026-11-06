import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { readFile, mkdtemp, cp, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
async function main() {
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL required");
const schema = process.env.DB_SCHEMA || "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid DB_SCHEMA");
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
try {
  const runtimePassword = process.env.DB_RUNTIME_PASSWORD;
  const workerPassword = process.env.DB_WORKER_PASSWORD;
  if (!runtimePassword || !workerPassword || runtimePassword.length < 24 || workerPassword.length < 24) throw new Error("Strong DB_RUNTIME_PASSWORD and DB_WORKER_PASSWORD (24+ chars) required");
  const escape = (v: string) => v.replace(/'/g, "''");
  for (const [role, password] of [["dz_runtime", runtimePassword], ["dz_push_worker", workerPassword]]) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${escape(password)}'; ELSE ALTER ROLE ${role} PASSWORD '${escape(password)}'; END IF; END $$;`);
    await pool.query(`GRANT CONNECT ON DATABASE ${JSON.stringify((await pool.query("select current_database() as name")).rows[0].name)} TO ${role}`);
  }
  if (schema !== "public") await pool.query(`CREATE SCHEMA IF NOT EXISTS ${JSON.stringify(schema)}`);
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  let migrationsFolder = "./drizzle";
  let tempDir = "";
  if (schema !== "public") {
    tempDir = await mkdtemp(join(tmpdir(), "dz-migrations-"));
    await cp("./drizzle", tempDir, { recursive: true });
    for (const file of await readdir(join(tempDir))) {
      if (!file.endsWith(".sql")) continue;
      const path = join(tempDir, file);
      await writeFile(path, (await readFile(path, "utf8")).replaceAll('"public".', `"${schema}".`));
    }
    migrationsFolder = tempDir;
  }
  try {
    await migrate(drizzle(pool), { migrationsFolder, migrationsSchema: schema === "public" ? "drizzle" : `${schema}_migrations` });
  } finally { if (tempDir) await rm(tempDir, { recursive: true, force: true }); }
  const policies = (await readFile("./docs/rls-policies.sql", "utf8")).replaceAll("pg_catalog, public", `pg_catalog, ${schema}, public`).replaceAll("pg_catalog,public", `pg_catalog,${schema},public`);
  await pool.query(policies);
  console.log("Schema, RLS, grants and worker policies applied.");
} finally { await pool.end(); }

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
