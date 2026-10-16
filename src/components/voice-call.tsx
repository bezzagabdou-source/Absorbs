"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNexus } from "@/lib/store";
import { readSSE } from "@/lib/sse";
import { apiFetch } from "@/lib/auth-context";

/**
 * Nexus Voice — a REAL voice call built from parts that actually work:
 *
 *   • Web Speech API (SpeechRecognition) for speech-to-text — free, in-browser
 *   • the same /api/chat streaming pipeline for the AI (fast engines or local)
 *   • SpeechSynthesis for the AI's voice, sentence by sentence, as the answer
 *     streams in — so it starts speaking before the answer is finished
 *
 * No API key is shipped to the browser, nothing is simulated.
 */

type CallState = "idle" | "starting" | "active" | "ended";
type Phase = "listening" | "thinking" | "speaking";

type AnyWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const AR_VOICES = () => {
  try {
    return window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("ar"));
  } catch {
    return [];
  }
};

function speak(text: string, onDone?: () => void) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    const ar = AR_VOICES()[0];
    if (ar) u.voice = ar;
    u.lang = ar?.lang ?? "ar-DZ";
    u.rate = 1;
    if (onDone) {
      u.onend = onDone;
      u.onerror = onDone;
    }
    window.speechSynthesis.speak(u);
  } catch {
    onDone?.();
  }
}

