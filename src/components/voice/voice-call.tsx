"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, Gauge, Hand, Keyboard, Mic, MicOff, PhoneOff, Sparkles, Waves, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { VoiceSettings } from "@/components/chat/voice-recorder";
import {
  createRecognizer,
  createSpeechQueue,
  isRecognitionSupported,
  plainForSpeech,
  setCloudVoice,
  type Recognizer,
  type SpeechQueue,
} from "@/lib/voice";
import { HANGUP_RE, VOICE_PERSONAS, personaById } from "@/lib/voice-call";
import { EMOTION_PRESETS, PERSONA_VOICES, VOICE_CATALOG, recommendVoices, voiceById } from "@/lib/voice-catalog";
import { usePrefs } from "@/lib/prefs-context";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — the voice is a first-class choice, not a hard-coded table.
 * Every persona ships two curated Gemini voices (masculine / feminine); the
 * user can override it with any of the 30 voices in the catalog and it is
 * remembered across calls.
 */
const VOICE_KEY = "barq_call_voice_v18";

function personaVoice(persona: string, stored?: string | null): string {
  if (stored && VOICE_CATALOG.some((v) => v.id === stored)) return stored;
  const pv = PERSONA_VOICES[persona];
  return pv?.m ?? "Zephyr";
}

const MOODS: { id: "warm" | "energetic" | "calm" | "deep" | "playful" | "pro"; label: string }[] = [
  { id: "warm", label: "ودّي" },
  { id: "energetic", label: "حيوي" },
  { id: "calm", label: "هادئ" },
  { id: "deep", label: "عميق" },
  { id: "playful", label: "مرح" },
  { id: "pro", label: "رسمي" },
];

type Phase = "idle" | "listening" | "thinking" | "speaking" | "paused" | "error";
type Turn = { role: "user" | "assistant"; content: string };

const LANGS = [
  { id: "ar-DZ", label: "عربي / دارجة" },
  { id: "fr-FR", label: "Français" },
  { id: "en-US", label: "English" },
] as const;

const PHASE_LABEL: Record<Phase, string> = {
  idle: "نجهّز المكالمة…",
  listening: "أسمعك… تكلّم",
  thinking: "نفكّر…",
  speaking: "Nexus AI v8.4 يتكلّم — اضغط على الكرة باش تقاطعه",
  paused: "اضغط على الكرة باش نكملو",
  error: "صرا مشكل",
};

const ERR_TEXT: Record<string, string> = {
  QUOTA: "خلصت طاقتك المجانية، تتجدد بعد ساعتين.",
  PRO_ONLY: "هذه الميزة غير متاحة الآن لحسابك.",
  RATE: "براحة شوية، عاود بعد ثواني.",
  NO_KEY: "الذكاء الاصطناعي غير مفعّل على السيرفر.",
  BUSY: "الخادم مشغول، عاود بعد ثواني.",
  UNAUTHENTICATED: "سجّل الدخول من جديد.",
  MIC: "الميكروفون مرفوض: فعّله من إعدادات المتصفح ثم عاود.",
};

/* ---------- text helpers ---------- */

/** Removes fenced code (not read aloud) and holds back an unfinished fence. The prefix is stable while streaming. */
function cleanForVoice(acc: string): string {
  let out = "";
  let i = 0;
  while (i < acc.length) {
    const open = acc.indexOf("```", i);
    if (open < 0) {
      out += acc.slice(i);
      break;
    }
    out += acc.slice(i, open);
    const close = acc.indexOf("```", open + 3);
    if (close < 0) break;
    out += "\n";
    i = close + 3;
  }
  return out;
}

