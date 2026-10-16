"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Code2,
  Eye,
  ExternalLink,
  Loader2,
  X,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-context";

type DeviceType = "desktop" | "tablet" | "mobile";

interface WebPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

const DEVICE_SIZES: Record<DeviceType, { width: string; label: string }> = {
  desktop: { width: "100%", label: "حاسوب" },
  tablet: { width: "768px", label: "لوحة" },
  mobile: { width: "375px", label: "جوال" },
};

/**
 * Nexus Web — real generation: the prompt goes to /api/web-gen where the code
 * task chain (or the built-in template engine without keys) writes a complete
 * single-file HTML page. Preview it live, copy the code, or open it full-size.
 */
export function WebPreview({ isOpen, onClose, initialCode }: WebPreviewProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [code, setCode] = useState(initialCode || "");
  const [previewKey, setPreviewKey] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);

  const generateWebsite = async () => {
    const p = prompt.trim();
    if (!p || isGenerating) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const r = await apiFetch("/api/web-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; html?: string; engine?: string; code?: string };
      if (!r.ok || !d.ok || !d.html) {
        setGenError(d.code === "RATE" ? "محاولات كثيرة — انتظر دقيقة." : "تعذّر توليد الموقع. حاول مرة أخرى.");
        return;
      }
      setCode(d.html);
      setEngine(d.engine ?? null);
      setPreviewKey((k) => k + 1);
      setActiveTab("preview");
    } catch {
      setGenError("تعذّر الاتصال بالخادم.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  const openFull = () => {
    const blob = new Blob([code], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-7xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl max-h-[95vh] flex flex-col"
      >
        {/* Header */}
        <div className="relative border-b border-(--line) bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-transparent p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/30">
                <Globe className="size-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-(--ink)">معاينة المواقع والتطبيقات</h2>
                <p className="text-[11px] text-(--ink-3)">
                  {engine ? `مولّد بواسطة ${engine}` : "كود HTML حقيقي مولّد بالذكاء الاصطناعي"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-(--glass-hi) rounded-xl p-1">
                {(["desktop", "tablet", "mobile"] as DeviceType[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDevice(d)}
                    aria-label={DEVICE_SIZES[d].label}
                    className={cn("grid size-8 cursor-pointer place-items-center rounded-lg transition", device === d ? "bg-blue-500 text-white" : "text-(--ink-3) hover:text-(--ink)")}
                  >
                    {d === "desktop" ? <Monitor className="size-4" /> : d === "tablet" ? <Tablet className="size-4" /> : <Smartphone className="size-4" />}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-(--glass-hi) rounded-xl p-1">
                <button
                  onClick={() => setActiveTab("preview")}
                  className={cn("flex cursor-pointer items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] transition", activeTab === "preview" ? "bg-blue-500 text-white" : "text-(--ink-3)")}
                >
                  <Eye className="size-3.5" /> معاينة
                </button>
                <button
                  onClick={() => setActiveTab("code")}
                  className={cn("flex cursor-pointer items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] transition", activeTab === "code" ? "bg-blue-500 text-white" : "text-(--ink-3)")}
                >
                  <Code2 className="size-3.5" /> الكود
                </button>
              </div>

              <button
                onClick={onClose}
                aria-label="إغلاق"
                className="grid size-9 cursor-pointer place-items-center rounded-xl bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80 transition"
              >
                <X className="size-4.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Prompt input */}
        <div className="p-4 border-b border-(--line)">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void generateWebsite()}
              placeholder="صف الموقع: مثال «متجر إلكتروني للأزياء» أو «مطعم شعبي» أو «لوحة تحكم إحصائيات»"
              className="flex-1 rounded-xl border border-(--line) bg-(--glass-hi) px-4 py-3 text-[13.5px] text-(--ink) placeholder:text-(--ink-3) focus:border-blue-500/50 focus:outline-none"
              dir="auto"
            />
            <button
              onClick={() => void generateWebsite()}
              disabled={isGenerating || !prompt.trim()}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold transition",
                isGenerating || !prompt.trim()
                  ? "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/30 hover:scale-105"
              )}
            >
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isGenerating ? "جاري التوليد..." : "توليد الموقع"}
            </button>
          </div>
          {genError && <p className="mt-2 text-[12px] text-red-400">{genError}</p>}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[#0b0e1a]">
          {activeTab === "preview" ? (
            <div className="h-full flex items-center justify-center p-4 overflow-y-auto">
              <div
                className="transition-all duration-300 rounded-xl overflow-hidden shadow-2xl bg-white h-full"
                style={{ width: DEVICE_SIZES[device].width, maxWidth: "100%" }}
              >
                {code ? (
                  <iframe
                    key={previewKey}
                    srcDoc={code}
                    className="w-full h-full bg-white"
                    sandbox="allow-scripts"
                    title="معاينة الموقع"
                  />
                ) : (
                  <div className="w-full h-full min-h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-900">
                    <Globe className="size-14 mb-4 opacity-50" />
                    <p className="text-[15px]">اكتب وصف الموقع واضغط «توليد الموقع»</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 bg-[#11142a] border-b border-[#1d2240]">
                <span className="text-[12px] text-slate-400" dir="ltr">
                  index.html — single file
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={openFull}
                    className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-white transition"
                  >
                    <ExternalLink className="size-3.5" /> فتح بحجم كامل
                  </button>
                  <button onClick={copyCode} className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-white transition">
                    {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copied ? "تم النسخ!" : "نسخ"}
                  </button>
                </div>
              </div>
              <textarea
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setPreviewKey((k) => k + 1);
                }}
                className="flex-1 bg-[#0b0e1a] text-slate-300 p-4 font-mono text-[12px] resize-none focus:outline-none"
                spellCheck={false}
                dir="ltr"
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
