const ops = require('./ops');
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' };
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: properties || {}, required: required || [] } } });
const TOOLS = [
fn('get_stats', 'إحصائيات البوت: عدد المستخدمين والنقاط والطلبات'),
fn('list_prizes', 'قائمة الجوائز مع الأسعار والتوفر'),
fn('add_prize', 'إضافة جائزة جديدة', { title: S, cost: N, emoji: S, desc: S }, ['title', 'cost']),
fn('update_prize', 'تعديل جائزة: الاسم أو السعر أو الوصف أو الإيموجي أو الترتيب', { prize: S, title: S, cost: N, emoji: S, desc: S, order: N, active: B }, ['prize']),
fn('delete_prize', 'حذف جائزة نهائياً', { prize: S }, ['prize']),
fn('set_prize_available', 'جعل الجائزة متوفرة أو غير متوفرة (تظهر علامة غير متوفر الآن)', { prize: S, available: B }, ['prize', 'available']),
fn('find_user', 'معلومات مستخدم بالمعرف أو اليوزر أو الاسم', { user: S }, ['user']),
fn('add_points', 'زيادة أو خصم نقاط مستخدم (رقم سالب للخصم)', { user: S, points: N }, ['user', 'points']),
fn('set_points', 'تحديد رصيد نقاط مستخدم بقيمة معينة', { user: S, points: N }, ['user', 'points']),
fn('ban_user', 'حظر أو فك حظر مستخدم', { user: S, banned: B }, ['user', 'banned']),
fn('top_users', 'ترتيب المستخدمين حسب النقاط أو الإحالات', { by: { type: 'string', enum: ['points', 'refs'] }, limit: N }),
fn('list_requests', 'طلبات الجوائز', { status: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }),
fn('set_request', 'قبول أو رفض طلب جائزة وإشعار المستخدم', { id: N, status: { type: 'string', enum: ['approved', 'rejected', 'pending'] }, refund: B }, ['id', 'status']),
fn('get_settings', 'إعدادات البوت'),
fn('update_settings', 'تعديل إعدادات البوت: نقاط الإحالة ورسالة الترحيب وتشغيل البوت', { refPoints: N, welcome: S, enabled: B }),
fn('get_channels', 'قنوات الاشتراك الإجباري'),
fn('set_channels', 'تعيين قائمة قنوات الاشتراك الإجباري بالكامل', { channels: { type: 'array', items: S } }, ['channels']),
fn('send_message', 'إرسال رسالة لمستخدم', { user: S, text: S }, ['user', 'text']),
fn('broadcast', 'إرسال رسالة لكل المستخدمين', { text: S }, ['text']),
fn('bot_health', 'حالة البوت والويب هوك وصلاحية البوت في القنوات')
];
const IMPL = {
get_stats: () => ops.stats(),
list_prizes: () => ops.listPrizes(),
add_prize: a => ops.savePrize({ title: a.title, cost: a.cost, emoji: a.emoji, desc: a.desc }),
update_prize: a => ops.savePrize({ ref: a.prize, title: a.title, cost: a.cost, emoji: a.emoji, desc: a.desc, order: a.order, active: a.active }),
delete_prize: a => ops.deletePrize(a.prize),
set_prize_available: a => ops.setAvailable(a.prize, a.available),
find_user: a => ops.userInfo(a.user),
add_points: a => ops.addPoints(a.user, a.points),
set_points: a => ops.setPoints(a.user, a.points),
ban_user: a => ops.setBan(a.user, a.banned),
top_users: a => ops.topUsers(a.by, a.limit),
list_requests: a => ops.listRequests(a.status),
set_request: a => ops.setRequest(a.id, a.status, a.refund),
get_settings: () => ops.getSettings(),
update_settings: a => ops.updateSettings(a),
get_channels: () => ops.getChannels(),
set_channels: a => ops.setChannels(a.channels),
send_message: a => ops.sendTo(a.user, a.text),
broadcast: a => ops.broadcast(a.text, 15000),
bot_health: () => ops.health(false)
};
const SYSTEM = 'أنت مساعد إدارة لبوت تيليغرام «مسابقات FT». تنفّذ طلبات المالك فعلياً عبر الأدوات المتاحة فقط. القواعد: 1) لا تقل إنك نفّذت شيئاً إلا بعد نتيجة أداة ناجحة، وإذا فشلت أداة اعرض الخطأ كما هو. 2) لا تخترع معرّفات أو أسماء: استعمل list_prizes أو find_user عند الشك قبل التعديل. 3) إذا الطلب ناقص أو غامض اسأل سؤالاً واحداً قصيراً. 4) ممنوع تماماً: كشف مفاتيح أو كلمات سر أو متغيرات بيئة، أو تنفيذ كود، أو حذف قاعدة البيانات أو كل المستخدمين؛ ارفض بجملة قصيرة. 5) الحذف والبث نفّذهما مباشرة إذا طلبهما المالك بوضوح. 6) إذا طلب شيئاً لا توجد له أداة، قل بصراحة إنه غير متاح حالياً ولا تدّعِ التنفيذ. 7) أجب بالدارجة الجزائرية أو العربية المبسطة، بإيجاز، مع ملخص دقيق لما تغيّر فعلاً.';
const MODELS = (process.env.AI_MODELS || 'openai/gpt-oss-20b,openai/gpt-oss-120b').split(',').map(s => s.trim()).filter(Boolean);
const READ_ONLY = new Set(['get_stats', 'list_prizes', 'find_user', 'top_users', 'list_requests', 'get_settings', 'get_channels', 'bot_health']);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function chat(messages, deadline) {
  const providers = [];
  if (process.env.GROQ_API_KEY) for (const model of MODELS) providers.push({ url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, model });
  if (process.env.OPENROUTER_API_KEY) providers.push({ url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b' });
  if (!providers.length) throw new Error('لا يوجد مزوّد ذكاء اصطناعي');
  let lastError = 'تعذّر الاتصال بمزوّد الذكاء الاصطناعي';
  let attempts = 0;
  // Retry only model requests. Executed tools are never automatically replayed.
  for (const provider of providers) {
    for (let retry = 0; retry < 2 && attempts < 4; retry++) {
      const remaining = deadline - Date.now();
      if (remaining < 400) throw new Error('انتهت مهلة المساعد');
      attempts++;
      try {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: { authorization: 'Bearer ' + provider.key, 'content-type': 'application/json' },
          body: JSON.stringify({ model: provider.model, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.1, max_tokens: 1400 }),
          signal: AbortSignal.timeout(Math.min(8000, remaining)),
        });
        const payload = await response.json().catch(() => ({}));
        const message = payload.choices?.[0]?.message;
        if (response.ok && message && typeof message === 'object') return message;
        lastError = `مزوّد الذكاء الاصطناعي: HTTP ${response.status}`;
        // Invalid credentials or unsupported models should fall through promptly to another provider/model.
        if (response.status !== 429 && response.status < 500) break;
      } catch (e) {
        lastError = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'انتهت مهلة مزوّد الذكاء الاصطناعي' : 'تعذّر الاتصال بمزوّد الذكاء الاصطناعي';
      }
      if (retry === 0 && deadline - Date.now() > 700) await pause(150);
    }
    if (attempts >= 4) break;
  }
  throw new Error(lastError);
}
const summarize = result => { const text = JSON.stringify(result); return text.length > 700 ? text.slice(0, 700) + '…' : text; };
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
async function runAI(prompt, history) {
  const text = String(prompt || '').trim().slice(0, 3000);
  if (!text) throw new Error('اكتب طلبك');
  const messages = [{ role: 'system', content: SYSTEM + ' لا تكرر نفس العملية المعدّلة أو البث في الطلب نفسه. عند غموض اسم أو مبلغ اطلب توضيحاً ولا تخمّن.' }];
  (Array.isArray(history) ? history : []).slice(-10).forEach(h => { if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string') messages.push({ role: h.role, content: h.content.slice(0, 2000) }); });
  messages.push({ role: 'user', content: text });
  const actions = [], mutations = new Map();
  const deadline = Date.now() + 42000;
  for (let step = 0; step < 6 && Date.now() < deadline; step++) {
    let msg;
    try { msg = await chat(messages, deadline); }
    catch (e) {
      if (!actions.length) throw e;
      return { reply: 'تعذّر إكمال رد المساعد. راجع نتائج العمليات أدناه قبل إعادة الطلب.', actions };
    }
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls.slice(0, 12)) {
        let args = {}, result, ok = true, skipped = false;
        const name = String(tc.function?.name || '');
        try {
          args = JSON.parse(tc.function?.arguments || '{}');
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('معاملات الأداة غير صالحة');
          Object.keys(args).forEach(k => { if (args[k] === null) delete args[k]; });
          const fn = IMPL[name];
          if (!fn) throw new Error('أداة غير مسموحة: ' + name);
          const fingerprint = name + ':' + JSON.stringify(stable(args));
          if (!READ_ONLY.has(name) && mutations.has(fingerprint)) {
            result = { skipped: true, message: 'تم تجاهل عملية مكررة؛ راجع نتيجة التنفيذ الأول.' };
            skipped = true;
          } else {
            // Mark before execution: if a write has an uncertain outcome, do not replay it.
            if (!READ_ONLY.has(name)) mutations.set(fingerprint, true);
            result = await fn(args);
          }
        } catch (e) { ok = false; result = { error: String(e.message || 'تعذر التنفيذ') }; }
        actions.push({ tool: name, args, ok: ok && !skipped, result: summarize(result) });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 6000) });
      }
      continue;
    }
    return { reply: typeof msg.content === 'string' && msg.content.trim() ? msg.content : 'لم أستطع توليد رد واضح.', actions };
  }
  return { reply: 'وصلت لحد الوقت أو الخطوات؛ راجع النتائج أدناه قبل إعادة الطلب.', actions };
}
module.exports = { runAI };
