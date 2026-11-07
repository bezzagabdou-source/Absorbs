import EmbeddedPostgres from "embedded-postgres";
import { mkdir } from "node:fs/promises";
const dir = process.env.LOCAL_DB_DIR || "/home/user/.local-db/marketplace";
await mkdir(dir, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: process.env.LOCAL_DB_PASSWORD || "local-development-only", port: Number(process.env.LOCAL_DB_PORT || 55432), persistent: true, autoRehydrateSymlinks: true, createPostgresUser: process.getuid?.() === 0, postgresFlags: ["-c", "listen_addresses=127.0.0.1"] });
try { await pg.initialise(); } catch (error) { if (!(await import("node:fs")).existsSync(`${dir}/PG_VERSION`)) throw error; }
await pg.start();
try { await pg.createDatabase("marketplace"); } catch (error) { if (!String(error).includes("already exists")) throw error; }
console.log("Local PostgreSQL ready on 127.0.0.1:" + (process.env.LOCAL_DB_PORT || 55432));
await new Promise((resolve) => { process.on("SIGTERM", resolve); process.on("SIGINT", resolve); });
await pg.stop();
