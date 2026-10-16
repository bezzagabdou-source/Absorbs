/**
 * NEXUS ATLAS — مركز الإعدادات الضخم (v18)
 * ---------------------------------------------------------------------------
 * One typed, versioned preference object covering every knob the app exposes:
 * appearance · voice · AI behaviour · internet · files · privacy · accessibility
 * · experimental. Pure: it runs in the browser (localStorage) and on the
 * server (barq.atlas_prefs) with the exact same defaults and validation.
 */

export const PREFS_VERSION = 18;

export type AccentId = "violet" | "gold" | "aqua" | "emerald" | "rose" | "amber" | "ice" | "sahara" | "nexus";
export type DensityId = "cozy" | "comfortable" | "compact";
export type ThinkingId = "instant" | "balanced" | "deep" | "titan";
export type LengthId = "short" | "medium" | "long" | "exhaustive";
export type VoiceEngineId = "gemini" | "eleven" | "browser" | "auto";

export type AppearancePrefs = {
  theme: "lumen" | "light" | "dark" | "system" | "midnight" | "aurora";
  accent: AccentId;
  density: DensityId;
  fontScale: number; // 0.85 – 1.35
  animations: boolean;
  particles: boolean;
  glass: boolean;
  glow: boolean;
  reducedMotion: boolean;
  wallpaper: "aurora" | "mesh" | "stars" | "none";
};

export type VoicePrefs = {
  engine: VoiceEngineId;
  /** Gemini prebuilt voice name (see voice-catalog) */
  voice: string;
  voiceF: string;
  lang: "auto" | "ar" | "fr" | "en";
  rate: number; // 0.6 – 1.6
  pitch: number; // 0.6 – 1.5
  style: "neutral" | "warm" | "energetic" | "calm" | "professional" | "playful";
  persona: string;
  autoSpeak: boolean;
  streamPlayback: boolean;
  bargeIn: boolean;
  vadSensitivity: number; // 0 – 100
  subtitles: boolean;
  callGreeting: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  soundFx: boolean;
};

export type AiPrefs = {
  tier: "auto" | "free" | "v6" | "v8" | "max";
  persona: "genius" | "coder" | "writer" | "teacher" | "analyst" | "algerian";
  thinking: ThinkingId;
  length: LengthId;
  temperature: number; // 0 – 1
  language: "auto" | "ar" | "darija" | "fr" | "en";
  webAuto: boolean;
  kbAuto: boolean;
  vaultAuto: boolean;
  memoryAuto: boolean;
  artifactsAuto: boolean;
  imageAuto: boolean;
  followUpChips: boolean;
  codeStyle: "complete-file" | "diff" | "snippet";
  safety: "balanced" | "strict" | "relaxed";
  autoVerify: boolean;
  showReasoning: boolean;
  streaming: boolean;
};

export type InternetPrefs = {
  enabled: boolean;
  searchProvider: "auto" | "tavily" | "brave" | "serper" | "bing" | "duckduckgo" | "wikipedia";
  maxResults: number; // 3 – 12
  readPages: boolean;
  autoFetchUrls: boolean;
  downloadMedia: boolean;
  maxDownloadMb: number; // 1 – 50
  allowedDomains: string[];
  blockedDomains: string[];
  citeSources: boolean;
  safeSearch: boolean;
};

export type FilesPrefs = {
  autoPreview: boolean;
  saveToVault: boolean;
  defaultFormat: "html" | "zip" | "markdown" | "json";
  naming: "smart" | "title" | "timestamp";
  autoZipMulti: boolean;
  publicLinks: boolean;
  keepHistory: boolean;
  maxHistory: number;
};

export type PrivacyPrefs = {
  telemetry: boolean;
  personalizedAds: boolean;
  cloudSync: boolean;
  saveTranscripts: boolean;
  analyticsVoice: boolean;
};

export type A11yPrefs = {
  dyslexicFont: boolean;
  highContrast: boolean;
  largeTargets: boolean;
  screenReaderHints: boolean;
  autoContrastText: boolean;
};

