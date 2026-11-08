"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Spinner, api, relTime, toast } from "../ui";

type B = { id: string; text: string; createdAt: string; status: string; sent: number; failed: number; audience: string };

export default function BroadcastPanel() {
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [btnLabel, setBtnLabel] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [audience, setAudience] = useState("all");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [history, setHistory] = useState<B[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ broadcasts: B[] }>("/api/admin/broadcast");
      setHistory(r.broadcasts);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) throw new Error(data.error ?? "فشل الرفع");
      setImage(data.url);
      toast("تم رفع الصورة ✅", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setUploading(false);
    }
  }

  async function send(test = false) {
    if (!text.trim()) return toast("اكتب نص الرسالة أولًا", "err");
    if (!test && !confirm(`إرسال البث إلى: ${audience === "all" ? "كل الأعضاء" : audience}؟`)) return;
    test ? setTestBusy(true) : setBusy(true);
    try {
      const r = await api<{ sent?: number; failed?: number; total?: number; tested?: boolean }>("/api/admin/broadcast", {
        text,
        image: image || undefined,
        buttonLabel: btnLabel || undefined,
        buttonUrl: btnUrl || undefined,
        audience,
        test,
      });
      toast(test ? "تم إرسال التجربة ✅" : `أُرسل إلى ${r.sent} عضو (فشل ${r.failed}) ✅`, "ok");
      await load();
      if (!test) setText("");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
      setTestBusy(false);
    }
  }

  return (
    <div className="grid split" data-split="1">
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>📢 رسالة جماعية لكل الأعضاء</h3>
        <Field label="نص الرسالة (يدعم HTML: <b> <i> <a href>)" hint={`${text.length} حرف`}>
          <textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="🎉 مسابقة جديدة! …" />
        </Field>
        <div className="row" style={{ gap: 8 }}>
          <Field label="صورة (اختياري)">
            <input className="input" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…"  />
          </Field>
          <label className="btn btn-ghost" style={{ marginTop: 22 }}>
            {uploading ? <Spinner /> : "📎 رفع صورة"}
            <input type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Field label="نص الزر (اختياري)"><input className="input" value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} placeholder="اشترك الآن" /></Field>
          <Field label="رابط الزر"><input className="input" value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} placeholder="https://t.me/mxabdou" /></Field>
        </div>
        <Field label="الجمهور">
          <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">كل الأعضاء</option>
            <option value="active">النشطون (7 أيام)</option>
            <option value="inactive">غير النشطين (7+ أيام)</option>
            <option value="withPoints">من لديهم نقاط</option>
            <option value="vip">أعضاء VIP 👑</option>
          </select>
        </Field>
        <div className="row wrap">
          <button className="btn btn-primary" disabled={busy} onClick={() => send(false)}>
            {busy ? <><Spinner /> جارٍ الإرسال…</> : "🚀 إرسال للجميع"}
          </button>
          <button className="btn btn-ghost" disabled={testBusy} onClick={() => send(true)}>
            {testBusy ? <Spinner /> : "🧪 تجربة للأدمن"}
          </button>
        </div>
        <div className="hint">💡 يُرسل على دفعات بسرعة آمنة لتجنّب حدود تيليجرام.</div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>🕘 سجل البث</h3>
        <div className="col" style={{ gap: 8 }}>
          {history.length ? (
            history.map((b) => (
              <div key={b.id} className="card-soft" style={{ padding: 10 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{b.text.slice(0, 120)}</div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="muted-2" style={{ fontSize: 10.5 }}>{relTime(b.createdAt)} • {b.audience}</span>
                  <span className={`badge ${b.status === "done" ? "badge-green" : "badge-gold"}`}>
                    ✅ {b.sent} / ❌ {b.failed}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty text="لا يوجد سجل بث بعد." />
          )}
        </div>
      </div>
    </div>
  );
}
