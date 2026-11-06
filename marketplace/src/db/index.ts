import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbContext = Database | Transaction;
export type Actor = { id: string; role: "buyer" | "seller" | "admin" | "support" } | null;
const globalDb = globalThis as typeof globalThis & { dzPool?: Pool; dzDb?: Database };
export function getPool(): Pool {
  if (!globalDb.dzPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    globalDb.dzPool = new Pool({ connectionString, max: Math.min(20, Math.max(1, Number(process.env.DB_POOL_MAX) || 5)), connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000, application_name: "dz-exchange-runtime", options: `-c search_path=${/^[a-z_][a-z0-9_]*$/.test(process.env.DB_SCHEMA || "public") ? (process.env.DB_SCHEMA || "public") : "public"},public` });
    globalDb.dzPool.on("error", () => console.error(JSON.stringify({ event: "database_pool_error" })));
  }
  return globalDb.dzPool;
}
export function getDb(): Database {
  return globalDb.dzDb ??= drizzle(getPool(), { schema });
}
/** Never use a pooled client without a transaction-local identity; RESET cannot leak across requests. */
export async function withActor<T>(actor: Actor, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${actor?.id ?? ""}, true), set_config('app.role', ${actor?.role ?? "anonymous"}, true)`);
    return fn(tx);
  });
}
