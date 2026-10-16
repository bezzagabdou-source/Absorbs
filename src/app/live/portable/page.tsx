"use client";

/**
 * NEXUS FORGE v19 — الرابط المحمول
 * ---------------------------------------------------------------------------
 * `/live/portable#d=<deflate-raw base64url>&t=<title>`
 *
 * When no database is configured the whole project travels inside the URL
 * *fragment*: the fragment is never sent to a server, so this page decompresses
 * it in the browser and runs it in a sandboxed iframe. A real live link with
 * zero storage.
 */
import { useEffect, useMemo, useRef, useState } from "react";

type State = "loading" | "ready" | "error";

function b64urlToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9_\-]/g, "");
  const pad = clean.length % 4 === 0 ? "" : "=".repeat(4 - (clean.length % 4));
  const bin = atob((clean + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => GenericTransformStream }).DecompressionStream;
  if (!DS) throw new Error("NO_DECOMPRESSION");
  const stream = new Response(new Blob([bytes.slice()] as unknown as BlobPart[]).stream().pipeThrough(new DS("deflate-raw")));
  return await stream.text();
}

export default function PortableSitePage() {
  const [state, setState] = useState<State>("loading");
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("مشروع Nexus");
  const [note, setNote] = useState("");
  const [bar, setBar] = useState(true);
  const frame = useRef<HTMLIFrameElement | null>(null);

  const payload = useMemo(() => {
    if (typeof window === "undefined") return { d: "", t: "" };
    const h = window.location.hash.replace(/^#/, "");
    const p = new URLSearchParams(h);
    return { d: p.get("d") ?? "", t: p.get("t") ?? "" };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!payload.d) {
        setState("error");
        setNote("الرابط لا يحمل أي مشروع — انسخ الرابط كاملًا مع الجزء الذي بعد #");
        return;
      }
      try {
        if (payload.t) setTitle(decodeURIComponent(payload.t));
        const text = await inflate(b64urlToBytes(payload.d));
        if (!alive) return;
        setHtml(text);
        setState("ready");
      } catch (e) {
        if (!alive) return;
        setState("error");
        setNote(
          (e as Error).message === "NO_DECOMPRESSION"
            ? "متصفحك لا يدعم فك الضغط (DecompressionStream) — حدّث المتصفح أو افتح الرابط في Chrome/Edge/Safari حديث"
            : "تعذّر فك ضغط المشروع من الرابط — قد يكون الرابط مقطوعًا"
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [payload.d, payload.t]);

  const kbSize = Math.round((html.length / 1024) * 10) / 10;
  const lines = html ? html.split("\n").length : 0;

  const download = () => {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[^\w\u0600-\u06FF\-]+/g, "_").slice(0, 60) || "nexus-site"}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      /* ignore */
    }
  };

  const openAlone = () => {
    try {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch {
      /* popup blocked */
    }
  };

  return (
    <div className="portable-root" dir="rtl">
      <style>{CSS}</style>

      {bar && state === "ready" && (
        <div className="p-bar">
          <div className="p-dot" />
          <div className="p-title" title={title}>
            {title}
          </div>
          <div className="p-meta">
            {lines.toLocaleString("ar-DZ")} سطر · {kbSize} KB
          </div>
          <div className="p-spacer" />
          <button className="p-btn" onClick={download} title="تنزيل الملف">
            تنزيل
          </button>
          <button className="p-btn" onClick={openAlone} title="افتح في تبويب جديد">
            تبويب جديد
          </button>
          <button className="p-btn p-ghost" onClick={() => setBar(false)} title="إخفاء الشريط">
            إخفاء
          </button>
        </div>
      )}

      {state === "ready" && (
        <iframe
          ref={frame}
          title={title}
          srcDoc={html}
          className={`p-frame${bar ? "" : " p-full"}`}
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
        />
      )}

      {state === "loading" && (
        <div className="p-center">
          <div className="p-ring" />
          <div className="p-h">جارٍ فك ضغط المشروع من الرابط…</div>
          <div className="p-s">Nexus AI v19 FORGE — abdelrezakbezzag 🇩🇿</div>
        </div>
      )}

      {state === "error" && (
        <div className="p-center">
          <div className="p-card">
            <div className="p-h">لم يعمل الرابط المحمول</div>
            <div className="p-s">{note}</div>
            <a className="p-cta" href="/app/code">
              افتح Nexus Code
            </a>
          </div>
        </div>
      )}

      {!bar && state === "ready" && (
        <button className="p-show" onClick={() => setBar(true)} title="إظهار الشريط">
          ⌃
        </button>
      )}
    </div>
  );
}

const CSS = `
.portable-root{position:fixed;inset:0;background:#0b0a0e;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Arabic",sans-serif}
.p-bar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:linear-gradient(180deg,#191722,#121019);border-bottom:1px solid #ffffff14;color:#f4f3f7;flex:0 0 auto}
.p-dot{width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,#d97757,#f5c451);box-shadow:0 0 12px #d9775788}
.p-title{font-weight:800;font-size:14px;max-width:44vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p-meta{font-size:11px;color:#a5a2b3}
.p-spacer{flex:1}
.p-btn{border:1px solid #ffffff1f;background:#ffffff0d;color:#f4f3f7;border-radius:10px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:.16s}
.p-btn:hover{background:#ffffff1c;transform:translateY(-1px)}
.p-ghost{background:transparent;border-color:transparent;color:#a5a2b3}
.p-frame{flex:1 1 auto;width:100%;border:0;background:#fff}
.p-full{height:100%}
.p-center{flex:1;display:grid;place-items:center;padding:24px;color:#f4f3f7;text-align:center}
.p-ring{width:44px;height:44px;border-radius:50%;border:3px solid #ffffff22;border-top-color:#d97757;animation:p-spin .9s linear infinite;margin:0 auto 18px}
@keyframes p-spin{to{transform:rotate(360deg)}}
.p-h{font-size:18px;font-weight:800;margin-bottom:8px}
.p-s{color:#a5a2b3;font-size:13px;line-height:1.9;max-width:520px}
.p-card{background:linear-gradient(180deg,#1a1922,#141319);border:1px solid #ffffff14;border-radius:22px;padding:28px;max-width:560px;box-shadow:0 40px 90px -50px #000}
.p-cta{display:inline-block;margin-top:18px;padding:11px 20px;border-radius:13px;background:linear-gradient(135deg,#d97757,#f5c451);color:#1a1206;font-weight:800;text-decoration:none}
.p-show{position:fixed;top:8px;inset-inline-end:10px;z-index:9;width:32px;height:32px;border-radius:10px;border:1px solid #ffffff22;background:#00000088;color:#fff;cursor:pointer}
@media (prefers-reduced-motion: reduce){.p-ring{animation:none}}
`;
