/* اختبار سلسلة مزوّدين الذكاء الاصطناعي (بلا Redis ولا شبكة):
   يتحقّق من أن المزوّد الاحتياطي (جيميني) يتحرّك ادا فشل المزوّد الأول،
   وأن حالة المزوّدين وفحص التجربة يخدمو كما يلزم. */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { buildProviders, aiStatus, testAI, chat } = require('../lib/ai');

let originalFetch;
let calls = [];

beforeEach(() => {
  originalFetch = global.fetch;
  calls = [];
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY_FALLBACK;
  delete process.env.GEMINI_FALLBACK_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
});

/** يسجّل كل طلب fetch ويرجّع رداً من القائمة (بالترتيب) أو 401. */
function stubFetch(responses) {
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = responses.shift();
    if (!next) return new Response('{}', { status: 401 });
    return typeof next === 'function' ? next(url, options) : next;
  };
}

test('buildProviders يرتب المزوّدين والمفتاح الاحتياطي لجيميني', () => {
  process.env.GROQ_API_KEY = 'groq-key-123456';
  process.env.OPENROUTER_API_KEY = 'or-key-123456';
  process.env.GEMINI_API_KEY = 'gemini-primary-key-123';
  process.env.GEMINI_API_KEY_FALLBACK = 'gemini-fallback-key-123';
  const providers = buildProviders();
  // Groq يضيف مزوّد لكل نموذج (AI_MODELS يحتوي نموذجين افتراضياً)
  assert.deepEqual(providers.map((p) => p.id), ['groq', 'groq', 'openrouter', 'gemini', 'gemini-fallback-1']);
  assert.equal(providers[3].kind, 'gemini');
  assert.equal(providers[3].key, 'gemini-primary-key-123');
  assert.equal(providers[4].key, 'gemini-fallback-key-123');
  assert.match(providers[3].url, /generativelanguage\.googleapis\.com/);
});

test('buildProviders ما يضيف جيميني إلا إذا كان المفتاح موجود', () => {
  process.env.GROQ_API_KEY = 'groq-key-123456';
  assert.deepEqual(buildProviders().map((p) => p.id), ['groq', 'groq']);
  process.env.GEMINI_FALLBACK_KEY = 'fallback-only-key-123';
  assert.deepEqual(buildProviders().map((p) => p.id), ['groq', 'groq', 'gemini']);
});

test('aiStatus يعرّف المزوّدين المتوفّرين بلا إظهار المفاتيح', () => {
  process.env.GEMINI_API_KEY = 'gemini-primary-key-123';
  const status = aiStatus();
  assert.equal(status.available, true);
  assert.deepEqual(status.providers.map((p) => p.id), ['gemini']);
  assert.ok(!JSON.stringify(status).includes('gemini-primary-key-123'));
});

test('المساعد يتحوّل للمفتاح الاحتياطي لجيميني ادا فشل الأول (401 → 401 → 200)', async () => {
  process.env.GROQ_API_KEY = 'groq-key-123456';
  process.env.GEMINI_API_KEY = 'gemini-primary-key-123';
  process.env.GEMINI_API_KEY_FALLBACK = 'gemini-fallback-key-123';
  const geminiReply = { choices: [{ message: { content: 'جاهز من الاحتياطي' } }] };
  stubFetch([
    new Response('{}', { status: 401 }),               // groq مرفوض
    new Response('{}', { status: 401 }),               // gemini الرئيسي مرفوض
    Response.json(geminiReply),                         // gemini الاحتياطي ناجح
  ]);
  const message = await chat([{ role: 'user', content: 'مرحبا' }], Date.now() + 30000);
  assert.equal(message.content, 'جاهز من الاحتياطي');
  assert.equal(calls.length, 3);
  // مزوّد جيميني يستعمل x-goog-api-key بدلاً من Bearer
  const geminiCall = calls[2];
  assert.equal(geminiCall.options.headers['x-goog-api-key'], 'gemini-fallback-key-123');
  assert.equal(geminiCall.options.headers.authorization, undefined);
});

test('testAI يفحص المزوّدين ويرجّع الناجح منهم', async () => {
  process.env.GEMINI_API_KEY = 'gemini-primary-key-123';
  stubFetch([Response.json({ choices: [{ message: { content: 'جاهز' } }] })]);
  const result = await testAI();
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'gemini');
});

test('testAI يرجع خطأ واضح إذا كل المزوّدين فاشلين', async () => {
  process.env.GEMINI_API_KEY = 'gemini-primary-key-123';
  stubFetch([new Response('{}', { status: 400 })]);
  const result = await testAI();
  assert.equal(result.ok, false);
  assert.ok(result.error);
});
