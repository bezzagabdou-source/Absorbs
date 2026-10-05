/**
 * Voice engine: Speech-to-Text and Text-to-Speech on top of the Web Speech API.
 * Framework-free and SSR-safe: every browser access is guarded.
 */

/* ---------- minimal Web Speech typings (not in lib.dom) ---------- */

interface RecResultItem {
  transcript: string;
}
interface RecEvent {
  results: ArrayLike<ArrayLike<RecResultItem> & { isFinal: boolean }>;
}
interface RecInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecCtor = new () => RecInstance;

function recCtor(): RecCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const W = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return W.SpeechRecognition ?? W.webkitSpeechRecognition;
}

export const isRecognitionSupported = () => !!recCtor();
export const isSynthesisSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/* ---------- preferences ---------- */

export type VoicePrefs = {
  /** SpeechSynthesisVoice.voiceURI, "" = automatic */
  voiceURI: string;
  /** 0.6 – 1.6 */
  rate: number;
  /** 0.6 – 1.6 */
  pitch: number;
};

export const DEFAULT_VOICE_PREFS: VoicePrefs = { voiceURI: "", rate: 1.0, pitch: 1 };
const KEY = "barq:voice-prefs:v2";
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function loadVoicePrefs(): VoicePrefs {
  if (typeof window === "undefined") return DEFAULT_VOICE_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VOICE_PREFS;
    const j = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      voiceURI: typeof j.voiceURI === "string" ? j.voiceURI : "",
      rate: clamp(Number(j.rate) || DEFAULT_VOICE_PREFS.rate, 0.6, 1.6),
      pitch: clamp(Number(j.pitch) || DEFAULT_VOICE_PREFS.pitch, 0.6, 1.6),
    };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

export function saveVoicePrefs(p: VoicePrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/* ---------- text helpers ---------- */

export function detectLang(text: string): "ar-SA" | "fr-FR" | "en-US" {
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA";
  if (/\b(le|la|les|des|est|une|que|pour|dans|avec|vous)\b/i.test(text)) return "fr-FR";
  return "en-US";
}

/** Strips markdown / code so the voice reads prose only. */
export function plainForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[#*_>|~=-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3600);
}

/* ---------- Text-to-Speech ---------- */

let speakToken = 0;

export function stopSpeaking(): void {
  speakToken++;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* unsupported */
  }
}

/** Resolves with the installed voices (waits for the async list on Chrome). */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSynthesisSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", done);
    setTimeout(done, 1200);
  });
}

/** Score a voice: natural / neural / network voices sound far more human than the default robot voice. */
function voiceScore(v: SpeechSynthesisVoice, lang: string): number {
  const base = lang.slice(0, 2).toLowerCase();
  const vl = v.lang.toLowerCase().replace("_", "-");
  if (!vl.startsWith(base)) return -1;
  let n = 0;
  if (vl === lang.toLowerCase()) n += 4;
  if (base === "ar" && /ar-(dz|ma|tn|eg|sa)/.test(vl)) n += 2;
  const name = v.name.toLowerCase();
  if (/natural|neural|online|premium|enhanced|wavenet|studio/.test(name)) n += 12;
  if (/google/.test(name)) n += 8;
  if (/microsoft/.test(name)) n += 5;
  if (/hamed|naayf|salma|shakir|zariyah|maged|laila|hoda|samia|amina|ismael|fatima|denise|henri|eloise|jenny|aria|guy/.test(name)) n += 4;
  if (!v.localService) n += 3;
  if (/espeak|compact|mbrola/.test(name)) n -= 8;
  return n;
}

export function pickVoice(lang: string, uri: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2).toLowerCase();
  if (uri) {
    const chosen = voices.find((v) => v.voiceURI === uri);
    // only use the chosen voice when it can actually speak this language
    if (chosen && chosen.lang.toLowerCase().startsWith(base)) return chosen;
  }
  // automatic: the most natural-sounding installed voice for this language
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -1;
  for (const v of voices) {
    const sc = voiceScore(v, lang);
    if (sc > bestScore) {
      best = v;
      bestScore = sc;
    }
  }
  return best;
}

export type SpeakOptions = Partial<VoicePrefs> & { lang?: string };

