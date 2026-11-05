import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStats } from "@/lib/stats";
import { usersCount } from "@/lib/users";
import { resetStatsAction } from "../actions";
import { Flash } from "../ui";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; days?: string }>;
}) {
  await requireAdmin();
  const { ok, err, days } = await searchParams;
  const range = Math.min(30, Math.max(1, Number(days) || 7));
  const [stats, users] = await Promise.all([getStats(range), usersCount()]);

  const cards = [
    { label: "زوار اليوم (فريدين)", value: stats.uniquesToday, hint: "أشخاص مختلفون زاروا الموقع اليوم" },
    { label: "زيارات اليوم", value: stats.visitsToday, hint: "كل فتح للصفحة" },
    { label: "نشطين في البوت اليوم", value: stats.activeToday, hint: "مستخدمون تفاعلوا مع البوت اليوم" },
    { label: "نشطين الآن (آخر ساعتين)", value: stats.activeOnline, hint: "تفاعلوا مع البوت قريباً" },
    { label: "نشطين آخر 7 أيام", value: stats.active7, hint: "مجموع النشاط اليومي" },
    { label: "إجمالي الزيارات", value: stats.visitsTotal, hint: "منذ أول تشغيل" },
    { label: "رسائل البوت اليوم", value: stats.messagesToday, hint: "تحديثات وصلت من تيليغرام" },
    { label: "مستخدمون مسجّلون", value: users, hint: "فتحوا البوت مرة على الأقل" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الإحصائيات</h1>
          <p className="muted">عدد الزوار ونشاط مستخدمي البوت — مباشرة من التخزين.</p>
        </div>
        <div className="row">
          <Link className="btn btn-ghost btn-sm" href="/admin">
            لوحة المعلومات
          </Link>
          <Link className="btn btn-primary btn-sm" href="/admin/contests">
            🏆 المسابقات
          </Link>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="stats">
        {cards.map((card) => (
          <div className="stat" key={card.label}>
            <b>{card.value}</b>
            <span>{card.label}</span>
            <small className="muted">{card.hint}</small>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>📅 التفصيل اليومي</h2>
          <span className="hint">آخر {range} يوم — بتوقيت الجزائر</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>اليوم</th>
                <th>زيارات</th>
                <th>زوار فريدين</th>
                <th>نشطين في البوت</th>
                <th>رسائل البوت</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((row) => (
                <tr key={row.day}>
                  <td className="mono">{row.day}</td>
                  <td>{row.visits}</td>
                  <td>
                    <span className={row.uniques ? "badge badge-active" : "badge badge-draft"}>
                      {row.uniques}
                    </span>
                  </td>
                  <td>{row.active}</td>
                  <td>{row.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <Link className="btn btn-ghost btn-sm" href="/admin/stats?days=1">
            اليوم
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/stats?days=7">
            7 أيام
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/stats?days=30">
            30 يوم
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🧹 تصفير الإحصائيات</h2>
        </div>
        <p className="small muted">
          يمسح عدّادات الزيارات والنشاط فقط — المستخدمون والمسابقات ومخزون الحسابات ما يتغيّروش.
        </p>
        <form action={resetStatsAction}>
          <input type="hidden" name="days" value="30" />
          <button className="btn btn-danger btn-sm" type="submit">
            تصفير الإحصائيات
          </button>
        </form>
      </div>
    </>
  );
}
