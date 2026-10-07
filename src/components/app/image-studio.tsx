"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { Check, Cloud, Download, Eraser, FolderOpen, ImagePlus, Loader2, Pencil, RefreshCw, Sparkles, Trash2, Undo2, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/firebase";
import { deleteCloudImage, listCloudImages, saveImageToCloud, type CloudImage } from "@/lib/firebase-cloud";
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
  type ImageEditAction,
  type ImageEditPoint,
  type ImageReference,
  type ImageStyle,
  type ImageTier,
} from "@/lib/image-types";

type Slot =
  | { id: number; status: "loading" }
  | { id: number; status: "done"; src: string; model: string; ms: number; mime: string }
  | { id: number; status: "error"; code: string };

const ERROR_TEXT: Record<string, string> = {
  PRO_ONLY: "هذه الميزة غير متاحة الآن لحسابك.",
  BLOCKED: "رفض النموذج الوصف لأسباب السلامة. غيّر الصياغة وجرّب مجددًا.",
  NO_PROVIDER: "لم تُضبط مفاتيح توليد الصور على الخادم بعد (GEMINI_API_KEY).",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  FAILED: "تعذّر توليد الصورة الآن. أعد المحاولة بعد لحظات.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
  BAD_REFERENCE: "تعذّر استخدام الصورة المرجعية. جرّب صورة JPG أو PNG أخرى.",
  BAD_EDIT: "طلب التعديل غير صالح. اكتب ما تريد تغييره أو انقر على العنصر.",
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

/** Same downscale as prepareReference, but from an image already on screen (data URL) — used by the editor. */
async function prepareFromSrc(src: string): Promise<ImageReference | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = src;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.78, 0.62]) {
      const data = canvas.toDataURL("image/jpeg", q).split(",")[1] ?? "";
      if (data.length > 0 && data.length <= IMAGE_REF_MAX_BYTES) return { mime: "image/jpeg", data };
    }
    return null;
  } catch {
    return null;
  }
}

interface EditTarget {
  slotId: number;
  src: string;
  mime: string;
}

