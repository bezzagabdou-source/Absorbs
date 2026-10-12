import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * حالة المزوّدين على هذا النشر — تُرجع أسماء المزوّدين المتاحين فقط، وبلا أي مفتاح.
 * الواجهة تستعملها لعرض «وضع تجريبي» أو «متصل» بصدق.
 */
export async function GET() {
  const providers: { id: string; label: string; keys: string[] }[] = [
    { id: 'gemini', label: 'Google Gemini', keys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] },
    { id: 'openrouter', label: 'OpenRouter', keys: ['OPENROUTER_API_KEY'] },
    { id: 'groq', label: 'Groq', keys: ['GROQ_API_KEY'] },
    { id: 'cerebras', label: 'Cerebras', keys: ['CEREBRAS_API_KEY'] },
    { id: 'deepseek', label: 'DeepSeek', keys: ['DEEPSEEK_API_KEY'] },
    { id: 'openai', label: 'OpenAI', keys: ['OPENAI_API_KEY'] },
    { id: 'xai', label: 'xAI', keys: ['XAI_API_KEY', 'GROK_API_KEY'] },
    { id: 'anthropic', label: 'Anthropic', keys: ['ANTHROPIC_API_KEY'] },
  ];

  const live = providers
    .filter((p) => p.keys.some((k) => (process.env[k] ?? '').trim().length > 8))
    .map((p) => p.label);

  return NextResponse.json(
    { live, count: live.length, mode: live.length ? 'live' : 'demo', at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
