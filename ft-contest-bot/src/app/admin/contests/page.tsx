import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { accountsCount, listContests, participantsCount } from "@/lib/contests";
import { claimsCount } from "@/lib/claims";
import { aiStatus } from "@/lib/ai";
import { aiContestWizardAction, createContestAction, setContestStatusAction } from "../actions";
import { Flash, StatusBadge, timeAgo } from "../ui";

export const dynamic = "force-dynamic";

export default async function ContestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;
  const ai = aiStatus();
  const contests = await listContests();
  const rows = await Promise.all(
    contests.map(async (c) => ({
      contest: c,
      stock: await accountsCount(c.id),
      winners: await claimsCount(c.id),
      participants: await participantsCount(c.id),
    })),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المسابقات</h1>
          <p className="muted">
            كل مسابقة = هدف بعدد الجهات + مخزون حسابات. أول من يكمل الهدف يستلم الحساب.
          </p>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="card">
        <div className="card-title">
          <h2>🤖 مسابقة بسطر واحد</h2>
          {ai.available ? (
            <span className="badge badge-active">🟢 {ai.provider}</span>
          ) : (
            <span className="badge badge-ended">غير مفعّل</span>
          )}
        </div>
        <form action={aiContestWizardAction}>
          <label className="field">
            <span>اكتب الفكرة بالعامية وخلّي البوت يبني المسابقة</span>
            <textarea
              name="idea"
              rows={2}
              required
              placeholder="مثال: مسابقة 300 دعوة، الجائزة حساب FT سنة كاملة، 3 فائزين، كتسالي نهار الجمعة"
            />
            <small>
              يولّد العنوان + الهدف + الجائزة + الوصف، ويفعّل المسابقة مباشرةً باش تبان في البوت.
            </small>
          </label>
          <button className="btn btn-primary" type="submit" disabled={!ai.available}>
            ✨ أنشئ المسابقة الآن
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>➕ إنشاء مسابقة</h2>
          <span className="hint">تقدر تعدّلها لاحقاً</span>
        </div>
        <form action={createContestAction}>
          <div className="grid-2">
            <label className="field">
              <span>عنوان المسابقة</span>
              <input name="title" required placeholder="مسابقة FT — 200 جهة" />
            </label>
            <label className="field">
              <span>عدد الجهات المطلوب</span>
              <input name="target" type="number" min={1} defaultValue={200} required />
              <small>مثال: 200 — أي أول من يجمع 200 جهة يربح.</small>
            </label>
            <label className="field">
              <span>الجائزة</span>
              <input name="prize" placeholder="حساب FT بريميوم — إيميل + كلمة سر" />
            </label>
            <label className="field">
              <span>عدد الفائزين</span>
              <input name="winners" type="number" min={1} defaultValue={1} />
              <small>1 = أول واحد فقط يوصل. أكثر من 1 = كل من يوصل يأخذ حساب.</small>
            </label>
            <label className="field">
              <span>طريقة حساب الجهات</span>
              <select name="mode" defaultValue="referral">
                <option value="referral">🔗 رابط البوت (كل شخص يفتحه = جهة)</option>
                <option value="group">🏃 أسرع ضيف (أعضاء المجموعة)</option>
              </select>
              <small>«أسرع ضيف» يحسب كل عضو يدخل مجموعتك من رابط دعوة المشارك.</small>
            </label>
            <label className="field">
              <span>الحالة</span>
              <select name="status" defaultValue="active">
                <option value="active">مفتوحة الآن</option>
                <option value="draft">مسودة (مخفية)</option>
                <option value="ended">منتهية</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>وصف المسابقة (اختياري)</span>
            <textarea name="description" rows={3} placeholder="اكتب تفاصيل إضافية تظهر في البوت..." />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>🖼 صورة المسابقة (اختياري)</span>
              <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" />
              <small>تظهر في الموقع وكتصويرة الرسالة في البوت — حتى 1.5 ميغا.</small>
            </label>
            <label className="field">
              <span>أو رابط صورة جاهز</span>
              <input name="imageUrl" placeholder="https://example.com/ft.png" className="mono" />
              <small>لو حطيت الاثنين، الصورة المرفوعة هي اللي تُعتمد.</small>
            </label>
          </div>
          <button className="btn btn-primary" type="submit">
            إنشاء المسابقة
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>كل المسابقات</h2>
          <span className="hint">{rows.length} مسابقة</span>
        </div>
        {rows.length === 0 ? (
          <p className="muted">ما فيه مسابقات بعد — أنشئ واحدة من الفورم فوق.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المسابقة</th>
                  <th>الحالة</th>
                  <th>الهدف</th>
                  <th>المخزون</th>
                  <th>فائزون</th>
                  <th>مشاركون</th>
                  <th>أُنشئت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ contest, stock, winners, participants }) => (
                  <tr key={contest.id}>
                    <td>
                      <b>{contest.title}</b>
                      <div className="small muted">
                        {contest.mode === "group" ? "🏃 أسرع ضيف" : "🔗 رابط البوت"}
                        {contest.imageUrl ? " • 🖼 صورة" : ""}
                      </div>
                      <div className="small muted mono">{contest.id}</div>
                    </td>
                    <td>
                      <StatusBadge status={contest.status} />
                    </td>
                    <td>{contest.target}</td>
                    <td>
                      <span className={stock ? "badge badge-active" : "badge badge-ended"}>{stock}</span>
                    </td>
                    <td>
                      {winners}/{contest.winners}
                    </td>
                    <td>{participants}</td>
                    <td className="small muted">{timeAgo(contest.createdAt)}</td>
                    <td>
                      <div className="row">
                        <Link className="btn btn-ghost btn-sm" href={`/admin/contests/${contest.id}`}>
                          إدارة
                        </Link>
                        <form action={setContestStatusAction}>
                          <input type="hidden" name="id" value={contest.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={contest.status === "active" ? "ended" : "active"}
                          />
                          <button className="btn btn-ghost btn-sm" type="submit">
                            {contest.status === "active" ? "إيقاف" : "تفعيل"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
