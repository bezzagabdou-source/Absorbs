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
        else if (body.action === 'ai' && body.prompt === 'احتفظ بالمرفق') data = { reply: 'حدد الجائزة أولاً', actions: [], retainImage: true };
        else if (body.action === 'ai' && body.prompt === 'خطأ شبكة') throw new Error('اختبار انقطاع الشبكة');
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

    aiInput.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !document.querySelector('#ai-attachment').hidden, 'second AI attachment');
    document.querySelector('#aq').value = 'احتفظ بالمرفق';
    document.querySelector('#af').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('#chat').textContent.includes('حدد الجائزة أولاً'), 'clarification');
    assert.equal(document.querySelector('#ai-attachment').hidden, false, 'retain image for clarification without re-uploading');
    document.querySelector('#aq').value = 'خطأ شبكة';
    document.querySelector('#af').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('#chat').textContent.includes('اختبار انقطاع الشبكة'), 'network error');
    assert.equal(document.querySelector('#ai-attachment').hidden, false, 'retain image after network failure');
    assert.equal(calls.filter(c => c.action === 'ai' && c.prompt === 'خطأ شبكة').length, 2, 'idempotent request may be retried');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('owner instruction page saves settings and broadcast UI runs durable batches to completion', async () => {
  const calls = [], errors = [];
  let instructions = 'تعليمات محفوظة', steps = 0;
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script defer src="/dashboard.js"></script>', `<script>${fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8')}</script>`)
    .replace('<script defer src="/dashboard-bot.js"></script>', `<script>${fs.readFileSync(path.join(root, 'dashboard-bot.js'), 'utf8')}</script>`);
  const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {
    url: 'https://panel.example/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('ftp', 'test-session');
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.confirm = () => true;
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body); calls.push(body);
        let data = {};
        if (body.action === 'health') data = { bot: '@test' };
        else if (body.action === 'agent_instructions_get') data = { text: instructions };
        else if (body.action === 'agent_instructions_save') { instructions = body.text; data = { text: instructions }; }
        else if (body.action === 'bot_view' && body.view === 'overview') data = { stats: {}, settings: {}, points: {}, group: {} };
        else if (body.action === 'bot_view' && body.view === 'stats') data = { activity: {} };
        else if (body.action === 'bot_manage' && body.op === 'broadcast_start') data = { jobId: body.input.jobId, total: 120, sent: 0, failed: 0, excludedBanned: 0, unknown: 0, remaining: 120, done: false };
        else if (body.action === 'bot_manage' && body.op === 'broadcast_step') { steps++; data = { jobId: body.input.jobId, total: 120, sent: steps === 1 ? 60 : 118, failed: steps === 1 ? 0 : 1, excludedBanned: 1, unknown: 0, remaining: steps === 1 ? 59 : 0, done: steps > 1 }; }
        return { status: 200, json: async () => ({ ok: true, data }) };
      };
    },
  });
  try {
    const { document, Event } = dom.window;
    document.querySelector('[data-t="instructions"]').click();
    await waitFor(() => document.querySelector('#instructions-text').value === instructions, 'load instructions');
    document.querySelector('#instructions-text').value = 'طور الأدوات واختبرها';
    document.querySelector('#instructions-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => instructions === 'طور الأدوات واختبرها', 'save instructions');
    document.querySelector('[data-t="bot"]').click();
    await waitFor(() => document.querySelector('[data-act="bot-tab"][data-v="settings"]'), 'bot settings tab');
    document.querySelector('[data-act="bot-tab"][data-v="settings"]').click();
    await waitFor(() => document.querySelector('#bot-broadcast-form'), 'broadcast form');
    document.querySelector('#bb-text').value = 'رسالة شاملة';
    document.querySelector('#bot-broadcast-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('#broadcast-progress').textContent.includes('انتهت معالجة البث'), 'broadcast completion');
    assert.equal(calls.filter(c => c.op === 'broadcast_start').length, 1);
    assert.equal(steps, 2);
    assert.equal(calls.find(c => c.op === 'broadcast_start').input.confirm, true);
    assert.match(document.querySelector('#broadcast-progress').textContent, /أُرسل 118/);
    assert.equal(dom.window.localStorage.getItem('ft-active-broadcast-v1'), null);
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});
