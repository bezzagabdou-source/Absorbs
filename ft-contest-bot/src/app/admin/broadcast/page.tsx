import { aiStatus } from "@/lib/ai";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { usersCount } from "@/lib/users";
import { aiBroadcastDraftAction, broadcastAction } from "../actions";
import { Flash } from "../ui";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;
  const total = await usersCount();
  const ai = aiStatus();
  const store = await getStore();
  const draft = await store.get<{ text: string; topic: string; at: number }>("broadcast:draft");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>بث رسالة</h1>
          <p className="muted">إرسال رسالة لكل مستخدمي البوت — استخدمها للإعلان عن مسابقة جديدة.</p>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="card">
        <div className="card-title">
          <h2>🤖 صياغة بالذكاء الاصطناعي</h2>
          {ai.available ? (
            <span className="badge badge-active">🟢 {ai.provider}</span>
          ) : (
            <span className="badge badge-ended">مطفي</span>
          )}
        </div>
        <form action={aiBroadcastDraftAction}>
          <label className="field">
            <span>موضوع الرسالة</span>
            <input
              name="topic"
              placeholder="مثال: مسابقة جديدة الليلة، 500 دعوة، الجائزة حساب FT كامل"
              defaultValue={draft?.topic || ""}
            />
            <small>البوت يكتب الرسالة ويحطها في الصندوق تحت — راجعها قبل الإرسال.</small>
          </label>
          <button className="btn" type="submit" disabled={!ai.available}>
            ✨ ولّد الرسالة
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>📣 رسالة جماعية</h2>
          <span className="hint">{total} مستخدم إجمالاً</span>
        </div>
        <form action={broadcastAction}>
          <label className="field">
            <span>نص الرسالة (يدعم HTML)</span>
            <textarea
              name="text"
              rows={6}
              required
              defaultValue={draft?.text || ""}
              placeholder={"🏆 مسابقة جديدة!\n200 ضيف وأول واحد يربح حساب FT كامل.\nافتح البوت واضغط «المسابقات» 👇"}
            />
          </label>
          <label className="field">
            <span>أقصى عدد مستقبلين في هذه العملية</span>
            <input name="limit" type="number" min={1} max={250} defaultValue={100} />
            <small>حد أقصى 250 في المرة — كرّر العملية لو المستخدمين أكثر.</small>
          </label>
          <button className="btn btn-primary" type="submit">
            إرسال الآن
          </button>
        </form>
      </div>

      <div className="alert">
        💡 تلغرام يحدّ الإرسال الجماعي — البوت يرسل على دفعات صغيرة (15 رسالة لكل دفعة) لتقليل
        الحظر. المستخدمون الذين حظروا البوت سيظهرون كفشل.
      </div>
    </>
  );
}