/** Full-screen editor: tap an element to mark it, then remove it / redesign it / change it with a sentence (Arabic is fine). */
function ImageEditor({
  target,
  tier,
  onApply,
  onClose,
}: {
  target: EditTarget;
  tier: ImageTier;
  onApply: (slotId: number, src: string, mime: string) => void;
  onClose: () => void;
}) {
  const { authFetch } = useAuth();
  const [current, setCurrent] = useState(target.src);
  const [mime, setMime] = useState(target.mime);
  const [history, setHistory] = useState<{ src: string; mime: string }[]>([]);
  const [point, setPoint] = useState<ImageEditPoint | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<ImageEditAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  const mark = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const box = imgRef.current?.getBoundingClientRect();
    if (!box || box.width < 1 || box.height < 1) return;
    setPoint({
      x: Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100)),
    });
    setErr(null);
  };

  const run = async (action: ImageEditAction): Promise<void> => {
    if (busy) return;
    const instruction = text.trim();
    if (action === "change" && instruction.length < 2) {
      setErr("اكتب ما تريد تغييره.");
      return;
    }
    if (action === "redesign" && instruction.length < 2 && !point) {
      setErr("انقر على العنصر ثم اكتب التصميم الجديد.");
      return;
    }
    if (action === "remove" && instruction.length < 2 && !point) {
      setErr("انقر على العنصر الذي تريد حذفه، أو اكتب اسمه.");
      return;
    }
    setBusy(action);
    setErr(null);
    trackEvent("image_edit", { action, pinned: !!point });
    try {
      const reference = await prepareFromSrc(current);
      if (!reference) {
        setErr(ERROR_TEXT.BAD_REFERENCE);
        return;
      }
      const res = await authFetch("/api/ai/image", {
        method: "POST",
        body: JSON.stringify({
          prompt: instruction,
          tier,
          aspect: "1:1",
          style: "photo",
          reference,
          edit: { action, ...(point ? { point } : {}) },
        }),
      });
      if (!res.ok) {
        let code = "FAILED";
        try {
          const j = (await res.json()) as { code?: string };
          if (j.code) code = j.code;
        } catch {
          /* keep FAILED */
        }
        setErr(ERROR_TEXT[code] ?? ERROR_TEXT.FAILED);
        return;
      }
      const ok = (await res.json()) as ImageApiOk;
      setHistory((h) => [...h.slice(-7), { src: current, mime }]);
      setCurrent(`data:${ok.image.mime};base64,${ok.image.data}`);
      setMime(ok.image.mime);
      setPoint(null);
      if (action !== "change") setText("");
    } catch {
      setErr(ERROR_TEXT.FAILED);
    } finally {
      setBusy(null);
    }
  };

  const undo = (): void => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setCurrent(last.src);
    setMime(last.mime);
    setPoint(null);
  };

  const act =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border px-3 text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-ink-900" role="dialog" aria-modal="true" aria-label="تعديل الصورة">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <h3 className="flex items-center gap-2 text-base font-black text-white">
          <Pencil className="h-5 w-5 text-brand-400" aria-hidden />
          تعديل الصورة
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0 || !!busy}
            aria-label="تراجع"
            className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10 disabled:opacity-30"
          >
            <Undo2 className="h-5 w-5" />
          </button>
          <button type="button" onClick={onClose} aria-label="إغلاق المحرر" className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-xs leading-5 text-slate-400">انقر على أي عنصر في الصورة لتحديده، ثم اختر: احذفه، أو أعد تصميمه، أو اكتب تعديلًا بالعربية.</p>
        <div
          ref={imgRef}
          onPointerDown={mark}
          className="relative mx-auto w-full max-w-md cursor-crosshair touch-manipulation overflow-hidden rounded-2xl border border-white/10 bg-ink-800"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="الصورة قيد التعديل" draggable={false} className="block h-auto w-full select-none" />
          {point && (
            <span
              aria-hidden
              className="pointer-events-none absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500/30 shadow-[0_0_0_3px_rgba(0,0,0,0.45)]"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/55">
              <Loader2 className="h-9 w-9 animate-spin text-brand-300" aria-label="جارٍ التعديل" />
            </div>
          )}
        </div>

        <textarea
          value={text}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value.slice(0, 400))}
          rows={2}
          placeholder="مثال: اجعل القميص أحمر / احذف الشخص في الخلفية / صمّم الكرسي بشكل عصري"
          className="input-base w-full resize-none"
        />
        {err && <p className="text-xs font-bold text-amber-300">{err}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => void run("remove")} className={cn(act, "border-rose-400/40 bg-rose-500/10 text-rose-200")}>
            {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" aria-hidden />}
            احذف العنصر
          </button>
          <button type="button" disabled={!!busy} onClick={() => void run("redesign")} className={cn(act, "border-brand-400/40 bg-brand-500/10 text-brand-200")}>
            {busy === "redesign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" aria-hidden />}
            أعد تصميمه
          </button>
          <button type="button" disabled={!!busy} onClick={() => void run("change")} className={cn(act, "border-white/15 bg-ink-800 text-slate-200")}>
            {busy === "change" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" aria-hidden />}
            عدّل بالوصف
          </button>
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        <a
          href={current}
          download={`nexus-edit.${mime.includes("jpeg") ? "jpg" : "png"}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/15 px-4 text-sm font-bold text-slate-200"
        >
          <Download className="h-4 w-4" aria-hidden />
          تحميل
        </a>
        <button
          type="button"
          onClick={() => {
            onApply(target.slotId, current, mime);
            onClose();
          }}
          disabled={!!busy}
          className="btn-primary flex flex-1 items-center justify-center gap-2 !py-3 disabled:opacity-50"
        >
          <Check className="h-5 w-5" aria-hidden />
          تم — احفظ في الاستوديو
        </button>
      </footer>
    </div>
  );
}

interface ImageStudioProps {
  open: boolean;
  onClose: () => void;
  tier: ImageTier;
  initialPrompt?: string;
  /** bump this number to fill the prompt with `initialPrompt` and start generating at once (chat: "ولّد لي صورة …") */
  autoStart?: number;
}

export function ImageStudio({ open, onClose, tier, initialPrompt, autoStart = 0 }: ImageStudioProps) {
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
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<CloudImage[] | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [autoPending, setAutoPending] = useState(false);
  const lastAuto = useRef(0);

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
    trackEvent("image_generate", { tier, style, aspect, has_ref: !!ref });
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

  useEffect(() => {
    if (!open || autoStart <= 0 || autoStart === lastAuto.current || !initialPrompt || initialPrompt.trim().length < 3) return;
    lastAuto.current = autoStart;
    setPrompt(initialPrompt.slice(0, IMAGE_PROMPT_MAX));
    setAutoPending(true);
  }, [open, autoStart, initialPrompt]);

  useEffect(() => {
    if (!autoPending || busy || prompt.trim().length < 3) return;
    setAutoPending(false);
    void generate();
  }, [autoPending, busy, prompt, generate]);

  const loadGallery = useCallback(async (): Promise<void> => {
    try {
      setGallery(await listCloudImages());
    } catch {
      setGallery([]);
      setCloudMsg("تعذّر تحميل صورك المحفوظة. تأكد من تسجيل الدخول ومن قواعد Firestore.");
    }
  }, []);

  useEffect(() => {
    if (open && galleryOpen && gallery === null) void loadGallery();
  }, [open, galleryOpen, gallery, loadGallery]);

  const saveCloud = async (slotId: number, src: string, mime: string): Promise<void> => {
    if (savingId !== null) return;
    setSavingId(slotId);
    setCloudMsg(null);
    try {
      const item = await saveImageToCloud(src, mime, prompt);
      setGallery((g) => (g ? [item, ...g] : g));
      setCloudMsg("تم الحفظ في السحابة ✅ (افتح «صوري» لرؤيتها)");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setCloudMsg(
        code === "TOO_BIG"
          ? "الصورة أكبر من 5MB."
          : code === "NOT_SIGNED_IN"
            ? "سجّل الدخول أولًا."
            : "تعذّر الحفظ. تحقق من قواعد Storage و Firestore في Firebase."
      );
    } finally {
      setSavingId(null);
    }
  };

  const removeCloud = async (img: CloudImage): Promise<void> => {
    setGallery((g) => (g ? g.filter((x) => x.id !== img.id) : g));
    try {
      await deleteCloudImage(img);
    } catch {
      setCloudMsg("تعذّر الحذف. أعد المحاولة.");
      void loadGallery();
    }
  };

  const applyEdit = (slotId: number, src: string, mime: string): void => {
    setSlots((prev) =>
      prev.map((x) => (x.id === slotId && x.status === "done" ? { ...x, src, mime, model: `${x.model} + edit` } : x))
    );
  };

  if (!open) return null;

  const firstError = slots.find((s): s is Extract<Slot, { status: "error" }> => s.status === "error");
  const allFailed = slots.length > 0 && slots.every((s) => s.status === "error");

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="استوديو الصور">
      <div className="relative flex max-h-[94dvh] min-h-[60dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl sm:rounded-3xl">
        {editing && <ImageEditor target={editing} tier={tier} onApply={applyEdit} onClose={() => setEditing(null)} />}
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setGalleryOpen((v) => !v)}
              aria-pressed={galleryOpen}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-slate-200 hover:bg-white/10"
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              صوري
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-300 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void saveCloud(s.id, s.src, s.mime)}
                            disabled={savingId !== null}
                            aria-label="حفظ في السحابة"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-sky-400/15 px-3 font-bold text-sky-200 disabled:opacity-50"
                          >
                            {savingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Cloud className="h-4 w-4" aria-hidden />}
                            حفظ
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing({ slotId: s.id, src: s.src, mime: s.mime })}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-amber-400/15 px-3 font-bold text-amber-200"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                            تعديل
                          </button>
                          <a
                            href={s.src}
                            download={`nexus-image-${s.id + 1}.${s.mime.includes("jpeg") ? "jpg" : "png"}`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-500/15 px-3 font-bold text-brand-300"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                            تحميل
                          </a>
                        </span>
                      </figcaption>
                    </>
                  )}
                </figure>
              ))}
            </div>
          )}

          {cloudMsg && <p className="text-xs font-bold text-sky-200" role="status">{cloudMsg}</p>}

          {galleryOpen && (
            <section aria-label="صوري المحفوظة" className="rounded-2xl border border-white/10 bg-ink-800 p-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-white">
                <Cloud className="h-4 w-4 text-sky-300" aria-hidden />
                صوري المحفوظة
              </h3>
              {gallery === null ? (
                <div className="grid place-items-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-400" aria-label="جارٍ التحميل" />
                </div>
              ) : gallery.length === 0 ? (
                <p className="py-3 text-center text-xs text-slate-400">ما عندك صور محفوظة بعد. اضغط «حفظ» تحت أي صورة.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {gallery.map((g) => (
                    <div key={g.id} className="group relative overflow-hidden rounded-xl border border-white/10">
                      <a href={g.url} target="_blank" rel="noopener noreferrer" aria-label={g.prompt || "صورة محفوظة"}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.url} alt={g.prompt || "صورة محفوظة"} loading="lazy" className="aspect-square w-full object-cover" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void removeCloud(g)}
                        aria-label="حذف الصورة"
                        className="absolute end-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
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
