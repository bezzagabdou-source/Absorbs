import { withAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GEN = 'https://gen.pollinations.ai/v1';

export const POST = withAuth(async (req) => {
  const body = (await req.json().catch(() => ({}))) as any;
  const kind = String(body.kind || 'image');
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) return Response.json({ error: 'POLLINATIONS_API_KEY missing' }, { status: 500 });
  const auth = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  try {
    if (kind === 'text') {
      const r = await fetch(GEN + '/chat/completions', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          model: String(body.model || 'openai/gpt-5.4-nano'),
          messages: [{ role: 'user', content: String(body.prompt || '') }],
          max_tokens: Number(body.maxTokens || 1024),
        }),
      });
      const j = await r.json().catch(() => ({}));
      return Response.json(j, { status: r.status });
    }
    if (kind === 'embeddings') {
      const r = await fetch(GEN + '/embeddings', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ model: String(body.model || 'openai/text-embedding-3-small'), input: String(body.prompt || '') }),
      });
      const j = await r.json().catch(() => ({}));
      return Response.json(j, { status: r.status });
    }
    if (kind === 'video') {
      const r = await fetch(GEN + '/videos/generations', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ model: String(body.model || 'seedance'), prompt: String(body.prompt || '') }),
      });
      const j = await r.json().catch(() => ({}));
      return Response.json(j, { status: r.status });
    }
    const prompt = encodeURIComponent(String(body.prompt || 'beautiful landscape'));
    const w = Number(body.width || 1024);
    const h = Number(body.height || 1024);
    const model = String(body.model || 'flux');
    const seed = Number(body.seed || 42);
    const url = 'https://image.pollinations.ai/prompt/' + prompt + '?width=' + w + '&height=' + h + '&model=' + model + '&nologo=true&seed=' + seed;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) return Response.json({ error: 'Image generation failed: ' + r.status }, { status: 502 });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || 'image/jpeg';
    return new Response(buf, { headers: { 'Content-Type': ct, 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 });
  }
});
