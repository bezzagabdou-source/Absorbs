import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { ensureBotReady, BOT_COMMANDS } from "@/lib/botSetup";
import { listContests } from "@/lib/contests";
import { getStore, storageInfo } from "@/lib/store";
import { usersCount } from "@/lib/users";
import { linkedGroup } from "@/lib/groups";
import { getSettings, ownerHandle } from "@/lib/settings";
import { requiredChannelsOf } from "@/lib/bot";
import { tgCall } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function Row({
  ok,
  title,
  children,
}: {
  ok: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        marginBottom: 12,
        borderColor: ok ? "rgba(46,230,168,.35)" : "rgba(255,107,107,.35)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {ok ? "✅" : "❌"} {title}
        </h3>
        <span className={ok ? "badge badge-active" : "badge badge-ended"}>
          {ok ? "سليم" : "يحتاج إصلاح"}
        </span>
      </div>
      {children ? <div className="small muted" style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ fix?: string }>;
}) {
  const { fix } = await searchParams;
  const ai = aiStatus();
  const status = await ensureBotReady({ force: fix === "1" });
  const [contests, storage, users, claims, settings] = await Promise.all([
    listContests(),
    Promise.resolve(storageInfo()),
    usersCount(),
    getStore().zCount("claims:index"),
    getSettings(),
  ]);
  const required = requiredChannelsOf(settings);
  const channelChecks = await Promise.all(
    required.map(async (chat) => {
      const res = await tgCall<{ title?: string }>("getChat", { chat_id: chat });
      return {
        chat,
        ok: Boolean(res.ok && res.result),
        note: res.ok ? res.result?.title || "" : res.description || "تعذّر",
      };
    }),
  );
  const channelsOk = required.length === 0 || channelChecks.every((c) => c.ok);
  const active = contests.filter((c) => c.status === "active");
  const group = linkedGroup(settings);
  const allGood =
    status.botOk &&
    status.webhookMatches &&
    status.updatesOk &&
    storage.configured &&
    active.length > 0 &&
    channelsOk;

  return (
    <main className="landing" style={{ maxWidth: 820 }}>
      <div className="page-head" style={{ marginTop: 24 }}>
        <div>
          <h1>🩺 تشخيص البوت</h1>
          <p className="muted">هذه الصفحة تفحص البوت مباشرة من تيليغرام وتخبرك بالضبط شنو ناقص.</p>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin">
          لوحة التحكم
        </Link>
      </div>

      {!storage.configured ? (
        <div className="alert alert-warn">
          ⚠️ <strong>ما كاينش قاعدة بيانات</strong> — وهادشي هو السبب الأول باش «المسابقة ما كتبانش في
          البوت»: اللوحة والبوت ما كيتشاركوش نفس الذاكرة، وأي Redeploy كيمسح كلشي. زيد
          <span className="mono"> DATABASE_URL</span> ثم Redeploy.
        </div>
      ) : (
        <div className="alert alert-ok">
          ✅ قاعدة البيانات مربوطة (<span className="mono">{storage.backend}</span>) — كلشي محفوظ.
        </div>
      )}

      <div className={`alert ${allGood ? "alert-ok" : "alert-warn"}`}>
        {allGood
          ? "كل شيء سليم — البوت يستقبل الرسائل والمسابقات جاهزة 🎉"
          : "فيه شيء ناقص تحت — اتبع الخطوات بالترتيب."}
        {status.fixed ? (
          <div className="small" style={{ marginTop: 6 }}>
            🔧 تم الآن ربط الويب هوك تلقائياً — جرّب تكتب /start للبوت.
          </div>
        ) : null}
      </div>

      <Row
        ok={status.tokenConfigured && status.botOk}
        title={`توكن البوت${status.botUsername ? ` — @${status.botUsername}` : ""}`}
      >
        {status.botOk
          ? "التوكن صالح وتيليغرام يتعرّف على البوت."
          : "التوكن غير مضبوط أو غير صالح. أضف TELEGRAM_BOT_TOKEN في Vercel ثم Redeploy، أو ضعه من الإعدادات."}
      </Row>

      <Row ok={status.webhookMatches} title="ربط الويب هوك (استقبال الرسائل)">
        <div className="mono-box" style={{ marginBottom: 8 }}>
          المطلوب: {status.webhookExpected}
          <br />
          المسجّل: {status.webhookCurrent || "— لا شيء —"}
        </div>
        {status.webhookMatches
          ? "البوت مربوط ويستقبل رسائل تيليغرام."
          : "رابط الويب هوك غير مطابق. اضغط الزر أسفل الصفحة لإصلاحه تلقائياً."}
        {status.pendingUpdates > 0 ? (
          <div>⏳ يوجد {status.pendingUpdates} تحديث في الانتظار عند تيليغرام.</div>
        ) : null}
        {status.lastError ? <div style={{ color: "#ffb4b4" }}>آخر خطأ من تيليغرام: {status.lastError}</div> : null}
      </Row>

      <Row ok={status.updatesOk} title="تحديثات المجموعة (نظام أسرع ضيف)">
        {status.updatesOk
          ? "البوت يستقبل طلبات الانضمام للمجموعة وأعضاء جدد — نظام أسرع ضيف يعمل."
          : "الويب هوك لا يستقبل chat_join_request — الزر أسفل الصفحة يعيد ضبطه تلقائياً."}
        {group ? (
          <div style={{ marginTop: 6 }}>
            👥 المجموعة المربوطة: {group.title} <span className="mono">({group.chatId})</span>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            👥 ما فيه مجموعة مربوطة — أضف البوت للمجموعة فيتفعّل النظام تلقائياً، أو اربطها من{" "}
            <Link href="/admin/group" style={{ textDecoration: "underline" }}>
              صفحة المجموعة
            </Link>
            .
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          👑 المالك: <a href={`https://t.me/${settings.ownerUsername}`}>{ownerHandle(settings)}</a>
        </div>
      </Row>

      <Row ok={storage.configured} title="قاعدة البيانات (حفظ المسابقات والحسابات)">
        {storage.configured ? (
          <>التخزين الحالي: {storage.backend} — البيانات دائمة.</>
        ) : (
          <>
            لا توجد قاعدة بيانات، يعني المسابقات والحسابات تضيع مع كل إعادة تشغيل، والبوت يشوف صفر
            مسابقات. أضف <b>Upstash Redis</b> مجاناً: Vercel ← مشروع ft-bot ← Storage ← Create ←
            Connect ← Redeploy.
          </>
        )}
      </Row>

      <Row ok={channelsOk} title={`قنوات الاشتراك الإجباري (${required.length})`}>
        {required.length === 0 ? (
          "ما كاينش قنوات مطلوبة — تقدر تزيدهم من الإعدادات."
        ) : (
          <div className="mono-box" style={{ marginBottom: 8 }}>
            {channelChecks.map((c) => `${c.ok ? "✅" : "❌"} ${c.chat}${c.note ? ` — ${c.note}` : ""}`).join("\n")}
          </div>
        )}
        {channelsOk
          ? "البوت يشوف كل القنوات ويقدر يتحقق من الاشتراك."
          : "زيد البوت أدمن في القنوات اللي فيها ❌ ثم أعد الفحص."}
        <div style={{ marginTop: 8 }}>
          <Link href="/admin/settings">تعديل القنوات / فحص فوري ←</Link>
        </div>
      </Row>

      <Row ok={active.length > 0} title={`المسابقات المفتوحة (${active.length})`}>
        {active.length > 0 ? (
          <>المستخدمون يشوفون {active.length} مسابقة في البوت.</>
        ) : (
          <>
            ما فيه مسابقة مفتوحة — أنشئ واحدة من{" "}
            <Link href="/admin/contests" style={{ textDecoration: "underline" }}>
              لوحة التحكم ← المسابقات
            </Link>{" "}
            (200 جهة مثلاً) وأضف الحسابات للمخزون ثم فعّلها.
          </>
        )}
      </Row>

      <div className="card">
        <div className="card-title">
          <h2>أرقام سريعة</h2>
          <span className="hint">{new Date().toLocaleString("ar-EG")}</span>
        </div>
        <div className="stats" style={{ marginBottom: 0 }}>
          <div className="stat">
            <b>{users}</b>
            <span>مستخدم في البوت</span>
          </div>
          <div className="stat">
            <b>{contests.length}</b>
            <span>مسابقة</span>
          </div>
          <div className="stat">
            <b>{claims}</b>
            <span>جائزة مسلّمة</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn btn-primary" href="/status?fix=1">
          🔧 إصلاح تلقائي الآن (ربط الويب هوك + ضبط الأوامر)
        </Link>
        {status.botUsername ? (
          <a className="btn btn-ghost" href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer">
            🚀 افتح البوت وجرّب /start
          </a>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>تفاصيل تقنية</h2>
        </div>
        <ul className="small muted" style={{ paddingInlineStart: 20, margin: 0 }}>
          {status.details.length ? (
            status.details.map((line) => <li key={line}>{line}</li>)
          ) : (
            <li>لا ملاحظات — كل الفحوصات مرّت.</li>
          )}
          <li>الأسرار محمية: {status.secretProtected ? "نعم (secret_token)" : "لا"}</li>
          <li>
            المساعد الذكي: {ai.available ? `مفعّل — ${ai.provider} (${ai.model})` : "غير مفعّل (بلا مفتاح)"}
          </li>
          <li>
            الأوامر المسجّلة: {BOT_COMMANDS.map((c) => `/${c.command}`).join(" ، ")} —{" "}
            {settings.botUsername ? "تظهر في زر القائمة" : "تُضبط تلقائياً بعد الربط"}
          </li>
        </ul>
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          نفس المعلومات متاحة بصيغة JSON للتقنيين: <span className="mono">/api/telegram/status</span>
        </p>
      </div>
    </main>
  );
}
