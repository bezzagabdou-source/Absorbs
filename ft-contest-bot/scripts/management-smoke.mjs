#!/usr/bin/env node
// Never run against production: writes test users and catalog entries to a local mock server.
import assert from 'node:assert/strict';
const base = process.env.BASE || 'http://127.0.0.1:3211';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Local mock server required');
const key = process.env.PANEL_PUBLIC_KEY || 'dev-panel-key';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || 'smoke-secret';
const headers = { 'content-type': 'application/json', 'x-panel-key': key };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=';
async function req(path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function op(body) {
  const result = await req('/api/panel/manage', body);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.ok, true, JSON.stringify(result));
  return result.data;
}
const mock = await fetch(base + '/api/dev/mock');
assert.equal(mock.status, 200, 'mock mode required');
assert.equal((await fetch(base + '/api/panel/manage')).status, 401);
assert.equal((await req('/api/panel/manage', { op: 'ai_act', prompt: 'anything' })).status, 404);
const original = (await req('/api/panel/manage?view=overview')).data;

const reward = (await op({ op: 'reward_save', reward: { title: 'Test reward', desc: 'Original description', cost: 20, stock: 2, active: false, section: 'services', delivery: 'original delivery' } })).reward;
assert.equal((await req('/api/admin2', { action: 'reward_image', id: reward.id, dataUrl: image })).status, 200);
await op({ op: 'reward_save', id: reward.id, reward: { cost: 30 } });
let catalog = (await req('/api/panel/manage?view=catalog')).data;
const saved = catalog.rewards.find(r => r.id === reward.id);
assert.equal(saved.cost, 30);
assert.equal(saved.desc, 'Original description');
assert.equal(saved.stock, 2);
assert.equal(saved.active, false);
assert.equal(saved.section, 'services');
assert.equal(saved.delivery, 'original delivery');
assert.equal(saved.hasImage, true);
assert.equal((await fetch(`${base}/api/rewards/${reward.id}/image`)).status, 200);
assert.equal((await req('/api/panel/manage', { op: 'reward_save', id: reward.id, reward: { cost: -1 } })).status, 400);
assert.equal((await req('/api/panel/manage', { op: 'reward_save', id: reward.id, reward: { image: 'bad' } })).status, 400);
assert.equal((await req('/api/panel/manage', { op: 'reward_delete', id: reward.id })).status, 400);

const contest = (await op({ op: 'contest_save', contest: { title: 'Test contest', target: 6, description: 'Keep me', mode: 'group', winners: 2, status: 'active' } })).contest;
assert.equal((await req('/api/admin2', { action: 'contest_image', id: contest.id, dataUrl: image })).status, 200);
await op({ op: 'contest_save', id: contest.id, contest: { target: 8 } });
catalog = (await req('/api/panel/manage?view=catalog')).data;
const edited = catalog.contests.find(c => c.id === contest.id);
assert.equal(edited.target, 8);
assert.equal(edited.description, 'Keep me');
assert.equal(edited.mode, 'group');
assert.equal(edited.status, 'active');
assert.equal(edited.winners, 2);
assert.equal(edited.hasImage, true);
assert.equal((await fetch(`${base}/api/contests/${contest.id}/image`)).status, 200);
assert.equal((await req('/api/panel/manage?view=leaderboard&id=' + contest.id)).data.contest.id, contest.id);

const longWelcome = 'رسالة ترحيب خاصة مطولة '.repeat(8).trim();
await op({ op: 'settings_save', settings: { welcomeText: longWelcome, requiredChannels: [], requireJoin: false, maintenanceMode: false } });
await op({ op: 'points_config', points: { perJoin: 4, dailyMin: 1, dailyMax: 5 } });
const overview = (await req('/api/panel/manage?view=overview')).data;
assert.equal(overview.settings.welcomeText, longWelcome);
assert.deepEqual(overview.settings.requiredChannels, []);
assert.equal(overview.points.perJoin, 4);
assert.ok(!('botToken' in overview.settings));
assert.ok(!('webhookSecret' in overview.settings));
assert.equal((await req('/api/panel/manage', { op: 'points_config', points: { dailyMin: 7, dailyMax: 3 } })).status, 400);
assert.equal((await req('/api/panel/manage', { op: 'settings_save', settings: { botToken: 'bad' } })).status, 400);

const uid = String(Math.floor(Date.now() / 10));
const webhook = await fetch(`${base}/api/telegram/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: Date.now(), message: { message_id: 1, chat: { id: Number(uid), type: 'private' }, from: { id: Number(uid), first_name: 'Local Test' }, text: '/start' } }) });
assert.equal(webhook.status, 200);
assert.equal((await op({ op: 'user_points', userId: uid, delta: 15 })).balance, 15);
assert.equal((await op({ op: 'user_points', userId: uid, delta: -40 })).balance, 0);
assert.equal((await op({ op: 'user_points', userId: uid, points: 7 })).balance, 7);
assert.equal((await req('/api/panel/manage?view=user&id=' + uid)).data.user.points, 7);
await op({ op: 'user_ban', userId: uid, banned: true });
let broadcast = await op({ op: 'broadcast', text: 'test', limit: 1, confirm: true });
assert.equal(broadcast.scope, 'recent_users_only');
assert.equal(broadcast.excludedBanned, 1);
await op({ op: 'user_ban', userId: uid, banned: false });
assert.equal((await op({ op: 'send_message', userId: uid, text: 'Hello' })).sent, true);
broadcast = await op({ op: 'broadcast', text: 'test', limit: 1, confirm: true });
assert.equal(broadcast.sent, 1);
assert.equal((await req('/api/panel/manage', { op: 'broadcast', text: 'test', limit: 51, confirm: true })).status, 400);
assert.equal((await req('/api/panel/manage', { op: 'contest_delete', id: contest.id })).status, 400);
await op({ op: 'reward_delete', id: reward.id, confirm: true });
await op({ op: 'contest_delete', id: contest.id, confirm: true });
assert.equal((await req('/api/panel/manage', { op: 'contest_delete', id: contest.id, confirm: true })).status, 404);
assert.ok((await req('/api/panel/manage?view=log')).data.log.length > 0);
await op({ op: 'points_config', points: original.points });
const prior = original.settings;
await op({ op: 'settings_save', settings: { ownerUsername: prior.ownerUsername, supportUsername: prior.supportUsername, welcomeText: prior.welcomeText, rulesText: prior.rulesText, requiredChannels: prior.requiredChannels, requireJoin: prior.requireJoin, aiEnabled: prior.aiEnabled, maintenanceMode: prior.maintenanceMode, autoApproveJoins: prior.autoApproveJoins, groupTarget: prior.groupTarget } });
console.log('Management smoke passed: partial saves, images, settings, points, users, messaging and deletion.');
