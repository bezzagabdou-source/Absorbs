"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Spinner, api, toast } from "../ui";

type Info = {
  ok: boolean;
  token: boolean;
  me: { id: number; username?: string; first_name?: string } | null;
  webhook: { url?: string; pending_update_count?: number; last_error_message?: string } | null;
  expectedUrl: string;
  join: { ok: boolean; title?: string; error?: string };
  store: string;
};

export default function BotPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState("");
  const [chatId, setChatId] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<Info>("/api/admin/bot");
      setInfo(r);
      setUrl(r.expectedUrl);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function run(op: string, extra: Record<string, unknown> = {}) {
    setBusy(op);
    try {
      const r = await api<{ ok: boolean }>("/api/admin/bot", { op, ...extra });
      toast(r.ok ? "تم بنجاح ✅" : "تعذّر التنفيذ — راجع التفاصيل", r.ok ? "ok" : "err");
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy("");
    }
  }

  if (!info) return <div className="card" style={{ padding: 40, display: "grid", placeItems: "center" }}><Spinner /></div>;

  const connected = Boolean(info.me) && Boolean(info.webhook?.url);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="row-between wrap">
          <div className="row" style={{ gap: 12 }}>
            <div style={{ fontSize: 34 }}>{connected ? "🟢" : "🔴"}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {info.me ? `${info.me.first_name ?? "FT Bot"} ${info.me.username ? `(@${info.me.username})` : ""}` : "البوت غير متصل"}
              </div>
              <div className="muted-2" style={{ fontSize: 12 }}>
                {connected ? "البوت يعمل ويستقبل الرسائل ✅" : "أكمل الإعداد: توكن + Webhook"}
              </div>
            </div>
          </div>
          <div className="row">
            <span className={`badge ${info.token ? "badge-green" : "badge-red"}`}>BOT_TOKEN {info.token ? "موجود" : "مفقود"}</span>
            <span className={`badge ${info.store === "redis" ? "badge-green" : "badge-gold"}`}>التخزين: {info.store}</span>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>🔗 ربط Webhook (أهم خطوة)</h3>
          <div className="hint" style={{ marginBottom: 8 }}>اضغط «ربط تلقائي» — سيضبط الرابط ويُفعّل أوامر البوت ووصفه.</div>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="row wrap">
            <button className="btn btn-primary" disabled={busy === "setWebhook"} onClick={() => run("setWebhook", { url })}>
              {busy === "setWebhook" ? <Spinner /> : "⚡️ ربط تلقائي"}
            </button>
            <button className="btn btn-ghost" onClick={() => run("setup")}>🧩 تفعيل الأوامر والوصف</button>
            <button className="btn btn-danger" onClick={() => run("deleteWebhook")}>🔌 حذف الربط</button>
          </div>
          <div className="card-soft" style={{ padding: 10, marginTop: 10 }}>
            <div className="row-between" style={{ fontSize: 11.5 }}>
              <span className="muted">Webhook الحالي:</span>
              <span style={{ fontWeight: 700, wordBreak: "break-all", textAlign: "left" }}>{info.webhook?.url || "—"}</span>
            </div>
            {info.webhook?.last_error_message && (
              <div className="badge badge-red" style={{ marginTop: 6, fontSize: 10.5 }}>⚠️ {info.webhook.last_error_message}</div>
            )}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            الرابط: <code>{info.expectedUrl}</code>
            <Copy text={info.expectedUrl} label="" />
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>🔒 قناة الاشتراك الإجباري</h3>
          <div className={`card-soft row-between`} style={{ padding: 11, marginBottom: 10 }}>
            <span className="row" style={{ gap: 8 }}>
              <span className={`dot ${info.join.ok ? "" : "off"}`} />
              <span style={{ fontWeight: 800, fontSize: 13 }}>{info.join.title ?? "—"}</span>
            </span>
            <span className={`badge ${info.join.ok ? "badge-green" : "badge-red"}`}>{info.join.ok ? "البوت أدمن ✅" : "غير متاح"}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.8 }}>
            لكي يعمل التحقق الحقيقي: أضف البوت أدمنًا في القناة بصلاحية «إدارة الأعضاء».
            إن لم يكن أدمنًا، سيتساهل البوت ويسمح بالمرور بعد الضغط على «تحقّقت».
          </p>
          {info.join.error && <div className="badge badge-red" style={{ marginTop: 8 }}>⚠️ {info.join.error}</div>}
          <a className="btn btn-ghost btn-sm" href="https://t.me/mxabdou" target="_blank" style={{ marginTop: 10 }}>📣 فتح القناة</a>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>🧪 رسالة تجربة</h3>
          <input
            className="input"
            placeholder="معرّف محادثتك (ADMIN_CHAT_ID) — أرسل /start للبوت أولًا ثم افتح @userinfobot"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <button className="btn btn-emerald" disabled={busy === "testMessage"} onClick={() => run("testMessage", { chatId })}>
            {busy === "testMessage" ? <Spinner /> : "📨 إرسال رسالة تجربة"}
          </button>
          <div className="hint">ستصلك رسالة على تيليجرام فورًا إن كان المعرّف صحيحًا.</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>📋 معلومات النظام</h3>
          <div className="col" style={{ gap: 7, fontSize: 12.5 }}>
            {[
              ["معرّف البوت", info.me ? String(info.me.id) : "—"],
              ["اسم المستخدم", info.me?.username ? `@${info.me.username}` : "—"],
              ["تحديثات معلّقة", String(info.webhook?.pending_update_count ?? 0)],
              ["التخزين", info.store],
              ["رابط الموقع", info.expectedUrl.split("/api/")[0]],
            ].map(([k, v]) => (
              <div key={k} className="row-between">
                <span className="muted">{k}</span>
                <span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