export type LabPrefs = {
  council: boolean;
  agentMode: boolean;
  smithInstant: boolean;
  offlineKit: boolean;
  commandPalette: boolean;
  devPanel: boolean;
  betaModels: boolean;
};

export type AtlasPrefs = {
  v: number;
  appearance: AppearancePrefs;
  voice: VoicePrefs;
  ai: AiPrefs;
  internet: InternetPrefs;
  files: FilesPrefs;
  privacy: PrivacyPrefs;
  a11y: A11yPrefs;
  lab: LabPrefs;
};

export const DEFAULT_PREFS: AtlasPrefs = {
  v: PREFS_VERSION,
  appearance: {
    theme: "lumen",
    accent: "gold",
    density: "comfortable",
    fontScale: 1,
    animations: true,
    particles: true,
    glass: true,
    glow: true,
    reducedMotion: false,
    wallpaper: "aurora",
  },
  voice: {
    engine: "auto",
    voice: "Zephyr",
    voiceF: "Kore",
    lang: "auto",
    rate: 1.05,
    pitch: 1,
    style: "warm",
    persona: "friend",
    autoSpeak: false,
    streamPlayback: true,
    bargeIn: true,
    vadSensitivity: 55,
    subtitles: true,
    callGreeting: true,
    noiseSuppression: true,
    echoCancellation: true,
    autoGain: true,
    soundFx: true,
  },
  ai: {
    tier: "auto",
    persona: "genius",
    thinking: "balanced",
    length: "medium",
    temperature: 0.7,
    language: "auto",
    webAuto: true,
    kbAuto: true,
    vaultAuto: true,
    memoryAuto: true,
    artifactsAuto: true,
    imageAuto: true,
    followUpChips: true,
    codeStyle: "complete-file",
    safety: "balanced",
    autoVerify: true,
    showReasoning: false,
    streaming: true,
  },
  internet: {
    enabled: true,
    searchProvider: "auto",
    maxResults: 6,
    readPages: true,
    autoFetchUrls: true,
    downloadMedia: true,
    maxDownloadMb: 25,
    allowedDomains: [],
    blockedDomains: [],
    citeSources: true,
    safeSearch: true,
  },
  files: {
    autoPreview: true,
    saveToVault: true,
    defaultFormat: "html",
    naming: "smart",
    autoZipMulti: true,
    publicLinks: false,
    keepHistory: true,
    maxHistory: 200,
  },
  privacy: {
    telemetry: true,
    personalizedAds: false,
    cloudSync: true,
    saveTranscripts: true,
    analyticsVoice: true,
  },
  a11y: {
    dyslexicFont: false,
    highContrast: false,
    largeTargets: false,
    screenReaderHints: true,
    autoContrastText: true,
  },
  lab: {
    council: true,
    agentMode: true,
    smithInstant: true,
    offlineKit: false,
    commandPalette: true,
    devPanel: false,
    betaModels: false,
  },
};

/* ═══════════════════════════════════════════════════════════════════
 *  Validation / merge (never trust stored or synced values)
 * ═══════════════════════════════════════════════════════════════════ */

const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const oneOf = <T extends string>(v: unknown, d: T, allowed: readonly T[]): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
const strArr = (v: unknown, d: string[], max = 60): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 120).slice(0, max) : d;
const str = (v: unknown, d: string, max = 60): string => (typeof v === "string" && v.length <= max ? v : d);

const GROUPS = ["appearance", "voice", "ai", "internet", "files", "privacy", "a11y", "lab"] as const;

