const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..', 'public');
const waitFor = async (predicate, description) => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out: ' + description);
};

test('dashboard edits real bot items with image retry and sends an AI image', async () => {
  const calls = [], errors = [];
  let imageFails = true;
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script defer src="/dashboard.js"></script>', `<script>${fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8')}</script>`)
    .replace('<script defer src="/dashboard-bot.js"></script>', `<script>${fs.readFileSync(path.join(root, 'dashboard-bot.js'), 'utf8')}</script>`);
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://panel.example/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('ftp', 'test-session');
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
      window.HTMLDialogElement.prototype.close = function () { this.open = false; };
      window.confirm = () => true;
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body); calls.push(body);
        let data = {}, ok = true, error = '';
        if (body.action === 'health') data = { bot: '@test' };
        else if (body.action === 'bot_connection') data = { configured: true, origin: 'https://bot.example' };
        else if (body.action === 'bot_view' && body.view === 'overview') data = { stats: { users: 1, rewards: 1 }, settings: {}, points: {}, group: {} };
        else if (body.action === 'bot_view' && body.view === 'stats') data = { activity: {} };
        else if (body.action === 'bot_view' && body.view === 'catalog') data = { rewards: [], contests: [], sections: [] };
        else if (body.action === 'bot_manage' && body.op === 'reward_save') data = { ok: true, reward: { id: body.input.id || 'created-id', ...body.input.reward } };
        else if (body.action === 'bot_image' && imageFails) { imageFails = false; ok = false; error = 'تعذّر رفع الصورة'; }
        else if (body.action === 'bot_image') data = { ok: true };
        else if (body.action === 'ai') data = { reply: 'هذه صورة تجريبية', actions: [] };
        return { status: 200, json: async () => ({ ok, ...(ok ? { data } : { error }) }) };
      };
    },
  });
  try {
    const { document, File, Event } = dom.window;
    document.querySelector('[data-t="bot"]').click();
    await waitFor(() => document.querySelector('[data-act="bot-tab"][data-v="rewards"]'), 'management tabs');
    document.querySelector('[data-act="bot-tab"][data-v="rewards"]').click();
    await waitFor(() => document.querySelector('[data-act="bot-add"][data-kind="reward"]'), 'reward catalog');
    document.querySelector('[data-act="bot-add"][data-kind="reward"]').click();
    assert.equal(document.querySelector('#bot-dlg').open, true);
    document.querySelector('#bf-title').value = 'Test reward';
    document.querySelector('#bf-cost').value = '10';
    const file = new File([Buffer.from('89504e470d0a1a0a00000000', 'hex')], 'reward.png', { type: 'image/png' });
    const fileInput = document.querySelector('#bf-file');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !document.querySelector('#bf-preview').hidden, 'image preview');
    document.querySelector('#bot-df').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.some(c => c.action === 'bot_image'), 'first image attempt');
    await waitFor(() => document.querySelector('#toast').textContent.includes('حُفظت البيانات'), 'partial save message');
    assert.equal(document.querySelector('#bot-dlg').open, true, 'keep editor open on image failure');
    document.querySelector('#bot-df').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.filter(c => c.action === 'bot_image').length === 2, 'image retry');
    await waitFor(() => !document.querySelector('#bot-dlg').open, 'dialog close');
    const saves = calls.filter(c => c.action === 'bot_manage' && c.op === 'reward_save');
    assert.equal(saves[0].input.id, undefined);
    assert.equal(saves[1].input.id, 'created-id', 'retry edits rather than creating a duplicate');
    assert.match(calls.filter(c => c.action === 'bot_image')[1].dataUrl, /^data:image\/png;base64,/);

    document.querySelector('[data-t="ai"]').click();
    const aiInput = document.querySelector('#ai-image');
    Object.defineProperty(aiInput, 'files', { configurable: true, value: [file] });
    aiInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !document.querySelector('#ai-attachment').hidden, 'AI attachment preview');
    document.querySelector('#aq').value = 'اشرح الصورة';
    document.querySelector('#af').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => calls.some(c => c.action === 'ai'), 'AI image request');
    const ai = calls.find(c => c.action === 'ai');
    assert.match(ai.image, /^data:image\/png;base64,/);
    assert.equal(ai.prompt, 'اشرح الصورة');
    assert.equal(document.querySelector('#ai-attachment').hidden, true);
    await waitFor(() => document.querySelector('#chat').textContent.includes('هذه صورة تجريبية'), 'AI reply');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
