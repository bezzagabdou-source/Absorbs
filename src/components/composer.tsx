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
} from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { NEXUS_MODELS } from "@/lib/models";
import { useNexus } from "@/lib/store";
import { Tooltip } from "@/components/ui";

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
          "press flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold text-(--ink-2) transition-colors hover:bg-(--glass-hi) hover:text-(--ink) disabled:opacity-50",
          open && "bg-(--glass-hi) text-(--ink)",
        )}
      >
        <Sparkles className="size-3.5 text-(--accent)" />
        <span dir="ltr">{current.name}</span>
        {current.badge && (
          <span className="rounded-md bg-(--accent)/15 px-1.5 py-px text-[9.5px] font-bold tracking-wider text-(--accent)">
            {current.badge}
          </span>
        )}
        <ChevronDown className={cn("size-3.5 text-(--ink-3) transition-transform duration-200", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="glass-pop absolute bottom-full start-0 z-50 mb-2 w-[19rem] origin-bottom rounded-2xl p-2"
          >
            <div className="px-2.5 pt-1.5 pb-2 text-[10.5px] font-bold tracking-[0.14em] text-(--ink-3) uppercase">
              محرّك الذكاء
            </div>
            {NEXUS_MODELS.map((m) => {
              const active = m.id === model;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "press flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                    active ? "bg-(--accent)/10" : "hover:bg-(--glass-hi)",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-4.5 place-items-center rounded-full border transition-colors",
                      active ? "border-(--accent) bg-(--accent)" : "border-(--line-2)",
                    )}
                  >
                    {active && <Check className="size-3 text-white" strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-(--ink)" dir="ltr">{m.name}</span>
                      {m.badge && (
                        <span className="rounded-md bg-(--accent)/15 px-1.5 py-px text-[9px] font-bold tracking-wider text-(--accent)">
                          {m.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-(--ink-2)">{m.tagline}</span>
                    <span className="mt-1.5 flex items-center gap-4">
                      <Dots n={m.speed} icon="zap" />
                      <Dots n={m.iq} icon="brain" />
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── voice recorder ──────────────────────────────────────────── */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return Ctor ? new Ctor() : null;
}

function VoiceOverlay({
  seconds,
  onCancel,
  onDone,
  supported,
}: {
  seconds: number;
  onCancel: () => void;
  onDone: () => void;
  supported: boolean;
}) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-full items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3"
    >
      <span className="relative grid size-9 place-items-center rounded-full bg-red-500 text-white">
        <Mic className="size-4" />
        <span
          className="absolute inset-0 rounded-full bg-red-500"
          style={{ animation: "ping-ring 1.4s cubic-bezier(0,0,.2,1) infinite" }}
        />
      </span>
      <span className="eq" dir="ltr" aria-hidden>
        <span /><span /><span /><span /><span /><span /><span />
      </span>
      <span className="font-mono text-sm font-semibold text-red-400 tabular-nums" dir="ltr">
        {mm}:{ss}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-(--ink-2)">
        {supported ? "تكلّم الآن… يتم تحويل صوتك إلى نص" : "المتصفح لا يدعم التعرف الصوتي — سيتم الإدخال يدويًا"}
      </span>
      <button
        onClick={onCancel}
        className="press cursor-pointer rounded-xl px-3 py-1.5 text-[12.5px] font-semibold text-(--ink-2) hover:bg-(--glass-hi) hover:text-(--ink)"
      >
        إلغاء
      </button>
      <button
        onClick={onDone}
        className="btn-primary press cursor-pointer rounded-xl px-3.5 py-1.5 text-[12.5px] font-bold"
      >
        إدخال
      </button>
    </motion.div>
  );
}

/* ── the composer ────────────────────────────────────────────── */

export function Composer() {
  const { send, stop, streaming } = useNexus();
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const recBaseRef = useRef("");

  /* autosize */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  /* recording timer */
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const next = Array.from(list)
      .slice(0, 6)
      .map((f) => ({
        id: `${f.name}-${f.size}-${f.lastModified}`,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
      }));
    setFiles((prev) => [...prev, ...next].slice(0, 6));
  }, []);

  const submit = useCallback(() => {
    const text = value.trim();
    if ((!text && files.length === 0) || streaming) return;
    const note =
      files.length > 0
        ? `\n\n**مرفقات:** ${files.map((f) => `\`${f.name}\` (${formatBytes(f.size)})`).join(" · ")}`
        : "";
    void send(text + note);
    setValue("");
    setFiles([]);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [files, send, streaming, value]);

  const startRecording = useCallback(() => {
    const recog = getRecognition();
    setSpeechSupported(Boolean(recog));
    recBaseRef.current = value;
    if (recog) {
      recog.lang = "ar-DZ";
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = (e) => {
        let transcript = "";
        for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
        const base = recBaseRef.current.trim();
        setValue(base ? `${base} ${transcript}` : transcript);
      };
      recog.onend = () => setRecording(false);
      try {
        recog.start();
        recogRef.current = recog;
      } catch {
        recogRef.current = null;
      }
    }
    setRecSeconds(0);
    setRecording(true);
  }, [value]);

  const stopRecording = useCallback((insert: boolean) => {
    recogRef.current?.stop();
    recogRef.current = null;
    if (!insert) setValue(recBaseRef.current);
    setRecording(false);
  }, []);

  const canSend = (value.trim().length > 0 || files.length > 0) && !streaming;

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
      }}
    >
      <motion.div
        animate={dragOver ? { scale: 1.015 } : { scale: 1 }}
        className={cn(
          "glass-2 hairline rounded-[26px] p-2.5 transition-shadow duration-300",
          dragOver && "shadow-[var(--glow-a)]",
        )}
      >
        {/* drag overlay */}
        <AnimatePresence>
          {dragOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[26px] border-2 border-dashed border-(--accent) bg-(--accent)/10 backdrop-blur-sm"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-(--accent)">
                <Paperclip className="size-4" /> أسقط الملفات هنا
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* attachments */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div layout className="flex flex-wrap gap-2 px-2 pt-1.5 pb-2.5">
              <AnimatePresence>
                {files.map((f) => (
                  <AttachmentChip key={f.id} file={f} onRemove={() => setFiles((p) => p.filter((x) => x.id !== f.id))} />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {recording ? (
          <VoiceOverlay
            seconds={recSeconds}
            supported={speechSupported}
            onCancel={() => stopRecording(false)}
            onDone={() => stopRecording(true)}
          />
        ) : (
          <div className="flex items-end gap-1.5">
            {/* attach */}
            <Tooltip label="إرفاق ملفات">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="press mb-0.5 grid size-9.5 shrink-0 cursor-pointer place-items-center rounded-xl text-(--ink-3) transition-colors hover:bg-(--glass-hi) hover:text-(--ink)"
                aria-label="إرفاق ملفات"
              >
                <Paperclip className="size-[18px]" />
              </button>
            </Tooltip>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {/* textarea */}
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="اسأل Nexus أيّ شيء…"
              dir="auto"
              className="scroll-slim max-h-50 min-h-9.5 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[15px] leading-relaxed text-(--ink) outline-none placeholder:text-(--ink-3)"
            />

            {/* voice */}
            <Tooltip label="إملاء صوتي">
              <button
                type="button"
                onClick={startRecording}
                className="press mb-0.5 grid size-9.5 shrink-0 cursor-pointer place-items-center rounded-xl text-(--ink-3) transition-colors hover:bg-(--glass-hi) hover:text-(--ink)"
                aria-label="إملاء صوتي"
              >
                <Mic className="size-[18px]" />
              </button>
            </Tooltip>

            {/* send / stop */}
            <div className="mb-0.5 shrink-0">
              {streaming ? (
                <Tooltip label="إيقاف التوليد">
                  <button
                    type="button"
                    onClick={stop}
                    className="btn-primary grid size-9.5 cursor-pointer place-items-center rounded-xl"
                    aria-label="إيقاف"
                  >
                    <Square className="size-4" fill="currentColor" />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip label="إرسال">
                  <motion.button
                    type="button"
                    onClick={submit}
                    disabled={!canSend}
                    aria-label="إرسال"
                    animate={canSend ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.35 }}
                    className="btn-primary grid size-9.5 cursor-pointer place-items-center rounded-xl"
                  >
                    <ArrowUp className="size-[18px]" strokeWidth={2.6} />
                  </motion.button>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        {/* bottom bar */}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-(--line) pt-1.5">
          <ModelSelector />
          <span className="hidden pe-2 text-[10.5px] font-medium text-(--ink-3) sm:block" dir="ltr">
            <kbd className="rounded-md border border-(--line-2) bg-(--glass-hi) px-1.5 py-0.5 font-sans">Enter</kbd>{" "}
            للإرسال ·{" "}
            <kbd className="rounded-md border border-(--line-2) bg-(--glass-hi) px-1.5 py-0.5 font-sans">Shift+Enter</kbd>{" "}
            سطر جديد
          </span>
        </div>
      </motion.div>
    </div>
  );
}
