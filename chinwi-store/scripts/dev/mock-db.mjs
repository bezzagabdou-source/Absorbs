/**
 * mock-db.mjs — قاعدة بيانات Postgres حقيقية داخل العملية (PGlite) مكشوفة على TCP.
 * للاختبار المحلي فقط — الإنتاج يستخدم Neon.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.MOCK_DB_PORT || 5432);

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 12 });
await server.start();
console.log(`[mock-db] PGlite listening on 127.0.0.1:${PORT}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.stop().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  });
}
