// Test source in a separate Vercel microVM, never in the serverless function.
// No production environment variables or database credentials are passed to it.
const repo = require('./agentRepo');
const audit = require('./agentAudit');

function project(value) {
  if (value === 'bot' || value === 'ft-contest-bot') return 'ft-contest-bot';
  if (value === 'panel' || value === 'ft-panel') return 'ft-panel';
  throw new Error('حدد project: bot أو panel');
}
async function run(args = {}, kind = 'test', ctx = {}) {
  const dir = project(args.project), cfg = repo.config(), ws = await repo.readWorkspace(cfg);
  const ref = ws?.baseCommit || await repo.head(cfg);
  const metadata = await repo.gh(cfg, '');
  if (metadata.private && !cfg.token) throw new Error('المستودع خاص؛ هيّئ AGENT_GITHUB_TOKEN للقراءة');
  const { Sandbox } = require('@vercel/sandbox');
  let sandbox;
  const outputs = [];
  const deadline = ctx.deadline || Date.now() + 230000;
  const remaining = () => Math.max(0, deadline - Date.now() - 8000);
  const budget = max => { const ms = Math.min(max, remaining()); if (ms < 1000) throw new Error('تعذّر إكمال الاختبار قبل انتهاء المهلة؛ شغّله مجدداً'); return ms; };
  try {
    sandbox = await Sandbox.create({
      image: 'vercel/sandbox/universal:latest', persistent: false, timeout: 240000,
      networkPolicy: { allow: { 'github.com': [], '*.github.com': [], 'registry.npmjs.org': [], '*.npmjs.org': [] } },
      source: { type: 'git', url: `https://github.com/${cfg.owner}/${cfg.repo}.git`, revision: ref, depth: 1,
        ...(metadata.private ? { username: 'x-access-token', password: cfg.token } : {}) },
      signal: AbortSignal.timeout(budget(100000)),
    });
    // Remove clone metadata before running any repository code; private-clone
    // credentials must not be available to npm scripts or the tests.
    const cleanup = await sandbox.runCommand({ cmd: 'rm', args: ['-rf', '.git'], timeoutMs: 10000 });
    if (cleanup.exitCode !== 0) throw new Error('تعذّر تأمين نسخة الاختبار');
    const entries = Object.entries(ws?.files || {}).filter(([p]) => p.startsWith(dir + '/'));
    const dirs = [...new Set(entries.map(([p]) => p.slice(0, p.lastIndexOf('/'))))];
    if (dirs.length) {
      const made = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', ...dirs], timeoutMs: 10000 });
      if (made.exitCode !== 0) throw new Error('تعذّر إنشاء مجلدات الاختبار');
    }
    if (entries.length) await sandbox.writeFiles(entries.map(([path, file]) => ({ path, content: Buffer.from(file.content, 'utf8') })));
    // Dependencies are installed without lifecycle scripts; test code runs after
    // network egress has been closed. The sandbox never receives runtime secrets.
    await sandbox.update({ networkPolicy: { allow: { 'registry.npmjs.org': [], '*.npmjs.org': [] } } });
    const install = await sandbox.runCommand({ cmd: 'npm', args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: dir, timeoutMs: budget(90000), signal: AbortSignal.timeout(budget(95000)) });
    outputs.push({ step: 'npm ci --ignore-scripts', exitCode: install.exitCode, output: repo.redact(await install.output('both')).slice(-18000) });
    if (install.exitCode !== 0) return { project: dir, commit: ref, staged: entries.length, passed: false, steps: outputs, note: 'فشل تثبيت الاعتماديات؛ لم تُشغّل الاختبارات.' };
    await sandbox.update({ networkPolicy: 'deny-all' });
    const commands = kind === 'lint'
      ? (dir === 'ft-panel' ? [['npm', ['run', 'check']]] : [['npm', ['run', 'typecheck']]])
      : (dir === 'ft-panel' ? [['sh', ['-c', 'export REDIS_TEST_BIN="$(command -v redis-server || true)"; npm test']]] : [['npm', ['test']], ['npm', ['run', 'typecheck']], ...(args.build === false ? [] : [['npm', ['run', 'build']]])]);
    for (const [cmd, cmdArgs] of commands) {
      const result = await sandbox.runCommand({ cmd, args: cmdArgs, cwd: dir, timeoutMs: budget(90000), signal: AbortSignal.timeout(budget(95000)) });
      outputs.push({ step: cmd + ' ' + cmdArgs.join(' '), exitCode: result.exitCode, output: repo.redact(await result.output('both')).slice(-22000) });
      if (result.exitCode !== 0) break;
    }
    const passed = outputs.every(step => step.exitCode === 0);
    await audit.log({ type: kind === 'lint' ? 'check' : 'tests', status: passed ? 'passed' : 'failed', detail: dir + ' ' + ref.slice(0, 8) }).catch(() => {});
    return { project: dir, commit: ref, staged: entries.length, passed, steps: outputs,
      note: kind === 'lint' ? 'لا يوجد سكربت lint مستقل؛ شُغّل فحص الصياغة للوحة أو TypeScript للبوت.' : 'الاختبار معزول وبلا أسرار الإنتاج؛ لا يثبت تكامل الخدمات الخارجية.' };
  } catch (error) {
    // SDK errors can contain URLs or credentials. Do not return the raw error.
    const known = error?.message && /^(?:تعذّر|المستودع)/.test(error.message) ? error.message : 'تعذّر تشغيل Vercel Sandbox؛ تحقّق من OIDC وصلاحية الخدمة والحدود';
    await audit.log({ type: 'sandbox', status: 'failed', detail: dir }).catch(() => {});
    throw new Error(known);
  } finally { if (sandbox) await sandbox.stop().catch(() => {}); }
}
module.exports = { run };