export function VoiceCall({ onClose }: { onClose: () => void }) {
  const { activeId, model } = useNexus();
  const [state, setState] = useState<CallState>("idle");
  const [phase, setPhase] = useState<Phase>("listening");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [interim, setInterim] = useState("");
  const [log, setLog] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const busyRef = useRef(false);
  const bufferRef = useRef("");

  const SR = typeof window !== "undefined" ? (window as AnyWindow).SpeechRecognition ?? (window as AnyWindow).webkitSpeechRecognition : null;

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    speakerRef.current = speakerOn;
    if (!speakerOn) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
  }, [speakerOn]);

  /* speak one sentence; tracks the "speaking" phase for the UI */
  const speakIfOn = useCallback((text: string) => {
    if (!speakerRef.current || !text.trim()) return;
    setPhase("speaking");
    speak(text, () => {
      try {
        if (!window.speechSynthesis.speaking && !busyRef.current && activeRef.current) setPhase("listening");
      } catch {
        /* noop */
      }
    });
  }, []);

  const ask = useCallback(
    async (text: string) => {
      if (busyRef.current || !activeRef.current) return;
      busyRef.current = true;
      setPhase("thinking");
      setLog((l) => [...l.slice(-30), { role: "user", text }]);
      let answer = "";
      let sentence = "";
      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeId, message: text, model }),
        });
        if (!res.ok || !res.body) throw new Error(`http_${res.status}`);
        await readSSE(res, (event, data) => {
          if (event === "delta") {
            const d = String(data.text ?? "");
            answer += d;
            if (/[.!?…؟\n]/.test(d.slice(-1))) {
              sentence += d;
              if (sentence.trim().length >= 12) {
                const s = sentence.trim();
                sentence = "";
                speakIfOn(s);
              }
            } else {
              sentence += d;
            }
            setLog((l) => {
              const next = [...l];
              const last = next[next.length - 1];
              if (last?.role === "ai") next[next.length - 1] = { role: "ai", text: answer };
              else next.push({ role: "ai", text: answer });
              return next.slice(-30);
            });
          } else if (event === "done" || event === "error") {
            if (sentence.trim()) speakIfOn(sentence.trim());
            bufferRef.current = "";
          }
        });
        if (sentence.trim()) speakIfOn(sentence.trim());
      } catch {
        setLog((l) => [...l, { role: "ai", text: "تعذّر الاتصال بي الآن — حاول مرة أخرى." }]);
      } finally {
        busyRef.current = false;
        setPhase("listening");
      }
    },
    [activeId, model, speakIfOn]
  );

  const startRecognition = useCallback(() => {
    if (!SR || !activeRef.current) return;
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = "ar-DZ";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        if (mutedRef.current) return;
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const t = (r[0]?.transcript ?? "").trim();
            if (t) {
              // the user is talking → interrupt the AI's voice
              try {
                window.speechSynthesis.cancel();
              } catch {
                /* noop */
              }
              setInterim("");
              void ask(t);
            }
          } else {
            interimText += r[0]?.transcript ?? "";
          }
        }
        if (interimText) setInterim(interimText);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError("أذّن الوصول للميكروفون في المتصفح ثم أعد المحاولة.");
        } else if (e.error !== "aborted" && e.error !== "no-speech") {
          /* transient — the loop below restarts */
        }
      };
      rec.onend = () => {
        // keep the call alive: restart unless we ended it ourselves
        if (activeRef.current && !mutedRef.current) {
          try {
            rec.start();
          } catch {
            /* already started */
          }
        }
      };
      try {
        rec.start();
      } catch {
        /* duplicate start */
      }
    } catch {
      setError("تعذّر بدء التعرّف الصوتي.");
    }
  }, [SR, ask]);

  const startCall = async () => {
    setState("starting");
    setError(null);
    if (!SR) {
      setError("متصفحك لا يدعم التعرّف الصوتي — استخدم Chrome أو Edge.");
      setState("idle");
      return;
    }
    try {
      // warm up voices (async in Chrome)
      if (!window.speechSynthesis.getVoices().length) {
        await new Promise<void>((r) => {
          const t = setTimeout(r, 1500);
          window.speechSynthesis.onvoiceschanged = () => {
            clearTimeout(t);
            r();
          };
        });
      }
      activeRef.current = true;
      setState("active");
      setPhase("listening");
      speakIfOn("أهلاً! أنا Nexus. تكلّم وأنا أسمعك.");
      startRecognition();
    } catch {
      setError("تعذّر بدء المكالمة — تأكد من أذونات الميكروفون.");
      setState("idle");
    }
  };

  const endCall = () => {
    activeRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    setState("ended");
    setTimeout(onClose, 1400);
  };

  const closeNow = () => {
    activeRef.current = false;
    try {
      recRef.current?.abort();
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    onClose();
  };

  useEffect(() => {
    return () => {
      activeRef.current = false;
      try {
        recRef.current?.abort();
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    };
  }, []);

  const phaseLabel =
    phase === "thinking"
      ? "يفكّر..."
      : phase === "speaking"
        ? "يتحدث..."
        : muted
          ? "مكتوم — فعّل الميكروفون"
          : "يستمع إليك الآن...";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-xl"
      onClick={closeNow}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) p-8 shadow-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent" />

        <div className="relative flex flex-col items-center">
          {state === "idle" || state === "starting" ? (
            <>
              <div className="relative">
                <div className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                  <Phone className="size-10 text-white" />
                </div>
                <div className="absolute -inset-4 rounded-full bg-indigo-500/20 animate-ping" />
              </div>
              <h3 className="mt-6 text-xl font-bold text-(--ink)">مكالمة صوتية مع Nexus</h3>
              <p className="mt-2 text-sm text-(--ink-2) text-center">
                تكلّم بالعربية — أستسمعك، أفهمك، وأجيبك بصوت.
                <br />
                <span className="text-[11px] text-(--ink-3)">تعرّف صوتي + محرك Nexus — بدون أي ملفات خارجة.</span>
              </p>
              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
              <button
                onClick={() => void startCall()}
                disabled={state === "starting"}
                className="mt-6 flex cursor-pointer items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:scale-105 active:scale-95 disabled:opacity-60"
              >
                <Phone className="size-5" />
                {state === "starting" ? "جاري البدء..." : "بدء المكالمة"}
              </button>
            </>
          ) : state === "active" ? (
            <>
              <div className="relative">
                <div className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30">
                  <Sparkles className="size-8 text-white animate-pulse" />
                </div>
                <div className="absolute -inset-3 rounded-full bg-emerald-500/20 animate-pulse" />
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-1 h-6">
                  {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [4, h * 4, 4] }}
                      transition={{ repeat: Infinity, duration: 1, delay: i * 0.1 }}
                      className="w-1 rounded-full bg-emerald-400"
                    />
                  ))}
                </div>
              </div>

              <h3 className="mt-12 text-lg font-bold text-(--ink)">المكالمة نشطة</h3>
              <p className="mt-1 text-sm text-(--ink-3)">{phaseLabel}</p>

              {(interim || log.length > 0) && (
                <div className="mt-4 w-full max-h-36 overflow-y-auto rounded-xl bg-(--glass-hi) p-3 text-[13px]">
                  {log.slice(-6).map((m, i) => (
                    <p key={i} className={cn("mb-1.5", m.role === "user" ? "text-(--ink-2)" : "text-(--ink)")}>
                      <span className={cn("font-bold", m.role === "user" ? "text-indigo-400" : "text-emerald-400")}>
                        {m.role === "user" ? "أنت:" : "Nexus:"}
                      </span>{" "}
                      {m.text}
                    </p>
                  ))}
                  {interim && <p className="text-(--ink-3) italic">{interim}</p>}
                </div>
              )}

              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={() => {
                    setMuted((v) => !v);
                    if (!muted) {
                      try {
                        recRef.current?.stop();
                      } catch {
                        /* noop */
                      }
                    } else {
                      startRecognition();
                    }
                  }}
                  aria-label={muted ? "إلغاء الكتم" : "كتم"}
                  className={cn(
                    "grid size-12 cursor-pointer place-items-center rounded-full transition",
                    muted ? "bg-red-500/20 text-red-400" : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                  )}
                >
                  {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>

                <button
                  onClick={endCall}
                  aria-label="إنهاء المكالمة"
                  className="grid size-14 cursor-pointer place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:scale-105 active:scale-95"
                >
                  <PhoneOff className="size-6" />
                </button>

                <button
                  onClick={() => setSpeakerOn((v) => !v)}
                  aria-label={speakerOn ? "كتم الصوت" : "تشغيل الصوت"}
                  className={cn(
                    "grid size-12 cursor-pointer place-items-center rounded-full transition",
                    !speakerOn ? "bg-red-500/20 text-red-400" : "bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80"
                  )}
                >
                  {speakerOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-8">
              <div className="grid size-16 place-items-center rounded-full bg-(--glass-hi)">
                <PhoneOff className="size-8 text-(--ink-3)" />
              </div>
              <p className="mt-4 text-(--ink-2)">تم إنهاء المكالمة</p>
            </div>
          )}
        </div>

        {state === "active" && (
          <button
            onClick={closeNow}
            className="absolute end-4 top-4 cursor-pointer text-(--ink-3) hover:text-(--ink)"
            aria-label="إغلاق"
          >
            ✕
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
