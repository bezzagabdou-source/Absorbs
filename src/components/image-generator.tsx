"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image as ImageIcon, Download, Loader2, RefreshCw, Sparkles, X, Palette, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type ImageModelId = "flux" | "turbo";
type Status = "loading" | "done" | "error";

interface GeneratedImage {
  id: string;
  url: string; // object URL (blob) once loaded
  src: string; // the remote url
  prompt: string;
  model: string;
  status: Status;
  seed: number;
}

interface ImageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

/**
 * Nexus Image Studio — REAL generation through the free Pollinations endpoint
 * (flux / turbo). No fake "model" labels: what you pick is what runs.
 * Images are fetched to a blob so loading & errors are real and download
 * works offline of CORS.
 */
const MODELS: { id: ImageModelId; name: string; desc: string; icon: typeof Zap; color: string }[] = [
  { id: "flux", name: "Nexus Flux", desc: "جودة عالية — التفاصيل دقيقة", icon: Sparkles, color: "from-purple-400 to-pink-500" },
  { id: "turbo", name: "Nexus Turbo", desc: "أسرع توليد — مناسب للمسودات", icon: Zap, color: "from-amber-400 to-orange-500" },
];

const STYLES = [
  { id: "none", name: "حر", prompt: "" },
  { id: "realistic", name: "واقعي", prompt: "photorealistic, 8k, highly detailed" },
  { id: "artistic", name: "فني", prompt: "digital art, trending on artstation, masterpiece" },
  { id: "anime", name: "أنمي", prompt: "anime style, studio ghibli, vibrant colors" },
  { id: "3d", name: "ثلاثي الأبعاد", prompt: "3d render, octane, cinematic lighting" },
  { id: "oil", name: "زيتي", prompt: "oil painting, classical art, canvas texture" },
];