/** Deep-merges an unknown payload over the defaults, clamping every value. */
export function normalizePrefs(raw: unknown): AtlasPrefs {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFS;
  const a = (src.appearance ?? {}) as Record<string, unknown>;
  const v = (src.voice ?? {}) as Record<string, unknown>;
  const ai = (src.ai ?? {}) as Record<string, unknown>;
  const net = (src.internet ?? {}) as Record<string, unknown>;
  const f = (src.files ?? {}) as Record<string, unknown>;
  const p = (src.privacy ?? {}) as Record<string, unknown>;
  const ac = (src.a11y ?? {}) as Record<string, unknown>;
  const l = (src.lab ?? {}) as Record<string, unknown>;

  return {
    v: PREFS_VERSION,
    appearance: {
      theme: oneOf(a.theme, d.appearance.theme, ["lumen", "light", "dark", "system", "midnight", "aurora"] as const),
      accent: oneOf(a.accent, d.appearance.accent, ["violet", "gold", "aqua", "emerald", "rose", "amber", "ice", "sahara", "nexus"] as const),
      density: oneOf(a.density, d.appearance.density, ["cozy", "comfortable", "compact"] as const),
      fontScale: num(a.fontScale, d.appearance.fontScale, 0.85, 1.35),
      animations: bool(a.animations, d.appearance.animations),
      particles: bool(a.particles, d.appearance.particles),
      glass: bool(a.glass, d.appearance.glass),
      glow: bool(a.glow, d.appearance.glow),
      reducedMotion: bool(a.reducedMotion, d.appearance.reducedMotion),
      wallpaper: oneOf(a.wallpaper, d.appearance.wallpaper, ["aurora", "mesh", "stars", "none"] as const),
    },
    voice: {
      engine: oneOf(v.engine, d.voice.engine, ["gemini", "eleven", "browser", "auto"] as const),
      voice: str(v.voice, d.voice.voice),
      voiceF: str(v.voiceF, d.voice.voiceF),
      lang: oneOf(v.lang, d.voice.lang, ["auto", "ar", "fr", "en"] as const),
      rate: num(v.rate, d.voice.rate, 0.6, 1.6),
      pitch: num(v.pitch, d.voice.pitch, 0.6, 1.5),
      style: oneOf(v.style, d.voice.style, ["neutral", "warm", "energetic", "calm", "professional", "playful"] as const),
      persona: str(v.persona, d.voice.persona, 30),
      autoSpeak: bool(v.autoSpeak, d.voice.autoSpeak),
      streamPlayback: bool(v.streamPlayback, d.voice.streamPlayback),
      bargeIn: bool(v.bargeIn, d.voice.bargeIn),
      vadSensitivity: num(v.vadSensitivity, d.voice.vadSensitivity, 0, 100),
      subtitles: bool(v.subtitles, d.voice.subtitles),
      callGreeting: bool(v.callGreeting, d.voice.callGreeting),
      noiseSuppression: bool(v.noiseSuppression, d.voice.noiseSuppression),
      echoCancellation: bool(v.echoCancellation, d.voice.echoCancellation),
      autoGain: bool(v.autoGain, d.voice.autoGain),
      soundFx: bool(v.soundFx, d.voice.soundFx),
    },
    ai: {
      tier: oneOf(ai.tier, d.ai.tier, ["auto", "free", "v6", "v8", "max"] as const),
      persona: oneOf(ai.persona, d.ai.persona, ["genius", "coder", "writer", "teacher", "analyst", "algerian"] as const),
      thinking: oneOf(ai.thinking, d.ai.thinking, ["instant", "balanced", "deep", "titan"] as const),
      length: oneOf(ai.length, d.ai.length, ["short", "medium", "long", "exhaustive"] as const),
      temperature: num(ai.temperature, d.ai.temperature, 0, 1),
      language: oneOf(ai.language, d.ai.language, ["auto", "ar", "darija", "fr", "en"] as const),
      webAuto: bool(ai.webAuto, d.ai.webAuto),
      kbAuto: bool(ai.kbAuto, d.ai.kbAuto),
      vaultAuto: bool(ai.vaultAuto, d.ai.vaultAuto),
      memoryAuto: bool(ai.memoryAuto, d.ai.memoryAuto),
      artifactsAuto: bool(ai.artifactsAuto, d.ai.artifactsAuto),
      imageAuto: bool(ai.imageAuto, d.ai.imageAuto),
      followUpChips: bool(ai.followUpChips, d.ai.followUpChips),
      codeStyle: oneOf(ai.codeStyle, d.ai.codeStyle, ["complete-file", "diff", "snippet"] as const),
      safety: oneOf(ai.safety, d.ai.safety, ["balanced", "strict", "relaxed"] as const),
      autoVerify: bool(ai.autoVerify, d.ai.autoVerify),
      showReasoning: bool(ai.showReasoning, d.ai.showReasoning),
      streaming: bool(ai.streaming, d.ai.streaming),
    },
    internet: {
      enabled: bool(net.enabled, d.internet.enabled),
      searchProvider: oneOf(net.searchProvider, d.internet.searchProvider, [
        "auto",
        "tavily",
        "brave",
        "serper",
        "bing",
        "duckduckgo",
        "wikipedia",
      ] as const),
      maxResults: Math.round(num(net.maxResults, d.internet.maxResults, 3, 12)),
      readPages: bool(net.readPages, d.internet.readPages),
      autoFetchUrls: bool(net.autoFetchUrls, d.internet.autoFetchUrls),
      downloadMedia: bool(net.downloadMedia, d.internet.downloadMedia),
      maxDownloadMb: Math.round(num(net.maxDownloadMb, d.internet.maxDownloadMb, 1, 50)),
      allowedDomains: strArr(net.allowedDomains, d.internet.allowedDomains),
      blockedDomains: strArr(net.blockedDomains, d.internet.blockedDomains),
      citeSources: bool(net.citeSources, d.internet.citeSources),
      safeSearch: bool(net.safeSearch, d.internet.safeSearch),
    },
    files: {
      autoPreview: bool(f.autoPreview, d.files.autoPreview),
      saveToVault: bool(f.saveToVault, d.files.saveToVault),
      defaultFormat: oneOf(f.defaultFormat, d.files.defaultFormat, ["html", "zip", "markdown", "json"] as const),
      naming: oneOf(f.naming, d.files.naming, ["smart", "title", "timestamp"] as const),
      autoZipMulti: bool(f.autoZipMulti, d.files.autoZipMulti),
      publicLinks: bool(f.publicLinks, d.files.publicLinks),
      keepHistory: bool(f.keepHistory, d.files.keepHistory),
      maxHistory: Math.round(num(f.maxHistory, d.files.maxHistory, 20, 1000)),
    },
    privacy: {
      telemetry: bool(p.telemetry, d.privacy.telemetry),
      personalizedAds: bool(p.personalizedAds, d.privacy.personalizedAds),
      cloudSync: bool(p.cloudSync, d.privacy.cloudSync),
      saveTranscripts: bool(p.saveTranscripts, d.privacy.saveTranscripts),
      analyticsVoice: bool(p.analyticsVoice, d.privacy.analyticsVoice),
    },
    a11y: {
      dyslexicFont: bool(ac.dyslexicFont, d.a11y.dyslexicFont),
      highContrast: bool(ac.highContrast, d.a11y.highContrast),
      largeTargets: bool(ac.largeTargets, d.a11y.largeTargets),
      screenReaderHints: bool(ac.screenReaderHints, d.a11y.screenReaderHints),
      autoContrastText: bool(ac.autoContrastText, d.a11y.autoContrastText),
    },
    lab: {
      council: bool(l.council, d.lab.council),
      agentMode: bool(l.agentMode, d.lab.agentMode),
      smithInstant: bool(l.smithInstant, d.lab.smithInstant),
      offlineKit: bool(l.offlineKit, d.lab.offlineKit),
      commandPalette: bool(l.commandPalette, d.lab.commandPalette),
      devPanel: bool(l.devPanel, d.lab.devPanel),
      betaModels: bool(l.betaModels, d.lab.betaModels),
    },
  };
}

