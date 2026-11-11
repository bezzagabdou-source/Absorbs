import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getStore } from "../src/lib/store";

// PGlite executes the actual PostgreSQL statements against an isolated, in-memory database.
let db: PGlite;
let store: ReturnType<typeof getStore>;
before(async () => {
  db = await PGlite.create();
  await db.exec(`
    create table ft_kv (k text primary key, v jsonb, n bigint not null default 0);
    create table ft_set (k text not null, m text not null, primary key (k, m));
    create table ft_zset (k text not null, m text not null, score double precision not null default 0, primary key (k, m));
    create table ft_list (id bigserial primary key, k text not null, v text not null);
  `);
  const query = async (sql: string, args?: unknown[]) => {
    const result = await db.query(sql, args);
    return { rows: result.rows, rowCount: result.rowCount };
  };
  const globals = globalThis as unknown as { __ftPool: unknown; __ftPoolReady: Promise<void> };
  globals.__ftPool = { query, connect: async () => ({ query, release() {} }) };
  globals.__ftPoolReady = Promise.resolve();
  process.env.DATABASE_URL = "postgres://local-test/ft";
  store = getStore();
});
const inviter = { id: "1001", firstName: "Inviter", username: "inviter", joinedAt: 100 };
const joiner = { id: "1002", firstName: "Joiner", username: "joiner", joinedAt: 200 };

after(async () => { await db.close(); });

test("PostgreSQL commits first join, attribution and points exactly once", async () => {
  await store.sAdd("users:ids", inviter.id);
  await store.set(`user:${inviter.id}`, inviter);
  const input = { inviter, joiner, at: 200, points: 2 };
  assert.equal(await store.registerReferral(input), true);
  assert.equal(await store.registerReferral(input), false);
  assert.equal(await store.get<number>(`pts:${inviter.id}`), 2);
  assert.equal(await store.get<number>(`refs:joined:${inviter.id}`), 1);
  assert.equal(await store.zScore("points:invites", inviter.id), 1);
  assert.equal(await store.zScore("pts:top", inviter.id), 2);
  assert.deepEqual(await store.get(`user:${joiner.id}`), joiner);
  const log = await store.listRecent("referrals:log", 10);
  assert.equal(log.length, 1);
  assert.equal(JSON.parse(log[0]).inviterId, inviter.id);
});

test("PostgreSQL rolls back registration and log if awarding points fails", async () => {
  const badInviter = { ...inviter, id: "1003" };
  const newJoiner = { ...joiner, id: "1004" };
  await store.set(`pts:${badInviter.id}`, "not-a-number");
  await assert.rejects(store.registerReferral({ inviter: badInviter, joiner: newJoiner, at: 300, points: 2 }));
  assert.equal(await store.sHas("users:ids", newJoiner.id), false);
  assert.equal(await store.get(`user:${newJoiner.id}`), null);
  assert.equal((await store.listRecent("referrals:log", 10)).length, 1);
});

test("legacy users, self referrals, and disabled points", async () => {
  const legacy = { ...joiner, id: "1005" };
  await store.set(`user:${legacy.id}`, legacy);
  assert.equal(await store.registerReferral({ inviter, joiner: legacy, at: 400, points: 2 }), false);
  assert.equal(await store.registerReferral({ inviter, joiner: inviter, at: 400, points: 2 }), false);
  const free = { ...joiner, id: "1006" };
  assert.equal(await store.registerReferral({ inviter, joiner: free, at: 500, points: 0 }), true);
  assert.equal(await store.get<number>(`pts:${inviter.id}`), 2);
  assert.equal(await store.get<number>(`refs:joined:${inviter.id}`), 2);
  const log = await store.listRecent("referrals:log", 1);
  assert.equal(JSON.parse(log[0]).joinerId, free.id);
});

test("shop balance adjustments are atomic, clamp at zero and keep ranking in sync", async () => {
  const id = "88801";
  await Promise.all(Array.from({ length: 12 }, () => store.adjustBalance(id, 1, false)));
  assert.equal(await store.get<number>(`pts:${id}`), 12);
  assert.equal(await store.zScore("pts:top", id), 12);
  assert.equal(await store.adjustBalance(id, -50, false), 0);
  assert.equal(await store.zScore("pts:top", id), 0);
  assert.equal(await store.adjustBalance(id, 7, true), 7);
  assert.equal(await store.zScore("pts:top", id), 7);
});

test("a rejected reward request is refunded once and cannot change status afterwards", async () => {
  const id = "request_atomic", uid = "88802";
  const request = { id, userId: uid, userName: "test", username: "", rewardId: "r", rewardTitle: "Reward", emoji: "🎁", cost: 12, status: "pending", at: 1 };
  await store.set(`rreq:${id}`, request);
  await store.adjustBalance(uid, 3, true);
  const first = await store.decideRewardRequest(id, "rejected", 10, "");
  const second = await store.decideRewardRequest(id, "approved", 11, "");
  assert.equal(first.changed, true);
  assert.equal(first.request?.status, "rejected");
  assert.equal(second.changed, false);
  assert.equal(second.request?.status, "rejected");
  assert.equal(await store.get<number>(`pts:${uid}`), 15);
  assert.equal(await store.zScore("pts:top", uid), 15);
});

test("recent requests, empty reward catalog and saved settings round-trip", async () => {
  const { listRequests, saveRewards, ensureRewards } = await import("../src/lib/rewards");
  const { getSettings, saveSettings } = await import("../src/lib/settings");
  const ids = Array.from({ length: 105 }, (_, i) => `recent_${i}`);
  for (const id of ids) await store.set(`rreq:${id}`, { id, status: "pending" });
  await store.listPush("rewards:requests", ids);
  const recent = await listRequests(5);
  assert.deepEqual(recent.map(r => r.id), ids.slice(-5).reverse());
  await saveRewards([]);
  assert.deepEqual(await ensureRewards(), [], "deleting the last reward must not restore defaults");
  const welcome = "ترحيب خاص طويل ".repeat(12);
  await saveSettings({ welcomeText: welcome, requiredChannels: [], requireJoin: false });
  const saved = await getSettings();
  assert.equal(saved.welcomeText, welcome.trim());
  assert.deepEqual(saved.requiredChannels, []);
  assert.equal(saved.requireJoin, false);
});
