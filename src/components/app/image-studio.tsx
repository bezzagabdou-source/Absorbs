"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  IMAGE_ASPECTS,
  IMAGE_PROMPT_MAX,
  IMAGE_STYLES,
  IMAGE_TIER_COUNT,
  IMAGE_TIER_HINT,
  IMAGE_TIER_LABEL,
  IMAGE_REF_MAX_BYTES,
  type ImageApiOk,
  type ImageAspect,
  type ImageReference,
  type ImageStyle,
  type ImageTier,
} from "@/lib/image-types";

type Slot =
  | { id: number; status: "loading" }
  | { id: number; status: "done"; src: string; model: string; ms: number; mime: string }
  | { id: number; status: "error"; code: string };

const ERROR_TEXT: Record<string, string> = {
  PRO_ONLY: "توليد الصور متاح لمشتركي Pro.",
  BLOCKED: "رفض النموذج الوصف لأسباب السلامة. غيّر الصياغة وجرّب مجددًا.",
  NO_PROVIDER: "لم تُضبط مفاتيح توليد الصور على الخادم بعد (GEMINI_API_KEY).",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  FAILED: "تعذّر توليد الصورة الآن. أعد المحاولة بعد لحظات.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
  BAD_REFERENCE: "تعذّر استخدام الصورة المرجعية. جرّب صورة JPG أو PNG أخرى.",
};

