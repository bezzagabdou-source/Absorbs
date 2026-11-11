#!/usr/bin/env node
// Local mock only: creates and deletes a temporary reward, never touches production.
import assert from 'node:assert/strict';
const base = process.env.BASE || 'http://127.0.0.1:3211';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('Local mock server required');
const key = process.env.PANEL_PUBLIC_KEY || 'dev-panel-key';
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || 'smoke-secret';
const headers = { 'content-type': 'application/json', 'x-panel-key': key };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a1sAAAAASUVORK5CYII=';
const mock = await fetch(base + '/api/dev/mock');
assert.equal(mock.status, 200, 'TELEGRAM_MOCK is required');
async function req(path, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await res.json();
  assert.ok(res.ok && result.ok, JSON.stringify(result));
  return result;
}
const original = (await req('/api/panel/manage?view=overview')).settings;
let rewardId = '';
let updateId = Date.now();
const user = Math.floor(Date.now() / 10);
const calls = async () => (await (await fetch(base + '/api/dev/mock')).json()).calls;
const clear = async () => fetch(base + '/api/dev/mock?clear=1', { method: 'DELETE' });
async function callback(data) {
  const res = await fetch(base + '/api/telegram/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify({ update_id: ++updateId, callback_query: { id: String(updateId), from: { id: user, first_name: 'Local' }, data, message: { message_id: 9, chat: { id: user, type: 'private' } } } }),
  });
  assert.equal(res.status, 200);
}
try {
  await req('/api/panel/manage', { op: 'settings_save', settings: { requireJoin: false, maintenanceMode: false } });
  const created = await req('/api/panel/manage', { op: 'reward_save', reward: { title: 'حساب بيس smoke', cost: 280, active: true, section: 'accounts' } });
  rewardId = created.reward.id;
  await req('/api/admin2', { action: 'reward_image', id: rewardId, dataUrl: image });
  for (const list of ['home_list', 'sec:accounts']) {
    await clear();
    await callback(list);
    const message = (await calls()).find(call => call.method === 'editMessageText');
    const row = message?.payload.reply_markup.inline_keyboard.find(row => row.some(button => button.callback_data === `buy:${rewardId}`));
    assert.equal(row?.length, 2);
    assert.equal(row[0].style, 'success');
    assert.equal(row[1].style, 'danger');
    assert.match(row[1].text, /280/);
    for (const button of row) {
      await clear();
      await callback(button.callback_data);
      const history = await calls();
      const photo = history.find(call => call.method === 'sendPhoto');
      assert.ok(photo, 'clicking the name or points sends the photo');
      assert.equal(photo.payload.photo, '[inline image]');
      assert.match(photo.payload.caption, /280/);
      assert.ok(history.some(call => call.method === 'editMessageReplyMarkup'));
    }
  }
  console.log('Reward media smoke passed: both lists, colored buttons, both callbacks and stored image.');
} finally {
  if (rewardId) await req('/api/panel/manage', { op: 'reward_delete', id: rewardId, confirm: true });
  await req('/api/panel/manage', { op: 'settings_save', settings: { requireJoin: original.requireJoin, maintenanceMode: original.maintenanceMode } });
}
