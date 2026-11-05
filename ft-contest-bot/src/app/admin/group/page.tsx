import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getLeaderboard } from "@/lib/contests";
import {
  activeGroupContest,
  groupJoinsCount,
  linkedGroup,
  ownerUrl,
  recentGroupJoins,
} from "@/lib/groups";
import { getSettings, ownerHandle } from "@/lib/settings";
import { getUser } from "@/lib/users";
import {
  createGroupContestAction,
  linkGroupAction,
  syncGroupAction,
  unlinkGroupAction,
} from "../actions";
import { Flash, StatusBadge, timeAgo } from "../ui";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;
  const settings = await getSettings();
  const group = linkedGroup(settings);
  const contest = group ? await activeGroupContest() : null;

  const board = contest ? await getLeaderboard(contest.id, 20) : [];
  const adders = await Promise.all(
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

  const joins = group ? await recentGroupJoins(group.chatId, 15) : [];
  const joinsTotal = group ? await groupJoinsCount(group.chatId) : 0;
  const inviteUrl = settings.botUsername
    ? `https://t.me/${settings.botUsername}?startgroup=true`
    : "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المجموعة وأسرع ضيف</h1>
          <p className="muted">
            البوت يربط نفسه بالمجموعة تلقائياً عند إضافته، وينشئ مسابقة «أسرع ضيف» ويحسب كل عضو يدخل
            من رابط دعوة خاص بكل مشارك.
          </p>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="card">
        <div className="card-title">
          <h2>🔗 المجموعة المربوطة</h2>
          {group ? (
            <span className="badge badge-active">✅ مربوطة</span>
          ) : (
            <span className="badge badge-ended">غير مربوطة</span>
          )}
        </div>

        {group ? (
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <tbody>
                <tr>
                  <td style={{ width: 200 }}>اسم المجموعة</td>
                  <td>
                    <b>{group.title}</b>
                  </td>
                </tr>
                <tr>
                  <td>آي دي المجموعة</td>
                  <td className="mono small">{group.chatId}</td>
                </tr>
                <tr>
                  <td>رابط المجموعة</td>
                  <td className="mono small">{group.url || "مجموعة خاصة (الدعوة عبر البوت)"}</td>
                </tr>
                <tr>
                  <td>قبول الانضمام تلقائياً</td>
                  <td>{settings.autoApproveJoins ? "✅ مفعّل" : "⚠️ يدوي"}</td>
                </tr>
                <tr>
                  <td>إجمالي الأعضاء المحسوبين</td>
                  <td>
                    <span className="badge badge-active">{joinsTotal}</span>
                  </td>
                </tr>
                <tr>
                  <td>المالك</td>
                  <td>
                    <a className="mono" href={ownerUrl(settings)} target="_blank" rel="noreferrer">
                      {ownerHandle(settings)} ↗
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="alert alert-warn">
            ما فيه مجموعة مربوطة. أضف البوت للمجموعة{" "}
            {inviteUrl ? (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "underline" }}
              >
                من هنا
              </a>
            ) : null}{" "}
            وارفع صلاحياته (دعوة مستخدمين) — الربط يتم تلقائياً، أو اكتب آي دي المجموعة تحت.
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <form action={syncGroupAction}>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={!group}>
              🔄 مزامنة بيانات المجموعة
            </button>
          </form>
          <form action={unlinkGroupAction}>
            <button className="btn btn-danger btn-sm" type="submit" disabled={!group}>
              ⛔️ فصل المجموعة
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🏃 مسابقة أسرع ضيف</h2>
          {contest ? <StatusBadge status={contest.status} /> : null}
        </div>

        {contest ? (
          <>
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table>
                <tbody>
                  <tr>
                    <td style={{ width: 200 }}>المسابقة</td>
                    <td>
                      <b>{contest.title}</b>
                      <div className="small muted mono">{contest.id}</div>
                    </td>
                  </tr>
                  <tr>
                    <td>الهدف</td>
                    <td>{contest.target} عضو</td>
                  </tr>
                  <tr>
                    <td>الجائزة</td>
                    <td>{contest.prize || "—"}</td>
                  </tr>
                  <tr>
                    <td>المشاركون</td>
                    <td>{adders.length}</td>
                  </tr>
                  <tr>
                    <td>بدأت</td>
                    <td className="small muted">{timeAgo(contest.startedAt || contest.createdAt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="row">
              <Link className="btn btn-ghost btn-sm" href={`/admin/contests/${contest.id}`}>
                ⚙️ تعديل الهدف والجائزة والمخزون
              </Link>
            </div>
          </>
        ) : (
          <p className="muted">لا توجد مسابقة أسرع ضيف مفتوحة — أنشئ واحدة.</p>
        )}

        <form action={createGroupContestAction} style={{ marginTop: 12 }}>
          <div className="grid-2">
            <label className="field">
              <span>هدف مسابقة أسرع ضيف (عدد الأعضاء)</span>
              <input
                name="target"
                type="number"
                min={1}
                defaultValue={contest?.target || settings.groupTarget}
              />
              <small>أول من يجمع هذا العدد من الأعضاء في المجموعة يربح الحساب.</small>
            </label>
          </div>
          <button className="btn btn-primary btn-sm" type="submit">
            {contest ? "تحديث الهدف" : "إنشاء مسابقة أسرع ضيف"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🥇 ترتيب أسرع ضيف</h2>
          <span className="hint">{adders.length} مشارك</span>
        </div>
        {adders.length === 0 ? (
          <p className="muted">
            ما فيه أحد بعد. كل مشارك يفتح البوت ← «🏃 أسرع ضيف» ← «رابطي» ويبدأ يضيف أعضاء.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المشارك</th>
                  <th>الآي دي</th>
                  <th>الأعضاء المضافون</th>
                  <th>الباقي للهدف</th>
                </tr>
              </thead>
              <tbody>
                {adders.map((a, i) => (
                  <tr key={a.id}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{a.name}</b>
                      {a.username ? <div className="small muted mono">@{a.username}</div> : null}
                    </td>
                    <td className="mono small">{a.id}</td>
                    <td>
                      <span className={a.score ? "badge badge-active" : "badge badge-draft"}>
                        {a.score}
                      </span>
                    </td>
                    <td>{Math.max(0, (contest?.target || 0) - a.score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>📥 آخر المنضمّين للمجموعة</h2>
          <span className="hint">آخر 15</span>
        </div>
        {joins.length === 0 ? (
          <p className="muted">لا توجد انضمامات مسجّلة بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>العضو</th>
                  <th>حُسب لصالح</th>
                  <th>الطريقة</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {joins.map((j) => (
                  <tr key={`${j.userId}-${j.at}`}>
                    <td>
                      {j.userName}
                      <div className="small muted mono">{j.userId}</div>
                    </td>
                    <td>
                      {j.ownerName}
                      <div className="small muted mono">{j.ownerId}</div>
                    </td>
                    <td>
                      <span className="badge badge-draft">
                        {j.via === "link" ? "🔗 رابط دعوة" : "➕ إضافة يدوية"}
                      </span>
                    </td>
                    <td className="small muted">{timeAgo(j.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🔧 ربط مجموعة يدوياً</h2>
        </div>
        <form action={linkGroupAction}>
          <div className="grid-2">
            <label className="field">
              <span>آي دي المجموعة أو @username</span>
              <input
                name="groupChat"
                placeholder="-1001234567890 أو @mygroup"
                className="mono"
                defaultValue={group?.chatId || ""}
                required
              />
              <small>البوت لازم يكون عضو/أدمن في المجموعة مع صلاحية «دعوة مستخدمين».</small>
            </label>
          </div>
          <button className="btn btn-blue btn-sm" type="submit">
            ربط المجموعة
          </button>
        </form>
      </div>
    </>
  );
}