/** Index just after the last finished sentence in `s` (0 = nothing to speak yet). */
function sentenceCut(s: string, final: boolean): number {
  let cut = 0;
  for (let i = 0; i < s.length; i++) {
    if (".!?؟…\n".includes(s[i])) {
      const next = s[i + 1];
      if (next === undefined ? final : /\s/.test(next)) cut = i + 1;
    }
  }
  if (cut === 0) {
    // speak the first clause at once (at a comma) so the voice starts almost instantly
    for (let i = 14; i < s.length - 1; i++) {
      if ((s[i] === "،" || s[i] === ",") && /\s/.test(s[i + 1])) {
        cut = i + 1;
        break;
      }
    }
  }
  if (cut === 0 && s.length > 220) {
    const j = Math.max(s.lastIndexOf("،", 210), s.lastIndexOf(",", 210), s.lastIndexOf(" ", 210));
    if (j > 40) cut = j + 1;
  }
  return cut;
}

/** 1-5 proficiency shown as dots inside the voice picker */
function dots(n: number): string {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return "●".repeat(k) + "○".repeat(5 - k);
}

const mmss = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/* ---------- the living orb ---------- */

const ORB_COLOR: Record<Phase, [number, number, number]> = {
  idle: [148, 163, 184],
  listening: [56, 189, 248],
  thinking: [251, 191, 36],
  speaking: [249, 115, 22],
  paused: [148, 163, 184],
  error: [244, 63, 94],
};

