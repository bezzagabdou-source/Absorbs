// أدوات إضافية للمساعد: تفكير وتخطيط، بحث وقراءة الويب، وإدارة متغيرات Vercel.
// القواعد الصارمة هنا في الكود (لا في البرومبت):
//  • لا توجد أداة حذف لأي متغير أو توكن أو مفتاح.
//  • المفاتيح والتوكنات الموجودة لا تُستبدل ولا تُفرَّغ؛ الجديدة فقط تُنشأ (من نوع sensitive).
//  • متغيرات البنية (قاعدة البيانات، التوكنات الأساسية، GATE_OFF...) لا يلمسها المساعد إطلاقاً.
const dns = require('node:dns').promises;
const net = require('node:net');
const repo = require('./agentRepo');
const audit = require('./agentAudit');

/* ───────────────────────────── تفكير وتخطيط ───────────────────────────── */
async function think(args = {}) {
  const thought = String(args.thought || '').trim();
  if (!thought) throw new Error('اكتب خطتك أو تحليلك');
  if (thought.length > 12000) throw new Error('التحليل أطول من 12000 حرف');
  return { noted: true, chars: thought.length, hint: 'تابع بالأدوات؛ هذه المذكرة لا تغيّر شيئاً.' };
}

/* ───────────────────────────── الويب (قراءة فقط) ───────────────────────────── */
function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('::ffff:') || v.startsWith('64:ff9b');
  }
  return true;
}
async function safeUrl(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { throw new Error('رابط غير صالح'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('الروابط http/https فقط');
  if (url.username || url.password) throw new Error('روابط بها بيانات دخول غير مسموحة');
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new Error('المنفذ غير مسموح');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) throw new Error('العنوان داخلي غير مسموح');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error('تعذّر تحديد عنوان الموقع'); });
  if (!addresses.length || addresses.some(a => privateIp(a.address))) throw new Error('العنوان داخلي أو خاص غير مسموح');
  return url;
}
function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}
async function readLimited(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let total = 0;
  while (total < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value)); total += value.length;
  }
  try { await reader.cancel(); } catch { /* done */ }
  return Buffer.concat(chunks).subarray(0, limit).toString('utf8');
}
async function fetchUrl(args = {}) {
  let url = await safeUrl(args.url);
  let response;
  for (let hop = 0; hop < 4; hop++) {
    try {
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FT-Assistant/1.0)', accept: 'text/html,application/json,text/plain,*/*;q=0.5' } });
    } catch { throw new Error('تعذّر فتح الصفحة'); }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = await safeUrl(new URL(response.headers.get('location'), url).toString());
      response = null; continue;
    }
    break;
  }
  if (!response) throw new Error('تحويلات كثيرة');
  if (!response.ok) throw new Error('الموقع رجّع HTTP ' + response.status);
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!/(text\/|json|xml|javascript)/.test(type)) throw new Error('نوع المحتوى غير نصي: ' + type.slice(0, 60));
  const raw = await readLimited(response, 700000);
  const text = /html/.test(type) ? htmlToText(raw) : raw;
  const max = Math.max(2000, Math.min(60000, Number(args.maxChars) || 30000));
  return { url: url.toString(), contentType: type.split(';')[0], text: text.slice(0, max), truncated: text.length > max };
}
async function webSearch(args = {}) {
  const query = String(args.query || '').trim();
  if (!query || query.length > 300) throw new Error('أدخل عبارة بحث بين 1 و300 حرف');
  let html;
  try {
    const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FT-Assistant/1.0)', 'accept-language': 'ar,en;q=0.8,fr;q=0.6' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    html = await readLimited(response, 600000);
  } catch (e) { throw new Error('تعذّر البحث الآن (' + String(e.message || '').slice(0, 60) + ')؛ جرّب fetch_url على موقع معروف'); }
  const results = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = re.exec(html)) && results.length < 8) {
    let link = m[1].replace(/&amp;/g, '&');
    const wrapped = link.match(/[?&]uddg=([^&]+)/);
    if (wrapped) { try { link = decodeURIComponent(wrapped[1]); } catch { continue; } }
    if (link.startsWith('//')) link = 'https:' + link;
    if (!/^https?:\/\//.test(link)) continue;
    results.push({ title: htmlToText(m[2]).slice(0, 200), url: link, snippet: htmlToText(m[3] || '').slice(0, 400) });
  }
  return { query, results, note: results.length ? 'استعمل fetch_url لقراءة أي نتيجة بالتفصيل.' : 'لا نتائج؛ غيّر الصياغة.' };
}

/* ───────────────────────────── متغيرات Vercel ───────────────────────────── */
// بنية تحتية: لا يلمسها المساعد (لا إنشاء ولا تعديل).
const INFRA = /^(?:AGENT_|GATE_OFF$|ADMIN_|SESSION_|BOT_PANEL_KEY$|PANEL_PUBLIC_KEY$|TELEGRAM_|BOT_TOKEN$|REDIS_|DATABASE_URL$|POSTGRES|KV_|UPSTASH_|VERCEL_|NEXT_|NODE_|OIDC|WEBHOOK_SECRET$)/i;
// أسرار: تُنشأ مرة واحدة فقط، ولا تُستبدل ولا تُحذف عبر المساعد.
const SECRETISH = /(?:TOKEN|KEY|SECRET|PASSWORD|PASS|CREDENTIAL|WEBHOOK)/i;
function projectId(project) {
  const id = project === 'panel' ? process.env.AGENT_VERCEL_PANEL_PROJECT_ID : project === 'bot' ? process.env.AGENT_VERCEL_BOT_PROJECT_ID : '';
  if (!id) throw new Error('هيّئ معرف مشروع Vercel لـ ' + project + ' (AGENT_VERCEL_' + String(project).toUpperCase() + '_PROJECT_ID)');
  return id;
}
async function listEnvs(id) {
  const data = await (await repo.vercel('/v9/projects/' + encodeURIComponent(id) + '/env?decrypt=false')).json();
  return Array.isArray(data.envs) ? data.envs : [];
}
async function envList(args = {}) {
  const id = projectId(args.project);
  const envs = await listEnvs(id);
  // القيم لا تُعرض أبداً — الأسماء والأنواع والبيئات فقط.
  return { project: args.project, variables: envs.map(e => ({ key: e.key, type: e.type, target: e.target, updatedAt: e.updatedAt || e.createdAt || null, protected: INFRA.test(e.key) || SECRETISH.test(e.key) })) };
}
async function envSet(args = {}) {
  const project = args.project, key = String(args.key || '').trim(), value = args.value;
  if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(key)) throw new Error('اسم المتغير يجب أن يكون بحروف كبيرة وأرقام و_');
  if (typeof value !== 'string' || !value.length || value.length > 8000) throw new Error('القيمة مطلوبة (حتى 8000 حرف)؛ التفريغ والحذف غير مسموحين');
  if (INFRA.test(key)) throw new Error('هذا متغير بنية تحتية محمي؛ لا يعدّله المساعد');
  const targets = Array.isArray(args.target) && args.target.length ? args.target : ['production', 'preview'];
  if (targets.some(t => !['production', 'preview', 'development'].includes(t))) throw new Error('البيئة غير صالحة');
  const id = projectId(project);
  return audit.locked(async () => {
    const existing = (await listEnvs(id)).filter(e => e.key === key);
    const secretish = SECRETISH.test(key);
    if (secretish && existing.length) throw new Error('التوكنات والمفاتيح الموجودة محمية: لا يبدّلها المساعد ولا يحذفها؛ بدّلها يدوياً من Vercel');
    await repo.vercel('/v10/projects/' + encodeURIComponent(id) + '/env?upsert=true', { method: 'POST', body: { key, value, type: secretish ? 'sensitive' : 'encrypted', target: targets } });
    await audit.log({ type: 'env_set', status: 'done', detail: project + ':' + key + (existing.length ? ' (updated)' : ' (created)') }).catch(() => {});
    return { project, key, created: !existing.length, updated: !!existing.length, target: targets, note: 'يسري المتغير على النشر الجديد؛ يلزم نشر/إعادة نشر المشروع ليتأثر به التشغيل الحالي.' };
  });
}

const S = { type: 'string' }, N = { type: 'number' };
const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const project = { type: 'string', enum: ['bot', 'panel'] };
const TOOLS = [
  fn('think', 'مذكرة تفكير وتخطيط: اكتب تحليل المشكلة وخطتك وفرضياتك قبل التنفيذ الكبير أو عند التعقيد. لا تغيّر أي شيء', { thought: S }, ['thought']),
  fn('web_search', 'بحث في الويب (نتائج: عنوان ورابط ومقتطف). للحصول على معلومة حديثة أو توثيق أو حل خطأ', { query: S }, ['query']),
  fn('fetch_url', 'قراءة صفحة ويب عامة كنص (توثيق، مقال، JSON). يمنع العناوين الداخلية', { url: S, maxChars: N }, ['url']),
  fn('env_list', 'قائمة متغيرات Vercel لمشروع bot أو panel: الأسماء والأنواع فقط، دون القيم', { project }, ['project']),
  fn('env_set', 'إنشاء متغير Vercel جديد أو تحديث متغير إعداد عادي (غير سري) في bot أو panel. لا يحذف شيئاً، ولا يبدّل توكناً أو مفتاحاً موجوداً، ولا يلمس متغيرات البنية', { project, key: S, value: S, target: { type: 'array', items: { type: 'string', enum: ['production', 'preview', 'development'] } } }, ['project', 'key', 'value']),
];
const IMPL = { think, web_search: webSearch, fetch_url: fetchUrl, env_list: envList, env_set: envSet };
const READ_ONLY = new Set(['think', 'web_search', 'fetch_url', 'env_list']);
module.exports = { TOOLS, IMPL, READ_ONLY, privateIp, safeUrl, htmlToText };
