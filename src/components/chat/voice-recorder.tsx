"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square, Volume2, X } from "lucide-react";
import {
  DEFAULT_VOICE_PREFS,
  createRecognizer,
  getVoices,
  isRecognitionSupported,
  isSynthesisSupported,
  loadVoicePrefs,
  saveVoicePrefs,
  speak,
  stopSpeaking,
  type Recognizer,
  type VoicePrefs,
} from "@/lib/voice";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Speech-to-Text button                                               */
/* ------------------------------------------------------------------ */

const ERRORS: Record<string, string> = {
  "not-allowed": "الميكروفون مرفوض: فعّله من إعدادات المتصفح",
  "service-not-allowed": "الميكروفون مرفوض: فعّله من إعدادات المتصفح",
  "no-speech": "ما سمعت والو، عاود",
  "audio-capture": "ما لقيتش ميكروفون",
  network: "مشكل في الشبكة",
};

export function VoiceRecorder({
  lang,
  getBase,
  onText,
  onBeforeStart,
  onListeningChange,
  disabled,
  className,
}: {
  /** BCP-47, e.g. "ar-DZ" */
  lang: string;
  /** Text already in the input: dictation is appended to it. */
  getBase?: () => string;
  /** Live transcript (base + dictated text). */
  onText: (text: string, isFinal: boolean) => void;
  /** Return false to block (e.g. Pro gate). */
  onBeforeStart?: () => boolean;
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognizer | null>(null);

  useEffect(() => {
    setSupported(isRecognitionSupported());
    return () => recRef.current?.stop();
  }, []);

  const setL = useCallback(
    (v: boolean) => {
      setListening(v);
      onListeningChange?.(v);
    },
    [onListeningChange]
  );

  const start = useCallback(() => {
    if (onBeforeStart && !onBeforeStart()) return;
    stopSpeaking();
    setError(null);
    const raw = getBase?.().trim() ?? "";
    const base = raw ? `${raw} ` : "";
    const rec = createRecognizer({
      lang,
      onText: (txt, final) => onText(base + txt, final),
      onEnd: () => setL(false),
      onError: (code) => {
        setL(false);
        setError(ERRORS[code] ?? null);
      },
    });
    if (!rec) return;
    recRef.current = rec;
    if (rec.start()) setL(true);
  }, [onBeforeStart, getBase, lang, onText, setL]);

  const toggle = () => (listening ? recRef.current?.stop() : start());

  // auto-hide the error hint
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  if (!supported) return null;

  return (
    <span className="relative inline-grid">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-pressed={listening}
        aria-label={listening ? "إيقاف التسجيل" : "تكلّم"}
        title={listening ? "إيقاف التسجيل" : "تكلّم"}
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:opacity-40",
          listening
            ? "bg-rose-500/20 text-rose-600 dark:text-rose-200"
            : "text-slate-500 hover:bg-slate-900/8 hover:text-brand-600 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-brand-300",
          className
        )}
      >
        {listening && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border border-rose-400/60"
            animate={{ scale: [1, 1.5], opacity: [0.7, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {listening ? (
          <span className="flex h-5 items-center gap-[3px]" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <motion.i
                key={i}
                className="w-[3px] rounded-full bg-current"
                animate={{ height: ["35%", "100%", "35%"] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
              />
            ))}
          </span>
        ) : (
          <Mic className="size-4" />
        )}
        <span className="sr-only">{listening ? "Recording" : "Voice input"}</span>
      </button>

      <AnimatePresence>
        {error && (
          <motion.span
            role="alert"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full start-0 z-20 mb-2 w-max max-w-[220px] rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Text-to-Speech settings                                             */
/* ------------------------------------------------------------------ */

export function VoiceSettings({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(isSynthesisSupported());
    setPrefs(loadVoicePrefs());
  }, []);

  useEffect(() => {
    if (open) void getVoices().then(setVoices);
  }, [open]);

  const update = (patch: Partial<VoicePrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      saveVoicePrefs(next);
      return next;
    });

  if (!supported) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="إعدادات الصوت"
        title="إعدادات الصوت"
        className="grid size-9 place-items-center rounded-xl border border-slate-900/10 bg-slate-900/5 text-slate-600 transition hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
      >
        <Volume2 className="size-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <GlassCard
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              static
              glow="brand"
              className="absolute end-0 top-full z-50 mt-2 w-72 bg-white/95 p-4 dark:bg-ink-900/95"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-black">صوت الردود</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                  className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-900/8 dark:hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>

              <label className="mb-3 block text-xs font-bold text-slate-600 dark:text-slate-300">
                الصوت
                <select
                  value={prefs.voiceURI}
                  onChange={(e) => update({ voiceURI: e.target.value })}
                  dir="ltr"
                  className="mt-1 w-full rounded-lg border border-slate-900/15 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-ink-800 dark:text-slate-100"
                >
                  <option value="">تلقائي (حسب اللغة)</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>

              {(
                [
                  ["rate", "السرعة"],
                  ["pitch", "درجة الصوت"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="mb-3 block text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span className="flex justify-between">
                    {label}
                    <span dir="ltr" className="tabular-nums text-slate-400">
                      {prefs[k].toFixed(2)}×
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={prefs[k]}
                    onChange={(e) => update({ [k]: Number(e.target.value) })}
                    className="mt-1 w-full accent-brand-500"
                  />
                </label>
              ))}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    speak("مرحبا، أنا Nexus AI v8.4. هذا هو صوتي.", undefined, { ...prefs, lang: "ar-SA" })
                  }
                  className="flex-1 rounded-lg bg-brand-500/15 px-3 py-2 text-xs font-black text-brand-600 ring-1 ring-brand-400/30 dark:text-brand-300"
                >
                  جرّب الصوت
                </button>
                <button
                  type="button"
                  onClick={() => stopSpeaking()}
                  aria-label="إيقاف"
                  className="grid size-9 place-items-center rounded-lg bg-slate-900/8 dark:bg-white/10"
                >
                  <Square className="size-3.5" />
                </button>
              </div>
            </GlassCard>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
