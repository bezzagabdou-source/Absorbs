"use client";
import { useEffect, useRef, useState } from "react";
import { Field, Spinner, api, relTime, toast } from "../ui";

type Log = {
  at: string;
  prompt: string;
  reply: string;
  provider: string;
  actions: { name: string; ok: boolean; detail?: string }[];
};

const IDEAS = [
  "اجعل الهدية اليومية من 2 إلى 5 نقاط",
  "أضف جائزة PlayStation Plus بسعر 45 نقطة",
  "ارفع مكافأة الإحالة إلى 5 نقاط",
  "أضف مهمة: اشترك في قناة @mxabdou مقابل 3 نقاط",
  "غيّر قوانين البوت: ممنوع استخدام أكثر من حساب",
  "أعطِ @username 50 نقطة",
  "جهّز مسابقة نهاية الأسبوع بجائزة 100 نقطة",
  "بث: 🎉 الهدية اليومية تضاعفت اليوم فقط!",
];

export default function AIConsole() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [chat, setChat] = useState<{ role: "user" | "ai"; text: string; actions?: Log["actions"]; provider?: string }[]>([]);
  const [keyOpen, setKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("auto");
  const [saving, setSaving] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api<{ logs: Log[]; settings?: { provider?: string; model?: string; apiBase?: string; enabled?: boolean } }>(
          "/api/admin/ai"
        );
        setLogs(r.logs ?? []);
        setProvider(r.settings?.provider || "auto");
        setModel(r.settings?.model ?? "");
        setApiBase(r.settings?.apiBase ?? "");
      } catch {
        /* ignore */
      }
    })();
  }, []);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [chat, busy]);

  async function send(text?: string) {
    const p = (text ?? prompt).trim();
    if (!p) return;
    setPrompt("");
    setChat((c) => [...c, { role: "user", text: p }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; results: { name: string; ok: boolean; detail?: string }[]; provider: string }>(
        "/api/admin/ai",
        { prompt: p }
      );
      setChat((c) => [...c, { role: "ai", text: r.reply, actions: r.results, provider: r.provider }]);
    } catch (e) {
      setChat((c) => [...c, { role: "ai", text: `⚠️ ${(e as Error).message}` }]);
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveKey() {
    if (!apiKey.trim() && !apiBase.trim() && !model.trim() && provider === "auto") return;
    setSaving(true);
    try {
      const ai: Record<string, unknown> = { provider, model, apiBase };
      if (apiKey.trim()) ai.apiKey = apiKey.trim();
      await api("/api/admin/settings", { settings: { ai } });
      toast("تم حفظ إعدادات الذكاء الاصطناعي — يعمل الآن فورًا", "ok");
      setApiKey("");
      setKeyOpen(false);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid split" data-split="1">
      <div className="card ai-box ai-glow" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 560 }}>
        <div className="row-between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ fontSize: 22 }}>🧠</div>
            <div>
              <div style={{ fontWeight: 900 }}>الكونسول الذكي</div>
              <div className="muted-2" style={{ fontSize: 11 }}>اكتب أي شيء… والبوت يتعدّل ويُنشر فورًا</div>
            </div>
          </div>
          <span className="badge badge-blue">AI</span>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {chat.length === 0 && (
            <div className="card-soft" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>👋 اكتب أمرك بالعربية</div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.9 }}>
                مثال: «اجعل الهدية اليومية من 2 إلى 4 نقاط» — «أضف جائزة Netflix الشهرية بسعر 15 نقطة» — «ارفع نقاط
                الإحالة إلى 5» — «أرسل بث للجميع: مسابقة الليلة».
                <br />
                سيتم تنفيذ الأمر مباشرة على البوت، مع سجل كامل لكل عملية.
              </p>
            </div>
          )}
          {chat.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                maxWidth: "86%",
                background: m.role === "user" ? "rgba(247,201,72,.12)" : "rgba(179,136,255,.12)",
                border: `1px solid ${m.role === "user" ? "rgba(247,201,72,.28)" : "rgba(179,136,255,.28)"}`,
                borderRadius: 14,
                padding: "10px 13px",
                fontSize: 13,
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.role === "ai" && m.provider && (
                <div className="muted-2" style={{ fontSize: 9.5, marginBottom: 4 }}>🧠 {m.provider}</div>
              )}
              {m.text}
              {m.actions && m.actions.length > 0 && (
                <div className="row wrap" style={{ marginTop: 8, gap: 5 }}>
                  {m.actions.map((a, j) => (
                    <span key={j} className={`badge ${a.ok ? "badge-green" : "badge-red"}`} style={{ fontSize: 10 }}>
                      {a.ok ? "✓" : "✕"} {a.name}{a.detail ? ` · ${a.detail}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="row card-soft" style={{ padding: 10, alignSelf: "flex-end", gap: 8 }}>
              <Spinner /> <span className="muted" style={{ fontSize: 12.5 }}>جارٍ الفهم والتنفيذ…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
          <div className="row">
            <textarea
              className="textarea"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="اكتب أمرك… مثال: أضف جائزة 5000 دج بسعر 80 نقطة"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              style={{ minHeight: 52 }}
            />
            <button className="btn btn-primary" disabled={busy} onClick={() => void send()} style={{ height: 52 }}>
              {busy ? <Spinner /> : "إرسال ➤"}
            </button>
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginBottom: 10 }}>💡 أفكار جاهزة</h3>
          <div className="col" style={{ gap: 6 }}>
            {IDEAS.map((i) => (
              <button key={i} className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start", textAlign: "start" }} onClick={() => void send(i)}>
                ✨ {i}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginBottom: 10 }}>🕘 آخر الأوامر</h3>
          <div className="col" style={{ gap: 7, maxHeight: 300, overflow: "auto" }}>
            {logs.length ? (
              logs.slice(0, 12).map((l, i) => (
                <div key={i} className="card-soft" style={{ padding: 9 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{l.prompt.slice(0, 70)}</div>
                  <div className="row-between" style={{ marginTop: 4 }}>
                    <span className="muted-2" style={{ fontSize: 10 }}>{relTime(l.at)} • {l.provider}</span>
                    <span className={`badge ${l.actions.length ? "badge-green" : "badge-muted"}`} style={{ fontSize: 9.5 }}>
                      {l.actions.length} عملية
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">لا توجد أوامر بعد.</div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="row-between" style={{ marginBottom: keyOpen ? 10 : 0 }}>
            <h3>🔑 مفتاح الذكاء الاصطناعي</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setKeyOpen((v) => !v)}>
              {keyOpen ? "إغلاق" : "إعداد"}
            </button>
          </div>
          {keyOpen && (
            <div className="col" style={{ gap: 0, marginTop: 8 }}>
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.8, marginBottom: 10 }}>
                الصق مفتاح <b className="gold">Gemini</b> أو أي مزوّد متوافق مع OpenAI.
                يُحفظ داخل قاعدة البيانات ويعمل <b>فورًا</b> بدون إعادة نشر.
              </p>
              <Field label="المفتاح (API Key)">
                <input
                  className="input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza… أو sk-…"
                  autoComplete="off"
                  dir="ltr"
                />
              </Field>
              <Field label="المزوّد">
                <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="auto">تلقائي (الأسرع يفوز)</option>
                  <option value="gemini">Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="cerebras">Cerebras</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="xai">Grok</option>
                  <option value="claude">Claude</option>
                </select>
              </Field>
              <Field label="رابط أساس مخصّص (اختياري)" hint="لمزوّد متوافق مع OpenAI فقط، مثال: https://api.groq.com/openai/v1">
                <input className="input" value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="https://…" dir="ltr" />
              </Field>
              <Field label="الموديل (اختياري)" hint="مثال: gemini-2.5-flash — llama-3.3-70b-versatile">
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="تلقائي" dir="ltr" />
              </Field>
              <button className="btn btn-primary" onClick={saveKey} disabled={saving} style={{ width: "100%" }}>
                {saving ? <Spinner /> : "حفظ وتشغيل فوري"}
              </button>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginBottom: 8 }}>⚙️ كيف يعمل؟</h3>
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.9 }}>
            1) يقرأ طلبك بالعربية ويحوّله لعملية دقيقة.
            <br />
            2) ينفّذها على قاعدة البوت فورًا (بدون إعادة نشر).
            <br />
            3) يسجّل كل عملية في السجل للمراجعة.
            <br />
            <span className="gold">بدون مفاتيح AI؟</span> المحرك العربي المدمج يفهم الأوامر الشائعة ويطبّقها.
          </p>
        </div>
      </div>
    </div>
  );
}
