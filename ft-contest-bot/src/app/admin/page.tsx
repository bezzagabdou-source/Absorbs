import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { accountsCount, listContests, participantsCount } from "@/lib/contests";
import { claimsCount, listClaims } from "@/lib/claims";
import { activeGroupContest, groupJoinsCount, linkedGroup } from "@/lib/groups";
import { getStats } from "@/lib/stats";
import { getSettings, ownerHandle } from "@/lib/settings";
import { getStore, storageInfo } from "@/lib/store";
import { currentOrigin, ensureBotReady } from "@/lib/botSetup";
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
  const origin = await currentOrigin();
  const botStatus = await ensureBotReady({ origin });
  const [settings, contests, users, totalClaims, recentClaims, stats] = await Promise.all([
    getSettings(),
    listContests(),
    usersCount(),
    getStore().zCount("claims:index"),
    listClaims(6),
    getStats(1),
  ]);

  const enriched = await Promise.all(
    contests.map(async (c) => ({
      contest: c,
      stock: await accountsCount(c.id),
      winners: await claimsCount(c.id),
      participants: await participantsCount(c.id),
    })),
  );

  const group = linkedGroup(settings);
  const groupContest = group ? await activeGroupContest() : null;
  const groupJoins = group ? await groupJoinsCount(group.chatId) : 0;

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

      {storage.backend === "memory" ? (
        <div className="alert alert-warn">
          ⚠️ <strong>التخزين مؤقت (بدون قاعدة بيانات)</strong> — هذا سبب «المسابقة ما كتبانش في البوت»:
          اللوحة والبوت كيخدمو في نسختين مختلفتين من السيرفر، وكل واحدة عندها ذاكرة بوحدها. زيد
          <span className="mono"> DATABASE_URL</span> (Neon/Upstash) في Vercel ثم Redeploy — وبعدها كل
          مسابقة كتزيد هنا كتظهر فوراً في البوت.
        </div>
      ) : (
        <div className="alert alert-ok">
          ✅ التخزين دائم (<span className="mono">{storage.backend}</span>) — المسابقات والمستخدمون
          والصور كيتحفظو ويظهرو في البوت مباشرة.
        </div>
      )}

      {!storage.configured ? (
        <div className="alert alert-warn">
          <b>⚠️ خطوة واحدة الباقية: أضف قاعدة بيانات.</b>
          <div className="small" style={{ marginTop: 6 }}>
            من غير قاعدة بيانات، المسابقات والحسابات تُحفظ في الذاكرة فقط وتضيع مع كل إعادة تشغيل.
            <br />
            1) افتح{" "}
            <a
              href="https://vercel.com/abdoubita986-gif/ft-bot/stores"
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
      ) : !botStatus.botOk ? (
        <div className="alert alert-err">
          ❌ توكن البوت غير صالح أو تيليغرام رفض الاتصال: {botStatus.details[0] || ""}
          <div className="small">جرّب <Link href="/status">صفحة التشخيص</Link>.</div>
        </div>
      ) : botStatus.webhookMatches ? (
        <div className="alert alert-ok">
          ✅ البوت مربوط ويستقبل الرسائل على @{botStatus.botUsername}
          {botStatus.fixed ? " — تم الربط الآن تلقائياً" : ""}
          {botStatus.pendingUpdates > 0 ? ` • ${botStatus.pendingUpdates} تحديث في الانتظار` : ""}
        </div>
      ) : (
        <div className="alert alert-err">
          ❌ البوت غير مربوط بالموقع (الويب هوك غير مسجّل) — لذلك لا يستجيب لأي رسالة.
          <div className="small" style={{ marginTop: 6 }}>
            <Link className="btn btn-primary btn-sm" href="/status?fix=1">
              🔧 إصلاح تلقائي الآن
            </Link>{" "}
            <Link className="small" href="/status" style={{ marginInlineStart: 8 }}>
              تفاصيل التشخيص
            </Link>
          </div>
        </div>
      )}

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
        <div className="stat">
          <b>{stats.uniquesToday}</b>
          <span>زائر اليوم</span>
        </div>
        <div className="stat">
          <b>{stats.activeToday}</b>
          <span>نشط في البوت اليوم</span>
        </div>
        <div className="stat">
          <b>{stats.activeOnline}</b>
          <span>نشط الآن</span>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <Link className="btn btn-primary btn-sm" href="/admin/stats">
          📈 الإحصائيات الكاملة (زوار + نشاط)
        </Link>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🏃 المجموعة وأسرع ضيف</h2>
          {group ? (
            <span className="badge badge-active">✅ {group.title}</span>
          ) : (
            <span className="badge badge-ended">غير مربوطة</span>
          )}
        </div>
        <p className="small muted">
          {group
            ? groupContest
              ? `مسابقة «${groupContest.title}» — الهدف ${groupContest.target} عضو • محسوب حالياً ${groupJoins} عضو.`
              : "المجموعة مربوطة لكن ما فيه مسابقة أسرع ضيف مفتوحة."
            : "أضف البوت للمجموعة ليتفعّل نظام أسرع ضيف تلقائياً، أو اربطها يدوياً من الصفحة."}
        </p>
        <div className="row">
          <Link className="btn btn-primary btn-sm" href="/admin/group">
            إدارة المجموعة
          </Link>
          <a className="small muted" href={`https://t.me/${settings.ownerUsername}`} target="_blank" rel="noreferrer">
            👑 المالك {ownerHandle(settings)} ↗
          </a>
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
