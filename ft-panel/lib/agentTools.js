const repo = require('./agentRepo');
const sandbox = require('./agentSandbox');
const audit = require('./agentAudit');
const bot = require('./botBridge');
const S = { type: 'string' }, B = { type: 'boolean' }, N = { type: 'number' };
const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const TOOLS = [
  fn('list_files', 'قائمة ملفات مشروعي البوت واللوحة على فرع GitHub المهيأ مع المسودات؛ path اختياري وoffset للصفحات', { path: S, offset: N, limit: N }),
  fn('read_file', 'قراءة ملف نصي مع أرقام بداية الأسطر؛ إذا كان nextOffset موجوداً اقرأ الباقي', { path: S, offset: N, limit: N }, ['path']),
  fn('write_file', 'إنشاء أو استبدال ملف نصي كامل في مسودة دائمة مع نسخة وdiff. لا ينشر الكود', { path: S, content: S }, ['path', 'content']),
  fn('patch_file', 'استبدال نص مطابق مرة واحدة فقط في ملف مع نسخة وdiff. لا ينشر الكود', { path: S, oldText: S, newText: S }, ['path', 'oldText', 'newText']),
  fn('search_code', 'بحث نصي حرفي في ملفات البوت واللوحة والمسودات؛ يعرض رقم السطر والنطاق الذي فُحص', { query: S, path: S, caseSensitive: B }, ['query']),
  fn('review_diff', 'عرض فروق جميع الملفات المعدلة في المسودة قبل الاختبار والنشر'),
  fn('db_query', 'قراءة مفتاح JSON واحد من مخزن Postgres الخاص بالبوت مع version؛ ليست SQL حرة', { key: S }, ['key']),
  fn('db_update', 'تحديث قيمة JSON واحدة في مخزن Postgres للبوت بعد db_query، بنسخة مشفرة ومقارنة version. للنقاط والإعدادات استخدم أدواتها المتخصصة', { key: S, valueJson: S, expectedVersion: S }, ['key', 'valueJson', 'expectedVersion']),
  fn('get_logs', 'قراءة أحداث بناء نشر Vercel لمشروع FT المهيأ؛ ليست سجلات التشغيل التاريخية', { id: S }, ['id']),
  fn('deploy', 'نشر المسودات إلى GitHub ثم بدء بناء Vercel production، فقط بطلب المالك. البناء غير فوري؛ استخدم get_deploy_status', { message: S }),
  fn('get_deploy_status', 'حالة نشر Vercel عبر معرّفه dpl_؛ READY وPROMOTED يجب التحقق منهما', { id: S }, ['id']),
  fn('get_bot_info', 'معلومات بوت تيليغرام الفعلية، الويب هوك والأوامر دون التوكن'),
  fn('set_commands', 'تحديث أوامر تيليغرام المطلوبة صراحة؛ تؤخذ نسخة من الأوامر السابقة أولاً', { commands: { type: 'array', items: { type: 'object', properties: { command: S, description: S }, required: ['command', 'description'] } } }, ['commands']),
  fn('set_webhook', 'ربط تيليغرام بعنوان FT-bot المهيأ فقط مع سر البوت الموجود؛ لا يحذف التحديثات المنتظرة. نفّذ بطلب صريح'),
  fn('run_tests', 'تشغيل الاختبارات في Vercel Sandbox مع مسودات project=bot أو panel؛ للبوت يشمل TypeScript والبناء إن لم يُلغَ build', { project: { type: 'string', enum: ['bot', 'panel'] }, build: B }, ['project']),
  fn('lint_check', 'فحص الصياغة للوحة أو TypeScript للبوت في بيئة معزولة؛ لا يوجد سكربت lint مستقل حالياً', { project: { type: 'string', enum: ['bot', 'panel'] } }, ['project']),
];
const READ_ONLY = new Set(['list_files', 'read_file', 'search_code', 'review_diff', 'db_query', 'get_logs', 'get_deploy_status', 'get_bot_info', 'run_tests', 'lint_check']);
function commands(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error('قائمة الأوامر غير صالحة');
  return input.map(c => {
    if (!c || !/^[a-z0-9_]{1,32}$/.test(c.command || '') || typeof c.description !== 'string' || !c.description.trim() || c.description.length > 256) throw new Error('أمر تيليغرام غير صالح');
    return { command: c.command, description: c.description.trim() };
  });
}
async function dbUpdate(args) {
  let value;
  try { value = JSON.parse(args.valueJson); } catch { throw new Error('valueJson يجب أن يحتوي JSON صحيحاً'); }
  return audit.locked(async () => {
    await audit.log({ type: 'db_update', status: 'started', detail: String(args.key || '').slice(0, 120) });
    const result = await bot.agent('db_update', { key: args.key, value, expectedVersion: args.expectedVersion });
    try {
      await audit.addUndo({ kind: 'db', id: result.backupId });
      await audit.log({ type: 'db_update', status: 'done', detail: String(args.key || '').slice(0, 120) });
      return result;
    } catch { return { ...result, warning: 'تم تعديل البيانات وحُفظت نسختها في البوت، لكن تعذّر تسجيل زر التراجع في اللوحة.' }; }
  });
}
async function setCommands(args) {
  const next = commands(args.commands);
  return audit.locked(async () => {
    const previous = await bot.agent('get_bot_info');
    if (!Array.isArray(previous.commands)) throw new Error('تعذّر قراءة الأوامر الحالية قبل حفظ النسخة');
    const id = await audit.snapshot({ kind: 'commands', before: previous.commands, after: next }, { type: 'commands', detail: 'Telegram commands' });
    const result = await bot.agent('set_commands', { commands: next });
    try { await audit.addUndo({ kind: 'commands', id }); await audit.log({ type: 'commands', status: 'done', detail: String(next.length) }); }
    catch { return { ...result, backupId: id, warning: 'تغيّرت الأوامر وحُفظت نسختها لكن تعذّر تسجيل زر التراجع.' }; }
    return { ...result, backupId: id };
  });
}
async function setWebhook() {
  return audit.locked(async () => {
    const previous = await bot.agent('get_bot_info');
    const url = bot.webhookUrl(), before = String(previous.webhook?.url || '');
    const id = await audit.snapshot({ kind: 'webhook', before, after: url }, { type: 'webhook', detail: 'Telegram webhook' });
    const result = await bot.agent('set_webhook', { url });
    // Telegram does not return the previous secret. Restore only an empty prior
    // webhook automatically; a different URL/secret needs manual recovery.
    if (!before) {
      try { await audit.addUndo({ kind: 'webhook', id }); } catch { return { ...result, backupId: id, warning: 'تغيّر الويب هوك لكن تعذّر تسجيل زر التراجع.' }; }
    }
    await audit.log({ type: 'webhook', status: 'done', detail: url }).catch(() => {});
    return { ...result, backupId: id, warning: before ? 'تيليغرام لا يكشف سر الويب هوك السابق؛ لا يُضمن التراجع التلقائي.' : '' };
  });
}
const IMPL = {
  list_files: (a, c) => repo.listFiles(a, c.repo), read_file: (a, c) => repo.readFile(a, c.repo),
  write_file: (a, c) => repo.writeFile(a, c.repo), patch_file: (a, c) => repo.writeFile(a, c.repo, true),
  search_code: (a, c) => repo.searchCode(a, c.repo), review_diff: () => repo.workspaceDiff(),
  db_query: a => bot.agent('db_query', { key: a.key }), db_update: dbUpdate,
  get_logs: a => repo.getLogs(a), deploy: (a, c) => repo.deploy(a, c.repo), get_deploy_status: a => repo.getDeployStatus(a),
  get_bot_info: () => bot.agent('get_bot_info'), set_commands: setCommands, set_webhook: setWebhook,
  run_tests: (a, c) => sandbox.run(a, 'test', c), lint_check: (a, c) => sandbox.run(a, 'lint', c),
};
module.exports = { TOOLS, IMPL, READ_ONLY };
