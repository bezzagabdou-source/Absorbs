import { withAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function wavHeader(dataLen: number, sampleRate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLen, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLen, 40);
  return h;
}

export const POST = withAuth(async (req) => {
  const body = (await req.json().catch(() => ({}))) as any;
  const text = String(body.text || '').slice(0, 900).trim();
  if (!text) return Response.json({ error: 'No text' }, { status: 400 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 });
  const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const voice = String(body.voice || process.env.GEMINI_TTS_VOICE || 'Kore');
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    }
  );
  if (!r.ok) return Response.json({ error: 'Gemini TTS failed: ' + r.status }, { status: 502 });
  const j: any = await r.json();
  const b64 = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].inlineData && j.candidates[0].content.parts[0].inlineData.data;
  if (!b64) return Response.json({ error: 'No audio returned' }, { status: 502 });
  const pcm = Buffer.from(b64, 'base64');
  const wav = Buffer.concat([wavHeader(pcm.length), pcm]);
  return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
});