function Orb({ phase, energyRef }: { phase: Phase; energyRef: { current: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const SIZE = 340;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let level = 0;
    let [cr, cg, cb] = ORB_COLOR.idle;

    const draw = () => {
      t += reduce ? 0.004 : 0.016;
      const ph = phaseRef.current;
      let target = 0.06;
      if (ph === "listening") target = 0.12 + energyRef.current * 0.88;
      else if (ph === "speaking") target = Math.min(1, Math.max(0.15, 0.5 + 0.3 * Math.sin(t * 11) + 0.2 * Math.sin(t * 4.3 + 1)));
      else if (ph === "thinking") target = 0.22 + 0.1 * Math.sin(t * 3);
      energyRef.current *= 0.9;
      level += (target - level) * 0.14;

      const want = ORB_COLOR[ph];
      cr += (want[0] - cr) * 0.08;
      cg += (want[1] - cg) * 0.08;
      cb += (want[2] - cb) * 0.08;
      const rgb = (a: number) => `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`;

      const c = SIZE / 2;
      const R = 76 * (1 + 0.16 * level);
      ctx.clearRect(0, 0, SIZE, SIZE);

      // glow
      const glow = ctx.createRadialGradient(c, c, R * 0.4, c, c, R * 2.3);
      glow.addColorStop(0, rgb(0.42));
      glow.addColorStop(1, rgb(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // spectrum ring
      const bars = 60;
      ctx.lineCap = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgb(0.75);
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const wave = 0.5 + 0.5 * Math.sin(i * 1.7 + t * 6 + Math.sin(i * 0.45 + t) * 3);
        const len = 4 + 30 * level * wave;
        const r0 = R + 20;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
        ctx.lineTo(c + Math.cos(a) * (r0 + len), c + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }

      // three wobbling blobs
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        const pts = 96;
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const rad = R + (6 + 16 * level) * Math.sin(a * (3 + k) + t * (1.4 + k * 0.7) + k * 2.1) + k * 3;
          const x = c + Math.cos(a) * rad;
          const y = c + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = rgb(0.34 - k * 0.07);
        ctx.fill();
      }

      // core
      const core = ctx.createRadialGradient(c - R * 0.3, c - R * 0.35, 4, c, c, R * 0.95);
      core.addColorStop(0, "rgba(255,255,255,0.95)");
      core.addColorStop(0.35, rgb(0.95));
      core.addColorStop(1, rgb(0.55));
      ctx.beginPath();
      ctx.arc(c, c, R * 0.82, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [energyRef]);

  return <canvas ref={ref} className="aspect-square w-[min(78vw,340px)]" aria-hidden />;
}

/* ---------- the call ---------- */

export function VoiceCall({
  open,
  locale,
  onClose,
}: {
  open: boolean;
  locale: string;
  /** conversation id of the call (null when nothing was said) */
  onClose: (convId: string | null) => void;
}) {
  const { authFetch } = useAuth();
  const { applyHeaders } = useCredits();
  const { prefs, set: setPref } = usePrefs();

  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [userLine, setUserLine] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState("");
  const [muted, setMuted] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [persona, setPersona] = useState("friend");
  const [lang, setLang] = useState<string>("ar-DZ");
  const [sttOk, setSttOk] = useState(true);
  const [ttsOk, setTtsOk] = useState(true);
  /* v18 — switchable voice, mood, rate, emotion + measured latency */
  const [voice, setVoice] = useState<string>("Zephyr");
  const [mood, setMood] = useState<string>("warm");
  const [rate, setRate] = useState<number>(1.05);
  const [emotion, setEmotion] = useState<string>("neutral");
  const [latency, setLatency] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [gender, setGender] = useState<"any" | "m" | "f">("any");

  // clear cloud voice (ElevenLabs / Gemini TTS) — falls back to the browser voice by itself
  useEffect(() => {
    setCloudVoice(async (text, signal) => {
      // Gemini voice is the primary engine: retry a few times before falling back to the browser voice
      const started = performance.now();
      for (let attempt = 0; attempt < 3; attempt++) {
        if (signal.aborted) return null;
        try {
          const res = await authFetch("/api/voice/tts", {
            method: "POST",
            body: JSON.stringify({
              text,
              voice: voiceRef.current,
              lang: langRef.current.slice(0, 2),
              mood: moodRef.current,
              rate: rateRef.current,
              emotion: emotionRef.current,
              stream: true,
            }),
            signal,
          });
          if (res.ok) {
            const b = await res.blob();
            const msHeader = Number(res.headers.get("x-barq-tts-ms") ?? "") || Math.round(performance.now() - started);
            if (b.size > 500) {
              setLatency(msHeader);
              const engine = res.headers.get("x-barq-voice");
              if (engine && engine !== "gemini") setTtsEngine(engine);
              return b;
            }
          }
        } catch {
          if (signal.aborted) return null;
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      return null;
    });
    return () => setCloudVoice(null);
  }, [authFetch]);

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const langRef = useRef("ar-DZ");
  const personaRef = useRef("friend");
  const histRef = useRef<Turn[]>([]);
  const convRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<SpeechQueue | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const recIdRef = useRef(0);
  const turnRef = useRef(0);
  const heardRef = useRef("");
  const spokenRef = useRef("");
  const silenceRef = useRef(0);
  const energyRef = useRef(0);
  const capRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef("Zephyr");
  const moodRef = useRef("warm");
  const rateRef = useRef(1.05);
  const emotionRef = useRef("neutral");
  const [ttsEngine, setTtsEngine] = useState("gemini");

  langRef.current = lang;
  personaRef.current = persona;
  mutedRef.current = muted;
  voiceRef.current = voice;
  moodRef.current = mood;
  rateRef.current = rate;
  emotionRef.current = emotion;

  /* adopt the saved ATLAS preferences (control centre) for this call */
  useEffect(() => {
    if (!prefs.voice) return;
    setMood((m) => (m === "warm" && prefs.voice.style ? prefs.voice.style : m));
    setRate((r) => (r === 1.05 ? prefs.voice.rate || r : r));
    moodRef.current = prefs.voice.style || moodRef.current;
    rateRef.current = prefs.voice.rate || rateRef.current;
  }, [prefs.voice.style, prefs.voice.rate]);

  const setPh = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* ----- stop everything that is running ----- */
  const stopAll = () => {
    recIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current?.cancel();
    queueRef.current = null;
    recRef.current?.stop();
    recRef.current = null;
  };

  /* ----- listening ----- */
  const listen = () => {
    if (!activeRef.current) return;
    if (mutedRef.current) {
      setPh("paused");
      return;
    }
    stopAll();
    const id = recIdRef.current;
    const rec = createRecognizer({
      lang: langRef.current,
      onText: (txt) => {
        if (id !== recIdRef.current) return;
        heardRef.current = txt;
        setHeard(txt);
        energyRef.current = 0.55 + Math.random() * 0.45;
      },
      onEnd: () => {
        if (id !== recIdRef.current || !activeRef.current) return;
        recRef.current = null;
        if (phaseRef.current !== "listening") return;
        const said = heardRef.current.trim();
        heardRef.current = "";
        setHeard("");
        if (said) {
          silenceRef.current = 0;
          void sendTurn(said);
          return;
        }
        silenceRef.current += 1;
        if (silenceRef.current >= 6) {
          setPh("paused");
          return;
        }
        setTimeout(() => {
          if (activeRef.current && phaseRef.current === "listening" && id === recIdRef.current) listen();
        }, 120);
      },
      onError: (code) => {
        if (id !== recIdRef.current) return;
        if (code === "not-allowed" || code === "service-not-allowed") {
          setErr(ERR_TEXT.MIC);
          setPh("error");
        }
      },
    });
    if (!rec) {
      setSttOk(false);
      setTyping(true);
      setPh("paused");
      return;
    }
    heardRef.current = "";
    setHeard("");
    setPh("listening");
    recRef.current = rec;
    if (!rec.start()) {
      setTimeout(() => {
        if (activeRef.current && id === recIdRef.current && recRef.current === rec && !rec.start()) setPh("paused");
      }, 300);
    }
  };

  /* ----- one conversational turn ----- */
  const sendTurn = async (text: string) => {
    stopAll();
    if (HANGUP_RE.test(text)) {
      hangup();
      return;
    }
    // typed while the previous answer was still coming: close that turn so roles keep alternating
    const prev = histRef.current[histRef.current.length - 1];
    if (prev && prev.role === "user") histRef.current.push({ role: "assistant", content: spokenRef.current.trim() || "…" });
    const myTurn = ++turnRef.current;
    const live = () => activeRef.current && turnRef.current === myTurn;
    setPh("thinking");
    setUserLine(text);
    setReply("");
    setErr("");
    spokenRef.current = "";
    histRef.current.push({ role: "user", content: text.slice(0, 4000) });
    if (histRef.current.length > 24) histRef.current = histRef.current.slice(-24);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const q = createSpeechQueue({
      onStart: () => live() && setPh("speaking"),
      onIdle: () =>
        setTimeout(() => {
          if (live() && phaseRef.current !== "error") listen();
        }, 180),
    });
    queueRef.current = q;

    const fail = (code: string) => {
      if (!live()) return;
      q.cancel();
      const last = histRef.current[histRef.current.length - 1];
      if (last && last.role === "user") histRef.current.pop();
      setErr(ERR_TEXT[code] ?? "ما قدرتش نجاوب، عاود.");
      setPh("error");
    };

    let acc = "";
    let spokenLen = 0;
    try {
      const res = await authFetch("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: convRef.current,
          messages: histRef.current,
          voice: true,
          voicePersona: personaRef.current,
        }),
        signal: ctrl.signal,
      });
      if (!live()) return;
      if (!res.ok || !res.body) {
        let code = "";
        try {
          code = ((await res.json()) as { code?: string }).code ?? "";
        } catch {
          /* not json */
        }
        fail(code || (res.status === 429 ? "RATE" : res.status === 503 ? "BUSY" : "ERROR"));
        return;
      }
      applyHeaders(res);
      const cid = res.headers.get("x-conversation-id");
      if (cid) convRef.current = cid;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (!live()) {
          reader.cancel().catch(() => undefined);
          return;
        }
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const cleaned = cleanForVoice(acc);
        setReply(plainForSpeech(cleaned));
        const pending = cleaned.slice(spokenLen);
        const cut = sentenceCut(pending, false);
        if (cut > 0) {
          q.enqueue(pending.slice(0, cut));
          spokenLen += cut;
          spokenRef.current = cleaned.slice(0, spokenLen);
        }
      }
      acc += decoder.decode();
      const cleaned = cleanForVoice(acc);
      setReply(plainForSpeech(cleaned));
      const rest = cleaned.slice(spokenLen);
      if (rest.trim()) q.enqueue(rest);
      spokenRef.current = cleaned;
      if (!acc.trim()) {
        fail("BUSY");
        return;
      }
      histRef.current.push({ role: "assistant", content: acc.slice(0, 6000) });
      q.finish();
    } catch (e) {
      if ((e as Error).name === "AbortError" || !live()) return;
      fail("BUSY");
    }
  };

  /* ----- user actions ----- */
  const hangup = () => {
    activeRef.current = false;
    turnRef.current++;
    stopAll();
    const id = convRef.current;
    setPh("idle");
    onClose(id);
  };

  const onOrb = () => {
    const ph = phaseRef.current;
    if (ph === "speaking" || ph === "thinking") {
      // interrupt: keep the history consistent, then listen
      const last = histRef.current[histRef.current.length - 1];
      if (last && last.role === "user") histRef.current.push({ role: "assistant", content: spokenRef.current.trim() || "…" });
      turnRef.current++;
      stopAll();
      setTimeout(() => activeRef.current && listen(), 150);
    } else if (ph === "listening") {
      recRef.current?.stop(); // ends the sentence now; onEnd sends it
    } else {
      silenceRef.current = 0;
      setErr("");
      if (mutedRef.current) setMuted(false);
      listen();
    }
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      recIdRef.current++;
      recRef.current?.stop();
      recRef.current = null;
      if (phaseRef.current === "listening") setPh("paused");
    } else if (phaseRef.current === "paused" || phaseRef.current === "error") {
      listen();
    }
  };

  const submitDraft = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    void sendTurn(t);
  };

  /* ----- lifecycle: open / close ----- */
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    histRef.current = [];
    convRef.current = null;
    turnRef.current = 0;
    silenceRef.current = 0;
    setSeconds(0);
    setHeard("");
    setUserLine("");
    setReply("");
    setErr("");
    setMuted(false);
    mutedRef.current = false;
    setTyping(false);
    setSttOk(isRecognitionSupported());
    setTtsOk(true);

    let p = "friend";
    let l = locale === "fr" ? "fr-FR" : locale === "en" ? "en-US" : "ar-DZ";
    try {
      p = localStorage.getItem("barq_call_persona") || p;
      l = localStorage.getItem("barq_call_lang") || l;
    } catch {
      /* private mode */
    }
    if (!VOICE_PERSONAS.some((x) => x.id === p)) p = "friend";
    if (!LANGS.some((x) => x.id === l)) l = "ar-DZ";
    personaRef.current = p;
    langRef.current = l;
    setPersona(p);
    setLang(l);
    // v18 — restore the voice the user chose last time (or the persona default)
    let storedVoice: string | null = null;
    try {
      storedVoice = localStorage.getItem(VOICE_KEY);
    } catch {
      /* private mode */
    }
    const v = personaVoice(p, storedVoice);
    voiceRef.current = v;
    setVoice(v);

    // greeting (also unlocks audio playback: we are inside the click that opened the call)
    setPh("speaking");
    const q = createSpeechQueue({
      onStart: () => undefined,
      onIdle: () => setTimeout(() => activeRef.current && phaseRef.current === "speaking" && listen(), 300),
    });
    queueRef.current = q;
    q.enqueue(personaById(p).greeting);
    q.finish();

    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);

    type WakeLockNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as WakeLockNav).wakeLock?.request("screen").then((l2) => (lock = l2)).catch(() => undefined);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hangup();
      } else if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onOrb();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      activeRef.current = false;
      turnRef.current++;
      stopAll();
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      lock?.release().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the newest caption in view
  useEffect(() => {
    const el = capRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [reply, heard, userLine]);

  const pickPersona = useCallback((id: string) => {
    setPersona(id);
    personaRef.current = id;
    // the persona brings its own curated voice unless the user pinned one
    let stored: string | null = null;
    try {
      localStorage.setItem("barq_call_persona", id);
      stored = localStorage.getItem(VOICE_KEY);
    } catch {
      /* private mode */
    }
    const pv = PERSONA_VOICES[id];
    if (pv && !stored) {
      voiceRef.current = pv.m;
      setVoice(pv.m);
    }
  }, []);

  const pickVoice = useCallback((id: string) => {
    setVoice(id);
    voiceRef.current = id;
    setPref({ voice: { voice: id } });
    try {
      localStorage.setItem(VOICE_KEY, id);
    } catch {
      /* private mode */
    }
  }, [setPref]);

  const pickMood = useCallback((id: string) => {
    setMood(id);
    moodRef.current = id;
    setPref({ voice: { style: id as never } });
  }, [setPref]);

  const pickEmotion = useCallback((id: string) => {
    setEmotion(id);
    emotionRef.current = id;
  }, []);

  const pickRate = useCallback((v: number) => {
    setRate(v);
    rateRef.current = v;
    setPref({ voice: { rate: v } });
  }, [setPref]);

  const pickLang = useCallback((id: string) => {
    setLang(id);
    langRef.current = id;
    try {
      localStorage.setItem("barq_call_lang", id);
    } catch {
      /* private mode */
    }
    // restart the microphone in the new language
    if (phaseRef.current === "listening") setTimeout(() => activeRef.current && listen(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownUser = phase === "listening" && heard ? heard : userLine;
  const active = personaById(persona);

  /* the voice list: best matches for this language/gender/mood first, then the rest */
  const voiceList = useMemo(() => {
    const pool = gender === "any" ? VOICE_CATALOG : VOICE_CATALOG.filter((v) => v.gender === gender);
    const top = recommendVoices({ lang: lang.slice(0, 2), gender, mood: mood as never, limit: 8 }).map((v) => v.id);
    return [...pool].sort((a, b) => Number(top.includes(b.id)) - Number(top.includes(a.id)));
  }, [gender, lang, mood]);
  const currentVoice = voiceById(voice);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="voice-call"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="dialog"
          aria-modal="true"
          aria-label="مكالمة صوتية مع Nexus AI v8.4"
          className="fixed inset-0 z-[95] flex flex-col bg-ink-950/95 text-white backdrop-blur-xl pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {/* header */}
          <div className="flex items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2 text-xs font-black">
              <span className={cn("h-2.5 w-2.5 rounded-full", phase === "error" ? "bg-rose-400" : "animate-pulse bg-emerald-400")} />
              <span dir="ltr" className="tabular-nums text-slate-300">
                {mmss(seconds)}
              </span>
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-slate-300">
                {active.emoji} {active.label}
              </span>
              <span className="hidden rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-slate-300 sm:inline-flex sm:items-center sm:gap-1">
                <Waves className="size-3" /> {voiceById(voice).name.ar}
              </span>
              {latency !== null && (
                <span
                  className={cn(
                    "hidden rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums sm:inline-flex sm:items-center sm:gap-1",
                    latency < 900 ? "bg-emerald-500/18 text-emerald-300" : latency < 1800 ? "bg-amber-500/18 text-amber-300" : "bg-rose-500/18 text-rose-300"
                  )}
                  title="زمن توليد الصوت"
                >
                  <Gauge className="size-3" />
                  <span dir="ltr">{(latency / 1000).toFixed(2)}s</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPicker((v) => !v)}
                aria-pressed={picker}
                aria-label="غيّر الصوت"
                title="غيّر الصوت والأسلوب"
                className={cn(
                  "grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:text-white",
                  picker && "ring-1 ring-brand-400/60 text-white"
                )}
              >
                <Waves className="size-4" />
              </button>
              <VoiceSettings />
              <button
                type="button"
                onClick={() => setTyping((v) => !v)}
                aria-pressed={typing}
                aria-label="اكتب بدل الكلام"
                title="اكتب بدل الكلام"
                className={cn(
                  "grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:text-white",
                  typing && "ring-1 ring-brand-400/60"
                )}
              >
                <Keyboard className="size-4" />
              </button>
            </div>
          </div>

          {/* orb */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4">
            <button
              type="button"
              onClick={onOrb}
              aria-label={PHASE_LABEL[phase]}
              className="grid place-items-center rounded-full outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Orb phase={phase} energyRef={energyRef} />
            </button>
            <p aria-live="polite" className="text-center text-sm font-black text-slate-200">
              {phase === "error" && err ? err : muted && phase === "paused" ? "المايك مسكّر" : PHASE_LABEL[phase]}
            </p>
            {!sttOk && <p className="max-w-xs text-center text-xs text-amber-300">متصفحك ما يدعمش التعرّف على الصوت — اكتب رسائلك وNexus AI v8.4 يرد عليك بصوته.</p>}
            {!ttsOk && <p className="max-w-xs text-center text-xs text-amber-300">متصفحك ما يدعمش القراءة الصوتية — الرد يظهر مكتوب.</p>}

            {/* captions */}
            <div ref={capRef} className="scroll-y max-h-[30vh] w-full max-w-xl space-y-2 rounded-2xl bg-white/[0.04] px-4 py-3 text-center">
              {shownUser && <p className="text-[13px] leading-relaxed text-slate-400">{shownUser}</p>}
              {reply && <p className="text-[17px] font-bold leading-relaxed text-white">{reply}</p>}
              {!shownUser && !reply && <p className="text-[13px] text-slate-500">كلامك وردّ Nexus AI v8.4 يظهرو هنا مباشرة</p>}
            </div>
          </div>

          {/* v18 — voice studio: pick any voice, mood, emotion and speed during the call */}
          <AnimatePresence>
            {picker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="mx-3 mb-2 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl"
              >
                <div className="max-h-[42vh] overflow-y-auto p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="size-4 text-brand-300" />
                    <h2 className="text-[13px] font-black text-white">استوديو الصوت — {VOICE_CATALOG.length} صوتًا</h2>
                    <button type="button" onClick={() => setPicker(false)} aria-label="إغلاق" className="ms-auto grid size-7 place-items-center rounded-lg bg-white/8 text-slate-300 hover:text-white">
                      <X className="size-3.5" />
                    </button>
                  </div>

                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {(["any", "f", "m"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={cn(
                          "h-7 rounded-full px-3 text-[11px] font-black transition",
                          gender === g ? "bg-white/18 text-white" : "bg-white/[0.05] text-slate-400 hover:text-white"
                        )}
                      >
                        {g === "any" ? "الكل" : g === "f" ? "نسائي" : "رجالي"}
                      </button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-white/10" />
                    {MOODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickMood(m.id)}
                        className={cn(
                          "h-7 rounded-full px-3 text-[11px] font-black transition",
                          mood === m.id ? "bg-brand-500/28 text-white ring-1 ring-brand-400/50" : "bg-white/[0.05] text-slate-400 hover:text-white"
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="مشاعر الصوت">
                    {EMOTION_PRESETS.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        role="radio"
                        aria-checked={emotion === e.id}
                        onClick={() => pickEmotion(e.id)}
                        className={cn(
                          "h-7 shrink-0 rounded-full px-3 text-[11px] font-bold transition",
                          emotion === e.id ? "bg-emerald-500/22 text-emerald-200 ring-1 ring-emerald-400/50" : "bg-white/[0.05] text-slate-400 hover:text-white"
                        )}
                      >
                        {e.ar}
                      </button>
                    ))}
                  </div>

                  <div className="mb-2 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2">
                    <span className="shrink-0 text-[11px] font-bold text-slate-300">السرعة</span>
                    <input
                      type="range"
                      min={0.7}
                      max={1.4}
                      step={0.05}
                      value={rate}
                      onChange={(e) => pickRate(Number(e.target.value))}
                      className="nx-range w-full"
                      aria-label="سرعة الكلام"
                    />
                    <span dir="ltr" className="shrink-0 font-mono text-[11px] font-black text-brand-300">{rate.toFixed(2)}×</span>
                  </div>

                  <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {voiceList.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => pickVoice(v.id)}
                          aria-pressed={voice === v.id}
                          className={cn(
                            "flex items-start gap-2 rounded-2xl border px-2.5 py-2 text-right transition active:scale-[0.98]",
                            voice === v.id ? "border-transparent bg-gradient-to-l from-brand-500/35 to-brand-400/15 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                          )}
                        >
                          <span className="text-base leading-none" aria-hidden>{v.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-black">{v.name.ar}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-slate-400">{v.best.ar}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-500" dir="ltr">
                              <span>AR {dots(v.arabic)}</span>
                              <span>FR {dots(v.french)}</span>
                              <span>EN {dots(v.english)}</span>
                            </span>
                          </span>
                          {voice === v.id && <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />}
                        </button>
                      ))}
                  </div>

                  <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
                    المحرك: <span className="font-bold text-slate-300">{ttsEngine}</span> · الصوت: <span className="font-bold text-slate-300">{currentVoice.name.ar}</span> — إن فشل السحاب يرجع تلقائيًا لصوت المتصفح.
                    {latency !== null && <span dir="ltr"> · TTS {latency}ms</span>}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* persona + language: only while paused / before talking, so the call screen stays clean */}
          {(phase === "paused" || phase === "idle" || phase === "error") && (
          <div className="space-y-2 px-3">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="radiogroup" aria-label="شخصية Nexus AI v8.4">
              {VOICE_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={persona === p.id}
                  title={p.hint}
                  onClick={() => pickPersona(p.id)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[12px] font-black transition active:scale-95",
                    persona === p.id ? "bg-gold-400/20 text-gold-200 ring-1 ring-gold-400/50" : "bg-white/[0.06] text-slate-400 hover:text-white"
                  )}
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="لغة الكلام">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.id}
                  onClick={() => pickLang(l.id)}
                  className={cn(
                    "h-7 rounded-full px-3 text-[11px] font-black transition active:scale-95",
                    lang === l.id ? "bg-brand-500/25 text-[#fff] ring-1 ring-brand-400/50" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* typed fallback */}
          {typing && (
            <form
              className="mx-auto mt-2 flex w-full max-w-xl items-center gap-2 px-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitDraft();
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="اكتب لNexus AI v8.4…"
                className="input-base min-w-0 flex-1"
                autoFocus
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="إرسال"
                className="btn-primary !rounded-full !p-0 size-11 shrink-0"
              >
                <ArrowUp className="size-5" />
              </button>
            </form>
          )}

          {/* controls */}
          <div className="mt-3 flex items-center justify-center gap-5 px-4">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "شغّل المايك" : "سكّر المايك"}
              className={cn(
                "grid size-14 place-items-center rounded-full border transition active:scale-90",
                muted ? "border-rose-400/50 bg-rose-500/15 text-rose-300" : "border-white/12 bg-white/[0.06] text-slate-200"
              )}
            >
              {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </button>
            <button
              type="button"
              onClick={hangup}
              aria-label="إنهاء المكالمة"
              className="grid size-[4.5rem] place-items-center rounded-full bg-gradient-to-b from-rose-500 to-rose-700 text-[#fff] shadow-[0_10px_30px_-8px_rgba(244,63,94,0.8)] transition active:scale-90"
            >
              <PhoneOff className="size-8" />
            </button>
            <button
              type="button"
              onClick={onOrb}
              aria-label="قاطع أو أرسل الآن"
              title="قاطع Nexus AI v8.4 أو أرسل كلامك الآن"
              className="grid size-14 place-items-center rounded-full border border-white/12 bg-white/[0.06] text-slate-200 transition active:scale-90"
            >
              <Hand className="size-6" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