/** Reads text aloud. Returns false when unsupported or when there is nothing to read. */
export function speak(text: string, onEnd?: () => void, opts: SpeakOptions = {}): boolean {
  if (!isSynthesisSupported()) return false;
  const clean = plainForSpeech(text);
  if (!clean) return false;
  stopSpeaking();
  const token = speakToken;
  const prefs = { ...loadVoicePrefs(), ...opts };
  const lang = opts.lang ?? detectLang(clean);
  const voice = pickVoice(lang, prefs.voiceURI);
  // short chunks: long utterances get cut off by Chrome
  const parts = (clean.match(/[^.!؟?،;\n]{1,110}[.!؟?،;:\n]?/g) ?? [clean])
    .map((x) => x.trim())
    .filter(Boolean);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = voice?.lang ?? lang;
    if (voice) u.voice = voice;
    u.rate = prefs.rate;
    u.pitch = prefs.pitch;
    if (i === parts.length - 1) {
      const done = () => {
        if (token === speakToken) onEnd?.();
      };
      u.onend = done;
      u.onerror = done;
    }
    window.speechSynthesis.speak(u);
  });
  return true;
}

/* ---------- Speech-to-Text ---------- */

export type RecognizerOptions = {
  lang: string;
  continuous?: boolean;
  /** Called on every update with the full transcript so far. */
  onText: (text: string, isFinal: boolean) => void;
  onEnd?: () => void;
  /** e.g. "not-allowed", "no-speech", "network" */
  onError?: (code: string) => void;
};

export type Recognizer = { start: () => boolean; stop: () => void };

export function createRecognizer(o: RecognizerOptions): Recognizer | null {
  const Ctor = recCtor();
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = o.lang;
  r.interimResults = true;
  r.continuous = !!o.continuous;
  r.onresult = (e) => {
    let txt = "";
    let final = true;
    for (let i = 0; i < e.results.length; i++) {
      txt += e.results[i][0].transcript;
      if (!e.results[i].isFinal) final = false;
    }
    o.onText(txt, final);
  };
  r.onend = () => o.onEnd?.();
  r.onerror = (e) => o.onError?.(e.error ?? "error");
  return {
    start() {
      try {
        r.start();
        return true;
      } catch {
        return false;
      }
    },
    stop() {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

/* ---------- streaming speech queue (voice calls) ----------
 * Sentences are queued while the answer is still being written, so the voice starts
 * after the FIRST sentence instead of after the whole reply. */

export type SpeechQueue = {
  /** queue text to read (markdown is stripped) */
  enqueue: (text: string) => void;
  /** no more text is coming: onIdle fires once everything queued has been spoken */
  finish: () => void;
  /** stop talking immediately and forget everything queued */
  cancel: () => void;
};

export function createSpeechQueue(o: {
  lang?: string;
  onStart?: () => void;
  onIdle?: () => void;
}): SpeechQueue {
  let pending = 0;
  let inputDone = false;
  let started = false;
  let dead = false;
  let idleFired = false;
  const token = ++speakToken;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* unsupported */
  }

  const maybeIdle = () => {
    if (dead || idleFired || !inputDone || pending > 0) return;
    idleFired = true;
    o.onIdle?.();
  };

  return {
    enqueue(text) {
      if (dead || !isSynthesisSupported()) return;
      const clean = plainForSpeech(text);
      if (!clean) return;
      const prefs = loadVoicePrefs();
      const parts = (clean.match(/[^.!؟?،;\n]{1,110}[.!؟?،;:\n]?/g) ?? [clean]).map((x) => x.trim()).filter(Boolean);
      for (const part of parts) {
        const lang = o.lang ?? detectLang(part);
        const voice = pickVoice(lang, prefs.voiceURI);
        const u = new SpeechSynthesisUtterance(part);
        u.lang = voice?.lang ?? lang;
        if (voice) u.voice = voice;
        u.rate = prefs.rate;
        u.pitch = prefs.pitch;
        pending++;
        u.onstart = () => {
          if (dead || token !== speakToken) return;
          if (!started) {
            started = true;
            o.onStart?.();
          }
        };
        const end = () => {
          if (token !== speakToken) return;
          pending = Math.max(0, pending - 1);
          maybeIdle();
        };
        u.onend = end;
        u.onerror = end;
        window.speechSynthesis.speak(u);
      }
    },
    finish() {
      inputDone = true;
      maybeIdle();
    },
    cancel() {
      dead = true;
      pending = 0;
      if (token === speakToken) {
        try {
          window.speechSynthesis?.cancel();
        } catch {
          /* unsupported */
        }
      }
    },
  };
}
