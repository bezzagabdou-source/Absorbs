import { NextResponse } from 'next/server';

/**
 * بروكسي النماذج لـ /apex — يستعمل مفاتيح البيئة على السيرفر فقط.
 * لا يُرسل أي مفتاح إلى المتصفح، ولا يعتمد على قاعدة البيانات أو المصادقة.
 *
 * المدعوم: Google Gemini · OpenRouter · Groq · Cerebras · DeepSeek · OpenAI · xAI · Anthropic
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Style = 'openai' | 'gemini' | 'anthropic';

interface Provider {
  id: string;
  label: string;
  style: Style;
  base: string;
  keys: string[];
  defaultModel: string;
}

const PROVIDERS: Record<string, Provider> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    style: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    keys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    defaultModel: 'gemini-2.5-flash',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    style: 'openai',
    base: 'https://openrouter.ai/api/v1',
    keys: ['OPENROUTER_API_KEY'],
    defaultModel: 'deepseek/deepseek-chat-v3.1:free',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    style: 'openai',
    base: 'https://api.groq.com/openai/v1',
    keys: ['GROQ_API_KEY'],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    style: 'openai',
    base: 'https://api.cerebras.ai/v1',
    keys: ['CEREBRAS_API_KEY'],
    defaultModel: 'llama-3.3-70b',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    style: 'openai',
    base: 'https://api.deepseek.com/v1',
    keys: ['DEEPSEEK_API_KEY'],
    defaultModel: 'deepseek-chat',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    style: 'openai',
    base: 'https://api.openai.com/v1',
    keys: ['OPENAI_API_KEY'],
    defaultModel: 'gpt-4o-mini',
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    style: 'openai',
    base: 'https://api.x.ai/v1',
    keys: ['XAI_API_KEY', 'GROK_API_KEY'],
    defaultModel: 'grok-2-mini',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    style: 'anthropic',
    base: 'https://api.anthropic.com/v1',
    keys: ['ANTHROPIC_API_KEY'],
    defaultModel: 'claude-3-5-haiku-latest',
  },
};

/** لكل نموذج في الواجهة: سلسلة مزوّدين مرتّبة بالأفضلية + معرّف مقترح */
const MODEL_ROUTES: Record<string, { providers: { id: keyof typeof PROVIDERS; model: string }[] }> = {
  'gpt-astra': {
    providers: [
      { id: 'openai', model: 'gpt-4o-mini' },
      { id: 'openrouter', model: 'openai/gpt-4o-mini' },
      { id: 'groq', model: 'llama-3.3-70b-versatile' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
    ],
  },
  'kimi-3': {
    providers: [
      { id: 'openrouter', model: 'moonshotai/kimi-k2-instruct' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
      { id: 'groq', model: 'llama-3.3-70b-versatile' },
    ],
  },
  'gemini-ultra-lite': {
    providers: [
      { id: 'gemini', model: 'gemini-2.5-flash' },
      { id: 'openrouter', model: 'google/gemini-2.5-flash' },
      { id: 'groq', model: 'llama-3.1-8b-instant' },
    ],
  },
  'deepseek-v4-lite': {
    providers: [
      { id: 'deepseek', model: 'deepseek-chat' },
      { id: 'openrouter', model: 'deepseek/deepseek-chat-v3.1:free' },
      { id: 'cerebras', model: 'llama-3.3-70b' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
    ],
  },
  'qwen-4-turbo': {
    providers: [
      { id: 'openrouter', model: 'qwen/qwen-2.5-coder-32b-instruct' },
      { id: 'groq', model: 'qwen/qwen3-32b' },
      { id: 'cerebras', model: 'qwen-3-32b' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
    ],
  },
  'grok-4-mini': {
    providers: [
      { id: 'xai', model: 'grok-2-mini' },
      { id: 'openrouter', model: 'x-ai/grok-2-mini' },
      { id: 'groq', model: 'llama-3.3-70b-versatile' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
    ],
  },
  'mistral-forge': {
    providers: [
      { id: 'openrouter', model: 'mistralai/mistral-small-latest' },
      { id: 'cerebras', model: 'llama3.1-8b' },
      { id: 'groq', model: 'llama-3.1-8b-instant' },
      { id: 'gemini', model: 'gemini-2.5-flash-lite' },
    ],
  },
  'glm-5-air': {
    providers: [
      { id: 'openrouter', model: 'z-ai/glm-4.5-air:free' },
      { id: 'cerebras', model: 'llama3.1-8b' },
      { id: 'gemini', model: 'gemini-2.5-flash-lite' },
    ],
  },
  'llama-4-scout': {
    providers: [
      { id: 'groq', model: 'llama-3.3-70b-versatile' },
      { id: 'cerebras', model: 'llama-3.3-70b' },
      { id: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' },
      { id: 'gemini', model: 'gemini-2.5-flash' },
    ],
  },
  'nova-coder-x': {
    providers: [
      { id: 'openrouter', model: 'deepseek/deepseek-r1:free' },
      { id: 'deepseek', model: 'deepseek-reasoner' },
      { id: 'gemini', model: 'gemini-2.5-pro' },
      { id: 'groq', model: 'llama-3.3-70b-versatile' },
    ],
  },
};

function keyFor(provider: Provider): string {
  for (const name of provider.keys) {
    const value = process.env[name];
    if (value && value.trim().length > 8) return value.trim();
  }
  return '';
}

/** المزوّدون المتاحون حالياً على هذا النشر (بلا كشف أي مفتاح) */
export function configuredProviders(): string[] {
  return Object.values(PROVIDERS)
    .filter((p) => keyFor(p))
    .map((p) => p.label);
}

interface Body {
  modelId?: string;
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'طلب غير صالح (JSON)' }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === 'string') : [];
  if (!messages.length) return NextResponse.json({ error: 'لا رسائل في الطلب' }, { status: 400 });

  const route = MODEL_ROUTES[body.modelId ?? ''] ?? MODEL_ROUTES['gpt-astra'];
  const chain = route.providers
    .map((entry) => ({ provider: PROVIDERS[entry.id], model: entry.model }))
    .filter((entry) => Boolean(entry.provider) && Boolean(keyFor(entry.provider)));

  // لا مفاتيح على السيرفر ⇒ المتصفح ينتقل للوضع التجريبي المحلي
  if (!chain.length) {
    return NextResponse.json({
      demo: true,
      note: 'لا مفاتيح مزوّدين في متغيرات البيئة — عرض تجريبي محلي.',
      configured: configuredProviders(),
    });
  }

  const temperature = clampNum(body.temperature, 0, 1.5, 0.6);
  const topP = clampNum(body.topP, 0.1, 1, 0.95);
  const maxTokens = Math.round(clampNum(body.maxTokens, 256, 65536, 8192));
  const wantStream = body.stream !== false;

  for (const entry of chain) {
    const key = keyFor(entry.provider);
    try {
      const result =
        entry.provider.style === 'gemini'
          ? await callGemini(entry.provider, entry.model, key, messages, temperature, topP, maxTokens, wantStream)
          : entry.provider.style === 'anthropic'
            ? await callAnthropic(entry.provider, entry.model, key, messages, temperature, maxTokens, wantStream)
            : await callOpenAICompatible(entry.provider, entry.model, key, messages, temperature, topP, maxTokens, wantStream);

      if (result) return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطأ غير معروف';
      // نحوّل للفشل على المزوّد التالي في السلسلة
      console.warn(`[apex] ${entry.provider.label} فشل: ${message}`);
    }
  }

  return NextResponse.json(
    { error: 'فشلت كل المزوّدين المتاحين لهذا النموذج. تحقّق من صلاحية المفاتيح أو جرّب نموذجاً آخر.' },
    { status: 502 },
  );
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** توجيه الرسائل لصيغة أوبن‑إيه‑آي */
function toOpenAIMessages(messages: { role: string; content: string }[]) {
  return messages.map((m) => ({
    role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

type SsePack = { t?: string; error?: string };

function sseStream(
  upstream: ReadableStream<Uint8Array>,
  extract: (payload: string) => string | null,
  providerLabel: string,
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (obj: SsePack) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const reader = upstream.getReader();
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
            if (!payload || payload === '[DONE]') {
              if (payload === '[DONE]') finished = true;
              continue;
            }
            const text = extract(payload);
            if (text) push({ t: text });
          }
        }
        push({ t: '' });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'انقطع البث';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `${providerLabel}: ${message}` })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function callOpenAICompatible(
  provider: Provider,
  model: string,
  key: string,
  messages: { role: string; content: string }[],
  temperature: number,
  topP: number,
  maxTokens: number,
  stream: boolean,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(provider.id === 'openrouter'
          ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'https://absorbs.app', 'X-Title': 'ABSORBS Apex' }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: toOpenAIMessages(messages),
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 160)}`);
    }

    if (!stream) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return NextResponse.json({ text: json.choices?.[0]?.message?.content ?? '', provider: provider.label });
    }

    return sseStream(
      res.body,
      (payload) => {
        try {
          const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          return json.choices?.[0]?.delta?.content ?? null;
        } catch {
          return null;
        }
      },
      provider.label,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  provider: Provider,
  model: string,
  key: string,
  messages: { role: string; content: string }[],
  temperature: number,
  topP: number,
  maxTokens: number,
  stream: boolean,
): Promise<Response | null> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const url = stream
    ? `${provider.base}/models/${model}:streamGenerateContent?alt=sse&key=${key}`
    : `${provider.base}/models/${model}:generateContent?key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature,
          topP,
          maxOutputTokens: Math.min(maxTokens, 65536),
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 160)}`);
    }

    if (!stream) {
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      return NextResponse.json({ text, provider: provider.label });
    }

    return sseStream(
      res.body,
      (payload) => {
        try {
          const json = JSON.parse(payload) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('') || null;
        } catch {
          return null;
        }
      },
      provider.label,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(
  provider: Provider,
  model: string,
  key: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number,
  stream: boolean,
): Promise<Response | null> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${provider.base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: system || undefined,
        messages: rest,
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${detail.slice(0, 160)}`);
    }

    if (!stream) {
      const json = (await res.json()) as { content?: { text?: string }[] };
      return NextResponse.json({ text: (json.content ?? []).map((c) => c.text ?? '').join(''), provider: provider.label });
    }

    return sseStream(
      res.body,
      (payload) => {
        try {
          const json = JSON.parse(payload) as { delta?: { text?: string } };
          return json.delta?.text ?? null;
        } catch {
          return null;
        }
      },
      provider.label,
    );
  } finally {
    clearTimeout(timer);
  }
}
