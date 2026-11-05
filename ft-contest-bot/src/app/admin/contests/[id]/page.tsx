import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  accountsCount,
  getContest,
  getLeaderboard,
  listAccounts,
  maskAccount,
  participantsCount,
} from "@/lib/contests";
import { claimsCount, listContestClaims } from "@/lib/claims";
import { getSettings } from "@/lib/settings";
import { getUser } from "@/lib/users";
import {
  addAccountsAction,
  clearAccountsAction,
  deleteContestAction,
  removeAccountAction,
  setContestStatusAction,
  updateContestAction,
} from "../../actions";
import { Flash, StatusBadge, dateText } from "../../ui";

export const dynamic = "force-dynamic";

export default async function ContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { ok, err } = await searchParams;
  const contest = await getContest(id);
  if (!contest) notFound();

  const [stock, accounts, participants, winners, claims, settings] = await Promise.all([
    accountsCount(contest.id),
    listAccounts(contest.id, 60),
    participantsCount(contest.id),
    claimsCount(contest.id),
    listContestClaims(contest.id, 50),
    getSettings(),
  ]);

  const board = await getLeaderboard(contest.id, 20);
  const boardRows = await Promise.all(
    board.map(async (entry) => {
      const user = await getUser(entry.member);
      return {
        id: entry.member,
        name: user?.firstName || "مستخدم",
        username: user?.username || "",
        score: entry.score,
      };
    }),
  );

  const botLink = settings.botUsername
    ? `https://t.me/${settings.botUsername}?start=c_${contest.id}`
    : "";
  const endAt = Math.max(contest.target, 1);
  const topScore = boardRows[0]?.score || 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row small muted">
            <Link href="/admin/contests">المسابقات</Link>
            <span>/</span>
            <span className="mono">{contest.id}</span>
          </div>
          <h1>{contest.title}</h1>
          <p className="muted">
            <StatusBadge status={contest.status} /> • الهدف {contest.target} جهة • أعلى رصيد حالياً{" "}
            {topScore}
          </p>
        </div>
        <div className="row">
          {botLink ? (
            <a className="btn btn-primary btn-sm" href={botLink} target="_blank" rel="noreferrer">
              🚀 فتح في البوت
            </a>
          ) : null}
          <form action={setContestStatusAction}>
            <input type="hidden" name="id" value={contest.id} />
            <input
              type="hidden"
              name="status"
              value={contest.status === "active" ? "ended" : "active"}
            />
            <button className="btn btn-ghost btn-sm" type="submit">
              {contest.status === "active" ? "⏹ إيقاف المسابقة" : "▶️ تفعيل المسابقة"}
            </button>
          </form>
          <form action={deleteContestAction}>
            <input type="hidden" name="id" value={contest.id} />
            <button className="btn btn-danger btn-sm" type="submit">
              🗑 حذف
            </button>
          </form>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="stats">
        <div className="stat">
          <b>{participants}</b>
          <span>مشارك (عندهم جهات)</span>
        </div>
        <div className="stat">
          <b>{topScore}</b>
          <span>أعلى رصيد جهات</span>
        </div>
        <div className="stat">
          <b>{stock}</b>
          <span>حساب في المخزون</span>
        </div>
        <div className="stat">
          <b>
            {winners}/{contest.winners}
          </b>
          <span>جوائز مسلّمة</span>
        </div>
      </div>

      {stock === 0 ? (
        <div className="alert alert-warn">
          ⚠️ مخزون الحسابات فاضي — لو وصل أحد للهدف مش راح يقدر يستلم. أضف حسابات من الكارت تحت.
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">
          <h2>⚙️ تعديل المسابقة</h2>
        </div>
        <form action={updateContestAction}>
          <input type="hidden" name="id" value={contest.id} />
          <div className="grid-2">
            <label className="field">
              <span>العنوان</span>
              <input name="title" defaultValue={contest.title} required />
            </label>
            <label className="field">
              <span>عدد الجهات المطلوب</span>
              <input name="target" type="number" min={1} defaultValue={contest.target} required />
            </label>
            <label className="field">
              <span>الجائزة</span>
              <input name="prize" defaultValue={contest.prize} />
            </label>
            <label className="field">
              <span>عدد الفائزين</span>
              <input name="winners" type="number" min={1} defaultValue={contest.winners} />
            </label>
            <label className="field">
              <span>الحالة</span>
              <select name="status" defaultValue={contest.status}>
                <option value="active">مفتوحة</option>
                <option value="draft">مسودة</option>
                <option value="ended">منتهية</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>الوصف</span>
            <textarea name="description" rows={2} defaultValue={contest.description} />
          </label>
          <button className="btn btn-primary" type="submit">
            حفظ التعديلات
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>📦 مخزون الحسابات ({stock})</h2>
          <span className="hint">كل فائز يستهلك حساباً واحداً من الأعلى</span>
        </div>

        <form action={addAccountsAction}>
          <input type="hidden" name="id" value={contest.id} />
          <label className="field">
            <span>أضف حسابات — كل سطر: email:password</span>
            <textarea
              name="accounts"
              rows={4}
              className="mono"
              placeholder={"user1@mail.com:Passw0rd1\nuser2@mail.com:Passw0rd2"}
            />
            <small>يدعم أيضاً الفصل بـ | أو , أو مسافة. السطور المكررة أو الفارغة تُتجاهل.</small>
          </label>
          <div className="row">
            <button className="btn btn-primary" type="submit">
              ➕ إضافة للمخزون
            </button>
          </div>
        </form>

        {accounts.length > 0 ? (
          <>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الإيميل</th>
                    <th>كلمة السر</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((entry, index) => {
                    const masked = maskAccount(entry);
                    return (
                      <tr key={`account-${index}`}>
                        <td className="muted">{index + 1}</td>
                        <td className="mono">{masked.email}</td>
                        <td className="mono muted">{masked.password}</td>
                        <td>
                          <form action={removeAccountAction}>
                            <input type="hidden" name="id" value={contest.id} />
                            <input type="hidden" name="index" value={index} />
                            <button className="btn btn-danger btn-sm" type="submit">
                              حذف
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              تظهر أول 60 حساب فقط (كلمات السر مخفية للأمان — لا تُطبع أبداً في اللوحة).
            </p>
            <form action={clearAccountsAction}>
              <input type="hidden" name="id" value={contest.id} />
              <button className="btn btn-danger btn-sm" type="submit">
                🗑 تفريغ المخزون بالكامل
              </button>
            </form>
          </>
        ) : (
          <p className="muted">المخزون فاضي — أضف حسابات باش يقدر الفائز يستلم.</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🥇 المتصدّرون</h2>
          <span className="hint">أول {boardRows.length} مشارك</span>
        </div>
        {boardRows.length === 0 ? (
          <p className="muted">ما فيه مشاركين بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المستخدم</th>
                  <th>الآي دي</th>
                  <th>الجهات</th>
                  <th>التقدّم</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>
                      {row.name}
                      {row.username ? <span className="small muted"> @{row.username}</span> : null}
                    </td>
                    <td className="mono small muted">{row.id}</td>
                    <td>
                      <b>{row.score}</b> / {contest.target}
                    </td>
                    <td style={{ minWidth: 160 }}>
                      <div className="progress" style={{ marginTop: 0 }}>
                        <div style={{ width: `${Math.min(100, (row.score / endAt) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🎁 الجوائز المسلّمة</h2>
        </div>
        {claims.length === 0 ? (
          <p className="muted">لم يتم تسليم جوائز في هذه المسابقة بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الآي دي</th>
                  <th>الإيميل</th>
                  <th>كلمة السر</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.userId}>
                    <td>{claim.userName}</td>
                    <td className="mono small muted">{claim.userId}</td>
                    <td className="mono small">{claim.email}</td>
                    <td className="mono small muted">••••••••</td>
                    <td className="small muted">{dateText(claim.at)}</td>
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
