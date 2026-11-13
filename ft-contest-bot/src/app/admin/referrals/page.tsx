import { requireAdmin } from "@/lib/auth";
import { listContests } from "@/lib/contests";
import { getStore } from "@/lib/store";
import { getUser } from "@/lib/users";
import { dateText } from "../ui";

export const dynamic = "force-dynamic";

type RefRow = {
  at: number;
  contestId: string;
  contestTitle: string;
  inviterId: string;
  inviterName: string;
  inviterUsername: string;
  joinerId: string;
  joinerName: string;
  joinerUsername: string;
};

async function readReferrals(limit = 300): Promise<RefRow[]> {
  const raw = await getStore().listAll("referrals:log", limit);
  return raw
    .map((line) => {
      try {
        return JSON.parse(line) as RefRow;
      } catch {
        return null;
      }
    })
    .filter((x): x is RefRow => Boolean(x))
    .reverse();
}

/** رابط إحالة لكل صاحب رابط: نحوّلو لاسمه من نفس السجل */
function inviterLink(contestId: string, inviterId: string) {
  return `https://t.me/{bot}?start=r_${contestId}_${inviterId}`;
}

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; contest?: string }>;
}) {
  await requireAdmin();
  const { q, contest } = await searchParams;
  const [rows, contests] = await Promise.all([readReferrals(400), listContests()]);
  const query = (q || "").trim().toLowerCase();

  const filtered = rows.filter((r) => {
    if (contest && r.contestId !== contest) return false;
    if (!query) return true;
    return (
      r.inviterId.includes(query) ||
      r.joinerId.includes(query) ||
      (r.inviterName || "").toLowerCase().includes(query) ||
      (r.joinerName || "").toLowerCase().includes(query) ||
      (r.inviterUsername || "").toLowerCase().includes(query) ||
      (r.joinerUsername || "").toLowerCase().includes(query)
    );
  });

  // تجميع: أكثر الناس جابو إحالات
  const byInviter = new Map<string, { id: string; name: string; username: string; count: number }>();
  for (const r of filtered) {
    const cur = byInviter.get(r.inviterId) || {
      id: r.inviterId,
      name: r.inviterName,
      username: r.inviterUsername,
      count: 0,
    };
    cur.count += 1;
    byInviter.set(r.inviterId, cur);
  }
  const top = [...byInviter.values()].sort((a, b) => b.count - a.count).slice(0, 20);

  // عدد الإحالات لكل مسابقة من العدّاد الحقيقي
  const contestStats = await Promise.all(
    contests.map(async (c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      target: c.target,
      counted: await getStore().zCount(`contest:${c.id}:score`),
    })),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الإحالات — شكون دخّل شكون</h1>
          <p className="muted">
            كل سطر = شخص دخل من رابط إحالة. مجموع السجل: {rows.length} إحالة.
          </p>
        </div>
        <form className="row" method="get">
          <input type="text" name="q" defaultValue={q || ""} placeholder="اسم / يوزر / آي دي" style={{ width: 220 }} />
          <select name="contest" defaultValue={contest || ""}>
            <option value="">كل المسابقات</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            بحث
          </button>
        </form>
      </div>

      <div className="grid cards">
        {contestStats.map((c) => (
          <div className="card" key={c.id}>
            <div className="muted tiny">{c.status === "active" ? "🟢 نشطة" : "⚪️ مسدودة"}</div>
            <h3>{c.title}</h3>
            <p>
              <b>{c.counted}</b> / {c.target} ضيف
            </p>
            <p className="muted tiny">
              {[...byInviter.keys()].length ? "" : ""}
              رابط المسابقة: <code>/start=c_{c.id}</code>
            </p>
          </div>
        ))}
      </div>

      <h2>🏆 أكثر الناس جابو إحالات</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الشخص</th>
              <th>الآي دي</th>
              <th>عدد الإحالات</th>
              <th>رابط الإحالة</th>
            </tr>
          </thead>
          <tbody>
            {top.length ? (
              top.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{t.name || "—"}</b>
                    {t.username ? <div className="muted tiny">@{t.username}</div> : null}
                  </td>
                  <td>
                    <code>{t.id}</code>
                  </td>
                  <td>
                    <b>{t.count}</b>
                  </td>
                  <td className="tiny">
                    <code>{contest ? inviterLink(contest, t.id) : inviterLink(contestStats[0]?.id || "{contest}", t.id)}</code>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  ما زال ما كاين حتى إحالة مسجّلة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>📋 آخر الإحالات</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>صاحب الرابط (دعا)</th>
              <th>اللي دخل (جديد)</th>
              <th>المسابقة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.slice(0, 200).map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td className="tiny">{dateText(r.at)}</td>
                  <td>
                    <b>{r.inviterName || "—"}</b>
                    <div className="muted tiny">
                      {r.inviterUsername ? `@${r.inviterUsername} · ` : ""}
                      <code>{r.inviterId}</code>
                    </div>
                  </td>
                  <td>
                    <b>{r.joinerName || "—"}</b>
                    <div className="muted tiny">
                      {r.joinerUsername ? `@${r.joinerUsername} · ` : ""}
                      <code>{r.joinerId}</code>
                    </div>
                  </td>
                  <td className="tiny">{r.contestTitle || r.contestId}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  ما كاين حتى سطر. جرّب تعاود تبعث رابط إحالة وتدخل بيه.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
