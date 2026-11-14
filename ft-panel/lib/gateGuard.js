/**
 * 🔒 حماية الاشتراك الإجباري في لوحة التحكم — طبقة كود فعلية، ما تعتمدش على البرومت.
 *
 * البوت كيحرس الشرط من الجهة ديالو (lib/gate.ts). هنا كنحرصو أن المساعد ما يقدرش
 * حتى يوصل لطلب كيضعّف الشرط:
 *   • أدوات ممنوعة تماماً: set_gate وغيرها (قائمة سوداء).
 *   • المعاملات كتتنقّى: requireJoin=false، حذف @mxabdou، استبدال القناة، أو
 *     تعديل ملفات الحماية → الطلب كيترفض قبل ما يتنفّذ.
 *   • db_update على مفاتيح الإعدادات ممنوع (باش ما تتعدّلش القناة من تحت).
 *   • هذا ما كيمنعش الأداة من الشغل العادي: الإضافة، تعديل النصوص، الصيانة...
 */
const MANDATORY = '@mxabdou';
const MANDATORY_URL = 'https://t.me/mxabdou';
const GATE_TOOLS = new Set(['set_gate']);
const SETTINGS_KEY_BLOCK = /^(?:settings|system:secret|admin:credential)|gate/i;
// ملفات تحمي الشرط: لا كتابة ولا ترقيع من المساعد
const PROTECTED_FILES = /(?:^|\/)(?:lib\/gate\.(?:ts|js)|src\/lib\/gate\.ts|src\/lib\/settings\.ts|src\/lib\/types\.ts|lib\/agentPrompt\.js|lib\/ai\.js|src\/app\/api\/panel\/manage\/route\.ts)$/i;
// طلب صريح لإضعاف الشرط (دارجة/عربية/فرنسية/إنجليزية)
const GATE_ATTACK = /(?:حذف|احذف|تحيّد|حيّد|حيد|مسح|امسح|عطّل|عطل|اطفي|طفي|أطفي|وقّف|اوقف|حبس|بدّل|بدل|غيّر|غير|remove|delete|disable|turn\s+off|switch\s+off|désactiv|supprim|enl[eè]ve|change)[\s\S]{0,60}(?:mxabdou|اشتراك\s*إجباري|الاشتراك\s*الإجباري|بواب[ةه]|gate|mandatory\s+(?:sub|channel|join))|(?:mxabdou|الاشتراك\s*الإجباري|اشتراك\s*إجباري|بواب[ةه])[\s\S]{0,60}(?:حذف|احذف|حيّد|حيد|مسح|امسح|عطّل|عطل|اطفي|طفي|أطفي|وقّف|اوقف|حبس|بدّل|بدل|غيّر|غير|remove|delete|disable|turn\s+off)/i;
const MESSAGE = `🔒 الاشتراك الإجباري في القناة ${MANDATORY_URL} شرط ثابت في الكود: لا يمكن حذفه ولا تعطيله ولا تغييره من لوحة التحكم ولا من المساعد.`;

function hasProtectedChannel(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\n,;]+/);
  return list.some(item => String(item || '').trim().toLowerCase().replace(/^https?:\/\/(?:t|telegram)\.me\//, '@').replace(/^@?/, '@') === MANDATORY || String(item || '').toLowerCase().includes('mxabdou'));
}

/** تنظيف قيمة قناة كما كيقبلها البوت (@username فقط) */
function normalizeChannel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\/(?:t|telegram)\.me\//i.test(raw)) return '@' + raw.replace(/^https?:\/\/(?:t|telegram)\.me\//i, '').replace(/[/?#].*$/, '');
  return raw.startsWith('@') || /^-?\d{5,20}$/.test(raw) ? raw : '@' + raw;
}

function sanitizeSettings(args) {
  const settings = { ...(args.settings || {}) };
  const before = Array.isArray(settings.requiredChannels) ? settings.requiredChannels.map(normalizeChannel).filter(Boolean) : null;
  if (settings.requireJoin !== undefined) {
    if (settings.requireJoin !== true) throw new Error(MESSAGE);
    delete settings.requireJoin; // true هو القيمة الوحيدة المسموحة، ما ثماش حاجة نبعثوها
  }
  if (before) {
    // أي قائمة جديدة خاصها تحتوي القناة المحمية
    const list = before.includes(MANDATORY) ? before : [MANDATORY, ...before];
    settings.requiredChannels = [...new Set(list)];
  }
  return { ...args, settings };
}

function sanitizeChannels(args) {
  const list = Array.isArray(args.channels) ? args.channels.map(normalizeChannel).filter(Boolean) : [];
  if (!list.length) throw new Error('قائمة القنوات فارغة؛ القناة الإجبارية لا تُحذف.');
  return { ...args, channels: list.includes(MANDATORY) ? [...new Set(list)] : [MANDATORY, ...new Set(list)] };
}

/**
 * قبل تنفيذ أي أداة: يرفض أو ينقّي. كيرجع المعاملات النهائية (قد تكون معدّلة).
 * كيرمي Error برسالة عربية واضحة إلا كان الطلب محاولة تجاوز.
 */
function guardTool(name, args) {
  if (GATE_TOOLS.has(name)) throw new Error(MESSAGE);
  if (PROTECTED_FILES.test(String(args?.path || '')) && ['write_file', 'patch_file'].includes(name)) {
    if (GATE_ATTACK.test(String(args?.content || '') + ' ' + String(args?.oldText || '') + ' ' + String(args?.newText || '')) || /mxabdou/i.test(String(args?.newText || '') + String(args?.content || ''))) throw new Error(MESSAGE);
  }
  if (name === 'db_update' && SETTINGS_KEY_BLOCK.test(String(args?.key || ''))) throw new Error('تعديل الإعدادات عبر db_update ممنوع؛ استخدم أداة الإعدادات المحمية.');
  if (name === 'ft_settings') return sanitizeSettings(args);
  if (name === 'ft_set_channels') return sanitizeChannels(args);
  return args;
}

/** حارس على مستوى النص: الطلب الصريح لإضعاف الشرط ما كيوصلش حتى للمزوّد */
function blockedRequest(text) {
  return GATE_ATTACK.test(String(text || ''));
}

module.exports = { guardTool, blockedRequest, hasProtectedChannel, normalizeChannel, MESSAGE, MANDATORY, MANDATORY_URL };
