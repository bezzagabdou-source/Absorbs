import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { accountsCount, listContests, participantsCount } from "@/lib/contests";
import { claimsCount, listClaims } from "@/lib/claims";
import { getSettings } from "@/lib/settings";
import { getStore, storageInfo } from "@/lib/store";
import { usersCount } from "@/lib/users";
import { Flash, StatusBadge, dateText } from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { ok, err } = await searchParams;
  const [settings, contests, users, totalClaims, recentClaims] = await Promise.all([
    getSettings(),
    listContests(),
    usersCount(),
    getStore().zCount("claims:index"),
    listClaims(6),
  ]);

  const enriched = await Promise.all(
    contests.map(async (c) => ({
      contest: c,
      stock: await accountsCount(c.id),
      winners: await claimsCount(c.id),
      participants: await participantsCount(c.id),
    })),
  );

  const active = enriched.filter((e) => e.contest.status === "active");
  const totalStock = enriched.reduce((sum, e) => sum + e.stock, 0);
  const storage = storageInfo();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>لوحة المعلومات</h1>
          <p className="muted">نظرة سريعة على البوت والمسابقات والمخزون.</p>
        </div>
        <div className="row">
          <Link className="btn btn-primary btn-sm" href="/admin/contests">
            ➕ مسابقة جديدة
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/admin/settings">
            ⚙️ الإعدادات
          </Link>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      {!storage.configured ? (
        <div className="alert alert-warn">
          <b>⚠️ خطوة واحدة الباقية: أضف قاعدة بيانات.</b>
          <div className="small" style={{ marginTop: 6 }}>
            من غير قاعدة بيانات، المسابقات والحسابات تُحفظ في الذاكرة فقط وتضيع مع كل إعادة تشغيل.
            <br />
            1) افتح{" "}
            <a
              href="https://vercel.com/dashboard/stores"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline" }}
            >
              Vercel ← Storage
            </a>{" "}
            2) أنشئ <b>Upstash Redis</b> (مجاني) 3) اضغط <b>Connect</b> على مشروع ft-bot 4) أعد
            النشر (Redeploy) — المتغيرات تُضاف تلقائياً.
          </div>
        </div>
      ) : null}

      {!settings.botToken ? (
        <div className="alert alert-warn">
          ⚠️ لم يتم ضبط توكن البوت بعد.{" "}
          <Link href="/admin/settings">أضِف التوكن من الإعدادات</Link> ثم اضغط «ربط الويب هوك».
        </div>
      ) : !settings.botUsername ? (
        <div className="alert alert-warn">
          ⚠️ البوت غير مربوط بالموقع.{" "}
          <Link href="/admin/settings">روح للإعدادات واضغط «ربط الويب هوك»</Link>.
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <b>{users}</b>
          <span>مستخدم داخل البوت</span>
        </div>
        <div className="stat">
          <b>{active.length}</b>
          <span>مسابقة مفتوحة</span>
        </div>
        <div className="stat">
          <b>{totalStock}</b>
          <span>حساب في المخزون</span>
        </div>
        <div className="stat">
          <b>{totalClaims}</b>
          <span>جائزة مسلّمة</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>المسابقات</h2>
          <span className="hint">{enriched.length} مسابقة</span>
        </div>
        {enriched.length === 0 ? (
          <p className="muted">
            ما فيه مسابقات بعد.{" "}
            <Link href="/admin/contests">أنشئ أول مسابقة</Link> — حدّد 200 جهة وأضف الحسابات.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المسابقة</th>
                  <th>الحالة</th>
                  <th>الهدف</th>
                  <th>الحسابات</th>
                  <th>الفائزون</th>
                  <th>مشاركون</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {enriched.map(({ contest, stock, winners, participants }) => (
                  <tr key={contest.id}>
                    <td>
                      <b>{contest.title}</b>
                      <div className="small muted mono">{contest.id}</div>
                    </td>
                    <td>
                      <StatusBadge status={contest.status} />
                    </td>
                    <td>{contest.target} جهة</td>
                    <td>
                      <span className={stock === 0 ? "badge badge-ended" : "badge badge-active"}>
                        {stock}
                      </span>
                    </td>
                    <td>
                      {winners} / {contest.winners}
                    </td>
                    <td>{participants}</td>
                    <td>
                      <Link className="btn btn-ghost btn-sm" href={`/admin/contests/${contest.id}`}>
                        إدارة
                      </Link>
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
          <h2>آخر الجوائز المسلّمة</h2>
          <Link className="small" href="/admin/claims">
            الكل ↗
          </Link>
        </div>
        {recentClaims.length === 0 ? (
          <p className="muted">لم يتم تسليم أي جائزة بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>المسابقة</th>
                  <th>الإيميل</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {recentClaims.map((c) => (
                  <tr key={`${c.contestId}-${c.userId}`}>
                    <td>
                      {c.userName} <span className="small muted mono">{c.userId}</span>
                    </td>
                    <td>{c.contestTitle}</td>
                    <td className="mono small">{c.email}</td>
                    <td className="small muted">{dateText(c.at)}</td>
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
