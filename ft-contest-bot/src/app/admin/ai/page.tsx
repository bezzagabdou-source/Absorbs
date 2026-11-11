import { requireAdmin } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { getStore } from "@/lib/store";
import { aiStudioAction } from "../actions";
import { Flash, timeAgo } from "../ui";

export const dynamic = "force-dynamic";

type LastDraft = {
  kind: string;
  kindLabel: string;
  prompt: string;
  answer: string;
  provider: string;
  model: string;
  at: number;
};

const KINDS: { id: string; label: string; hint: string; sample: string }[] = [
  {
    id: "contest",
    label: "📝 وصف مسابقة",
    hint: "وصف حماسي جاهز للنشر",
    sample: "مسابقة جمع 300 دعوة، الجائزة حساب FT كامل لمدة سنة، 3 فائزين",
  },
  {
    id: "broadcast",
    label: "📣 رسالة بث",
    hint: "رسالة لكل المستخدمين",
    sample: "إعلان مسابقة جديدة الليلة مع مضاعفة الدعوات لأول 50 مشارك",
  },
  {
    id: "ideas",
    label: "💡 أفكار مسابقات",
    hint: "5 أفكار عملية",
    sample: "بغيت أفكار مسابقات تزيد الدعوات والمشاركين في المجموعة",
  },
  {
    id: "reply",
    label: "💬 رد على مستخدم",
    hint: "رد دعم قصير ومهذب",
    sample: "مستخدم كيقول جمعت 200 دعوة وما وصلنيش الحساب",
  },
  {
    id: "custom",
    label: "✍️ نص حر",
    hint: "أي طلب كتابة",
    sample: "كتب لي قواعد المسابقة في 6 سطور",
  },
];

export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; kind?: string }>;
}) {
  await requireAdmin();
  const { ok, err, kind } = await searchParams;
  const status = aiStatus();
  const store = await getStore();
  const last = await store.get<LastDraft>("ai:last");
  const active = KINDS.find((k) => k.id === kind) || KINDS[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🤖 المساعد الذكي</h1>
          <p className="muted">
            توليد نصوص المسابقات، رسائل البث، أفكار النمو، وردود الدعم — كل شي بالعربية/الدارجة.
          </p>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="card">
        <div className="card-title">
          <h2>حالة المحرّك</h2>
          {status.available ? (
            <span className="badge badge-active">🟢 متصل — {status.provider}</span>
          ) : (
            <span className="badge badge-ended">🔴 غير مفعّل</span>
          )}
        </div>
        {status.available ? (
          <p className="muted">
            الموديل: <code>{status.model}</code> — يوفر أكثر من مزوّد؟ البوت كيختار الأول المتوفر
            (Gemini ← OpenAI ← Groq ← OpenRouter ← Cerebras ← DeepSeek ← xAI ← Claude).
          </p>
        ) : (
          <div className="alert alert-warn">
            ⚠️ ما كاينش مفتاح ذكاء اصطناعي في البيئة. زيد <code>GEMINI_API_KEY</code> (مجاني من
            aistudio.google.com/apikey) أو <code>OPENAI_API_KEY</code> / <code>GROQ_API_KEY</code> في
            إعدادات Vercel ومن بعد Redeploy.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>✍️ اكتب الطلب</h2>
          <span className="hint">اختار النوع ثم اكتب التفاصيل</span>
        </div>
        <form action={aiStudioAction}>
          <label className="field">
            <span>نوع النص</span>
            <select name="kind" defaultValue={active.id}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} — {k.hint}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>التفاصيل</span>
            <textarea
              name="prompt"
              rows={5}
              required
              placeholder={active.sample}
              defaultValue=""
            />
            <small>كل ما زدت تفاصيل، كان النص أحسن. مثال: {active.sample}</small>
          </label>
          <button className="btn btn-primary" type="submit">
            ✨ ولّد النص
          </button>
        </form>
      </div>

      {last ? (
        <div className="card">
          <div className="card-title">
            <h2>🧾 آخر نص مولّد</h2>
            <span className="hint">
              {last.kindLabel} · {last.provider} · {timeAgo(last.at)}
            </span>
          </div>
          <p className="muted">
            الطلب: <strong>{last.prompt}</strong>
          </p>
          <div className="ai-out">{last.answer}</div>
          <div className="alert">
            💡 انسخ النص واستعمله في «تعديل المسابقة» أو «بث رسالة». راجع الأرقام والتواريخ قبل
            الإرسال.
          </div>
        </div>
      ) : (
        <div className="alert">ما زال ما ولّدنا حتى نص — جرّب «وصف مسابقة» فوق.</div>
      )}
    </>
  );
}
