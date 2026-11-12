import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiChat, type AiMessage } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 45;

const SYSTEM = `أنت "Dz connect ai"، المساعد الذكي الرسمي داخل منصة التواصل الاجتماعي الجزائرية "Dz connect".
شخصيتك: ودود، ذكي، سريع، وتتكلم عربية واضحة؛ إذا كتب المستخدم بالدارجة الجزائرية ردّ عليه بالدارجة.
مهامك: مساعدة المستخدم في كتابة المنشورات وتحسينها، اقتراح أفكار محتوى، صياغة ردود ذكية على الرسائل،
تلخيص النصوص، الإجابة عن الأسئلة العامة، والعصف الذهني. كن مختصرًا وعمليًا، واستعمل إيموجي باعتدال.
لا تدّعِ وجود ميزات غير حقيقية في المنصة: المنصة فيها منشورات وقصص 24 ساعة ورسائل فورية ومكالمات صوت/فيديو وحفظ وإشعارات.
إذا طُلب منك نص منشور، أعطِ النص جاهزًا للنشر مباشرة.`;

/* ── tiny in-memory rate limiter (per user, per instance) ── */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

interface ChatBody {
  messages?: AiMessage[];
  action?: "improve-post" | "post-ideas" | "smart-replies";
  text?: string;
}

const ACTION_PROMPTS: Record<NonNullable<ChatBody["action"]>, (text: string) => AiMessage[]> = {
  "improve-post": (text) => [
    {
      role: "user",
      content: `حسّن هذا المنشور ليكون جذابًا ومناسبًا لمنصة Dz connect: حافظ على معناه وصوت كاتبه، صحّح الأخطاء، أضف إيموجي واحدًا أو اثنين كحد أقصى وهاشتاغين مناسبين في النهاية. أعد النص النهائي فقط بدون شرح:\n\n${text}`,
    },
  ],
  "post-ideas": (text) => [
    {
      role: "user",
      content: `اقترح 5 أفكار منشورات قصيرة وجذابة لمنصة Dz connect حول: ${text || "الحياة اليومية في الجزائر"}. رتّبها كقائمة مرقّمة، كل فكرة في سطر أو سطرين مع إيموجي مناسب.`,
    },
  ],
  "smart-replies": (text) => [
    {
      role: "user",
      content: `هذه رسالة وصلتني: "${text}". اقترح 3 ردود ذكية قصيرة بأسلوب مختلف (ودود / مرح / رسمي مختصر)، مرقّمة وجاهزة للنسخ.`,
    },
  ],
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "سجّل الدخول لاستخدام Dz connect ai." }, { status: 401 });

  if (rateLimited(user.id)) {
    return NextResponse.json({ ok: false, error: "طلبات كثيرة — انتظر دقيقة ثم حاول مجددًا." }, { status: 429 });
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح." }, { status: 400 });
  }

  let messages: AiMessage[];
  if (body.action) {
    const builder = ACTION_PROMPTS[body.action];
    messages = builder((body.text ?? "").slice(0, 1500));
  } else {
    messages = (body.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (messages.length === 0) return NextResponse.json({ ok: false, error: "اكتب رسالتك أولًا." }, { status: 400 });
  }

  try {
    const text = await runAiChat(SYSTEM, messages);
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "حدث خطأ غير متوقع." },
      { status: 502 },
    );
  }
}
