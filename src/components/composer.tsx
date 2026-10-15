"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Square,
  Sparkles,
  X,
  Zap,
  BrainCircuit,
  Check,
  Phone,
  Globe,
  Network,
  Wand2,
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { NEXUS_MODELS } from "@/lib/models";
import { useNexus } from "@/lib/store";
import { Tooltip } from "@/components/ui";
import { VoiceCall } from "@/components/voice-call";
import { ImageGenerator } from "@/components/image-generator";
import { WebPreview } from "@/components/web-preview";
import { AIOrchestrator } from "@/components/ai-orchestrator";

/* ── attachment preview chip ─────────────────────────────────── */

type Attachment = { id: string; name: string; size: number; type: string };

function AttachmentChip({ file, onRemove }: { file: Attachment; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.85, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, y: 8 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="glass hover-lift group/chip relative flex items-center gap-2 rounded-xl py-1.5 ps-2 pe-7 text-[12px] font-medium text-(--ink-2)"
    >
      {isImage ? <ImageIcon className="size-3.5 text-(--accent-2)" /> : <FileText className="size-3.5 text-(--accent)" />}
      <span className="max-w-36 truncate">{file.name}</span>
      <span className="text-[10px] text-(--ink-3)">{formatBytes(file.size)}</span>
      <button
        onClick={onRemove}
        aria-label={`إزالة ${file.name}`}
        className="press absolute end-1 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink)"
      >
        <X className="size-3" />
      </button>
    </motion.span>
  );
}

/* ── model selector ──────────────────────────────────────────── */

function Dots({ n, icon }: { n: number; icon: "zap" | "brain" }) {
  const Icon = icon === "zap" ? Zap : BrainCircuit;
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <Icon
          key={i}
          className={cn("size-3", i <= n ? "text-(--accent)" : "text-(--ink-3)/40")}
          fill={i <= n ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

export function ModelSelector() {
  const { model, setModel, streaming } = useNexus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = NEXUS_MODELS.find((m) => m.id === model) ?? NEXUS_MODELS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={streaming}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "press flex cursor-pointer items-center gap-2 rounded-2xl border border-(--line) bg-(--panel) px-3 py-2 text-[12.5px] font-semibold text-(--ink-2) backdrop-blur-xl transition hover:border-(--line-2) hover:text-(--ink)",
          streaming && "opacity-50",
        )}
      >
        <Sparkles className="size-3.5 text-(--accent)" />
        <span className="max-w-28 truncate">{current.name}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="glass pop-in absolute bottom-full start-0 z-40 mb-2 w-72 overflow-hidden rounded-2xl p-1.5 shadow-pop"
          >
            <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-(--ink-3)">
              اختر المحرك
            </div>
            {NEXUS_MODELS.map((m) => {
              const active = m.id === model;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setModel(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "press relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-start transition",
                    active ? "bg-(--accent)/12 text-(--ink)" : "text-(--ink-2) hover:bg-(--glass-hi)",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      active ? "bg-(--accent)/20 text-(--accent)" : "bg-(--glass-hi) text-(--ink-3)",
                    )}
                  >
                    <BrainCircuit className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-bold">{m.name}</span>
                      {m.badge && (
                        <span className="rounded-md bg-(--accent)/15 px-1.5 py-0.5 text-[9px] font-bold text-(--accent)">
                          {m.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-(--ink-3)">{m.tagline}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Dots n={m.speed} icon="zap" />
                    <Dots n={m.iq} icon="brain" />
                  </span>
                  {active && <Check className="absolute end-2 top-1/2 size-4 -translate-y-1/2 text-(--accent)" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── main composer ───────────────────────────────────────────── */

export function Composer() {
  const { send, streaming, stop } = useNexus();
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [showWebPreview, setShowWebPreview] = useState(false);
  const [showOrchestrator, setShowOrchestrator] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = value.trim().length > 0 && !streaming;

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(resize, [value, resize]);

  const submit = async () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue("");
    requestAnimationFrame(resize);
    await send(text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 6));
  };

  const handleOrchestratorComplete = (results: any[]) => {
    setShowOrchestrator(false);
    // يمكن إضافة منطق لمعالجة النتائج
  };

  return (
    <>
      <div className="relative z-10 mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-5">
        {/* أزرار الميزات السريعة */}
        <div className="mb-3 flex items-center justify-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowVoiceCall(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 px-4 py-2 text-sm font-semibold text-emerald-400 hover:from-emerald-500/30 hover:to-teal-500/30 transition"
          >
            <Phone className="size-4" />
            مكالمة صوتية
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowImageGen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 px-4 py-2 text-sm font-semibold text-purple-400 hover:from-purple-500/30 hover:to-pink-500/30 transition"
          >
            <ImageIcon className="size-4" />
            توليد صور
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowWebPreview(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 px-4 py-2 text-sm font-semibold text-blue-400 hover:from-blue-500/30 hover:to-cyan-500/30 transition"
          >
            <Globe className="size-4" />
            معاينة مواقع
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowOrchestrator(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 px-4 py-2 text-sm font-semibold text-indigo-400 hover:from-indigo-500/30 hover:to-violet-500/30 transition"
          >
            <Network className="size-4" />
            وضع التوزيع الذكي
          </motion.button>
        </div>

        {/* مربع الإدخال الرئيسي */}
        <div className="glass rounded-[26px] p-2 shadow-pop">
          <div className="flex flex-wrap gap-1.5 px-1.5 pb-1.5">
            <AnimatePresence>
              {attachments.map((f) => (
                <AttachmentChip key={f.id} file={f} onRemove={() => setAttachments((p) => p.filter((x) => x.id !== f.id))} />
              ))}
            </AnimatePresence>
          </div>

          <div className="flex items-end gap-1.5">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Tooltip label="إرفاق ملف">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="press grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-(--ink-3) transition hover:bg-(--glass-hi) hover:text-(--ink)"
              >
                <Paperclip className="size-[18px]" />
              </button>
            </Tooltip>

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="اسأل أي شيء... أو اضغط على الميزات بالأعلى"
              className="min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] leading-6 text-(--ink) outline-none placeholder:text-(--ink-3)"
              dir="auto"
            />

            {streaming ? (
              <button
                type="button"
                onClick={stop}
                className="press grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-red-500/15 text-red-400 transition hover:bg-red-500/25"
              >
                <Square className="size-3.5" fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSend}
                className={cn(
                  "press grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl transition",
                  canSend
                    ? "btn-primary text-white"
                    : "cursor-not-allowed bg-(--glass-hi) text-(--ink-3)",
                )}
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
            <ModelSelector />
            <span className="text-[10.5px] text-(--ink-3)">
              Enter للإرسال · Shift+Enter سطر جديد
            </span>
          </div>
        </div>
      </div>

      {/* النوافذ المنبثقة */}
      <AnimatePresence>
        {showVoiceCall && <VoiceCall onClose={() => setShowVoiceCall(false)} />}
        {showImageGen && <ImageGenerator isOpen={showImageGen} onClose={() => setShowImageGen(false)} initialPrompt={value} />}
        {showWebPreview && <WebPreview isOpen={showWebPreview} onClose={() => setShowWebPreview(false)} />}
        {showOrchestrator && (
          <AIOrchestrator 
            isVisible={showOrchestrator} 
            onClose={() => setShowOrchestrator(false)}
            userPrompt={value}
            onTaskComplete={handleOrchestratorComplete}
          />
        )}
      </AnimatePresence>
    </>
  );
}
