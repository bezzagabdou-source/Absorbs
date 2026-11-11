import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/panel/agent/route";

let db: PGlite;
const request = (body: unknown, key = "panel-test-key") => new NextRequest("https://bot.example/api/panel/agent", { method: "POST", headers: { "content-type": "application/json", "x-panel-key": key }, body: JSON.stringify(body) });
const call = async (body: unknown) => { const response = await POST(request(body)); return { status: response.status, body: await response.json() }; };
before(async () => {
  process.env.PANEL_PUBLIC_KEY = "panel-test-key";
  process.env.ADMIN_SECRET = "stable-test-backup-secret";
  process.env.DATABASE_URL = "postgres://local-test/ft";
  process.env.TELEGRAM_MOCK = "1";
  db = await PGlite.create();
  await db.exec("create table ft_kv (k text primary key, v jsonb, n bigint not null default 0)");
  const query = async (sql: string, args?: unknown[]) => { const r = await db.query(sql, args); return { rows: r.rows, rowCount: r.rowCount }; };
  const globals = globalThis as unknown as { __ftPool: unknown; __ftPoolReady: Promise<void> };
  globals.__ftPool = { query, connect: async () => ({ query, release() {} }) };
  globals.__ftPoolReady = Promise.resolve();
});
after(async () => { await db.close(); });

test("agent route requires the panel key and stores encrypted, conflict-safe database backups", async () => {
  assert.equal((await POST(request({ op: "db_query", key: "user:1" }, "bad"))).status, 401);
  const initial = await call({ op: "db_query", key: "user:1" });
  assert.equal(initial.body.exists, false);
  const updated = await call({ op: "db_update", key: "user:1", value: { firstName: "Alice" }, expectedVersion: initial.body.version });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.ok(updated.body.backupId);
  const snapshot = await db.query<{ snapshot: string }>("select snapshot from ft_agent_versions where id=$1", [updated.body.backupId]);
  assert.ok(!snapshot.rows[0].snapshot.includes("Alice"));
  assert.equal((await call({ op: "db_update", key: "user:1", value: {}, expectedVersion: initial.body.version })).status, 400);
  const undone = await call({ op: "db_undo", id: updated.body.backupId });
  assert.equal(undone.body.restored, true);
  assert.equal((await call({ op: "db_query", key: "user:1" })).body.exists, false);
  assert.equal((await call({ op: "db_undo", id: updated.body.backupId })).status, 400);
  assert.equal((await call({ op: "db_query", key: "settings" })).status, 400);
  assert.equal((await call({ op: "db_update", key: "pts:1", value: 500, expectedVersion: initial.body.version })).status, 400);
});

test("database undo does not overwrite a newer value", async () => {
  const initial = await call({ op: "db_query", key: "contest:test" });
  const update = await call({ op: "db_update", key: "contest:test", value: { title: "one" }, expectedVersion: initial.body.version });
  await db.query("update ft_kv set v=$2::jsonb where k=$1", ["contest:test", JSON.stringify({ title: "newer" })]);
  assert.equal((await call({ op: "db_undo", id: update.body.backupId })).status, 400);
  assert.equal((await call({ op: "db_query", key: "contest:test" })).body.value.title, "newer");
});

test("Telegram command and webhook management is authenticated and does not expose the secret", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret-not-to-expose";
  const commands = [{ command: "start", description: "Start" }];
  assert.equal((await call({ op: "set_commands", commands })).status, 200);
  assert.deepEqual((await call({ op: "get_bot_info" })).body.commands, commands);
  assert.equal((await call({ op: "set_webhook", url: "https://evil.example/api/telegram/webhook" })).status, 400);
  const result = await call({ op: "set_webhook", url: "https://bot.example/api/telegram/webhook" });
  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body).includes("secret-not-to-expose"));
});
