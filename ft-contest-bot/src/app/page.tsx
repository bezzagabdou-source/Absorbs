import Link from "next/link";
import { headers } from "next/headers";
import { after } from "next/server";
import { currentOrigin, ensureBotReady } from "@/lib/botSetup";
import { accountsCount, listContests } from "@/lib/contests";
import { claimsCount } from "@/lib/claims";
import { linkedGroup } from "@/lib/groups";
import { getSettings, ownerHandle } from "@/lib/settings";
import { getStats, trackVisit } from "@/lib/stats";
import { usersCount } from "@/lib/users";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  if (status === "active") return <span className="badge badge-active">🟢 مفتوحة الآن</span>;
  if (status === "ended") return <span className="badge badge-ended">🔴 انتهت</span>;
  return <span className="badge badge-draft">⚪️ قريباً</span>;
}

export default async function LandingPage() {
  // إصلاح ذاتي: يربط البوت بالموقع تلقائياً بعد إرسال الصفحة (بدون أي أمر يدوي)
  const origin = await currentOrigin();
  const headerBag = await headers();
  const ip =
    headerBag.get("x-forwarded-for")?.split(",")[0]?.trim() || headerBag.get("x-real-ip") || "";
  const ua = headerBag.get("user-agent") || "";
  after(async () => {
    await Promise.all([
      ensureBotReady({ origin }).catch(() => undefined),
      trackVisit({ ip, ua }).catch(() => undefined),
    ]);
  });

  const [settings, contests, users, totalClaims, stats] = await Promise.all([
    getSettings(),
    listContests(),
    usersCount(),
    getStore().zCount("claims:index"),
    getStats(1),
  ]);

  const visible = contests.filter((c) => c.status !== "draft");
  const active = visible.filter((c) => c.status === "active");
  const botLink = settings.botUsername ? `https://t.me/${settings.botUsername}` : "";
  const group = linkedGroup(settings);
  const ownerHref = `https://t.me/${settings.ownerUsername}`;
  const groupLink = settings.botUsername
    ? `https://t.me/${settings.botUsername}?start=fastest`
    : botLink;

  const cards = await Promise.all(
    visible.map(async (contest) => ({
      contest,
      stock: await accountsCount(contest.id),
      winners: await claimsCount(contest.id),
    })),
  );

  return (
    <>
      <header className="public-header">
        <div className="brand">
          <span className="brand-mark">🏆</span>
          <span>
            مسابقات FT
            <small>اربح حسابات بالجهات — بوت تيليغرام</small>
          </span>
        </div>
        <nav className="row">
          {botLink ? (
            <a className="btn btn-primary btn-sm" href={botLink} target="_blank" rel="noreferrer">
              🚀 افتح البوت
            </a>
          ) : null}
          <Link className="btn btn-ghost btn-sm" href="/admin">
            🛠 لوحة التحكم
          </Link>
        </nav>
      </header>

      <main className="landing">
        <section className="hero">
          <span className="eyebrow">⚡️ مسابقة بعدد جهات محدود — أول من يوصل يفوز</span>
          <h1>
            اجمع <span className="gradient-text">200 جهة</span>
            <br />
            واربح الحساب كامل 🎁
          </h1>
          <p className="lead">
            مسابقات FT على تيليغرام: كل شخص يدخل من رابطك = جهة في رصيدك، وكل عضو تضيفه لمجموعتنا
            = جهة في مسابقة «أسرع ضيف». أول من يوصل الهدف يستلم إيميل وكلمة سر الحساب فوراً.
          </p>
          <div className="hero-actions">
            {botLink ? (
              <a className="btn btn-primary" href={botLink} target="_blank" rel="noreferrer">
                🎯 ابدأ المشاركة الآن
              </a>
            ) : (
              <span className="badge badge-warn">ضبط البوت من لوحة التحكم أولاً</span>
            )}
            <Link className="btn btn-ghost" href="/admin">
              إدارة المسابقات
            </Link>
          </div>
          <div className="hero-stats">
            <div className="stat-mini">
              <b>{active.length}</b>
              <span>مسابقة مفتوحة</span>
            </div>
            <div className="stat-mini">
              <b>{users}</b>
              <span>مشارك في البوت</span>
            </div>
            <div className="stat-mini">
              <b>{totalClaims}</b>
              <span>جائزة تم تسليمها</span>
            </div>
            <div className="stat-mini">
              <b>{stats.visitsTotal}</b>
              <span>زيارة للموقع</span>
            </div>
          </div>
        </section>

        <div className="section-title">
          <h2>المسابقات المتاحة</h2>
          <span>
            {visible.length
              ? "اضغط على المسابقة للدخول إليها من تيليغرام"
              : "لا توجد مسابقات منشورة حالياً"}
          </span>
        </div>

        {cards.length === 0 ? (
          <div className="card">
            <h3>ما فيه مسابقات بعد 🕒</h3>
            <p className="muted">
              من لوحة التحكم أضف مسابقة جديدة، حدّد عدد الجهات (مثلاً 200)، أضف الحسابات في
              المخزون، ثم فعّل المسابقة وستظهر هنا مباشرة.
            </p>
            <Link className="btn btn-primary btn-sm" href="/admin/contests">
              ➕ إنشاء مسابقة
            </Link>
          </div>
        ) : (
          <div className="contest-grid">
            {cards.map(({ contest, stock, winners }) => {
              const deepLink = settings.botUsername
                ? `https://t.me/${settings.botUsername}?start=c_${contest.id}`
                : "";
              return (
                <article className="land-card" key={contest.id}>
                  {contest.imageUrl ? (
                    <img
                      className="land-image"
                      src={`/api/contests/${contest.id}/image`}
                      alt={contest.title}
                      loading="lazy"
                    />
                  ) : null}
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    {statusBadge(contest.status)}
                              <span className="badge badge-gold">
                      {contest.mode === "group" ? "🏃" : "🎯"} {contest.target} جهة
                    </span>
                  </div>
                  <h3>{contest.title}</h3>
                  {contest.description ? <p className="small">{contest.description}</p> : null}
                  <div className="small muted">
                    🎁 {contest.prize || "حساب FT كامل"}
                    <br />
                    👥 فائزون: {winners} / {contest.winners} • 📦 حسابات متاحة: {stock}
                  </div>
                  {deepLink ? (
                    <a className="btn btn-primary btn-sm" href={deepLink} target="_blank" rel="noreferrer">
                      شارك في المسابقة
                    </a>
                  ) : (
                    <span className="small muted">سيتم تفعيل الرابط بعد ضبط البوت</span>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="section-title">
          <h2>كيف تعمل المسابقة؟</h2>
        </div>
        <div className="steps">
          <div className="step">
            <b>1</b>
            <h4>افتح البوت وابدأ</h4>
            <p className="small">
              اضغط «ابدأ» في البوت، اختار المسابقة، وبيوصلك رابط إحالة خاص فيك.
            </p>
          </div>
          <div className="step">
            <b>2</b>
            <h4>اجمع الجهات</h4>
            <p className="small">
              كل شخص جديد يدخل من رابطك = جهة. البوت يحسبها لك تلقائياً ويعرض رصيدك وترتيبك.
            </p>
          </div>
          <div className="step">
            <b>3</b>
            <h4>أسرع ضيف في المجموعة</h4>
            <p className="small">
              البوت مربوط بمجموعة FT: كل مشارك ياخذ رابط دعوة خاص، وكل عضو يدخل منه = جهة. الطلبات
              تُقبل تلقائياً والترتيب يتحدّث مباشرة.
            </p>
          </div>
          <div className="step">
            <b>4</b>
            <h4>اضغط «ربح الحساب»</h4>
            <p className="small">
              لما توصل للعدد المطلوب، البوت يسلّمك الإيميل وكلمة السر فوراً (وسجّل الفوز عند الإدارة).
            </p>
          </div>
        </div>

      </main>

      <footer className="footer">
        <span>
          © {new Date().getFullYear()} بوت مسابقات FT — المالك{" "}
          <a className="small" href={ownerHref} target="_blank" rel="noreferrer">
            {ownerHandle(settings)} ↗
          </a>
        </span>
        <span className="row">
          {groupLink ? (
            <a className="small" href={groupLink} target="_blank" rel="noreferrer">
              🏃 أسرع ضيف ↗
            </a>
          ) : null}
          <Link className="small" href="/admin">
            لوحة التحكم ↗
          </Link>
        </span>
      </footer>
    </>
  );
}
