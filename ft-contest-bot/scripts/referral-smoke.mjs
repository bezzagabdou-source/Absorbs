#!/usr/bin/env node
// Requires a local server with TELEGRAM_MOCK=1, TELEGRAM_WEBHOOK_SECRET and PANEL_PUBLIC_KEY.
// Never run against a real bot: this script generates simulated users and updates.
import assert from "node:assert/strict";

const base = process.env.BASE || "http://127.0.0.1:3210";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Smoke test requires a local mock server");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "smoke-secret";
const key = process.env.PANEL_PUBLIC_KEY || "dev-panel-key";
let updateId = Math.floor(Math.random() * 100_000_000);
const inviter = Math.floor(Date.now() / 10);
const joiner = inviter + 1;
const already = inviter + 2;
const stranger = inviter + 3;

async function update(userId, text, extra = {}) {
  const r = await fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: ++updateId, message: { message_id: updateId, chat: { id: userId, type: "private" }, from: { id: userId, first_name: userId === inviter ? "Alice <FT>" : "Bob", username: `u${userId}`, ...extra }, text } }),
  });
  assert.equal(r.status, 200);
}
async function callback(userId, data) {
  const r = await fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: ++updateId, callback_query: { id: String(updateId), from: { id: userId, first_name: "Alice <FT>" }, data, message: { message_id: 9, chat: { id: userId, type: "private" } } } }),
  });
  assert.equal(r.status, 200);
}
const calls = async () => (await (await fetch(`${base}/api/dev/mock`)).json()).calls;
const referrals = async () => (await (await fetch(`${base}/api/panel/referrals`, { headers: { "x-panel-key": key } })).json()).referrals;

const mock = await fetch(`${base}/api/dev/mock`);
assert.equal(mock.status, 200, "The server must be in TELEGRAM_MOCK mode");
await fetch(`${base}/api/dev/mock?clear=1`, { method: "DELETE" });
// An unsubscribed user can still get their referral link, even with no active contest.
await fetch(`${base}/api/dev/mock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ left: ["@F_5_5_T", "@Ft_efootbal", "@F_M_M_T"] }) });
await update(inviter, "/start");
const gate = (await calls()).find((x) => x.method === "sendMessage" && x.payload.chat_id === inviter);
assert.ok(JSON.stringify(gate).includes("reflink"), "gate offers referral link");
await callback(inviter, "reflink");
const linkMsg = (await calls()).find((x) => x.method === "editMessageText" && x.payload.chat_id === inviter && String(x.payload.text).includes(`start=ref_${inviter}`));
assert.ok(linkMsg, "unique working link is displayed with no active contest");
assert.ok(JSON.stringify(linkMsg.payload.reply_markup).includes("t.me/share/url"), "share button exists");
await update(inviter, "/ref");
assert.ok((await calls()).some((x) => x.method === "sendMessage" && x.payload.chat_id === inviter && String(x.payload.text).includes(`start=ref_${inviter}`)), "/ref works before channel subscription");

// Concurrent starts and retries from one new person count exactly once.
await Promise.all(Array.from({ length: 6 }, () => update(joiner, `/start ref_${inviter}`, { first_name: "Bob", last_name: "Joined" })));
let entries = (await referrals()).filter((r) => r.joinerId === String(joiner));
assert.equal(entries.length, 1, "new user credited and logged once");
assert.equal(entries[0].inviterId, String(inviter));
assert.equal(entries[0].inviterName, "Alice <FT>");
assert.equal(entries[0].joinerName, "Bob Joined");
assert.equal(entries[0].points, 2, "configured per-join shop reward is granted");
let logs = await calls();
assert.ok(logs.some((x) => x.method === "sendMessage" && String(x.payload.chat_id) === String(joiner) && String(x.payload.text).includes("Alice &lt;FT&gt;")), "new user sees inviter safely escaped");
assert.ok(logs.some((x) => x.method === "sendMessage" && String(x.payload.chat_id) === String(inviter) && String(x.payload.text).includes("Bob Joined")), "inviter sees who joined");

await update(inviter, `/start ref_${inviter}`); // self-referral
await update(already, "/start");
await update(already, `/start ref_${inviter}`); // not new
await update(stranger, "/start ref_99999999999"); // inviter does not exist
entries = (await referrals()).filter((r) => [inviter, already, stranger].map(String).includes(r.joinerId));
assert.equal(entries.length, 0, "self, old users and unknown inviters do not get credit");

const users = await (await fetch(`${base}/api/admin2?what=users`, { headers: { "x-panel-key": key } })).json();
assert.equal(users.users.find((u) => u.id === String(inviter)).points, 2, "duplicate starts do not multiply points");
assert.equal((await fetch(`${base}/api/panel/referrals`)).status, 401, "referral list is private");
assert.equal((await fetch(`${base}/api/panel/referrals?photo=${inviter}`, { headers: { "x-panel-key": key } })).status, 404, "unavailable profile photo degrades gracefully");

// Settings update changes only the intended per-join reward.
const headers = { "content-type": "application/json", "x-panel-key": key };
const configBefore = await (await fetch(`${base}/api/panel/referrals?config=1`, { headers })).json();
assert.equal(configBefore.perJoin, 2);
const badConfig = await fetch(`${base}/api/panel/referrals`, { method: "POST", headers, body: JSON.stringify({ perJoin: -1 }) });
assert.equal(badConfig.status, 400);
const change = await fetch(`${base}/api/panel/referrals`, { method: "POST", headers, body: JSON.stringify({ perJoin: 4 }) });
assert.equal((await change.json()).perJoin, 4);
await fetch(`${base}/api/panel/referrals`, { method: "POST", headers, body: JSON.stringify({ perJoin: 2 }) });

// Uploaded images survive ordinary edits by the pre-existing external FT AI panel.
async function post(path, body) {
  const response = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const result = await response.json();
  assert.ok(response.ok && result.ok, JSON.stringify(result));
  return result;
}
const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=';
const rewardId = `smoke_${Date.now()}`;
await post('/api/panel/rewards', { op: 'save_reward', reward: { id: rewardId, title: 'Smoke reward', cost: 5 } });
await post('/api/admin2', { action: 'reward_image', id: rewardId, dataUrl });
await post('/api/panel/rewards', { op: 'save_reward', reward: { id: rewardId, title: 'Edited', cost: 6 } });
const saved = await (await fetch(`${base}/api/panel/rewards`, { headers })).json();
assert.equal(saved.rewards.find((r) => r.id === rewardId).image, dataUrl);
const made = await post('/api/panel/rewards', { op: 'save_contest', contest: { title: 'Smoke contest', target: 5 } });
const contestId = made.contest.id;
await post('/api/admin2', { action: 'contest_image', id: contestId, dataUrl });
await post('/api/panel/rewards', { op: 'save_contest', contest: { id: contestId, title: 'Edited', target: 5, imageUrl: '1' } });
assert.equal((await fetch(`${base}/api/contests/${contestId}/image`)).status, 200);
await post('/api/panel/rewards', { op: 'delete_reward', id: rewardId });
await post('/api/panel/rewards', { op: 'delete_contest', id: contestId });
console.log("Referral smoke test passed: gated link, attribution, points, privacy, photos and image preservation.");