/** Applies a partial patch `{ "voice.rate": 1.2 }` or `{ voice: { rate: 1.2 } }`. */
export function patchPrefs(current: AtlasPrefs, patch: unknown): AtlasPrefs {
  const src = (patch && typeof patch === "object" ? patch : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  for (const [k, val] of Object.entries(src)) {
    if (k.includes(".")) {
      const [g, field] = k.split(".");
      if ((GROUPS as readonly string[]).includes(g) && field) {
        next[g] = { ...((current as unknown as Record<string, Record<string, unknown>>)[g] ?? {}), [field]: val };
      }
      continue;
    }
    if ((GROUPS as readonly string[]).includes(k) && val && typeof val === "object") {
      next[k] = { ...((current as unknown as Record<string, Record<string, unknown>>)[k] ?? {}), ...(val as Record<string, unknown>) };
    }
  }
  return normalizePrefs(next);
}

/** How many knobs the control centre exposes (shown in the UI). */
export function prefsKnobCount(p: AtlasPrefs = DEFAULT_PREFS): number {
  let n = 0;
  for (const g of GROUPS) n += Object.keys((p as unknown as Record<string, Record<string, unknown>>)[g] ?? {}).length;
  return n;
}

export const PREF_GROUPS = GROUPS;

export const PREFS_KEY = "nexus:atlas-prefs:v18";

/* ═══════════════════════════════════════════════════════════════════
 *  Storage helpers (browser-safe; no-ops during SSR)
 * ═══════════════════════════════════════════════════════════════════ */

export function loadPrefsLocal(): AtlasPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefsLocal(p: AtlasPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode / quota */
  }
}

