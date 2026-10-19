import { withAuth } from '@/lib/auth';
import { consume, getPlan } from '@/lib/limits';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withAuth(async (_req, user) => {
  const { plan } = await getPlan(user.uid);
  try {
    await consume(user.uid, 'voice', plan, 1);
  } catch (e) {}
  return Response.json({
    ok: true,
    mode: 'browser',
    plan,
    engine: 'gemini-tts',
    ttsModel: process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
    ttsVoice: process.env.GEMINI_TTS_VOICE || 'Kore',
  });
});
