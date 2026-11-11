import { config } from "dotenv"; config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { Pool } from "pg";
import { dispatchPushBatch } from "../src/features/notifications/push.server";
async function main() {
  const connectionString = process.env.PUSH_DATABASE_URL; if (!connectionString) throw new Error("PUSH_DATABASE_URL required");
  const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 120000 }); let stopping = false;
  process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
  while (!stopping) { try { const sent = await dispatchPushBatch(pool); if (sent) console.log(JSON.stringify({ event: "push_sent", count: sent })); } catch { console.error(JSON.stringify({ event: "push_batch_failed" })); } if (!stopping) await new Promise((resolve) => setTimeout(resolve, 2000)); }
  await pool.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
