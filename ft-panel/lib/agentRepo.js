const crypto = require('node:crypto');
const { createTwoFilesPatch } = require('diff');
const { redis } = require('./db');
const audit = require('./agentAudit');

const MAX_FILE = 250_000;
const MAX_WORKSPACE = 4_000_000;
function config() {
  const repository = process.env.AGENT_GITHUB_REPOSITORY || [process.env.VERCEL_GIT_REPO_OWNER || 'bezzagabdou-source', process.env.VERCEL_GIT_REPO_SLUG || 'Absorbs'].join('/');
  const parts = repository.split('/');
  const branch = process.env.AGENT_GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || '';
  if (parts.length !== 2 || parts.some(p => !/^[A-Za-z0-9_.-]{1,100}$/.test(p)) || !branch || branch.length > 200 || !/^[A-Za-z0-9_./-]+$/.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    throw new Error('هيّئ AGENT_GITHUB_REPOSITORY و AGENT_GITHUB_BRANCH في بيئة اللوحة');
  }
  const scope = crypto.createHash('sha256').update(repository + '\n' + branch).digest('hex').slice(0, 24);
  return { owner: parts[0], repo: parts[1], repository, branch, scope, token: process.env.AGENT_GITHUB_TOKEN || '' };
}
function workspaceKey(cfg) { return audit.PREFIX + 'workspace:' + cfg.scope; }
function pathOk(value, allowRoot = false) {
  const path = String(value || '').replace(/^\.\//, '').replace(/\/$/, '');
  if (allowRoot && !path) return '';
  if (path.length > 300 || !/^(ft-contest-bot|ft-panel)(?:\/|$)/.test(path) || path.includes('\\') || path.includes('//') || /[\x00-\x1f]/.test(path)) throw new Error('المسار خارج مشاريع FT أو غير صالح');
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /^(?:\.git|\.vercel|node_modules|\.next|dist|build)$/i.test(p) || (/^\.env(?:\.|$)/i.test(p) && p !== '.env.example') || /\.(?:pem|key|p12|pfx)$/i.test(p))) throw new Error('هذا المسار يحتوي أسراراً أو ملفات مولّدة ولا يمكن فتحه');
  return path;
}
function checkText(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_FILE || value.includes('\0')) throw new Error('الملف يجب أن يكون نصياً وأصغر من 250 كيلوبايت');
  return value;
}
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const clip = (value, max = 45_000) => String(value).length > max ? String(value).slice(0, max) + '\n… (diff truncated)' : String(value);
function diff(path, before, after) { return clip(createTwoFilesPatch(path, path, before || '', after || '', 'قبل', 'بعد', { context: 3 })); }
async function gh(cfg, route, { method = 'GET', body, missing = false } = {}) {
  if (method !== 'GET' && !cfg.token) throw new Error('يلزم تهيئة AGENT_GITHUB_TOKEN للكتابة إلى GitHub');
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ft-panel-agent' };
  if (cfg.token) headers.authorization = 'Bearer ' + cfg.token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${route}`, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('تعذّر الاتصال بـ GitHub؛ لم يُؤكَّد التغيير'); }
  if (response.status === 404 && missing) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}${response.status === 409 || response.status === 422 ? '؛ ربما تغيّر الفرع أو لا تسمح الصلاحيات' : ''}`);
  return response.json();
}
async function head(cfg) {
  const data = await gh(cfg, '/git/ref/heads/' + encodeURIComponent(cfg.branch));
  if (!/^[a-f0-9]{40}$/i.test(data?.object?.sha || '')) throw new Error('تعذّر قراءة رأس فرع GitHub');
  return data.object.sha;
}
async function readWorkspace(cfg) {
  const raw = await redis().get(workspaceKey(cfg));
  return raw ? audit.open(raw) : null;
}
async function remoteFile(cfg, path, ref, cache) {
  const cacheKey = ref + ':' + path;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);
  const route = '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref);
  const data = await gh(cfg, route, { missing: true });
  let result = null;
  if (data) {
    if (data.type !== 'file' || data.encoding !== 'base64' || Number(data.size) > MAX_FILE) throw new Error('الملف غير نصي أو أكبر من الحد');
    const bytes = Buffer.from(String(data.content || '').replace(/\s/g, ''), 'base64');
    const content = bytes.toString('utf8');
    if (content.includes('\0') || !Buffer.from(content, 'utf8').equals(bytes)) throw new Error('الملف غير نصي');
    result = { content: checkText(content), sha: data.sha };
  }
  cache?.set(cacheKey, result);
  return result;
}
async function current(cfg, path, workspace, cache) {
  const entry = workspace?.files?.[path];
  if (entry) return entry.deleted ? null : { content: entry.content, sha: entry.baseSha, staged: true };
  return remoteFile(cfg, path, workspace?.baseCommit || await head(cfg), cache);
}
async function readFile(args = {}, ctx = {}) {
  const cfg = config(), path = pathOk(args.path);
  const ws = await readWorkspace(cfg), file = await current(cfg, path, ws, ctx.files);
  if (!file) throw new Error('الملف غير موجود');
  const lines = file.content.split('\n');
  const start = Math.max(1, Math.floor(Number(args.offset) || 1));
  const limit = Math.max(1, Math.min(1200, Math.floor(Number(args.limit) || 400)));
  const selected = lines.slice(start - 1, start - 1 + limit).join('\n');
  const content = selected.slice(0, 100000);
  return { path, content, offset: start, totalLines: lines.length, nextOffset: start - 1 + limit < lines.length ? start + limit : null, truncated: content.length < selected.length, staged: !!file.staged, baseCommit: ws?.baseCommit || null };
}
async function tree(cfg, ref, ctx) {
  ctx.trees ||= new Map();
  if (ctx.trees.has(ref)) return ctx.trees.get(ref);
  const commit = await gh(cfg, '/git/commits/' + encodeURIComponent(ref));
  const listing = await gh(cfg, '/git/trees/' + encodeURIComponent(commit.tree.sha) + '?recursive=1');
  if (listing.truncated) throw new Error('شجرة GitHub غير مكتملة؛ حدّد مشروعاً أصغر');
  const result = { treeSha: commit.tree.sha, entries: Array.isArray(listing.tree) ? listing.tree : [] };
  ctx.trees.set(ref, result);
  return result;
}
async function listFiles(args = {}, ctx = {}) {
  const cfg = config(), prefix = pathOk(args.path || '', true), ws = await readWorkspace(cfg), ref = ws?.baseCommit || await head(cfg);
  const t = await tree(cfg, ref, ctx);
  const paths = new Set(t.entries.filter(e => e.type === 'blob' && e.mode !== '120000').map(e => e.path).filter(p => {
    try { return !!pathOk(p) && (!prefix || p === prefix || p.startsWith(prefix + '/')); } catch { return false; }
  }));
  for (const [p, entry] of Object.entries(ws?.files || {})) {
    if (prefix && p !== prefix && !p.startsWith(prefix + '/')) continue;
    if (entry.deleted) paths.delete(p); else paths.add(p);
  }
  const all = [...paths].sort();
  const start = Math.max(0, Math.floor(Number(args.offset) || 0)), limit = Math.max(1, Math.min(500, Math.floor(Number(args.limit) || 250)));
  return { branch: cfg.branch, commit: ref, files: all.slice(start, start + limit), total: all.length, nextOffset: start + limit < all.length ? start + limit : null };
}
async function searchCode(args = {}, ctx = {}) {
  const pattern = String(args.query || '');
  if (!pattern || pattern.length > 300) throw new Error('أدخل عبارة بحث بين 1 و300 حرف');
  const listing = await listFiles({ path: args.path || '', limit: 500 }, ctx);
  const candidates = listing.files.filter(p => /\.(?:[cm]?[jt]sx?|json|md|html|css|sql|ya?ml|mjs)$/.test(p)).slice(0, 160);
  const matches = [], needle = args.caseSensitive ? pattern : pattern.toLowerCase();
  let index = 0, failed = 0;
  async function worker() {
    while (index < candidates.length && matches.length < 100) {
      const path = candidates[index++];
      try {
        const cfg = config(), ws = await readWorkspace(cfg), file = await current(cfg, path, ws, ctx.files);
        if (!file) continue;
        file.content.split('\n').forEach((line, i) => {
          if (matches.length >= 100) return;
          if ((args.caseSensitive ? line : line.toLowerCase()).includes(needle)) matches.push({ path, line: i + 1, text: line.slice(0, 500) });
        });
      } catch { failed++; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, worker));
  matches.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  return { matches, scanned: Math.min(index, candidates.length), failed, truncated: listing.nextOffset !== null || listing.files.length > candidates.length || matches.length >= 100 };
}
async function writeFile(args = {}, ctx = {}, patch = false) {
  const path = pathOk(args.path), cfg = config();
  return audit.locked(async () => {
    let ws = await readWorkspace(cfg);
    if (!ws) ws = { version: 1, repository: cfg.repository, branch: cfg.branch, baseCommit: await head(cfg), files: {}, stageIds: [] };
    const beforeEntry = ws.files[path] || null;
    const old = await current(cfg, path, ws, ctx.files);
    let next;
    if (patch) {
      if (!old) throw new Error('الملف غير موجود؛ استخدم write_file لإنشائه');
      const from = String(args.oldText ?? ''), to = String(args.newText ?? '');
      if (!from || old.content.indexOf(from) < 0) throw new Error('النص المراد استبداله غير موجود كما هو؛ أعد قراءة الملف');
      if (old.content.indexOf(from) !== old.content.lastIndexOf(from)) throw new Error('النص يتكرر؛ أرسل سياقاً يحدّد موضعاً واحداً');
      next = old.content.replace(from, to);
    } else next = args.content;
    checkText(next);
    if (old && old.content === next) return { path, unchanged: true, staged: true, message: 'لا يوجد تغيير' };
    const base = beforeEntry ? { content: beforeEntry.baseContent, sha: beforeEntry.baseSha } : await remoteFile(cfg, path, ws.baseCommit, ctx.files);
    const id = crypto.randomUUID();
    const entry = { baseContent: base?.content ?? null, baseSha: base?.sha ?? null, content: next, deleted: false };
    ws.files[path] = entry;
    ws.stageIds.push(id);
    if (Buffer.byteLength(JSON.stringify(ws)) > MAX_WORKSPACE) throw new Error('المسودات كبيرة جداً؛ انشر أو تراجع عن بعض الملفات أولاً');
    const snap = { kind: 'file', scope: cfg.scope, path, beforeEntry, afterHash: sha(next), baseCommit: ws.baseCommit };
    const item = audit.meta({ id, type: 'file', detail: path, status: 'staged' });
    const undo = JSON.stringify({ kind: 'file', id, scope: cfg.scope });
    // Snapshot, staging and undo pointer are committed together in durable Redis.
    const result = await redis().multi().set(audit.PREFIX + 'backup:' + id, audit.seal(snap)).set(workspaceKey(cfg), audit.seal(ws)).lpush(audit.HISTORY, JSON.stringify(item)).lpush(audit.UNDO, undo).exec();
    if (!result || result.some(([error]) => error)) throw new Error('تعذّر حفظ المسودة والنسخة؛ تحقّق من سجل العمليات');
    return { path, version: id, staged: true, published: false, diff: diff(path, old?.content || '', next), baseCommit: ws.baseCommit };
  });
}
async function workspaceDiff() {
  const cfg = config(), ws = await readWorkspace(cfg);
  if (!ws) return { files: [], staged: false };
  return { branch: ws.branch, baseCommit: ws.baseCommit, staged: true, files: Object.entries(ws.files).map(([path, f]) => ({ path, diff: diff(path, f.baseContent || '', f.deleted ? '' : f.content) })) };
}
function vercelConfig(paths) {
  const token = process.env.AGENT_VERCEL_TOKEN || '';
  if (!token) throw new Error('هيّئ AGENT_VERCEL_TOKEN قبل النشر');
  const projects = [];
  if (paths.some(p => p.startsWith('ft-contest-bot/'))) projects.push({ name: 'ft-bot', id: process.env.AGENT_VERCEL_BOT_PROJECT_ID || '' });
  if (paths.some(p => p.startsWith('ft-panel/'))) projects.push({ name: 'ft-panel', id: process.env.AGENT_VERCEL_PANEL_PROJECT_ID || '' });
  if (!projects.length || projects.some(p => !p.id)) throw new Error('هيّئ معرف مشروع Vercel لكل مشروع تغيّر قبل النشر');
  return { token, team: process.env.AGENT_VERCEL_TEAM_ID || '', projects };
}
async function vercel(route, { method = 'GET', body, timeout = 15000 } = {}) {
  const token = process.env.AGENT_VERCEL_TOKEN || '';
  if (!token) throw new Error('هيّئ AGENT_VERCEL_TOKEN أولاً');
  const team = process.env.AGENT_VERCEL_TEAM_ID || '';
  const separator = route.includes('?') ? '&' : '?';
  let response;
  try {
    response = await fetch('https://api.vercel.com' + route + (team ? separator + 'teamId=' + encodeURIComponent(team) : ''), {
      method, headers: { authorization: 'Bearer ' + token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout), redirect: 'error',
    });
  } catch { throw new Error('تعذّر الاتصال بـ Vercel؛ تحقّق من النتيجة قبل إعادة الطلب'); }
  if (!response.ok) throw new Error(`Vercel HTTP ${response.status}`);
  return response;
}
async function startDeployments(cfg, vcfg, commit) {
  const deployments = [];
  for (const project of vcfg.projects) {
    try {
      const res = await vercel('/v13/deployments', { method: 'POST', body: { name: project.name, project: project.id, target: 'production', gitSource: { type: 'github', org: cfg.owner, repo: cfg.repo, ref: cfg.branch, sha: commit } } });
      const data = await res.json();
      deployments.push({ project: project.name, id: data.id, state: data.readyState || data.status || 'QUEUED', url: data.url || '' });
    } catch (e) { deployments.push({ project: project.name, error: e.message, state: 'UNKNOWN' }); }
  }
  return deployments;
}
async function deploy(args = {}, ctx = {}) {
  const cfg = config();
  return audit.locked(async () => {
    const ws = await readWorkspace(cfg);
    if (!ws || !Object.keys(ws.files).length) throw new Error('لا توجد مسودات للنشر');
    const paths = Object.keys(ws.files), vcfg = vercelConfig(paths);
    if (!cfg.token) throw new Error('هيّئ AGENT_GITHUB_TOKEN قبل النشر');
    const currentHead = await head(cfg);
    if (currentHead !== ws.baseCommit) throw new Error('تغيّر فرع GitHub منذ بدء المسودة؛ لم يُنشر شيء. راجع التغييرات قبل المتابعة');
    const base = await tree(cfg, currentHead, ctx);
    const entries = [];
    for (const path of paths) {
      const file = ws.files[path];
      const old = base.entries.find(e => e.path === path);
      if (old && (old.type !== 'blob' || old.mode === '120000')) throw new Error('لا يمكن استبدال رابط رمزي أو مجلد');
      if (file.deleted) entries.push({ path, mode: old?.mode || '100644', type: 'blob', sha: null });
      else {
        const blob = await gh(cfg, '/git/blobs', { method: 'POST', body: { content: file.content, encoding: 'utf-8' } });
        entries.push({ path, mode: old?.mode === '100755' ? '100755' : '100644', type: 'blob', sha: blob.sha });
      }
    }
    const nextTree = await gh(cfg, '/git/trees', { method: 'POST', body: { base_tree: base.treeSha, tree: entries } });
    const commit = await gh(cfg, '/git/commits', { method: 'POST', body: { message: String(args.message || 'Update FT bot and panel').slice(0, 150), tree: nextTree.sha, parents: [currentHead] } });
    const release = { kind: 'release', scope: cfg.scope, beforeCommit: currentHead, beforeTree: base.treeSha, commit: commit.sha, paths, stageIds: ws.stageIds, projects: vcfg.projects };
    const id = await audit.snapshot(release, { type: 'release', status: 'prepared', detail: paths.join(', ') });
    // Non-force update: concurrent GitHub writers win rather than being overwritten.
    await gh(cfg, '/git/refs/heads/' + encodeURIComponent(cfg.branch), { method: 'PATCH', body: { sha: commit.sha, force: false } });
    const tx = redis().multi().del(workspaceKey(cfg));
    for (const stageId of ws.stageIds) tx.lrem(audit.UNDO, 0, JSON.stringify({ kind: 'file', id: stageId, scope: cfg.scope }));
    tx.lpush(audit.UNDO, JSON.stringify({ kind: 'release', id, scope: cfg.scope }));
    tx.lpush(audit.HISTORY, JSON.stringify(audit.meta({ id, type: 'release', status: 'committed', detail: commit.sha })));
    const saved = await tx.exec().catch(() => null);
    if (!saved || saved.some(([error]) => error)) return { commit: commit.sha, deployments: [], warning: 'تحدّث فرع GitHub لكن تعذّر تأكيد السجل؛ افحص الفرع قبل إعادة النشر.' };
    const deployments = await startDeployments(cfg, vcfg, commit.sha);
    await audit.log({ type: 'deploy', status: deployments.some(d => d.error) ? 'partial' : 'started', detail: commit.sha }).catch(() => {});
    return { commit: commit.sha, deployments, published: false, message: 'أُنشئ الالتزام وطُلب البناء؛ تحقق من حالة كل نشر قبل اعتباره ناجحاً.' };
  });
}
async function undoFile(item, raw, cfg) {
  const snap = await audit.readSnapshot(item.id), ws = await readWorkspace(cfg);
  if (snap.kind !== 'file' || !ws || ws.baseCommit !== snap.baseCommit || sha(ws.files[snap.path]?.content ?? '') !== snap.afterHash) throw new Error('المسودة تغيّرت بعد هذه النسخة؛ لم يتم التراجع');
  if (snap.beforeEntry) ws.files[snap.path] = snap.beforeEntry; else delete ws.files[snap.path];
  ws.stageIds = ws.stageIds.filter(id => id !== item.id);
  if ((await audit.latestUndo())?.raw !== raw) throw new Error('تغيّر سجل التراجع؛ حدّث الصفحة');
  const tx = redis().multi();
  if (Object.keys(ws.files).length) tx.set(workspaceKey(cfg), audit.seal(ws)); else tx.del(workspaceKey(cfg));
  tx.lpop(audit.UNDO).lpush(audit.HISTORY, JSON.stringify(audit.meta({ type: 'undo', detail: snap.path })));
  const result = await tx.exec();
  if (!result || result.some(([error]) => error)) throw new Error('تعذّر تأكيد التراجع؛ راجع سجل العمليات');
  return { kind: 'file', path: snap.path, restored: true, staged: Object.keys(ws.files).length > 0 };
}
async function undoRelease(item, raw, cfg, ctx) {
  const release = await audit.readSnapshot(item.id);
  if (release.kind !== 'release' || await readWorkspace(cfg)) throw new Error('توجد مسودات؛ تراجع عنها أولاً');
  if (await head(cfg) !== release.commit) throw new Error('تغيّر الفرع بعد النشر؛ التراجع التلقائي متوقف لمنع فقدان تغييرات أخرى');
  const vcfg = vercelConfig(release.paths);
  const reverted = await gh(cfg, '/git/commits', { method: 'POST', body: { message: 'Revert FT agent release ' + release.commit.slice(0, 8), tree: release.beforeTree, parents: [release.commit] } });
  await audit.snapshot({ kind: 'undo-release', release }, { type: 'undo', status: 'prepared', detail: release.commit });
  await gh(cfg, '/git/refs/heads/' + encodeURIComponent(cfg.branch), { method: 'PATCH', body: { sha: reverted.sha, force: false } });
  await audit.popUndo(raw);
  const deployments = await startDeployments(cfg, vcfg, reverted.sha);
  await audit.log({ type: 'undo', status: 'committed', detail: reverted.sha }).catch(() => {});
  return { kind: 'release', commit: reverted.sha, deployments, restored: false, message: 'أُنشئ التراجع وطُلب البناء؛ تحقق من حالة النشر.' };
}
async function undo() {
  return audit.locked(async () => {
    const latest = await audit.latestUndo();
    if (!latest) throw new Error('لا توجد عملية قابلة للتراجع');
    const { item, raw } = latest;
    if (item.kind === 'db') {
      const bot = require('./botBridge');
      const result = await bot.agent('db_undo', { id: item.id });
      await audit.popUndo(raw);
      await audit.log({ type: 'undo', detail: 'database ' + item.id }).catch(() => {});
      return result;
    }
    if (item.kind === 'commands' || item.kind === 'webhook') {
      const bot = require('./botBridge'), snap = await audit.readSnapshot(item.id), currentInfo = await bot.agent('get_bot_info');
      if (snap.kind !== item.kind) throw new Error('النسخة غير صالحة');
      let result;
      if (item.kind === 'commands') {
        if (JSON.stringify(currentInfo.commands) !== JSON.stringify(snap.after)) throw new Error('تغيّرت الأوامر بعد التعديل؛ لم يتم التراجع');
        result = await bot.agent('set_commands', { commands: snap.before });
      } else {
        if (currentInfo.webhook?.url !== snap.after || snap.before) throw new Error('تغيّر الويب هوك أو لا يمكن استعادة سره السابق تلقائياً');
        result = await bot.agent('delete_webhook');
      }
      await audit.popUndo(raw);
      await audit.log({ type: 'undo', detail: item.kind }).catch(() => {});
      return { ...result, kind: item.kind, restored: true };
    }
    const cfg = config();
    if (item.scope !== cfg.scope) throw new Error('النسخة تخص فرعاً آخر؛ لم يتم التراجع');
    if (item.kind === 'file') return undoFile(item, raw, cfg);
    if (item.kind === 'release') return undoRelease(item, raw, cfg, {});
    throw new Error('لا يمكن التراجع عن هذه العملية تلقائياً');
  });
}
async function getDeployStatus(args = {}) {
  const id = String(args.id || '');
  if (!/^dpl_[A-Za-z0-9]+$/.test(id)) throw new Error('حدد معرّف نشر Vercel صحيحاً');
  const data = await (await vercel('/v13/deployments/' + encodeURIComponent(id))).json();
  const allowed = [process.env.AGENT_VERCEL_BOT_PROJECT_ID, process.env.AGENT_VERCEL_PANEL_PROJECT_ID].filter(Boolean);
  if (!allowed.includes(data.projectId)) throw new Error('النشر لا يخص مشروع FT المهيأ');
  return { id: data.id, projectId: data.projectId, state: data.readyState || data.status, readySubstate: data.readySubstate || null, url: data.url || '', aliases: data.alias || [], commit: data.meta?.githubCommitSha || null, error: data.errorMessage ? String(data.errorMessage).slice(0, 300) : null };
}
function redact(text) {
  let value = String(text || '');
  for (const [name, secret] of Object.entries(process.env)) if (/(?:TOKEN|KEY|SECRET|PASSWORD|DATABASE_URL|REDIS_URL)/i.test(name) && secret && secret.length >= 8) value = value.split(secret).join('[redacted]');
  return value.replace(/\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/g, '[redacted]').replace(/((?:token|secret|password|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
async function getLogs(args = {}) {
  const status = await getDeployStatus(args);
  // Build events are finite. Runtime logs are a live stream and are not claimed as historical logs.
  const response = await vercel('/v2/deployments/' + encodeURIComponent(status.id) + '/events?limit=100&direction=backward', { timeout: 10000 });
  const raw = await response.text();
  return { id: status.id, kind: 'build_events', text: redact(raw).slice(0, 30000), truncated: raw.length > 30000 };
}
function context() { return { files: new Map(), trees: new Map() }; }
module.exports = { config, pathOk, head, gh, tree, current, readWorkspace, listFiles, readFile, searchCode, writeFile, workspaceDiff, deploy, undo, getDeployStatus, getLogs, context, redact };