/** CSS variables driven by the appearance prefs (applied on <html>). */
export const ACCENTS: Record<AccentId, { from: string; to: string; ring: string; name: string }> = {
  violet: { from: "#8b5cf6", to: "#22d3ee", ring: "#a78bfa", name: "بنفسجي كهربائي" },
  gold: { from: "#f5c451", to: "#b8860b", ring: "#f5c451", name: "ذهبي فاخر" },
  aqua: { from: "#06b6d4", to: "#3b82f6", ring: "#22d3ee", name: "سماوي" },
  emerald: { from: "#10b981", to: "#0ea5e9", ring: "#34d399", name: "زمردي" },
  rose: { from: "#f43f5e", to: "#a855f7", ring: "#fb7185", name: "وردي" },
  amber: { from: "#f59e0b", to: "#ef4444", ring: "#fbbf24", name: "عنبري" },
  ice: { from: "#e0f2fe", to: "#93c5fd", ring: "#bfdbfe", name: "جليدي" },
  /** v19 — رمال الصحراء الجزائرية ونحاسها */
  sahara: { from: "#e0a458", to: "#b4531f", ring: "#f0c07a", name: "صحراوي — رمال ونحاس" },
  /** v19 — تدرّج شعار Nexus: أزرق ← بنفسجي */
  nexus: { from: "#5b8cff", to: "#8b6bff", ring: "#8fb0ff", name: "Nexus — أزرق بنفسجي" },
};

/* ═══════════════════════════════════════════════════════════════════
 *  Wire format — what the chat API receives from the control centre
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Extracts the knobs that change how the model answers, so the chat request can
 * carry them. Read straight from storage so it never depends on React state.
 */
export function chatPrefsPayload(): {
  kb: boolean;
  vault: boolean;
  internet: boolean;
  thinking: ThinkingId;
  length: LengthId;
  language: AiPrefs["language"];
  codeStyle: AiPrefs["codeStyle"];
  followUps: boolean;
  temperature: number;
  persona: AiPrefs["persona"];
  autoVerify: boolean;
  showReasoning: boolean;
  artifacts: boolean;
  imageAuto: boolean;
  voiceName: string;
  voiceMood: string;
} {
  const p = loadPrefsLocal();
  return {
    kb: p.ai.kbAuto,
    vault: p.ai.vaultAuto,
    internet: p.internet.enabled,
    thinking: p.ai.thinking,
    length: p.ai.length,
    language: p.ai.language,
    codeStyle: p.ai.codeStyle,
    followUps: p.ai.followUpChips,
    temperature: p.ai.temperature,
    persona: p.ai.persona,
    autoVerify: p.ai.autoVerify,
    showReasoning: p.ai.showReasoning,
    artifacts: p.ai.artifactsAuto,
    imageAuto: p.ai.imageAuto,
    voiceName: p.voice.voice,
    voiceMood: p.voice.style,
  };
}
