"use client";
/**
 * 🖼️ ImageField — حقل صورة واحد يغطي كل الاحتياجات:
 *   1) رفع مباشر من الكاميرا/الاستوديو (input file + سحب وإفلات)
 *   2) لصق رابط
 *   3) توليد بالذكاء الاصطناعي من وصف
 *   4) معاينة فورية + إزالة
 *
 * كان الفورم يعرض حقل «رابط» فقط، فيضطر المستخدم لرفع الصورة
 * في تبويب آخر ثم نسخ الرابط — الآن كل ذلك في مكان واحد.
 */
import { useRef, useState } from "react";
import { Field, Spinner, toast } from "./ui";

export type ImageFieldProps = {
  value?: string;
  onChange: (url: string) => void;
  /** نص مقترح لتوليد الصورة بالذكاء الاصطناعي */
  promptHint?: string;
  label?: string;
  /** نسبة المعاينة — مربعة افتراضيًا */
  ratio?: string;
};

export default function ImageField({
  value,
  onChange,
  promptHint,
  label = "صورة",
  ratio = "16 / 9",
}: ImageFieldProps) {
  const [busy, setBusy] = useState<"up" | "gen" | null>(null);
  const [prompt, setPrompt] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("اختر صورة فقط (JPG/PNG/WebP)", "err");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("الحجم الأقصى 8 ميغابايت", "err");
      return;
    }
    setBusy("up");
    try {
      const fd = new FormData();
      fd.append("file", file);
      // الرفع عبر fetch مباشرة (multipart — لا يصلح عبر api() الذي يُرسل JSON)
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? "فشل الرفع");
      onChange(data.url);
      toast("تم رفع الصورة ✅", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    const p = prompt.trim() || promptHint || "";
    if (p.length < 3) {
      toast("اكتب وصفًا للصورة أولًا", "err");
      return;
    }
    setBusy("gen");
    try {
      const res = await fetch("/api/admin/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.ok || !data.url) throw new Error(data.error ?? "فشل التوليد");
      onChange(data.url);
      toast("تم توليد الصورة ✅", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Field label={label}>
      {/* ─── منطقة الرفع/المعاينة ─── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        onClick={() => !busy && fileRef.current?.click()}
        style={{
          position: "relative",
          border: `1.5px dashed ${drag ? "var(--gold)" : "var(--line)"}`,
          borderRadius: 14,
          background: drag ? "var(--gold-soft)" : "var(--panel-2)",
          aspectRatio: ratio,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          cursor: busy ? "wait" : "pointer",
          transition: "border-color .15s, background .15s",
          maxHeight: 240,
        }}
        role="button"
        tabIndex={0}
        aria-label={label}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                insetInline: 0,
                bottom: 0,
                display: "flex",
                gap: 6,
                padding: 8,
                background: "linear-gradient(0deg, rgba(0,0,0,.85), transparent)",
              }}
            >
              <button
                type="button"
                className="btn btn-sm"
                style={{ flex: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                🔄 تغيير
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ flex: 1, borderColor: "rgba(255,92,116,.5)", color: "#ffc0c9" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              >
                🗑 حذف
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 26 }}>{busy === "up" ? "⏳" : "📷"}</div>
            <div style={{ fontWeight: 800, fontSize: 12.5, marginTop: 4 }}>
              {busy === "up" ? "جارٍ الرفع…" : "اضغط لاختيار صورة"}
            </div>
            <div className="muted-2" style={{ fontSize: 10.5, marginTop: 2 }}>
              من الكاميرا أو الاستوديو · أو اسحبها هنا
            </div>
          </div>
        )}
        {busy === "up" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(7,10,16,.7)", display: "grid", placeItems: "center" }}>
            <Spinner />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />

      {/* ─── رابط مباشر ─── */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          className="input"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… أو الصق رابطًا"
          style={{ fontSize: 12.5 }}
        />
      </div>

      {/* ─── توليد بالذكاء الاصطناعي ─── */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          className="input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={promptHint ? `مثال: ${promptHint}` : "صف الصورة…"}
          style={{ fontSize: 12.5 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void generate();
            }
          }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={busy !== null}>
          {busy === "gen" ? <Spinner /> : "🎨 توليد"}
        </button>
      </div>
    </Field>
  );
}
