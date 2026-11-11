import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/panel/manage/route";
import { broadcastStatus, createBroadcast, processBroadcast, retryFailedBroadcast, sendWithSecondaryOnMissingChat } from "../src/lib/broadcast";
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
    if (id === "4") return { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" };
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
  assert.equal(state.failureReasons.blocked, 1);
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
  assert.equal((await post({ op: "broadcast_retry", jobId, confirm: false })).status, 400);
  const retry = await post({ op: "broadcast_retry", jobId, confirm: true });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.total, 1);
  assert.equal(retry.body.scope, "failed_only_retry");
  const again = await retryFailedBroadcast(jobId);
  assert.equal(again.jobId, retry.body.jobId, "repeated clicks return the same retry job");
  const retried: string[] = [];
  const completed = await processBroadcast(retry.body.jobId, { send: async user => { retried.push(user); return { ok: true }; }, wait });
  assert.equal(completed.sent, 1);
  assert.deepEqual(retried, ["4"], "never retry successful or uncertain recipients");
  await processBroadcast((await retryFailedBroadcast(jobId)).jobId, { send: async user => { retried.push(user); return { ok: true }; }, wait });
  assert.equal(retried.length, 1);
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


test("fallback is restricted to explicit chat-not-found and never bypasses a block or uncertain delivery", async () => {
  let secondary = 0;
  const backup = async () => { secondary++; return { ok: true }; };
  assert.equal((await sendWithSecondaryOnMissingChat(async () => ({ ok: false, error_code: 400, description: "Bad Request: chat not found" }), backup, wait)).ok, true);
  assert.equal(secondary, 1);
  for (const response of [
    { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
    { ok: false, error_code: 400, description: "Bad Request: message is too long" },
    { ok: false, error_code: 429, description: "Too Many Requests" },
    { ok: false, uncertain: true },
    { ok: true },
  ]) await sendWithSecondaryOnMissingChat(async () => response, backup, wait);
  assert.equal(secondary, 1);
});

test("real delivery path uses second configured bot only after chat-not-found", async () => {
  const id = "job_secondary_bot_12345678", store = getStore();
  await store.set(`broadcast:job:${id}`, { id, ids: ["77"], text: "hello", createdAt: Date.now() });
  const oldFetch = global.fetch, oldPrimary = process.env.TELEGRAM_BOT_TOKEN, oldSecond = process.env.TELEGRAM_BOT_TOKEN_2, oldMock = process.env.TELEGRAM_MOCK;
  process.env.TELEGRAM_BOT_TOKEN = "primary-test-token"; process.env.TELEGRAM_BOT_TOKEN_2 = "secondary-test-token"; process.env.TELEGRAM_MOCK = "0";
  const urls: string[] = [];
  global.fetch = async (input) => {
    const url = String(input); urls.push(url);
    if (url.includes("primary-test-token")) return Response.json({ ok: false, error_code: 400, description: "Bad Request: chat not found" }, { status: 400 });
    if (url.includes("secondary-test-token")) return Response.json({ ok: true, result: { message_id: 1 } });
    throw new Error("unexpected endpoint");
  };
  try {
    const status = await processBroadcast(id, { wait });
    assert.equal(status.sent, 1); assert.equal(status.failed, 0);
    assert.equal(urls.length, 2); assert.match(urls[0], /primary-test-token/); assert.match(urls[1], /secondary-test-token/);
  } finally {
    global.fetch = oldFetch;
    if (oldPrimary === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = oldPrimary;
    if (oldSecond === undefined) delete process.env.TELEGRAM_BOT_TOKEN_2; else process.env.TELEGRAM_BOT_TOKEN_2 = oldSecond;
    if (oldMock === undefined) delete process.env.TELEGRAM_MOCK; else process.env.TELEGRAM_MOCK = oldMock;
  }
});

test("a broken bot token pauses the job instead of falsely failing every member", async () => {
  const id = "job_invalid_token_1234567", store = getStore();
  await store.set(`broadcast:job:${id}`, { id, ids: ["77", "78"], text: "hello", createdAt: Date.now() });
  let calls = 0;
  const paused = await processBroadcast(id, { wait, send: async () => { calls++; return { ok: false, error_code: 401, description: "Unauthorized" }; } });
  assert.equal(calls, 1); assert.equal(paused.failed, 0); assert.equal(paused.attempted, 0);
  assert.equal(paused.remaining, 2); assert.ok(paused.retryAfterMs > 0); assert.match(paused.problem || "", /توكن/);
  await processBroadcast(id, { wait, send: async () => { calls++; return { ok: true }; } });
  assert.equal(calls, 1);
  await store.set("broadcast:worker:cooldown", 0);
  const resumed = await processBroadcast(id, { wait, send: async () => ({ ok: true }) });
  assert.equal(resumed.sent, 2); assert.equal(resumed.problem, null); assert.equal(resumed.done, true);
});


test("known pre-send network failures retry with backoff, then remain retryable as rejected", async () => {
  const id = "job_network_retry_1234567", store = getStore();
  await store.set(`broadcast:job:${id}`, { id, ids: ["77"], text: "hello", createdAt: Date.now() });
  let calls = 0;
  const failed = async () => { calls++; return { ok: false, retryable: true, uncertain: false }; };
  for (let i = 0; i < 3; i++) {
    const state = await processBroadcast(id, { wait, send: failed });
    assert.equal(state.attempted, 0); assert.equal(state.failed, 0); assert.ok(state.retryAfterMs > 0);
    await store.set("broadcast:worker:cooldown", 0);
  }
  const exhausted = await processBroadcast(id, { wait, send: failed });
  assert.equal(calls, 4); assert.equal(exhausted.failed, 1); assert.equal(exhausted.failureReasons.network, 1);
  assert.equal(exhausted.done, true);
  const retry = await retryFailedBroadcast(id);
  assert.equal((await processBroadcast(retry.jobId, { wait, send: async () => ({ ok: true }) })).sent, 1);
});

test("Telegram network classification only retries failures known to precede sending", async () => {
  const { sendMessage } = await import("../src/lib/telegram");
  const oldFetch = global.fetch, oldToken = process.env.TELEGRAM_BOT_TOKEN, oldMock = process.env.TELEGRAM_MOCK;
  process.env.TELEGRAM_BOT_TOKEN = "mock-token"; process.env.TELEGRAM_MOCK = "0";
  try {
    global.fetch = async () => { throw new TypeError("dns failed", { cause: { code: "ENOTFOUND" } }); };
    const dns = await sendMessage("55", "hello");
    assert.equal(dns.retryable, true); assert.equal(dns.uncertain, false);
    global.fetch = async () => { throw new TypeError("socket lost", { cause: { code: "UND_ERR_SOCKET" } }); };
    const socket = await sendMessage("55", "hello");
    assert.equal(socket.retryable, false); assert.equal(socket.uncertain, true);
    global.fetch = async () => Response.json({ unexpected: true });
    assert.equal((await sendMessage("55", "hello")).uncertain, true);
  } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = oldToken;
    if (oldMock === undefined) delete process.env.TELEGRAM_MOCK; else process.env.TELEGRAM_MOCK = oldMock;
  }
});
