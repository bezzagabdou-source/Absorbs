import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __barqPool?: Pool;
  __barqDb?: NodePgDatabase;
};

/** Variable names that commonly hold a Postgres connection string. */
const URL_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
  "SUPABASE_DB_URL",
  "DB_URL",
  "DATABASE",
];

function cleanValue(v: string | undefined): string {
  return (v ?? "").trim().replace(/^[\"'`]+|[\"'`]+$/g, "").trim();
}

/** Finds the connection string in any of the usual variables (case-insensitive). */
export function findDatabaseUrl(): string | undefined {
  const upper = new Map<string, string>();
  for (const k of Object.keys(process.env)) upper.set(k.toUpperCase(), k);
  for (const n of URL_NAMES) {
    const real = upper.get(n);
    const v = real ? cleanValue(process.env[real]) : "";
    if (/^postgres(ql)?:\/\//i.test(v)) return v;
  }
  // last resort: any variable that looks like a postgres URL
  for (const k of Object.keys(process.env)) {
    const v = cleanValue(process.env[k]);
    if (/^postgres(ql)?:\/\//i.test(v)) return v;
  }
  return undefined;
}

function buildPool(): Pool {
  const raw = findDatabaseUrl();
  if (!raw) {
    throw new Error(
      "DATABASE_URL is missing (add it in Vercel → Settings → Environment Variables, then Redeploy)"
    );
  }

  let connectionString = raw;
  let host = "";
  try {
    const u = new URL(raw);
    host = u.hostname;
    // we configure TLS ourselves; these query params only confuse `pg`
    for (const p of [
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "uselibpqcompat",
      "channel_binding",
      "supa",
      "pgbouncer",
      "connect_timeout",
    ]) {
      u.searchParams.delete(p);
    }
    connectionString = u.toString();
  } catch {
    /* keep the raw string */
  }

  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";

  return new Pool({
    connectionString,
    // Neon / Supabase / Vercel Postgres all require TLS; their chains are valid
    // but pooler hostnames sometimes aren't, so we don't verify the hostname.
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 3, // serverless: keep the footprint small
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
}

/**
 * Lazy init: the connection is only created on first real use, so
 * `next build` never fails when the variable is missing at build time.
 */
function getPool(): Pool {
  if (!globalForDb.__barqPool) {
    const p = buildPool();
    p.on("error", (e) => console.error("[db] idle client error:", e.message));
    globalForDb.__barqPool = p;
  }
  return globalForDb.__barqPool;
}

function getDb(): NodePgDatabase {
  if (!globalForDb.__barqDb) {
    globalForDb.__barqDb = drizzle(getPool());
  }
  return globalForDb.__barqDb;
}

export const pool = new Proxy({} as Pool, {
  get(_t, prop) {
    const p = getPool();
    const v = Reflect.get(p, prop, p);
    return typeof v === "function" ? v.bind(p) : v;
  },
});

export const db = new Proxy({} as NodePgDatabase, {
  get(_t, prop) {
    const d = getDb();
    const v = Reflect.get(d, prop, d);
    return typeof v === "function" ? v.bind(d) : v;
  },
});
