import type { ChatMessage, ModelId, Settings } from '@/lib/apex/types';
import { MODEL_BY_ID, QUALITY_PACK_AR, QUALITY_PACK_EN } from '@/lib/apex/models';
import { PROMPT_BY_ID } from '@/lib/apex/prompts';
import { AURORA_LANDING, NOVA_DASH, STARTER_HTML } from '@/lib/apex/templates';
import { detectKind, uid } from '@/lib/apex/utils';

/**
 * طبقة الاتصال بالنماذج (نسخة v19 APEX)
 *
 * ثلاث حالات تشغيل، مرتّبة بالأمان:
 *  1) عبر السيرفر: `/api/apex/chat` — تستعمل مفاتيح البيئة على Vercel ولا تُعرّض أي مفتاح للمتصفح (الافتراضي).
 *  2) مباشر: ملء مفتاح في الإعدادات ⇒ نداء من المتصفح لأي مزوّد متوافق مع OpenAI.
 *  3) وضع تجريبي: بلا أي مفتاح ⇒ محاكاة محلية تُنتج مشروعاً حقيقياً قابلاً للتشغيل.
 */

export interface ApiMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpts {
  settings: Settings;
  modelId: ModelId;
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
}

export interface CallResult {
  text: string;
  ok: boolean;
  error?: string;
  simulated: boolean;
  provider?: string;
}

export function buildSystemPrompt(modelId: ModelId, settings: Settings): string {
  const model = MODEL_BY_ID[modelId];
  const persona = settings.persona.trim();
  const base = settings.lang === 'ar' ? model?.system.ar ?? '' : model?.system.en ?? '';
  const pack = settings.lang === 'ar' ? QUALITY_PACK_AR : QUALITY_PACK_EN;
  const personaBlock = persona
    ? settings.lang === 'ar'
      ? `\n— سياق المكتب/الفريق (التزم به في كل مخرَج) —\n${persona}\n`
      : `\n— Studio context (obey in every output) —\n${persona}\n`
    : '';
  return [base, personaBlock, pack].filter(Boolean).join('\n');
}

export async function callModel(messages: ApiMsg[], opts: CallOpts): Promise<CallResult> {
  const { settings, modelId, signal, onDelta } = opts;
  const direct = Boolean(settings.apiKey.trim());

  if (settings.demoMode && !direct) {
    return simulate(messages, modelId, settings, signal, onDelta);
  }

  return direct ? callDirect(messages, opts) : callServer(messages, opts);
}

/* ============================ 1) عبر السيرفر ============================ */

async function callServer(messages: ApiMsg[], { settings, modelId, signal, onDelta }: CallOpts): Promise<CallResult> {
  try {
    const res = await fetch('/api/apex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        messages,
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: settings.maxTokens,
        stream: settings.stream,
      }),
      signal,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, text: '', simulated: false, error: `فشل الطلب (${res.status}): ${raw.slice(0, 220)}` };
    }

    const type = res.headers.get('content-type') ?? '';

    // لا مفاتيح على السيرفر ⇒ يعود بإشارة الوضع التجريبي
    if (type.includes('application/json')) {
      const json = (await res.json()) as { demo?: boolean; text?: string; provider?: string; error?: string };
      if (json.demo) return simulate(messages, modelId, settings, signal, onDelta);
      if (json.error) return { ok: false, text: '', simulated: false, error: json.error };
      return { ok: true, text: json.text ?? '', simulated: false, provider: json.provider };
    }

    // بث SSE
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, text: '', simulated: false, error: 'لا يمكن قراءة البث من السيرفر.' };
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    let done = false;
    while (!done) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          done = true;
          break;
        }
        try {
          const json = JSON.parse(payload) as { t?: string; error?: string };
          if (json.error) return { ok: false, text: full, simulated: false, error: json.error };
          if (json.t) {
            full += json.t;
            onDelta?.(json.t);
          }
        } catch {
          /* سطر جزئي — يُتجاهل بأمان */
        }
      }
    }
    return { ok: true, text: full, simulated: false };
  } catch (err) {
    if (signal?.aborted) return { ok: false, text: '', simulated: false, error: 'أُلغي الطلب.' };
    const message = err instanceof Error ? err.message : 'خطأ شبكة غير معروف';
    return { ok: false, text: '', simulated: false, error: `تعذّر الوصول للسيرفر: ${message}` };
  }
}

/* ============================ 2) مباشر من المتصفح ============================ */

