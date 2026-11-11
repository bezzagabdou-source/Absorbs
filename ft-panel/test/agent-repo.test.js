const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const socket = `/tmp/ft-agent-test-${process.pid}.sock`;
let server, db, originalFetch, repo, audit, currentHead, writes, commitNumber;
const BASE = 'a'.repeat(40), TREE = 'b'.repeat(40), PATH = 'ft-contest-bot/src/example.ts';
before(async () => {
  server = spawn(process.env.REDIS_TEST_BIN || '/tmp/redis-7.4.7/src/redis-server', ['--port', '0', '--unixsocket', socket, '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (String(d).includes('Ready to accept connections')) resolve(); }); server.once('error', reject); server.once('exit', code => reject(new Error('redis exited ' + code))); });
  process.env.REDIS_URL = socket;
  process.env.SESSION_SECRET = 'agent-test-session-secret';
  process.env.AGENT_GITHUB_REPOSITORY = 'example/test-repo';
  process.env.AGENT_GITHUB_BRANCH = 'feature/test';
  process.env.AGENT_GITHUB_TOKEN = 'fake-github-secret';
  process.env.AGENT_VERCEL_TOKEN = 'fake-vercel-secret';
  process.env.AGENT_VERCEL_BOT_PROJECT_ID = 'prj_bot_test';
  const Redis = require('ioredis'); db = new Redis(socket);
  repo = require('../lib/agentRepo'); audit = require('../lib/agentAudit');
  originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const u = new URL(url), method = options.method || 'GET', path = u.pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    if (u.hostname === 'api.vercel.com') { writes.push({ host: 'vercel', method, path, body }); return Response.json({ id: 'dpl_test1', readyState: 'QUEUED', url: 'test.vercel.app' }); }
    if (u.hostname !== 'api.github.com') throw new Error('unexpected external call');
    const prefix = '/repos/example/test-repo';
    if (method === 'GET' && path.startsWith(prefix + '/git/ref/heads/')) return Response.json({ object: { sha: currentHead } });
    if (method === 'GET' && path.startsWith(prefix + '/git/commits/')) return Response.json({ tree: { sha: TREE } });
    if (method === 'GET' && path.startsWith(prefix + '/git/trees/')) return Response.json({ truncated: false, tree: [{ path: PATH, type: 'blob', mode: '100644', sha: 'f'.repeat(40) }] });
    if (method === 'GET' && path.startsWith(prefix + '/contents/')) {
      const file = decodeURIComponent(path.slice((prefix + '/contents/').length));
      return file === PATH ? Response.json({ type: 'file', encoding: 'base64', size: 18, sha: 'f'.repeat(40), content: Buffer.from('const value = 1;\n').toString('base64') }) : new Response('{}', { status: 404 });
    }
    writes.push({ host: 'github', method, path, body });
    if (method === 'POST' && path.endsWith('/git/blobs')) return Response.json({ sha: crypto.createHash('sha1').update(body.content).digest('hex') });
    if (method === 'POST' && path.endsWith('/git/trees')) return Response.json({ sha: 'c'.repeat(40) });
    if (method === 'POST' && path.endsWith('/git/commits')) return Response.json({ sha: String(++commitNumber).repeat(40) });
    if (method === 'PATCH' && path.includes('/git/refs/heads/')) { assert.equal(body.force, false); currentHead = body.sha; return Response.json({ object: { sha: currentHead } }); }
    return new Response('{}', { status: 500 });
  };
});
after(async () => { global.fetch = originalFetch; await db.quit(); await require('../lib/db').redis().quit(); server.kill(); try { fs.unlinkSync(socket); } catch {} });
async function reset() { await db.flushdb(); currentHead = BASE; writes = []; commitNumber = 0; }

test('file changes are staged, encrypted, reviewable and undone without touching GitHub', async () => {
  await reset();
  const ctx = repo.context();
  assert.ok((await repo.listFiles({}, ctx)).files.includes(PATH));
  const first = await repo.writeFile({ path: PATH, content: 'const value = 2;\n' }, ctx);
  assert.match(first.diff, /value = 2/);
  assert.equal(first.published, false);
  const raw = await db.get(audit.PREFIX + 'backup:' + first.version);
  assert.ok(!raw.includes('const value'));
  await repo.writeFile({ path: PATH, oldText: 'value = 2', newText: 'value = 3' }, ctx, true);
  assert.match((await repo.readFile({ path: PATH }, ctx)).content, /value = 3/);
  assert.equal((await repo.undo()).restored, true);
  assert.match((await repo.readFile({ path: PATH }, ctx)).content, /value = 2/);
  assert.equal((await repo.undo()).restored, true);
  assert.match((await repo.readFile({ path: PATH }, ctx)).content, /value = 1/);
  assert.equal(writes.length, 0, 'staging and undo do not write to GitHub');
  await assert.rejects(() => repo.readFile({ path: 'ft-panel/.env' }, ctx), /أسرار/);
  await assert.rejects(() => repo.readFile({ path: 'ft-panel/../../.env' }, ctx), /أسرار|صالح/);
});

test('deploy refuses concurrent changes and non-force publishes, then prepares a reversible release', async () => {
  await reset();
  const ctx = repo.context();
  await repo.writeFile({ path: PATH, content: 'const value = 9;\n' }, ctx);
  currentHead = 'd'.repeat(40);
  await assert.rejects(() => repo.deploy({}, ctx), /تغيّر فرع/);
  assert.equal(writes.length, 0);
  currentHead = BASE;
  const published = await repo.deploy({}, ctx);
  assert.equal(published.commit, '1'.repeat(40));
  assert.equal(published.deployments[0].state, 'QUEUED');
  assert.equal((await repo.workspaceDiff()).staged, false);
  assert.ok(writes.some(x => x.path.endsWith('/git/refs/heads/feature%2Ftest') && x.body.force === false));
  const reversed = await repo.undo();
  assert.equal(reversed.commit, '2'.repeat(40));
  assert.equal(reversed.restored, false, 'a queued Vercel rollback is not claimed as already live');
  assert.equal(reversed.deployments[0].state, 'QUEUED');
});
