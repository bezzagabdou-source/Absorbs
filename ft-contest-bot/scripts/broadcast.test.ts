import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/panel/manage/route";
import { broadcastStatus, createBroadcast, processBroadcast } from "../src/lib/broadcast";
import { getStore } from "../src/lib/store";

let db: PGlite;
const wait = async () => {};
const req = (body: unknown, key = "test-panel-key") => new NextRequest("https://bot.example/api/panel/manage", { method: "POST", headers: { "content-type": "application/json", "x-panel-key": key }, body: JSON.stringify(body) });
const post = async (body: unknown, key?: string) => { const r = await POST(req(body, key)); return { status: r.status, body: await r.json() }; };
before(async () => {
  process.env.DATABASE_URL = "postgres://test/broadcast";
  process.env.PANEL_PUBLIC_KEY = "test-panel-key";
  db = await PGlite.create();
  await db.exec(`create table ft_kv (k text primary key, v jsonb, n bigint not null default 0);
    create table ft_set (k text not null, m text not null, primary key (k, m));
    create table ft_zset (k text not null, m text not null, score double precision not null default 0, primary key (k,m));
    create table ft_list (id bigserial primary key, k text not null, v text not null);`);
  const query = async (sql: string, args?: unknown[]) => { const r = await db.query(sql, args); return { rows: r.rows, rowCount: r.rowCount }; };
  const globals = globalThis as unknown as { __ftPool: unknown; __ftPoolReady: Promise<void> };
  globals.__ftPool = { query }; globals.__ftPoolReady = Promise.resolve();
  const store = getStore();
  // Deliberately no users:joined entries: all registered users must be included.
  for (let i = 1; i <= 123; i++) await store.sAdd("users:ids", String(i));
  await store.sAdd("users:banned", "3");
});
after(async () => { await db.close(); });

test("authenticated broadcast snapshots all registered users, resumes and never repeats uncertain sends", async () => {
  const jobId = "job_everyone_1234567890", text = "رسالة اختبار";
  assert.equal((await post({ op: "broadcast_start", text, jobId, confirm: true }, "wrong")).status, 401);
  assert.equal((await post({ op: "broadcast_start", text, jobId, confirm: false })).status, 400);
  const started = await post({ op: "broadcast_start", text, jobId, confirm: true });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.total, 123);
  assert.equal(started.body.sent, 0);
  assert.equal(started.body.done, false);
  assert.equal((await post({ op: "broadcast_start", text, jobId, confirm: true })).body.total, 123);
  assert.equal((await post({ op: "broadcast_start", text: "different", jobId, confirm: true })).status, 500);
  // A new user joining after creation is not silently included in this snapshot.
  await getStore().sAdd("users:ids", "999");
  const calls: string[] = [];
  const send = async (id: string) => {
    calls.push(id);
    if (id === "4") return { ok: false, error_code: 403 };
    if (id === "5") throw new Error("response lost after sending");
    return { ok: true };
  };
  let state = await processBroadcast(jobId, { send, wait, maxItems: 17 });
  assert.equal(state.done, false);
  while (!state.done) state = await processBroadcast(jobId, { send, wait, maxItems: 17 });
  assert.equal(state.total, 123);
  assert.equal(state.sent, 120);
  assert.equal(state.failed, 1);
  assert.equal(state.unknown, 1);
  assert.equal(state.excludedBanned, 1);
  assert.equal(state.remaining, 0);
  assert.equal(new Set(calls).size, calls.length);
  assert.ok(!calls.includes("3") && !calls.includes("999"));
  await processBroadcast(jobId, { send, wait });
  assert.equal(calls.length, 122, "a finished job is never replayed");
  const url = new URL("https://bot.example/api/panel/manage"); url.searchParams.set("view", "broadcast"); url.searchParams.set("id", jobId);
  const read = await GET(new NextRequest(url, { headers: { "x-panel-key": "test-panel-key" } }));
  const data = await read.json();
  assert.equal(data.broadcast.sent, 120);
  assert.ok(!JSON.stringify(data).includes(text));
});

test("a durable pre-send claim after interruption is uncertain and never sent again", async () => {
  const id = "job_interrupted_12345678";
  await createBroadcast(id, "message");
  const store = getStore();
  const raw = await store.get<{ ids: string[] }>(`broadcast:job:${id}`);
  const interrupted = raw!.ids.find(user => user !== "3")!;
  await store.sAdd(`broadcast:job:${id}:attempted`, interrupted);
  const calls: string[] = [];
  let state = await processBroadcast(id, { send: async user => { calls.push(user); return { ok: true }; }, wait, maxItems: 30 });
  while (!state.done) state = await processBroadcast(id, { send: async user => { calls.push(user); return { ok: true }; }, wait, maxItems: 30 });
  assert.ok(!calls.includes(interrupted));
  assert.equal(state.unknown, 1);
  assert.equal(state.remaining, 0);
});

test("a shared lease prevents concurrent workers across separate jobs", async () => {
  const a = "job_concurrent_a_123456", b = "job_concurrent_b_123456";
  await createBroadcast(a, "first"); await createBroadcast(b, "second");
  let entered!: () => void, release!: () => void;
  const inSend = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const first = processBroadcast(a, { maxItems: 1, wait, send: async () => { entered(); await hold; return { ok: true }; } });
  await inSend;
  const other = await processBroadcast(b, { maxItems: 1, wait, send: async () => { throw new Error("must not send"); } });
  assert.equal(other.busy, true);
  assert.equal(other.attempted, 0);
  release(); await first;
  assert.equal((await broadcastStatus(a)).sent, 1);
  assert.equal((await processBroadcast(b, { maxItems: 1, wait, send: async () => ({ ok: true }) })).busy, false);
});

test("Telegram 429 pauses all workers and retries only the explicitly rejected recipient", async () => {
  const id = "job_flood_control_123456";
  await createBroadcast(id, "message");
  let calls = 0;
  const limited = await processBroadcast(id, { wait, send: async () => { calls++; return { ok: false, error_code: 429, parameters: { retry_after: 5 } }; } });
  assert.equal(calls, 1); assert.equal(limited.attempted, 0); assert.ok(limited.retryAfterMs > 0);
  await processBroadcast(id, { wait, send: async () => { calls++; return { ok: true }; } });
  assert.equal(calls, 1);
  await getStore().set("broadcast:worker:cooldown", 0);
  const retried = await processBroadcast(id, { maxItems: 1, wait, send: async () => { calls++; return { ok: true }; } });
  assert.equal(calls, 2); assert.equal(retried.sent, 1);
});