async function callDirect(messages: ApiMsg[], { settings, modelId, signal, onDelta }: CallOpts): Promise<CallResult> {
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const override = settings.modelOverrides[modelId];
  const model = override && override.trim() ? override.trim() : MODEL_BY_ID[modelId]?.apiModel ?? modelId;
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey.trim()}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
        stream: settings.stream,
      }),
      signal,
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      return { ok: false, text: '', simulated: false, error: `فشل المزوّد (${res.status}): ${raw.slice(0, 200)}` };
    }
    if (settings.stream && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let full = '';
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            finished = true;
            break;
          }
          try {
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const piece = json.choices?.[0]?.delta?.content ?? '';
            if (piece) {
              full += piece;
              onDelta?.(piece);
            }
          } catch {
            /* تجاهل */
          }
        }
      }
      return { ok: true, text: full, simulated: false, provider: 'direct' };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, text: '', simulated: false, error: 'استجابة فارغة من المزوّد.' };
    return { ok: true, text, simulated: false, provider: 'direct' };
  } catch (err) {
    if (signal?.aborted) return { ok: false, text: '', simulated: false, error: 'أُلغي الطلب.' };
    const message = err instanceof Error ? err.message : 'خطأ غير معروف';
    return { ok: false, text: '', simulated: false, error: `تعذّر الاتصال بالمزوّد: ${message}` };
  }
}

/* ============================ 3) الوضع التجريبي ============================ */

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/** توليد محلي محاكى يُنتج مشروعاً حقيقياً قابلاً للتشغيل حسب نوع الطلب */
async function simulate(
  messages: ApiMsg[],
  modelId: ModelId,
  settings: Settings,
  signal?: AbortSignal,
  onDelta?: (c: string) => void,
): Promise<CallResult> {
  const model = MODEL_BY_ID[modelId];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const promptMatch = /PROMPT_ID:(\S+)/.exec(lastUser);
  const promptItem = promptMatch ? PROMPT_BY_ID[promptMatch[1]] : undefined;
  const kind = promptItem
    ? promptItem.category === 'game'
      ? 'game'
      : promptItem.category === 'web'
        ? 'website'
        : detectKind(promptItem.body.ar)
    : detectKind(lastUser);

  const clean = lastUser.replace(/PROMPT_ID:\S+/g, '').replace(/\[[^\]]*\]/g, '').trim();
  const title = promptItem ? promptItem.title.ar : clean.split('\n')[0]?.slice(0, 60) || 'مشروع نوفا';

  let code = STARTER_HTML;
  if (kind === 'game') code = NOVA_DASH;
  else if (kind === 'website') code = AURORA_LANDING;

  const header =
    settings.lang === 'ar'
      ? `<!-- تم التوليد بواسطة ${model?.name ?? modelId} (وضع تجريبي — محاكاة محلية)\n     الطلب: ${title}\n     للتعطيل: أضف مفاتيح المزوّد في متغيرات البيئة على Vercel -->\n`
      : `<!-- Generated by ${model?.name ?? modelId} (demo mode — local simulation)\n     Request: ${title}\n     Add provider keys in Vercel env vars to go live -->\n`;

  const footer =
    settings.lang === 'ar'
      ? `\n<!--\nDELIVERY: افتح الملف في أي متصفح — يعمل بلا سيرفر وبلا إنترنت.\nSELF-CHECK: مراجع DOM محمّية، deltaTime محصور، تخزين داخل try/catch، إيقاف عند إخفاء التبويب، تحكم لمس حاضر.\nRISKS: لا مخاطر حرجة — تحسين مقترح: مؤثرات صوتية اختيارية.\nSCORE: 96/100\n-->`
      : `\n<!--\nDELIVERY: Open the file in any browser — no server, no internet needed.\nSELF-CHECK: guarded DOM lookups, clamped deltaTime, storage in try/catch, pause on hidden tab, touch controls present.\nRISKS: No critical risks — suggested improvement: optional sound cues.\nSCORE: 96/100\n-->`;

  const full = header + code + footer;
  if (!onDelta) return { ok: true, text: full, simulated: true, provider: 'demo' };

  const step = 90;
  for (let i = 0; i < full.length; i += step) {
    await delay(6, signal);
    onDelta(full.slice(i, i + step));
  }
  return { ok: true, text: full, simulated: true, provider: 'demo' };
}

/* ============================ برومبت الإصلاح الذكي ============================ */

export interface RepairIssue {
  rule: string;
  severity: string;
  line?: number;
  title: string;
  detail: string;
  fix: string;
  evidence?: string;
}

/**
 * يبني رسالة إصلاح دقيقة: قائمة الأخطاء + الأدلة + الإصلاح المقترح،
 * ويُلزم النموذج بإعادة الملف كاملاً في كتلة كود واحدة بلا شرح خارجي.
 */
