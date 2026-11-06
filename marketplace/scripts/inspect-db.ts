import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { Pool } from "pg";
async function main() {
  const url = process.env.DATABASE_MIGRATION_URL; if (!url) throw new Error("DATABASE_MIGRATION_URL required");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    const schema = process.env.DB_SCHEMA || "public"; const tables = await pool.query("select tablename from pg_tables where schemaname=$1 order by tablename", [schema]);
    const types = await pool.query("select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname=$1 and t.typtype='e' order by 1", [schema]);
    const roles = await pool.query("select rolname from pg_roles where rolname in ('dz_runtime','dz_push_worker') order by 1");
    const extensions = await pool.query("select extname from pg_extension order by 1");
    console.log(JSON.stringify({ event: "db_inspect", schema, tables: tables.rows.map(r => r.tablename), enumTypes: types.rows.map(r => r.typname), roles: roles.rows.map(r => r.rolname), extensions: extensions.rows.map(r => r.extname) }));
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(JSON.stringify({ event: "db_inspect_failed", name: error instanceof Error ? error.name : "UnknownError" })); process.exitCode = 1; });
