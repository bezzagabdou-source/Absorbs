"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Empty, Field, Spinner, api, relTime, toast } from "../ui";

type F = { name: string; url: string; size: number; at: string; type: string };

export default function Library() {
  const [files, setFiles] = useState<F[]>([]);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genUrl, setGenUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<{ files: F[]; blobReady: boolean }>("/api/admin/upload");
      setFiles(r.files);
      setReady(r.blobReady);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "فشل الرفع");
      toast("تم الرفع ✅", "ok");
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (prompt.trim().length < 3) return toast("اكتب وصف الصورة", "err");
    setGenBusy(true);
    try {
      const r = await api<{ url: string }>("/api/admin/image", { prompt });
      setGenUrl(r.url);
      toast("تم التوليد 🎨", "ok");
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 10 }}>📎 رفع الصور والملفات</h3>
          {!ready && <div className="badge badge-red" style={{ marginBottom: 10 }}>⚠️ أضف BLOB_READ_WRITE_TOKEN لتفعيل الرفع</div>}
          <label className="card-soft center" style={{ padding: 26, borderStyle: "dashed", cursor: "pointer", display: "block" }}>
            <div style={{ fontSize: 28 }}>{uploading ? "⏳" : "📤"}</div>
            <div style={{ fontWeight: 800, marginTop: 6, fontSize: 13 }}>{uploading ? "جارٍ الرفع…" : "اسحب ملفًا هنا أو اضغط للاختيار"}</div>
            <div className="muted-2" style={{ fontSize: 11 }}>صور • PDF • ZIP • فيديو — حتى 8MB</div>
            <input type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <div className="hint" style={{ marginTop: 8 }}>الملفات المرفوعة تُستخدم مباشرة في «صورة الترحيب» و«بطاقات الجوائز» وبث الصور.</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 10 }}>🎨 توليد صورة بالذكاء الاصطناعي</h3>
          <Field label="وصف الصورة">
            <textarea className="textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="بطاقة ذهبية فاخرة لجائزة Netflix، خلفية داكنة، إضاءة سينمائية" />
          </Field>
          <button className="btn btn-primary" disabled={genBusy} onClick={generate}>{genBusy ? <><Spinner /> يولّد…</> : "✨ توليد"}</button>
          {genUrl && (
            <div style={{ marginTop: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={genUrl} alt="generated" style={{ width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" }} />
              <div className="row" style={{ marginTop: 6 }}>
                <code style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{genUrl}</code>
                <Copy text={genUrl} label="" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginBottom: 10 }}>🖼️ المكتبة ({files.length})</h3>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {files.map((f, i) => (
            <div key={i} className="card-soft" style={{ padding: 8 }}>
              {f.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 8 }} />
              ) : (
                <div className="center" style={{ height: 92, display: "grid", placeItems: "center", fontSize: 28 }}>📄</div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div className="row-between" style={{ marginTop: 4 }}>
                <span className="muted-2" style={{ fontSize: 9.5 }}>{Math.round(f.size / 1024)}KB • {relTime(f.at)}</span>
                <Copy text={f.url} label="🔗" />
              </div>
            </div>
          ))}
        </div>
        {!files.length && <Empty text="لا توجد ملفات بعد." />}
      </div>
    </div>
  );
}