export function buildRepairPrompt(code: string, issues: RepairIssue[], lang: 'ar' | 'en'): string {
  const list = issues
    .map(
      (i) =>
        `- [${i.rule} · ${i.severity}${i.line ? ` · سطر ${i.line}` : ''}] ${i.title}\n  التفصيل: ${i.detail}\n  الإصلاح المقترح: ${i.fix}${i.evidence ? `\n  الدليل: ${i.evidence.slice(0, 160)}` : ''}`,
    )
    .join('\n');
  const body = code.length > 26000 ? `${code.slice(0, 26000)}\n/* … اقتُطع بقية الكود للطول — حافظ على البنية نفسها … */` : code;

  if (lang === 'ar') {
    return `أنت مدقّق الجودة النهائي في NOVA FORGE. هذا الكود فشل في بوابة الفحص الآلي ولن يُسلَّم لمستخدم حقيقي قبل إصلاحه.

الأخطاء المكتشفة (بالترتيب حسب الخطورة):
${list}

مهمتك الآن:
1) أصلح كل خطأ مذكور أعلاه إصلاحاً جذرياً — لا ترقيعاً سطحياً ولا كتم المشكلة.
2) لا تحذف أي ميزة موجودة، ولا تبسّط اللعبة/الموقع، ولا تغيّر الهوية البصرية أو النصوص.
3) أبقِ كل شيء يعمل بلا مكتبات خارجية (إلا إن كانت موجودة أصلاً)، وبلا صور أو خطوط خارجية.
4) تحقّق قبل الإخراج: كل مرجع معرّف؟ كل مستمع/مؤقت يُنظَّف؟ deltaTime محصور؟ تخزين داخل try/catch؟ تحكم لمس موجود للألعاب؟ RTL وتركيز ظاهر؟
5) أخرِج الملف الكامل المُصلَح في كتلة كود واحدة فقط. لا شرح قبلها ولا بعدها.

الكود المطلوب إصلاحه:
\`\`\`
${body}
\`\`\``;
  }

  return `You are the final QA auditor of NOVA FORGE. This code failed the automated gate and will not ship to a real user until it is fixed.

Detected issues (ordered by severity):
${list}

Your job now:
1) Fix every listed issue at the root — no surface patches, no silencing the symptom.
2) Remove no existing feature, do not simplify the game/site, and keep the visual identity and copy intact.
3) Keep everything working with no external libraries (unless already present), no external images or fonts.
4) Verify before output: every reference defined? every listener/timer cleaned up? deltaTime clamped? storage in try/catch? touch controls for games? RTL and visible focus?
5) Output the complete fixed file in a single code block only. No prose before or after.

Code to repair:
\`\`\`
${body}
\`\`\``;
}

/* ============================ مراجعة AI للكود ============================ */

export function buildReviewPrompt(code: string, reportSummary: string, lang: 'ar' | 'en'): string {
  const trimmed = code.length > 14000 ? `${code.slice(0, 14000)}\n/* … اقتُطع بقية الكود للطول … */` : code;
  if (lang === 'ar') {
    return `راجع هذا الكود الذي سُلّم لمستخدم حقيقي. نتيجة الفحص الآلي: ${reportSummary}

المطلوب بدقة:
1) أخطاء وقت تشغيل محتملة (مراجع ناقصة، ترتيب تنفيذ، أخطاء نوعية).
2) مشاكل أداء تُخفِض الإطارات أو تُظهر تسريباً.
3) مخاطر أمنية.
4) ثلاث تحسينات ملموسة لقابلية التوسّع.
5) النسخة المُصلَحة من أي سطر خطير فقط (لا تُعد كتابة الكود كاملاً).

لكل بند: [الخطورة] السطر → السبب → الإصلاح. اختم بـ VERDICT: SHIP أو FIX_FIRST مع سبب واحد قاطع.

الكود:
\`\`\`
${trimmed}
\`\`\``;
  }
  return `Review this code that shipped to a real user. Automated QA result: ${reportSummary}

Required:
1) Likely runtime failures (missing refs, execution order, type errors).
2) Performance problems causing frame drops or leaks.
3) Security risks.
4) Three concrete scalability improvements.
5) The corrected version of dangerous lines only (do not rewrite the whole file).

For each item: [severity] line → cause → fix. End with VERDICT: SHIP or FIX_FIRST plus one decisive reason.

Code:
\`\`\`
${trimmed}
\`\`\``;
}

export function newMessage(role: ChatMessage['role'], content: string, modelId?: ModelId): ChatMessage {
  return {
    id: uid('msg'),
    role,
    content,
    at: Date.now(),
    modelId,
    tokens: Math.max(1, Math.round(content.length / 3.4)),
  };
}
