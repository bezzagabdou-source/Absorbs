"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Image as ImageIcon, 
  Download, 
  RefreshCw, 
  Loader2, 
  Sparkles,
  X,
  Wand2,
  Palette,
  Settings2
} from "lucide-react";
import { cn } from "@/lib/utils";

type ImageModel = "dall-e-3" | "stable-diffusion" | "midjourney" | "flux";

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  timestamp: number;
}

interface ImageGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
}

const MODELS: { id: ImageModel; name: string; desc: string; icon: any; color: string }[] = [
  { id: "dall-e-3", name: "DALL-E 3", desc: "أفضل للمشاهد الواقعية", icon: Sparkles, color: "from-teal-400 to-cyan-500" },
  { id: "stable-diffusion", name: "Stable Diffusion XL", desc: "سريع ومرن", icon: Palette, color: "from-purple-400 to-pink-500" },
  { id: "midjourney", name: "Midjourney V6", desc: "فني وإبداعي", icon: Wand2, color: "from-indigo-400 to-purple-500" },
  { id: "flux", name: "FLUX Pro", desc: "الأقوى في النصوص العربية", icon: ImageIcon, color: "from-amber-400 to-orange-500" },
];

const STYLES = [
  { id: "realistic", name: "واقعي", prompt: "photorealistic, 8k, highly detailed" },
  { id: "artistic", name: "فني", prompt: "digital art, trending on artstation, masterpiece" },
  { id: "anime", name: "أنمي", prompt: "anime style, studio ghibli, vibrant colors" },
  { id: "3d", name: "ثلاثي الأبعاد", prompt: "3d render, octane, cinematic lighting" },
  { id: "oil", name: "زيتي", prompt: "oil painting, classical art, canvas texture" },
];

export function ImageGenerator({ isOpen, onClose, initialPrompt }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [selectedModel, setSelectedModel] = useState<ImageModel>("dall-e-3");
  const [selectedStyle, setSelectedStyle] = useState("realistic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");

  const generateImage = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      // هنا يمكن ربط API حقيقي
      // مؤقتاً نستخدم placeholder
      const style = STYLES.find(s => s.id === selectedStyle);
      const fullPrompt = `${prompt}, ${style?.prompt}`;

      // محاكاة التوليد
      await new Promise(r => setTimeout(r, 3000));

      const newImage: GeneratedImage = {
        id: Date.now().toString(),
        url: `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${aspectRatio === "16:9" ? 1024 : aspectRatio === "9:16" ? 768 : 1024}&height=${aspectRatio === "16:9" ? 576 : aspectRatio === "9:16" ? 1344 : 1024}&seed=${Math.random()}`,
        prompt: fullPrompt,
        model: selectedModel,
        timestamp: Date.now(),
      };

      setImages(prev => [newImage, ...prev]);
    } catch (err) {
      setError("فشل توليد الصورة. حاول مرة أخرى.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = async (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-image-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="relative border-b border-(--line) bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-transparent p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/30">
                    <ImageIcon className="size-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-(--ink)">استوديو توليد الصور</h2>
                    <p className="text-sm text-(--ink-2)">أقوى نماذج توليد الصور بالذكاء الاصطناعي</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid size-10 place-items-center rounded-xl bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80 transition"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* لوحة التحكم */}
                <div className="lg:col-span-1 space-y-4">
                  {/* اختيار النموذج */}
                  <div>
                    <label className="text-sm font-semibold text-(--ink) mb-2 block">النموذج</label>
                    <div className="space-y-2">
                      {MODELS.map((model) => (
                        <button
                          key={model.id}
                          onClick={() => setSelectedModel(model.id)}
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl border p-3 transition",
                            selectedModel === model.id
                              ? "border-purple-500/30 bg-purple-500/10"
                              : "border-(--line) bg-(--glass-hi) hover:bg-(--glass-hi)/80"
                          )}
                        >
                          <div className={cn("grid size-10 place-items-center rounded-lg bg-gradient-to-br", model.color)}>
                            <model.icon className="size-5 text-white" />
                          </div>
                          <div className="text-start">
                            <div className="font-semibold text-(--ink) text-sm">{model.name}</div>
                            <div className="text-xs text-(--ink-3)">{model.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* اختيار النمط */}
                  <div>
                    <label className="text-sm font-semibold text-(--ink) mb-2 block">النمط الفني</label>
                    <div className="flex flex-wrap gap-2">
                      {STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => setSelectedStyle(style.id)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                            selectedStyle === style.id
                              ? "bg-purple-500 text-white"
                              : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                          )}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* نسبة الأبعاد */}
                  <div>
                    <label className="text-sm font-semibold text-(--ink) mb-2 block">الأبعاد</label>
                    <div className="flex gap-2">
                      {(["1:1", "16:9", "9:16"] as const).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          className={cn(
                            "flex-1 rounded-lg py-2 text-sm font-medium transition",
                            aspectRatio === ratio
                              ? "bg-purple-500 text-white"
                              : "bg-(--glass-hi) text-(--ink-2)"
                          )}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* منطقة العرض */}
                <div className="lg:col-span-2">
                  {/* حقل الإدخال */}
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
                        onClick={generateImage}
                        disabled={isGenerating || !prompt.trim()}
                        className={cn(
                          "absolute bottom-3 end-3 flex items-center gap-2 rounded-xl px-4 py-2 font-semibold transition",
                          isGenerating || !prompt.trim()
                            ? "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                            : "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 hover:scale-105"
                        )}
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            جاري التوليد...
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" />
                            توليد
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* عرض الصور */}
                  <div className="grid grid-cols-2 gap-4">
                    <AnimatePresence>
                      {images.map((img) => (
                        <motion.div
                          key={img.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="group relative aspect-square rounded-2xl overflow-hidden border border-(--line) bg-(--glass-hi)"
                        >
                          <img
                            src={img.url}
                            alt={img.prompt}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                            <button
                              onClick={() => downloadImage(img.url)}
                              className="grid size-10 place-items-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition"
                            >
                              <Download className="size-5" />
                            </button>
                            <button
                              onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                              className="grid size-10 place-items-center rounded-xl bg-red-500/80 text-white hover:bg-red-500 transition"
                            >
                              <X className="size-5" />
                            </button>
                          </div>
                          <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-xs text-white/80 truncate">{img.prompt}</p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Placeholder */}
                    {images.length === 0 && !isGenerating && (
                      <div className="col-span-2 aspect-video rounded-2xl border-2 border-dashed border-(--line) flex flex-col items-center justify-center text-(--ink-3)">
                        <ImageIcon className="size-12 mb-3 opacity-50" />
                        <p>الصور المولدة ستظهر هنا</p>
                      </div>
                    )}

                    {/* Loading skeleton */}
                    {isGenerating && (
                      <div className="col-span-2 aspect-video rounded-2xl border border-(--line) bg-(--glass-hi) flex flex-col items-center justify-center">
                        <Loader2 className="size-8 animate-spin text-purple-400 mb-3" />
                        <p className="text-sm text-(--ink-2)">جاري إنشاء صورتك...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
