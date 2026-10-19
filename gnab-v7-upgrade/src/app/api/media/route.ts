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
    if (kind === 'audio') {
      const voice = String(body.voice || 'nova');
      const r = await fetch(GEN + '/chat/completions', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          model: 'openai-audio',
          modalities: ['text', 'audio'],
          audio: { voice: voice, format: 'mp3' },
          messages: [{ role: 'user', content: 'Read this aloud exactly as written: ' + String(body.prompt || '') }],
        }),
      });
      const j: any = await r.json().catch(() => ({}));
      const data = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.audio && j.choices[0].message.audio.data;
      if (!r.ok || !data) return Response.json({ error: 'Audio generation failed', detail: JSON.stringify(j).slice(0, 300) }, { status: 502 });
      const buf = Buffer.from(String(data), 'base64');
      return new Response(buf, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
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
