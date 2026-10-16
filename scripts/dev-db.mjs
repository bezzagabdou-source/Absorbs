/**
 * Local Postgres for development — a full embedded server (no install needed).
 *
 *   npm run db:dev
 *
 * Prints DATABASE_URL at the end; the app picks it up automatically when
 * exported (Next.js reads .env.local — add the printed line there if you
 * start the DB in a separate terminal).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const port = Number(process.env.PG_PORT || 54329);
const user = "postgres";
const password = "postgres";
const database = "nexus";
const dataDir = process.env.PG_DATA_DIR || join(root, ".pgdata");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

console.log(`[dev-db] using data dir: ${dataDir}`);

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
} catch (e) {
  console.error("[dev-db] embedded-postgres is not installed. Run: npm install");
  process.exit(1);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
});

try {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch {
    /* already created on a previous run */
  }
  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
  console.log(`[dev-db] Postgres is running on port ${port}`);
  console.log(`DATABASE_URL=${url}`);

  // keep the process alive
  const noop = () => {};
  process.on("SIGINT", noop);
  process.on("SIGTERM", noop);
  setInterval(() => {}, 1 << 30);
} catch (e) {
  console.error("[dev-db] failed to start embedded Postgres:", e);
  process.exit(1);
}
