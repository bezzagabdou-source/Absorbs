import { headers } from "next/headers";
import { aiStatus } from "@/lib/ai";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getStore } from "@/lib/store";
import { storageInfo } from "@/lib/store";
import { tgCall } from "@/lib/telegram";
import {
  changePasswordAction,
  checkBotAction,
  checkChannelsAction,
  connectWebhookAction,
  disconnectWebhookAction,
  saveSettingsAction,
  setCommandsAction,
} from "../actions";
import { Flash } from "../ui";

export const dynamic = "force-dynamic";

type WebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const ai = aiStatus();
  const { ok, err } = await searchParams;
  const settings = await getSettings();
  const storage = storageInfo();
  const lastCheck = await getStore().get<{ at: number; results: { chat: string; ok: boolean; note: string }[] }>(
    "channels:lastCheck",
  );
  const headerBag = await headers();
  const host = headerBag.get("x-forwarded-host") || headerBag.get("host") || "your-domain.vercel.app";
  const proto = headerBag.get("x-forwarded-proto") || "https";
  const webhookUrl = `${proto}://${host}/api/telegram/webhook`;

  let webhook: WebhookInfo | null = null;
  if (settings.botToken) {
    const info = await tgCall<WebhookInfo>("getWebhookInfo");
    if (info.ok && info.result) webhook = info.result;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الإعدادات والبوت</h1>
          <p className="muted">تحكم كامل: التوكن، القناة، الويب هوك، النصوص، والحماية.</p>
        </div>
      </div>

      <Flash ok={ok} err={err} />

      <div className="card">
        <div className="card-title">
          <h2>🤖 حالة البوت</h2>
          {settings.botUsername ? (
            <a
              className="badge badge-active"
              href={`https://t.me/${settings.botUsername}`}
              target="_blank"
              rel="noreferrer"
            >
              @{settings.botUsername} ↗
            </a>
          ) : (
            <span className="badge badge-draft">غير مربوط</span>
          )}
        </div>

        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <tbody>
              <tr>
                <td style={{ width: 200 }}>التوكن</td>
                <td>{settings.botToken ? "✅ مضبوط" : "❌ غير مضبوط"}</td>
              </tr>
              <tr>
                <td>يوزر البوت</td>
                <td className="mono">{settings.botUsername || "—"}</td>
              </tr>
              <tr>
                <td>رابط الويب هوك المطلوب</td>
                <td className="mono small">{webhookUrl}</td>
              </tr>
              <tr>
                <td>الويب هوك المسجّل حالياً</td>
                <td className="mono small">
                  {webhook === null ? "—" : webhook.url || "غير مسجّل (البوت لا يستقبل رسائل)"}
                </td>
              </tr>
              <tr>
                <td>تحديثات معلّقة</td>
                <td>{webhook?.pending_update_count ?? 0}</td>
              </tr>
              {webhook?.last_error_message ? (
                <tr>
                  <td>آخر خطأ</td>
                  <td className="small" style={{ color: "#ffb4b4" }}>
                    {webhook.last_error_message}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td>حماية الويب هوك</td>
                <td>{settings.webhookSecret ? "✅ سر مُفعّل" : "⚠️ بدون سر (يُنشأ عند الربط)"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="row">
          <form action={checkBotAction}>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={!settings.botToken}>
              🔍 فحص التوكن
            </button>
          </form>
          <form action={connectWebhookAction}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!settings.botToken}>
              🔗 ربط الويب هوك بالموقع
            </button>
          </form>
          <form action={setCommandsAction}>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={!settings.botToken}>
              ⌨️ ضبط أوامر البوت
            </button>
          </form>
          <form action={disconnectWebhookAction}>
            <button className="btn btn-danger btn-sm" type="submit">
              ⛔️ فصل الويب هوك
            </button>
          </form>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          بعد أي تعديل على التوكن اضغط «فحص التوكن» ثم «ربط الويب هوك» — الربط يستخدم رابط هذا
          النشر الحالي تلقائياً.
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>⚙️ إعدادات البوت والمسابقات</h2>
        </div>
        <form action={saveSettingsAction}>
          <input type="hidden" name="settingsForm" value="1" />
          <div className="grid-2">
            <label className="field">
              <span>توكن البوت</span>
              <input
                type="password"
                name="botToken"
                placeholder={settings.botToken ? "•••••••• (محفوظ — اتركه فاضي ليبقى)" : "123456:ABC..."}
              />
              <small>من @BotFather. لو حطيت توكن جديد، اضغط «فحص التوكن» بعد الحفظ.</small>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>قنوات الاشتراك الإجباري (كل واحدة في سطر)</span>
              <textarea
                name="requiredChannels"
                rows={4}
                defaultValue={(settings.requiredChannels || []).join("\n")}
                placeholder={"@F_5_5_T\n@Ft_efootbal\n@F_M_M_T"}
                className="mono"
              />
              <small>
                البوت ما كيخليش أي واحد يستعملو حتى يشترك في <b>كل</b> هاد القنوات. لازم البوت يكون{" "}
                <b>أدمن</b> في كل قناة، وإلا ما يقدرش يتحقق من الاشتراك.
              </small>
            </label>
            <label className="field">
              <span>قناة قديمة / رابط (اختياري)</span>
              <input name="channelChat" defaultValue={settings.channelChat} placeholder="@mychannel" className="mono" />
              <input name="channelUrl" defaultValue={settings.channelUrl} placeholder="https://t.me/mychannel" className="mono" />
              <small>كانت للنسخة القديمة — القائمة فوق هي اللي كتتحكم.</small>
            </label>
            <label className="field">
              <span>يوزر المالك (يظهر في البوت)</span>
              <input
                name="ownerUsername"
                defaultValue={settings.ownerUsername}
                placeholder="F_Y_Y_T"
                className="mono"
              />
              <small>يظهر في زر «👑 المالك» وكل رسائل الدعم.</small>
            </label>
            <label className="field">
              <span>يوزر الدعم</span>
              <input
                name="supportUsername"
                defaultValue={settings.supportUsername}
                placeholder="F_Y_Y_T"
                className="mono"
              />
            </label>
            <label className="field">
              <span>شات سجل الفوز (اختياري)</span>
              <input
                name="logChatId"
                defaultValue={settings.logChatId}
                placeholder="-1001234567890"
                className="mono"
              />
              <small>تُرسل إليه كل عملية تسليم جائزة.</small>
            </label>
            <label className="field">
              <span>آي دي الأدمن (مفصولة بفاصلة)</span>
              <input
                name="adminIds"
                defaultValue={settings.adminIds.join(", ")}
                placeholder="123456789, 987654321"
                className="mono"
              />
              <small>يستقبلون إشعار فوري عند تسليم جائزة أو نفاد المخزون.</small>
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <span>آي دي مجموعة أسرع ضيف</span>
              <input
                name="groupChat"
                defaultValue={settings.groupChat}
                placeholder="-1001234567890"
                className="mono"
              />
              <small>يُملأ تلقائياً عند إضافة البوت للمجموعة. الإدارة الكاملة من صفحة «المجموعة وأسرع ضيف».</small>
            </label>
            <label className="field">
              <span>رابط المجموعة (اختياري)</span>
              <input
                name="groupUrl"
                defaultValue={settings.groupUrl}
                placeholder="https://t.me/mygroup"
                className="mono"
              />
            </label>
            <label className="field">
              <span>هدف مسابقة أسرع ضيف</span>
              <input
                name="groupTarget"
                type="number"
                min={1}
                defaultValue={settings.groupTarget}
              />
              <small>عدد الأعضاء المطلوب للفوز — يُستخدم عند إنشاء المسابقة تلقائياً.</small>
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <input
                type="checkbox"
                name="autoApproveJoins"
                defaultChecked={settings.autoApproveJoins}
                style={{ width: "auto", marginInlineEnd: 8 }}
              />
              <span style={{ display: "inline" }}>قبول طلبات الانضمام للمجموعة تلقائياً</span>
            </label>
            <label className="field">
              <input
                type="checkbox"
                name="requireJoin"
                defaultChecked={settings.requireJoin}
                style={{ width: "auto", marginInlineEnd: 8 }}
              />
              <span style={{ display: "inline" }}>
                الاشتراك في القنوات إجباري قبل استعمال البوت (موصى به ✅)
              </span>
            </label>
            <label className="field">
              <input
                type="checkbox"
                name="autoGrant"
                defaultChecked={settings.autoGrant}
                style={{ width: "auto", marginInlineEnd: 8 }}
              />
              <span style={{ display: "inline" }}>
                تسليم الحساب تلقائياً لحظة إكمال الهدف (بدون ضغط «ربح الحساب»)
              </span>
            </label>
          </div>

          <div className="card-title" style={{ marginTop: 18 }}>
            <h2>🔔 فحص قنوات الاشتراك</h2>
            <span className="hint">تأكد أن البوت يشوف القنوات</span>
          </div>
          <p className="muted small">
            اضغط الزر باش نتأكدو أن البوت أدمن في كل قناة. إذا ظهر خطأ، زيد البوت أدمن في القناة ثم أعد الفحص.
          </p>
          {lastCheck?.results?.length ? (
            <div className="mono-box" style={{ marginBottom: 10 }}>
              {lastCheck.results
                .map((row) => `${row.ok ? "✅" : "❌"} ${row.chat} — ${row.note}`)
                .join("\n")}
            </div>
          ) : null}
          <button className="btn btn-ghost" type="submit" formAction={checkChannelsAction}>
            🔍 فحص القنوات الآن
          </button>

          <div className="card-title" style={{ marginTop: 18 }}>
            <h2>🤖 المساعد الذكي</h2>
            {ai.available ? (
              <span className="badge badge-active">🟢 {ai.provider} — {ai.model}</span>
            ) : (
              <span className="badge badge-ended">🔴 بلا مفتاح</span>
            )}
          </div>
          <div className="grid-2">
            <label className="field">
              <input
                type="checkbox"
                name="aiEnabled"
                defaultChecked={settings.aiEnabled}
                style={{ width: "auto", marginInlineEnd: 8 }}
              />
              <span style={{ display: "inline" }}>تفعيل المساعد الذكي في البوت (الخاص فقط)</span>
            </label>
            <label className="field">
              <span>موديل مخصص (اختياري)</span>
              <input
                name="aiModel"
                defaultValue={settings.aiModel}
                placeholder="gemini-2.5-flash"
                className="mono"
              />
              <small>خليه خاوي إلا بغيت الموديل الافتراضي ديال المزوّد.</small>
            </label>
          </div>

          <label className="field">
            <span>رسالة الترحيب القصيرة</span>
            <textarea name="welcomeText" rows={2} defaultValue={settings.welcomeText} />
          </label>
          <label className="field">
            <span>نص الشروط</span>
            <textarea name="rulesText" rows={8} defaultValue={settings.rulesText} />
          </label>

          <button className="btn btn-primary" type="submit">
            حفظ الإعدادات
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>🔐 كلمة مرور اللوحة</h2>
        </div>
        <form action={changePasswordAction}>
          <div className="grid-2">
            <label className="field">
              <span>كلمة المرور الحالية</span>
              <input type="password" name="current" required />
            </label>
            <label className="field">
              <span>الجديدة</span>
              <input type="password" name="next" required minLength={6} />
            </label>
            <label className="field">
              <span>تأكيد الجديدة</span>
              <input type="password" name="confirm" required minLength={6} />
            </label>
          </div>
          <button className="btn btn-blue" type="submit">
            تحديث كلمة المرور
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>💾 التخزين</h2>
          <span className={storage.configured ? "badge badge-active" : "badge badge-ended"}>
            {storage.backend}
          </span>
        </div>
        {storage.configured ? (
          <p className="small muted">
            البيانات تُحفظ في {storage.backend === "redis" ? "Upstash Redis" : "Postgres"} — دائمة
            وموثوقة.
          </p>
        ) : (
          <div className="alert alert-warn">
            البيانات حالياً في الذاكرة فقط (تختفي بعد إعادة تشغيل السيرفر، والبوت لا يرى المسابقات).
            أضف قاعدة بيانات مجاناً:
            <br />
            <a
              href="https://vercel.com/abdoubita986-gif/ft-bot/stores"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline" }}
            >
              Vercel ← Storage ← Upstash Redis
            </a>{" "}
            ← Connect على مشروع ft-bot ← Redeploy. المتغيرات تُضاف تلقائياً.
          </div>
        )}
      </div>
    </>
  );
}