/** Downscales the picked image to max 1280 px JPEG so the request stays small and fast. */
async function prepareReference(file: File): Promise<ImageReference | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.88, 0.75, 0.6]) {
      const data = canvas.toDataURL("image/jpeg", q).split(",")[1] ?? "";
      if (data.length > 0 && data.length <= IMAGE_REF_MAX_BYTES) return { mime: "image/jpeg", data };
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ImageStudioProps {
  open: boolean;
  onClose: () => void;
  tier: ImageTier;
  initialPrompt?: string;
}

export function ImageStudio({ open, onClose, tier, initialPrompt }: ImageStudioProps) {
  const { authFetch } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("photo");
  const [aspect, setAspect] = useState<ImageAspect>("1:1");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [ref, setRef] = useState<ImageReference | null>(null);
  const [refErr, setRefErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const busy = slots.some((s) => s.status === "loading");

  useEffect(() => {
    if (open && initialPrompt) setPrompt(initialPrompt.slice(0, IMAGE_PROMPT_MAX));
  }, [open, initialPrompt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const generate = useCallback(async (): Promise<void> => {
    const text = prompt.trim();
    if (text.length < 3 || busy) return;
    const run = ++runRef.current;
    const count = IMAGE_TIER_COUNT[tier];
    setSlots(Array.from({ length: count }, (_, i): Slot => ({ id: i, status: "loading" })));

    const setSlot = (slot: Slot): void => {
      if (runRef.current !== run) return;
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)));
    };

    await Promise.all(
      Array.from({ length: count }, async (_, i) => {
        try {
          const res = await authFetch("/api/ai/image", {
            method: "POST",
            body: JSON.stringify({ prompt: text, tier, aspect, style, ...(ref ? { reference: ref } : {}) }),
          });
          if (!res.ok) {
            let code = "FAILED";
            try {
              const j = (await res.json()) as { code?: string };
              if (j.code) code = j.code;
            } catch {
              /* keep FAILED */
            }
            setSlot({ id: i, status: "error", code });
            return;
          }
          const ok = (await res.json()) as ImageApiOk;
          setSlot({
            id: i,
            status: "done",
            src: `data:${ok.image.mime};base64,${ok.image.data}`,
            mime: ok.image.mime,
            model: ok.image.model,
            ms: ok.image.ms,
          });
        } catch {
          setSlot({ id: i, status: "error", code: "FAILED" });
        }
      })
    );
  }, [prompt, busy, tier, aspect, style, ref, authFetch]);

  if (!open) return null;

  const firstError = slots.find((s): s is Extract<Slot, { status: "error" }> => s.status === "error");
  const allFailed = slots.length > 0 && slots.every((s) => s.status === "error");

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="استوديو الصور">
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-black text-white">
              <ImagePlus className="h-5 w-5 text-brand-400" aria-hidden />
              استوديو الصور الواقعية
            </h2>
            <p className="truncate text-xs text-slate-400">
              {IMAGE_TIER_LABEL[tier]} — {IMAGE_TIER_HINT[tier]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label htmlFor="img-prompt" className="mb-1.5 block text-sm font-bold text-slate-200">
              صف الصورة
            </label>
            <textarea
              id="img-prompt"
              value={prompt}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value.slice(0, IMAGE_PROMPT_MAX))}
              rows={3}
              placeholder="مثال: عجوز جزائري يحتسي الشاي على شرفة في القصبة وقت الغروب"
              className="input-base w-full resize-none"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-200">صورة مرجعية (اختياري) — ولّد حسب صورتك</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const r = await prepareReference(f);
                setRefErr(r === null);
                if (r) setRef(r);
              }}
            />
            {ref ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-800 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:${ref.mime};base64,${ref.data}`} alt="الصورة المرجعية" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                <p className="min-w-0 flex-1 text-xs leading-5 text-slate-300">سيُحافظ النموذج على الشخص/الشكل/التكوين ويطبّق عليه الوصف والنمط.</p>
                <button type="button" onClick={() => setRef(null)} aria-label="إزالة الصورة المرجعية" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-white/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-ink-800 px-3 text-sm font-bold text-slate-300 transition hover:border-brand-500/60"
              >
                <ImagePlus className="h-4 w-4 text-brand-400" aria-hidden />
                ارفع صورة لتكون المرجع
              </button>
            )}
            {refErr && <p className="mt-1.5 text-xs text-amber-300">{ERROR_TEXT.BAD_REFERENCE}</p>}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-200">النمط</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="النمط">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={style === s.id}
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-3.5 text-sm font-bold transition",
                    style === s.id
                      ? "border-brand-500 bg-brand-500/15 text-brand-300"
                      : "border-white/10 bg-ink-800 text-slate-300 hover:border-white/25"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-200">الأبعاد</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="الأبعاد">
              {IMAGE_ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={aspect === a.id}
                  onClick={() => setAspect(a.id)}
                  className={cn(
                    "min-h-10 min-w-14 rounded-full border px-3 text-sm font-bold tabular-nums transition",
                    aspect === a.id
                      ? "border-brand-500 bg-brand-500/15 text-brand-300"
                      : "border-white/10 bg-ink-800 text-slate-300 hover:border-white/25"
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 3}
            className="btn-primary flex w-full items-center justify-center gap-2 !py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Zap className="h-5 w-5" aria-hidden />}
            {busy ? "جارٍ التوليد…" : slots.length > 0 ? "ولّد من جديد" : "ولّد الصورة"}
          </button>

          {slots.length > 0 && (
            <div className={cn("grid gap-3", slots.length > 1 ? "sm:grid-cols-2" : "grid-cols-1")} aria-live="polite">
              {slots.map((s) => (
                <figure key={s.id} className="overflow-hidden rounded-2xl border border-white/10 bg-ink-800">
                  {s.status === "loading" && (
                    <div className="grid aspect-square place-items-center">
                      <Loader2 className="h-8 w-8 animate-spin text-brand-400" aria-label="جارٍ التوليد" />
                    </div>
                  )}
                  {s.status === "error" && (
                    <div className="grid aspect-square place-items-center p-4 text-center text-sm text-slate-300">
                      {ERROR_TEXT[s.code] ?? ERROR_TEXT.FAILED}
                    </div>
                  )}
                  {s.status === "done" && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.src} alt={prompt.slice(0, 120)} className="block h-auto w-full" />
                      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-400">
                        <span className="min-w-0 truncate">
                          {(s.ms / 1000).toFixed(1)} ث · {s.model}
                        </span>
                        <a
                          href={s.src}
                          download={`nexus-image-${s.id + 1}.${s.mime.includes("jpeg") ? "jpg" : "png"}`}
                          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-brand-500/15 px-3 font-bold text-brand-300"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                          تحميل
                        </a>
                      </figcaption>
                    </>
                  )}
                </figure>
              ))}
            </div>
          )}

          {firstError && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              {firstError.code === "PRO_ONLY" && (
                <Link href="/app/upgrade" className="btn-primary !px-4 !py-2 text-sm">
                  رقِّ إلى Pro
                </Link>
              )}
              {allFailed && firstError.code !== "PRO_ONLY" && firstError.code !== "BLOCKED" && (
                <button
                  type="button"
                  onClick={() => void generate()}
                  className="btn-ghost inline-flex items-center gap-2 !px-4 !py-2 text-sm"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  أعد المحاولة
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