function pollinationsUrl(prompt: string, model: ImageModelId, ratio: "1:1" | "16:9" | "9:16", seed: number): string {
  const size = ratio === "16:9" ? "1024x576" : ratio === "9:16" ? "768x1344" : "1024x1024";
  const [w, h] = size.split("x");
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&model=${model}&nolog=true`;
}

export function ImageGenerator({ isOpen, onClose, initialPrompt }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [selectedModel, setSelectedModel] = useState<ImageModelId>("flux");
  const [selectedStyle, setSelectedStyle] = useState("none");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generateImage = useCallback(
    async (existing?: GeneratedImage) => {
      const p = (existing?.prompt ?? prompt).trim();
      if (!p) return;
      setError(null);

      const style = STYLES.find((s) => s.id === (existing ? selectedStyle : selectedStyle));
      const fullPrompt = style?.prompt ? `${p}, ${style.prompt}` : p;
      const seed = Math.floor(Math.random() * 1_000_000);
      const model = selectedModel;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const src = pollinationsUrl(fullPrompt, model, aspectRatio, seed);

      const entry: GeneratedImage = { id, url: "", src, prompt: fullPrompt, model, status: "loading", seed };
      setImages((prev) => [entry, ...prev.filter((i) => i.id !== existing?.id)].slice(0, 8));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const t = setTimeout(() => ctrl.abort(), 120_000);
        const r = await fetch(src, { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error(`http_${r.status}`);
        const blob = await r.blob();
        if (!blob.type.startsWith("image/")) throw new Error("not-an-image");
        const url = URL.createObjectURL(blob);
        setImages((prev) => prev.map((i) => (i.id === id ? { ...i, url, status: "done" } : i)));
      } catch {
        setImages((prev) => prev.map((i) => (i.id === id ? { ...i, status: "error" } : i)));
        setError("فشل توليد الصورة — تحقق من الشبكة وأعد المحاولة.");
      }
    },
    [prompt, selectedModel, selectedStyle, aspectRatio]
  );

  const downloadImage = async (img: GeneratedImage) => {
    if (!img.url) return;
    const a = document.createElement("a");
    a.href = img.url;
    a.download = `nexus-image-${img.seed}.png`;
    a.click();
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xl"
      onClick={close}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="relative border-b border-(--line) bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/30">
                <ImageIcon className="size-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-(--ink)">استوديو توليد الصور</h2>
                <p className="text-[11.5px] text-(--ink-3)">توليد حقيقي عبر Flux / Turbo — يدعم العربية</p>
              </div>
            </div>
            <button onClick={close} aria-label="إغلاق" className="grid size-9 cursor-pointer place-items-center rounded-xl bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80 transition">
              <X className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* controls */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              <div>
                <label className="text-[12.5px] font-semibold text-(--ink) mb-2 block">المحرك</label>
                <div className="flex flex-col gap-2">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={cn(
                        "w-full flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
                        selectedModel === m.id ? "border-purple-500/40 bg-purple-500/10" : "border-(--line) bg-(--glass-hi) hover:bg-(--glass-hi)/80"
                      )}
                    >
                      <div className={cn("grid size-9 place-items-center rounded-lg bg-gradient-to-br", m.color)}>
                        <m.icon className="size-4 text-white" />
                      </div>
                      <div className="text-start">
                        <div className="font-semibold text-(--ink) text-[13px]">{m.name}</div>
                        <div className="text-[10.5px] text-(--ink-3)">{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12.5px] font-semibold text-(--ink) mb-2 block">النمط</label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={cn(
                        "cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                        selectedStyle === s.id ? "bg-purple-500 text-white" : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12.5px] font-semibold text-(--ink) mb-2 block">الأبعاد</label>
                <div className="flex gap-1.5">
                  {(["1:1", "16:9", "9:16"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={cn(
                        "flex-1 cursor-pointer rounded-lg py-2 text-[12px] font-medium transition",
                        aspectRatio === r ? "bg-purple-500 text-white" : "bg-(--glass-hi) text-(--ink-2)"
                      )}
                      dir="ltr"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* output */}
            <div className="lg:col-span-2">
              <div className="mb-4">
                <div className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="صف الصورة التي تريدها... (يدعم العربية)"
                    className="w-full h-24 rounded-2xl border border-(--line) bg-(--glass-hi) p-4 text-(--ink) placeholder:text-(--ink-3) resize-none focus:border-purple-500/50 focus:outline-none"
                    dir="auto"
                  />
                  <button
                    onClick={() => void generateImage()}
                    disabled={!prompt.trim()}
                    className={cn(
                      "absolute bottom-3 end-3 flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition",
                      prompt.trim()
                        ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:scale-105"
                        : "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                    )}
                  >
                    <Sparkles className="size-4" />
                    توليد
                  </button>
                </div>
                {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence>
                  {images.map((img) => (
                    <motion.div
                      key={img.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="group relative aspect-square rounded-2xl overflow-hidden border border-(--line) bg-(--glass-hi)"
                    >
                      {img.status === "loading" && (
                        <div className="absolute inset-0 grid place-items-center">
                          <div className="flex flex-col items-center gap-2 text-(--ink-3)">
                            <Loader2 className="size-7 animate-spin text-purple-400" />
                            <span className="text-[11px]">جاري التوليد…</span>
                          </div>
                        </div>
                      )}
                      {img.status === "error" && (
                        <div className="absolute inset-0 grid place-items-center">
                          <div className="flex flex-col items-center gap-2 text-red-400">
                            <X className="size-6" />
                            <span className="text-[11px]">فشل التوليد</span>
                          </div>
                        </div>
                      )}
                      {img.status === "done" && img.url && (
                        <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                      )}
                      {img.status === "done" && (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                          <button
                            onClick={() => void downloadImage(img)}
                            aria-label="تنزيل"
                            className="grid size-9 cursor-pointer place-items-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition"
                          >
                            <Download className="size-4.5" />
                          </button>
                          <button
                            onClick={() => void generateImage(img)}
                            aria-label="إعادة توليد"
                            className="grid size-9 cursor-pointer place-items-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition"
                          >
                            <RefreshCw className="size-4.5" />
                          </button>
                          <button
                            onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                            aria-label="حذف"
                            className="grid size-9 cursor-pointer place-items-center rounded-xl bg-red-500/80 text-white hover:bg-red-500 transition"
                          >
                            <X className="size-4.5" />
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-[10px] text-white/80 truncate">{img.prompt}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {images.length === 0 && (
                  <div className="col-span-2 aspect-video rounded-2xl border-2 border-dashed border-(--line) flex flex-col items-center justify-center text-(--ink-3)">
                    <ImageIcon className="size-12 mb-3 opacity-50" />
                    <p className="text-[13px]">الصور المولدة ستظهر هنا</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
