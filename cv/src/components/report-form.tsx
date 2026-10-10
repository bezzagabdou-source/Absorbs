"use client";

import { useState, type ChangeEvent } from "react";
import { Check, Copy, Send } from "lucide-react";

const SUPPORT_EMAIL = "abdiubz0@gmail.com";

const KINDS = [
  { id: "bug", label: "خلل في التطبيق" },
  { id: "ai", label: "جودة إجابة المساعد" },
  { id: "billing", label: "الدفع أو الاشتراك" },
  { id: "other", label: "أمر آخر" },
] as const;

type KindId = (typeof KINDS)[number]["id"];

function diagnostics(): string {
  if (typeof window === "undefined") return "";
  return [
    `الصفحة السابقة: ${document.referrer || "—"}`,
    `المتصفح: ${navigator.userAgent}`,
    `اللغة: ${navigator.language}`,
    `حجم الشاشة: ${window.innerWidth}×${window.innerHeight}`,
    `الوقت: ${new Date().toISOString()}`,
  ].join("\n");
}

export function ReportForm() {
  const [kind, setKind] = useState<KindId>("bug");
  const [text, setText] = useState("");
  const [withInfo, setWithInfo] = useState(true);
  const [copied, setCopied] = useState(false);

  const kindLabel = KINDS.find((k) => k.id === kind)?.label ?? "";
  const body = (): string =>
    `${text.trim()}${withInfo ? `\n\n— معلومات تقنية —\n${diagnostics()}` : ""}`;
  const ready = text.trim().length >= 10;

  function send(): void {
    if (!ready) return;
    const subject = encodeURIComponent(`[Nexus AI] ${kindLabel}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${encodeURIComponent(body())}`;
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${kindLabel}\n\n${body()}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-slate-200">نوع المشكلة</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع المشكلة">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              onClick={() => setKind(k.id)}
              className={
                kind === k.id
                  ? "min-h-11 rounded-xl border border-brand-500 bg-brand-500/15 px-4 text-sm font-bold text-brand-300"
                  : "min-h-11 rounded-xl border border-white/10 bg-ink-800 px-4 text-sm font-semibold text-slate-300 hover:border-white/25"
              }
            >
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="report-text" className="mb-2 block text-sm font-bold text-slate-200">
          ماذا حدث؟
        </label>
        <textarea
          id="report-text"
          value={text}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          rows={6}
          placeholder="اكتب الخطوات التي قمت بها وما الذي توقعته وما الذي ظهر فعلًا."
          className="input-base w-full resize-y"
        />
        <p className="mt-1 text-xs text-slate-400">10 أحرف على الأقل.</p>
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={withInfo}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setWithInfo(e.target.checked)}
          className="h-5 w-5 accent-[#d97757]"
        />
        إرفاق معلومات المتصفح وحجم الشاشة لمساعدتنا على إعادة المشكلة
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={send}
          disabled={!ready}
          className="btn-primary inline-flex items-center gap-2 !px-5 !py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          فتح رسالة البريد
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!ready}
          className="btn-ghost inline-flex items-center gap-2 !px-5 !py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "تم النسخ" : "نسخ النص"}
        </button>
      </div>
    </div>
  );
}
