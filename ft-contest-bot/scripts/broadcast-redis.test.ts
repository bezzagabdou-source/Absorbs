import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createConnection } from "node:net";
import { after, before, test } from "node:test";
import { getStore } from "../src/lib/store";
import { createBroadcast, processBroadcast } from "../src/lib/broadcast";

// Exercise the real Redis commands/Lua through a tiny Upstash-compatible local
// HTTP adapter. No production services or credentials are involved.
const binary = process.env.REDIS_TEST_BIN || "/tmp/redis-7.4.7/src/redis-server";
const available = existsSync(binary);
const socketPath = `/tmp/ft-broadcast-${process.pid}.sock`;
let child: ReturnType<typeof spawn>, http: Server;
function parse(data: Buffer, pos = 0): { value: unknown; end: number } | null {
  const lineEnd = data.indexOf("\r\n", pos);
  if (lineEnd < 0) return null;
  const kind = String.fromCharCode(data[pos]), line = data.toString("utf8", pos + 1, lineEnd), start = lineEnd + 2;
  if (kind === "+") return { value: line, end: start };
  if (kind === "-") return { value: { error: line }, end: start };
  if (kind === ":") return { value: Number(line), end: start };
  if (kind === "$") {
    const n = Number(line);
    if (n < 0) return { value: null, end: start };
    if (data.length < start + n + 2) return null;
    return { value: data.toString("utf8", start, start + n), end: start + n + 2 };
  }
  if (kind === "*") {
    let end = start; const values = [];
    for (let i = 0; i < Number(line); i++) { const item = parse(data, end); if (!item) return null; values.push(item.value); end = item.end; }
    return { value: values, end };
  }
  throw new Error("unexpected Redis response");
}
async function redis(args: (string | number)[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const conn = createConnection(socketPath); let received = Buffer.alloc(0);
    conn.on("connect", () => {
      const parts = [`*${args.length}\r\n`];
      for (const arg of args) { const value = String(arg); parts.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`); }
      conn.write(parts.join(""));
    });
    conn.on("data", chunk => {
      received = Buffer.concat([received, chunk]);
      const result = parse(received); if (result) { conn.end(); resolve(result.value); }
    });
    conn.on("error", reject);
  });
}
before(async () => {
  if (!available) return;
  child = spawn(binary, ["--port", "0", "--unixsocket", socketPath, "--save", "", "--appendonly", "no"]);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Redis did not start")), 10000);
    child.stdout!.on("data", chunk => { if (String(chunk).includes("Ready to accept connections")) { clearTimeout(timer); resolve(); } });
    child.once("error", reject);
  });
  http = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const result = await redis(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result && typeof result === "object" && "error" in result ? result : { result }));
    } catch { res.writeHead(500); res.end(JSON.stringify({ error: "test adapter failed" })); }
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("missing test address");
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${address.port}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "local-test";
});
after(async () => {
  if (!available) return;
  await new Promise<void>(resolve => http.close(() => resolve()));
  child.kill(); try { unlinkSync(socketPath); } catch { /* already removed */ }
});

test("Redis claims, lock, resume and ban exclusion work for more than 50 registered users", { skip: !available }, async () => {
  const store = getStore(); assert.equal(store.backend, "redis");
  for (let i = 1; i <= 75; i++) await store.sAdd("users:ids", String(i));
  await store.sAdd("users:banned", "4");
  const id = "redis_broadcast_123456789";
  assert.equal((await createBroadcast(id, "hello")).total, 75);
  assert.equal((await createBroadcast(id, "hello")).total, 75);
  // Simulate a process dying immediately after the durable claim.
  await store.sAdd(`broadcast:job:${id}:attempted`, "1");
  const sent: string[] = [];
  const options = { maxItems: 25, wait: async () => {}, send: async (user: string) => { sent.push(user); return { ok: true }; } };
  let status = await processBroadcast(id, options);
  while (!status.done) status = await processBroadcast(id, options);
  assert.equal(status.total, 75); assert.equal(status.sent, 73);
  assert.equal(status.excludedBanned, 1); assert.equal(status.unknown, 1);
  assert.ok(!sent.includes("1") && !sent.includes("4"));
  assert.equal(new Set(sent).size, sent.length);
  assert.equal(await store.acquireLease("test:lease", "one", 1000), true);
  assert.equal(await store.acquireLease("test:lease", "two", 1000), false);
  await store.releaseLease("test:lease", "two");
  assert.equal(await store.acquireLease("test:lease", "two", 1000), false);
  await store.releaseLease("test:lease", "one");
  assert.equal(await store.acquireLease("test:lease", "two", 1000), true);
  await store.releaseLease("test:lease", "two");
});
