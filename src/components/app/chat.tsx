"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Code2,
  Brain,
  Headphones,
  Volume2,
  VolumeX,
  Copy,
  Crown,
  Download,
  FileText,
  Languages,
  Lightbulb,
  Lock,
  MessageSquarePlus,
  Maximize2,
  Package,
  Paperclip,
  RefreshCw,
  PanelRight,
  PenLine,
  RotateCcw,
  Square,
  SquarePen,
  Trash2,
  X,
  Info,
  Zap,
  Sparkles,
  Rocket,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useCredits, UserAvatar, meterLabel } from "@/components/app/app-shell";
import { SESSION_MAX_MS } from "@/lib/limits";
import { Markdown } from "@/components/markdown";
import { MessageSkeleton } from "@/components/ui/skeleton";
import { ExportMenu } from "@/components/chat/export-menu";
import { VoiceRecorder, VoiceSettings } from "@/components/chat/voice-recorder";
import { DropOverlay, useFileDrop } from "@/components/chat/drop-overlay";
import { ImageStudio } from "@/components/app/image-studio";
import { ToolsMenu, type ToolMenuId } from "@/components/app/tools-menu";
import { TierCompare } from "@/components/app/tier-compare";
import { CHAT_MODES, chatModeById, type ChatModeId } from "@/lib/chat-modes";
import { speak, stopSpeaking } from "@/lib/voice";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { FullPreview } from "@/components/game-preview";
import { VoiceCall } from "@/components/voice/voice-call";
import {
  codeLooksCut,
  createZip,
  downloadBlob,
  filesFromReply,
  zipSizeLabel,
} from "@/lib/zip";
import { usePro } from "@/lib/pro-i18n";
import {
  MAX_FILES,
  MAX_PAYLOAD,
  payloadSize,
  prepareFile,
  extractHtml,
  type PendingFile,
} from "@/lib/attachments";

/** v8: "generate me an image" requests (the image engine is not available yet). */
const IMAGE_INTENT =
  /(ولّ?د|اصنع|أنشئ|انشئ|صمّ?م|ارسم|اعمل|سوّ?ي|توليد|generate|create|make|draw|génère|genere|crée|cree|dessine)\s+(لي\s+|لنا\s+|me\s+|moi\s+)?(an?\s+|une?\s+|des\s+)?(صور[ةه]?|صور|image|images|picture|pictures|photo|photos)(?![\w\u0600-\u06FF])/i;

/* ---- Nexus AI v8.4: free OpenRouter catalog (inline, no extra file) ---- */
const DEFAULT_FREE_MODEL = "openrouter/free";

interface FreeModel {
  id: string;
  label: string;
}
interface FreeModelGroup {
  group: string;
  models: FreeModel[];
}

const FREE_MODEL_GROUPS: readonly FreeModelGroup[] = [
  {
    group: "🚀 Fast Default & Routing",
    models: [
      { id: "openrouter/free", label: "Auto-Router (fastest available) — Default" },
      { id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B (ultra-fast)" },
    ],
  },
  {
    group: "💻 Code & Game Development",
    models: [
      { id: "cohere/north-mini-code:free", label: "Cohere North Mini Code" },
      { id: "poolside/laguna-s-2.1:free", label: "Poolside Laguna S 2.1" },
      { id: "poolside/laguna-xs-2.1:free", label: "Poolside Laguna XS 2.1" },
    ],
  },
  {
    group: "🧠 Deep Reasoning & 1M Context",
    models: [
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B (1M ctx)" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B" },
      { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning" },
      { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", label: "Nemotron 3 Nano Omni 30B Reasoning" },
      { id: "thinkingmachines/inkling:free", label: "Thinking Machines Inkling" },
      { id: "thinkingmachines/inkling-small:free", label: "Thinking Machines Inkling Small" },
      { id: "apodex/apodex-1.1-mini:free", label: "Apodex 1.1 Mini" },
    ],
  },
  {
    group: "🌐 General & Multimodal",
    models: [
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B IT" },
      { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B A4B IT" },
      { id: "dots-studio/dots-3-note-preview:free", label: "dots 3 Note Preview" },
      { id: "liquid/lfm-2.5-2.6b:free", label: "Liquid LFM 2.5 2.6B" },
      { id: "inclusionai/ling-3.0-flash-sante:free", label: "Ling 3.0 Flash Santé" },
      { id: "stealth/space-bunny-alpha", label: "Space Bunny Alpha (stealth)" },
    ],
  },
];

/** free accounts may only use these lighter models; the rest is Pro */
const FREE_ALLOWED: ReadonlySet<string> = new Set([
  "openrouter/free",
  "qwen/qwen3.8-27b:free",
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-26b-a4b-it:free",
  "liquid/lfm-2.5-2.6b:free",
]);

const ALL_IDS: ReadonlySet<string> = new Set(FREE_MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.id)));

/** Runtime guard for model ids coming from a request body (only catalog ids are accepted). */
function isFreeModel(v: unknown): v is string {
  return typeof v === "string" && ALL_IDS.has(v);
}


type Msg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  /** names of files attached to a user message (display only) */
  files?: string[];
};
type ConvSummary = { id: string; title: string; updatedAt: string };
type ErrKind = "quota" | "nokey" | "busy" | "generic" | "pro";

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechCtor = new () => SpeechRec;
function getSpeech(): SpeechCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const W = window as unknown as {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return W.SpeechRecognition ?? W.webkitSpeechRecognition;
}

let msgCounter = 0;
const nextId = () => ++msgCounter;

const SUGGESTION_ICONS: LucideIcon[] = [PenLine, BookOpen, Languages, Lightbulb];

function formatDay(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale, {
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* v8 helpers: follow-up chips, read-aloud                             */
/* ------------------------------------------------------------------ */

type TierId = "v4" | "v5" | "v6" | "v8" | "max";
const PERSONAS: { id: string; label: string; emoji: string }[] = [
  { id: "genius", label: "ذكي", emoji: "🧠" },
  { id: "coder", label: "مبرمج", emoji: "💻" },
  { id: "writer", label: "كاتب", emoji: "✍️" },
  { id: "teacher", label: "معلّم", emoji: "🎓" },
  { id: "analyst", label: "محلل", emoji: "📊" },
];

const NEXT_RE = /\s*<<next:\s*([^>]*?)>>\s*$/i;
/** Separates the answer from the hidden "<<next: a | b | c>>" follow-up line (also while it is still streaming). */
function splitNext(text: string): { body: string; next: string[] } {
  const m = NEXT_RE.exec(text);
  if (m) {
    const next = m[1]
      .split("|")
      .map((x) => x.trim())
      .filter((x) => x.length > 1 && x.length < 90)
      .slice(0, 3);
    return { body: text.slice(0, m.index).trimEnd(), next };
  }
  const cut = text.search(/\s*<{1,2}(?:n(?:e(?:x(?:t:?[^>]*)?)?)?)?$/i);
  if (cut > 0 && text.length - cut < 160) return { body: text.slice(0, cut).trimEnd(), next: [] };
  return { body: text, next: [] };
}

/* ------------------------------------------------------------------ */
/* One message — memoised so only the streaming bubble re-renders      */
/* ------------------------------------------------------------------ */

function ThinkingOrb({ label }: { label: string }) {
  const steps = ["يحلل سؤالك", "يجمع الأفكار", "يكتب الإجابة"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % steps.length), 1600);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <span className="flex items-center gap-3 py-1.5 text-sm text-slate-300">
      <span className="relative grid h-7 w-7 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-300 border-e-brand-300" style={{ animationDuration: "1.1s" }} />
        <Sparkles className="h-3.5 w-3.5 text-brand-300" />
      </span>
      <span className="font-semibold">{label} <span className="text-slate-500">· {steps[i]}…</span></span>
    </span>
  );
}


/* ------------------------------------------------------------------ */
/* Hidden code: show "thinking" while building, then a result card     */
/* ------------------------------------------------------------------ */

type CodeInfo = { text: string; chars: number; lines: number };
/** Strips big fenced code blocks (also a half-written last one) and reports how much code there is. */
function analyseCode(body: string): CodeInfo | null {
  const first = body.indexOf("```");
  if (first < 0) return null;
  let chars = 0;
  let lines = 0;
  let text = "";
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("```", i);
    if (open < 0) {
      text += body.slice(i);
      break;
    }
    text += body.slice(i, open);
    const nl = body.indexOf("\n", open);
    if (nl < 0) break;
    const close = body.indexOf("```", nl + 1);
    const end = close < 0 ? body.length : close;
    const code = body.slice(nl + 1, end);
    chars += code.length;
    for (let k = 0; k < code.length; k++) if (code.charCodeAt(k) === 10) lines++;
    i = close < 0 ? body.length : close + 3;
  }
  return chars >= 1200 ? { text: text.trim(), chars, lines } : null;
}

/** Lines / size of everything written so far (used before a fenced block is big enough to count as "code"). */
function lineStats(body: string): CodeInfo | null {
  if (body.length < 200) return null;
  let lines = 0;
  for (let k = 0; k < body.length; k++) if (body.charCodeAt(k) === 10) lines++;
  return { text: "", chars: body.length, lines };
}

const BUILD_RE = /(موقع|صفحة|لعبة|تطبيق|متجر|منصة|ويب|لاندينج|داشبورد|لوحة تحكم|website|web ?site|landing|game|app\b|application|dashboard|portfolio|store|site web|jeu|application|page web|build|create|اصنع|ابني|بني|سوي|اعمل|اعملي|انشئ|أنشئ|صمم|صمّم|كود)/i;

const BUILD_STEPS = [
  "يفكّر في الفكرة والبنية",
  "يخطّط للأنظمة والمراحل",
  "يصمّم الواجهة (UI/UX)",
  "يكتب المحرّك والفيزياء",
  "يضيف الأعداء والمستويات",
  "يلمّع الحركات والأصوات",
  "يفحص الأخطاء سطراً بسطر",
  "يجهّز المعاينة",
];

function BuildThinking({ info }: { info: CodeInfo | null }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(BUILD_STEPS.length - 1, v + 1)), 5200);
    return () => clearInterval(id);
  }, []);
  const lines = info?.lines ?? 0;
  const pct = Math.min(96, Math.round((lines / 5000) * 100));
  return (
    <div className="mt-2 rounded-2xl border border-orange-300/40 bg-orange-500/10 p-4 shadow-[0_18px_40px_-26px_rgba(194,65,12,0.45)]">
      <div className="flex items-center gap-3">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/30" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-orange-500 border-e-amber-300" style={{ animationDuration: "1.1s" }} />
          <Sparkles className="h-4 w-4 text-orange-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-black text-slate-100">Nexus AI v8.4 يفكّر ويبني…</p>
          <p className="truncate text-[12.5px] font-semibold text-slate-400">{BUILD_STEPS[i]}…</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-400/20">
        <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-500 transition-[width] duration-700" style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
      {info && (
        <p className="mt-2 text-[11.5px] font-bold text-slate-400" dir="ltr">
          {info.lines.toLocaleString("en-US")} lines · {(info.chars / 1024).toFixed(0)} KB
        </p>
      )}
    </div>
  );
}

function BuildDone({
  info,
  onPreview,
  onDownload,
  showCode,
  toggleCode,
  canPreview,
  files,
}: {
  info: CodeInfo;
  onPreview: () => void;
  onDownload: () => void;
  showCode: boolean;
  toggleCode: () => void;
  canPreview: boolean;
  files: number;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-orange-300/45 bg-orange-500/10 p-4 shadow-[0_18px_40px_-26px_rgba(194,65,12,0.45)]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white">
          <Check className="h-5 w-5" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-black text-slate-100">تم البناء بنجاح</p>
          <p className="text-[12px] font-bold text-slate-400" dir="ltr">
            {info.lines.toLocaleString("en-US")} lines · {(info.chars / 1024).toFixed(0)} KB{files > 1 ? ` · ${files} files` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canPreview && (
          <button type="button" onClick={onPreview} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-orange-500 to-amber-400 px-4 text-[13px] font-black text-white shadow-[0_8px_22px_-10px_rgba(234,88,12,0.9)] transition active:scale-95">
            <Maximize2 className="h-4 w-4" />
            افتح اللعبة / المعاينة
          </button>
        )}
        <button type="button" onClick={onDownload} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-orange-300/60 bg-white/10 px-3.5 text-[13px] font-black text-slate-100 transition active:scale-95">
          <Download className="h-4 w-4" />
          تحميل
        </button>
        <button type="button" onClick={toggleCode} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-orange-300/40 px-3.5 text-[13px] font-bold text-slate-300 transition active:scale-95">
          <Code2 className="h-4 w-4" />
          {showCode ? "إخفاء الكود" : "عرض الكود"}
        </button>
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({
  m,
  name,
  photo,
  thinking,
  copyLabel,
  copiedLabel,
  pro,
  isLast,
  buildIntent,
  onPreview,
  onRegenerate,
  onSuggest,
}: {
  m: Msg;
  name: string | null;
  photo: string | null;
  thinking: string;
  copyLabel: string;
  copiedLabel: string;
  pro: boolean;
  isLast: boolean;
  /** the user asked to build something (site / game / app): show only "thinking", never the long text */
  buildIntent: boolean;
  onPreview: (html: string) => void;
  onRegenerate: () => void;
  onSuggest: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const isUser = m.role === "user";
  const { body, next } = useMemo(() => (isUser ? { body: m.content, next: [] as string[] } : splitNext(m.content)), [isUser, m.content]);
  const done = !isUser && !m.pending && !!body;
  const html = useMemo(() => (done && pro ? extractHtml(body) : null), [done, pro, body]);
  const zipFiles = useMemo(
    () => (done && pro && body.includes("```") ? filesFromReply(body) : []),
    [done, pro, body]
  );
  const showZip =
    zipFiles.length > 1 && zipFiles.some((f) => typeof f.data === "string" && f.data.length > 400);
  // big code is hidden on screen: "thinking" while it streams, a result card when it is done
  const codeInfo = useMemo(() => (!isUser && pro ? analyseCode(body) : null), [isUser, pro, body]);

  const act =
    "inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-bold text-slate-400 transition active:scale-95 hover:bg-white/[0.07] hover:text-slate-100";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex w-full justify-end gap-2.5"
      >
        <div className="max-w-[86%] min-w-0 sm:max-w-[78%]">
          <div className="rounded-3xl rounded-se-lg bg-gradient-to-br from-brand-600 to-aqua-500 px-4.5 py-3 text-[16px] leading-[1.75] text-white shadow-[0_10px_30px_-14px_rgba(0,180,255,0.9)] ring-1 ring-white/20">
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.files && m.files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.files.map((f, i) => (
                  <span
                    key={`${f}-${i}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-lg bg-black/25 px-2 py-1 text-[11px] font-semibold text-white/90"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span dir="ltr" className="truncate">{f}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <UserAvatar name={name} photo={photo} size={32} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex w-full gap-3"
    >
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-aqua-500 to-gold-400 text-base font-bold leading-none text-white ring-1 ring-white/20">
        ب
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[16px] leading-[1.85] text-slate-100">
          {m.pending && !m.content ? (
            <div>
              <ThinkingOrb label={thinking} />
              <MessageSkeleton lines={3} avatar={false} className="mt-3 max-w-md opacity-80" />
            </div>
          ) : pro && m.pending && (buildIntent || body.includes("```")) ? (
            // while building: ONLY the thinking card (no long message, no raw code)
            <BuildThinking info={codeInfo ?? lineStats(body)} />
          ) : codeInfo && !showCode ? (
            <>
              {codeInfo.text && codeInfo.text.length <= 220 && (
                <Markdown pro={pro} plainCode>
                  {codeInfo.text}
                </Markdown>
              )}
              {m.pending ? (
                <BuildThinking info={codeInfo} />
              ) : (
                <BuildDone
                  info={codeInfo}
                  canPreview={!!html && html.length > 800}
                  files={showZip ? zipFiles.length : 1}
                  onPreview={() => html && onPreview(html)}
                  onDownload={() =>
                    showZip
                      ? downloadBlob(createZip(zipFiles), "barq-project.zip")
                      : downloadBlob(new Blob([html ?? body], { type: html ? "text/html" : "text/plain" }), html ? "barq-build.html" : "barq-build.txt")
                  }
                  showCode={showCode}
                  toggleCode={() => setShowCode(true)}
                />
              )}
            </>
          ) : (
            <>
              <Markdown pro={pro} plainCode={!!m.pending}>
                {body}
              </Markdown>
              {codeInfo && !m.pending && (
                <button type="button" onClick={() => setShowCode(false)} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border border-orange-300/40 px-3 text-[12.5px] font-bold text-slate-300 transition active:scale-95">
                  <Code2 className="h-4 w-4" />
                  إخفاء الكود
                </button>
              )}
            </>
          )}
        </div>

        {showZip && !(codeInfo && !showCode) && (
          <button
            type="button"
            onClick={() => downloadBlob(createZip(zipFiles), "barq-project.zip")}
            className="mt-3 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-amber-300/25 bg-gradient-to-l from-amber-300/10 to-brand-500/10 p-3 text-start transition active:scale-[0.99] hover:border-amber-300/50"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-300/20 text-amber-200">
              <Package className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span dir="ltr" className="block truncate text-start text-sm font-black text-white">barq-project.zip</span>
              <span className="block text-[11px] font-bold text-slate-400">
                {zipFiles.length} ملفات · {zipSizeLabel(zipFiles)} · اضغط للتحميل
              </span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-gold-400 text-white">
              <Download className="h-4.5 w-4.5" />
            </span>
          </button>
        )}

        {done && (
          <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
            <button
              type="button"
              onClick={async () => {
                if (await copyText(body)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }
              }}
              className={act}
            >
              {copied ? <Check className="h-4 w-4 text-brand-400" /> : <Copy className="h-4 w-4" />}
              {copied ? copiedLabel : copyLabel}
            </button>
            {html && html.length > 800 && (
              <button type="button" onClick={() => onPreview(html)} className={cn(act, "text-amber-200/90")}>
                <Maximize2 className="h-4 w-4" />
                معاينة كاملة
              </button>
            )}
            {body.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (speaking) {
                    stopSpeaking();
                    setSpeaking(false);
                  } else if (speak(body, () => setSpeaking(false))) {
                    setSpeaking(true);
                  }
                }}
                className={cn(act, speaking && "text-aqua-300")}
              >
                {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {speaking ? "إيقاف" : "استماع"}
              </button>
            )}
            {isLast && (
              <button type="button" onClick={onRegenerate} className={act}>
                <RefreshCw className="h-4 w-4" />
                إعادة
              </button>
            )}
          </div>
        )}

        {done && isLast && pro && next.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {next.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSuggest(q)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold-400/30 bg-gold-400/[0.07] px-3.5 py-2 text-start text-[12.5px] font-bold text-gold-200 transition active:scale-95 hover:border-gold-400/60 hover:bg-gold-400/15"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                <span className="min-w-0 break-words">{q}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function ChatPage() {
  const { t, locale, dir } = useI18n();
  const pro = usePro();
  const { user, authFetch } = useAuth();
  const { applyHeaders, profile } = useCredits();
  const isPro = profile?.plan === "pro";
  const searchParams = useSearchParams();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState<ErrKind | null>(null);
  const [errDetail, setErrDetail] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [deep, setDeep] = useState(false);
  const [mode, setMode] = useState<ChatModeId | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [freeModel, setFreeModel] = useState<string>(DEFAULT_FREE_MODEL);
  /** MAX / Pro: every OpenRouter model (loaded once from /api/ai/models) */
  const [orModels, setOrModels] = useState<{ id: string; name: string; ctx: number; free: boolean }[]>([]);
  const orIds = useMemo(() => new Set(orModels.map((m) => m.id)), [orModels]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nexus_model");
      if (isFreeModel(saved)) setFreeModel(saved);
      else if (typeof saved === "string" && /^[\w.\-]+\/[\w.\-:]+$/.test(saved)) setFreeModel(saved);
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    if (!isPro || orModels.length > 0) return;
    let dead = false;
    (async () => {
      try {
        const res = await authFetch("/api/ai/models");
        if (!res.ok) return;
        const data = (await res.json()) as { models?: { id: string; name: string; ctx: number; free: boolean }[] };
        if (!dead && Array.isArray(data.models)) setOrModels(data.models);
      } catch {
        /* the built-in catalog still works */
      }
    })();
    return () => {
      dead = true;
    };
  }, [isPro, orModels.length, authFetch]);
  const router = useRouter();
  const [tier, setTier] = useState<TierId>("v8");
  const [persona, setPersona] = useState("genius");
  const [talk, setTalk] = useState(false);
  const [call, setCall] = useState(false);
  const talkRef = useRef(false);
  const transcriptRef = useRef("");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("barq_tier");
      // everyone lands on the new flagship once; afterwards their choice is respected
      if (localStorage.getItem("barq_v8_default") !== "1") {
        localStorage.setItem("barq_v8_default", "1");
        localStorage.setItem("barq_tier", "v8");
      } else if (v === "v4" || v === "v5" || v === "v6" || v === "v8" || v === "max") setTier(v);
      const pr = localStorage.getItem("barq_persona");
      if (pr && PERSONAS.some((x) => x.id === pr)) setPersona(pr);
    } catch {}
  }, []);
  // MAX starters (command palette / Ctrl+K): fill the box and switch to the MAX engine
  useEffect(() => {
    const take = () => {
      if (!profile) return; // wait for the plan to load so the MAX switch is not lost
      try {
        const raw = sessionStorage.getItem("barq_prefill");
        if (!raw) return;
        sessionStorage.removeItem("barq_prefill");
        const d = JSON.parse(raw) as { text?: string; tier?: string };
        if (typeof d.text === "string" && d.text) {
          setInput(d.text);
          if (d.tier === "max" && isPro) {
            setTier("max");
            try { localStorage.setItem("barq_tier", "max"); } catch {}
          }
          setTimeout(() => taRef.current?.focus(), 60);
        }
      } catch {}
    };
    take();
    window.addEventListener("barq:prefill", take);
    return () => window.removeEventListener("barq:prefill", take);
  }, [isPro, profile]);
  // "voice call" can also be started from the command palette (Ctrl+K)
  useEffect(() => {
    const open = () => {
      if (!isPro) {
        setProHint(true);
        return;
      }
      setCall(true);
    };
    window.addEventListener("barq:voice-call", open);
    return () => window.removeEventListener("barq:voice-call", open);
  }, [isPro]);
  // a Pro account never runs on the free engine: 4 → 5
  useEffect(() => {
    if (isPro && tier === "v4") setTier("v5");
  }, [isPro, tier]);
  const pickTier = (v: TierId) => {
    if (v !== "v4" && !isPro) {
      router.push("/app/upgrade");
      return;
    }
    setTier(v);
    try { localStorage.setItem("barq_tier", v); } catch {}
  };
  const [, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [proHint, setProHint] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRetryRef = useRef(0);
  const silenceRef = useRef(0);
  const res0Ok = useRef(false);
  const sendRef = useRef<(t: string, retry?: boolean, base?: Msg[]) => Promise<void>>(async () => undefined);
  const startListeningRef = useRef<() => void>(() => undefined);
  const stickRef = useRef(true);
  const openSeq = useRef(0);
  const lastTextRef = useRef("");
  const lastFilesRef = useRef<PendingFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  /** true once the page was hidden (app switch / screen lock) during the current answer */
  const hiddenRef = useRef(false);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    setVoiceOk(!!getSpeech());
  }, []);

  useEffect(() => {
    const onVis = (): void => {
      if (document.visibilityState === "hidden") hiddenRef.current = true;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /* ---------- scrolling: follow the answer unless the reader scrolled up ---------- */

  const scrollToEnd = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = gap < 90;
    setShowJump(gap > 260);
  }, []);

  useEffect(() => {
    if (stickRef.current) scrollToEnd();
  }, [msgs, scrollToEnd]);

  /* ---------- conversations ---------- */

  const loadConvs = useCallback(async () => {
    try {
      const res = await authFetch("/api/history");
      if (res.ok) {
        const data = (await res.json()) as { conversations: ConvSummary[] };
        setConvs(data.conversations);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingConvs(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (user) void loadConvs();
  }, [user, loadConvs]);

  const resetChat = useCallback(() => {
    openSeq.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setMsgs([]);
    setConvId(null);
    setError(null);
    setStreaming(false);
    setDrawer(false);
    setFiles([]);
    setNotice(null);
    stickRef.current = true;
    taRef.current?.focus();
  }, []);

  // "New chat" in the shell must clear the screen even when we are already on /app
  useEffect(() => {
    const onNew = () => resetChat();
    window.addEventListener("barq:new-chat", onNew);
    return () => window.removeEventListener("barq:new-chat", onNew);
  }, [resetChat]);

  /** The answer keeps being generated on the server even if the browser left: poll until it is saved. */
  const waitForAnswer = useCallback(
    async (id: string, snippet: string, seq: number) => {
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, i < 5 ? 1500 : 3000));
        if (seq !== openSeq.current) return;
        try {
          const res = await authFetch(`/api/conversations/${id}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { messages: { role: string; content: string }[] };
          const ms = data.messages;
          const last = ms[ms.length - 1];
          const prev = ms[ms.length - 2];
          if (last?.role === "assistant" && prev?.role === "user" && prev.content.startsWith(snippet)) {
            if (seq !== openSeq.current) return;
            stickRef.current = true;
            setMsgs(
              ms.map((m) => ({
                id: nextId(),
                role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                content: m.content,
              }))
            );
            setStreaming(false);
            setTimeout(() => void loadConvs(), 300);
            return;
          }
        } catch {
          /* keep waiting */
        }
      }
      if (seq === openSeq.current) {
        // keep whatever was already written instead of throwing it away
        setMsgs((m) => m.map((x) => (x.pending ? { ...x, pending: false } : x)).filter((x) => !(x.role === "assistant" && !x.content)));
        setStreaming(false);
        setError("busy");
      }
    },
    [authFetch, loadConvs]
  );

  const openConv = useCallback(
    async (id: string) => {
      const seq = ++openSeq.current;
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
      setError(null);
      setDrawer(false);
      try {
        const res = await authFetch(`/api/conversations/${id}`);
        if (!res.ok || seq !== openSeq.current) return;
        const data = (await res.json()) as {
          messages: { role: string; content: string; createdAt?: string }[];
        };
        if (seq !== openSeq.current) return;
        stickRef.current = true;
        setConvId(id);
        const loaded: Msg[] = data.messages.map((m) => ({
          id: nextId(),
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));
        // the last question has no answer yet but is fresh → the server is still working on it
        const lastRaw = data.messages[data.messages.length - 1];
        const age = lastRaw?.createdAt ? Date.now() - new Date(lastRaw.createdAt).getTime() : Infinity;
        if (lastRaw?.role === "user" && age < 8 * 60_000) {
          loaded.push({ id: nextId(), role: "assistant", content: "", pending: true });
          setMsgs(loaded);
          setStreaming(true);
          void waitForAnswer(id, lastRaw.content.slice(0, 40), seq);
          return;
        }
        setMsgs(loaded);
      } catch {
        /* ignore */
      }
    },
    [authFetch, waitForAnswer]
  );

  // open a conversation via /app?c=<id> (from the history page)
  const wantedConv = searchParams.get("c");
  useEffect(() => {
    if (wantedConv && user) void openConv(wantedConv);
  }, [wantedConv, user, openConv]);

  // open a ready-made prompt via /app?q=... (used by the "try it" buttons of the v8 tour)
  const wantedQ = searchParams.get("q");
  const qDone = useRef(false);
  useEffect(() => {
    if (!wantedQ || qDone.current || !user || !profile) return;
    qDone.current = true;
    router.replace("/app");
    setTimeout(() => {
      if (isPro) void sendRef.current(wantedQ);
      else {
        setInput(wantedQ);
        taRef.current?.focus();
      }
    }, 450);
  }, [wantedQ, user, profile, isPro, router]);

  const deleteConv = useCallback(
    async (id: string) => {
      setConvs((cs) => cs.filter((c) => c.id !== id));
      if (convId === id) resetChat();
      await authFetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(
        () => undefined
      );
    },
    [authFetch, convId, resetChat]
  );

  /* ---------- sending ---------- */

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      return;
    }
    // waiting for a server-side answer (after leaving the page): just stop waiting
    openSeq.current += 1;
    setStreaming(false);
    setMsgs((m) => m.filter((x) => !(x.pending && !x.content)).map((x) => (x.pending ? { ...x, pending: false } : x)));
  }, []);



  const send = useCallback(
    async (text: string, retry = false, baseOverride?: Msg[]) => {
      const sendFiles = retry ? lastFilesRef.current : baseOverride ? [] : files;
      const content = text.trim() || (sendFiles.length > 0 ? pro.defaultAsk : "");
      if (!content || streaming) return;
      // v8: image generation is not available yet — answer instantly, spend no credit
      if (!retry && !baseOverride && IMAGE_INTENT.test(content)) {
        setInput("");
        setNotice(null);
        setError(null);
        setMsgs([
          ...msgs,
          { id: nextId(), role: "user", content },
          {
            id: nextId(),
            role: "assistant",
            content:
              "🖼️ **توليد الصور غير متوفر حاليًا.**\n\nنشتغل عليه، وأول ما يتفعّل نعلمك. في الأثناء أقدر نصنعلك شعارًا أو خلفية متحرّكة أو واجهة أو موقعًا أو لعبة كاملة تعاينها مباشرة.",
          },
        ]);
        return;
      }
      lastTextRef.current = text.trim();
      lastFilesRef.current = sendFiles;
      if (!retry) autoRetryRef.current = 0;
      openSeq.current += 1; // cancels any stale "waiting for the server" loop
      const mySeq = openSeq.current;
      stopSpeaking();
      setFiles([]);
      setNotice(null);
      setProHint(false);
      setError(null);
      setStreaming(true);
      setInput("");
      stickRef.current = true;
      if (taRef.current) taRef.current.style.height = "auto";

      // on retry the failed user message is already on screen: don't duplicate it
      const base =
        baseOverride ?? (retry && msgs[msgs.length - 1]?.role === "user" ? msgs.slice(0, -1) : msgs);
      const history = base.map((m) => ({ role: m.role, content: m.content }));
      setMsgs([
        ...base,
        {
          id: nextId(),
          role: "user",
          content,
          files: sendFiles.length > 0 ? sendFiles.map((f) => f.name) : undefined,
        },
        { id: nextId(), role: "assistant", content: "", pending: true },
      ]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const mine = () => abortRef.current === controller;

      let acc = "";
      let activeConv: string | null = convId;
      let timer: ReturnType<typeof setTimeout> | null = null;
      // paint the answer ~16×/s instead of once per network chunk: far less
      // markdown re-parsing, so long answers stay smooth even on weak phones
      const flush = () => {
        timer = null;
        const snapshot = acc;
        setMsgs((m) => {
          const last = m[m.length - 1];
          if (!last || last.role !== "assistant") return m;
          return [...m.slice(0, -1), { ...last, content: snapshot }];
        });
      };
      const schedule = () => {
        if (!timer) timer = setTimeout(flush, 33);
      };

      res0Ok.current = false;
      hiddenRef.current = false;
      let dropped = false;
      let waiting = false;
      // keep the screen awake while building: a locked phone suspends the connection (the glitch you saw)
      type WL = { release: () => Promise<void> };
      let wake: WL | null = null;
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WL> } };
        nav.wakeLock?.request("screen").then((l) => (wake = l)).catch(() => undefined);
      } catch {
        /* not supported */
      }
      try {
        const res = await authFetch("/api/ai/chat", {
          method: "POST",
          body: JSON.stringify({
            conversationId: convId,
            messages: [...history, { role: "user", content }],
            ...(isPro && sendFiles.length > 0
              ? {
                  attachments: sendFiles
                    .filter((f) => f.data)
                    .map((f) => ({ name: f.name, mime: f.mime, data: f.data })),
                  textFiles: sendFiles
                    .filter((f) => f.text !== undefined)
                    .map((f) => ({ name: f.name, text: f.text })),
                }
              : {}),
            // free accounts: the chosen free OpenRouter model; Pro keeps its premium engines unless a specific model is picked
            ...(!isPro || freeModel !== DEFAULT_FREE_MODEL ? { freeModel } : {}),
            ...(isPro && (deep || tier === "v6") ? { deep: true } : {}),
            ...(isPro && tier === "v6" ? { v6: true } : {}),
            ...(isPro && mode ? { mode } : {}),
            ...(isPro && (tier === "v8" || tier === "max") ? { v8: true, persona, ...(tier === "max" ? { max: true } : {}) } : {}),
          }),
          signal: controller.signal,
        });

        if (!mine()) return;

        if (!res.ok) {
          let code = "";
          let detail = "";
          try {
            const j = (await res.json()) as { code?: string; detail?: string };
            code = j.code ?? "";
            detail = j.detail ?? "";
          } catch {
            /* ignore */
          }
          const hard = code === "QUOTA" || code === "PRO_ONLY" || code === "NO_KEY" || code === "UNAUTHENTICATED";
          if (!hard && autoRetryRef.current < 2) {
            // never fail: wait a moment and try again by itself (the server also switches engines)
            autoRetryRef.current += 1;
            setMsgs((m) => m.filter((x) => !x.pending));
            await new Promise((r) => setTimeout(r, 1400 * autoRetryRef.current));
            if (!mine()) return;
            abortRef.current = null;
            setStreaming(false);
            setTimeout(() => void sendRef.current(content, true), 50);
            return;
          }
          setErrDetail(detail);
          setMsgs((m) => m.filter((x) => !x.pending));
          setError(
            code === "QUOTA"
              ? "quota"
              : code === "PRO_ONLY"
                ? "pro"
                : code === "NO_KEY"
                ? "nokey"
                : code === "UNAUTHENTICATED" || code === "DB"
                  ? "generic"
                  : "busy"
          );
          return;
        }

        applyHeaders(res);
        res0Ok.current = true;
        const newConvId = res.headers.get("x-conversation-id");
        if (newConvId && !convId) setConvId(newConvId);
        if (newConvId) activeConv = newConvId;

        const reader = res.body?.getReader();
        if (!reader) throw new Error("no stream");
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            schedule();
          }
        } catch (re) {
          // connection dropped in the middle (screen lock, weak network, server time limit):
          // a Pro build is finished by the continuation loop below instead of stopping
          if ((re as Error).name === "AbortError" || !isPro || acc.length === 0) throw re;
          dropped = true;
        }
        acc += decoder.decode();

        // NEVER STOP IN THE MIDDLE OF CODE: while the answer still ends inside a code
        // block (limit / network / screen lock), ask the server to finish it — up to 12 rounds,
        // surviving dropped connections; stops only when two rounds in a row bring nothing new.
        if (isPro && freeModel === DEFAULT_FREE_MODEL) {
          let idle = 0;
          // one hour of chained ~13-minute requests without stopping (time-based, not a fixed 12 rounds)
          const chainStart = Date.now();
          for (let r = 0; r < 200 && Date.now() - chainStart < SESSION_MAX_MS && mine() && codeLooksCut(acc); r++) {
            if (r > 0) await new Promise((res) => setTimeout(res, idle ? 1500 : 500));
            if (!mine()) break;
            const before = acc.length;
            try {
              const cres = await authFetch("/api/ai/chat", {
                method: "POST",
                body: JSON.stringify({
                  conversationId: newConvId || convId,
                  messages: [...history, { role: "user", content }],
                  continueFrom: acc,
                  v6: tier === "v6",
                  ...(isPro && mode ? { mode } : {}),
                  ...(tier === "v8" || tier === "max" ? { v8: true } : {}),
                  ...(tier === "max" ? { max: true } : {}),
                }),
                signal: controller.signal,
              });
              if (cres.ok && cres.body) {
                const cr = cres.body.getReader();
                try {
                  for (;;) {
                    const { done, value } = await cr.read();
                    if (done) break;
                    acc += decoder.decode(value, { stream: true });
                    schedule();
                  }
                } catch (ce) {
                  if ((ce as Error).name === "AbortError") throw ce;
                }
                acc += decoder.decode();
              } else if (cres.status === 403 || cres.status === 401) {
                break;
              }
            } catch (ce) {
              if ((ce as Error).name === "AbortError") throw ce;
            }
            if (acc.length === before) {
              idle++;
              if (idle >= 3) break;
            } else idle = 0;
          }
        }

        // The connection died in the background (app switch / screen lock) and the answer is still cut:
        // never show a half answer as finished. The server keeps writing and saves the full text, so wait for it.
        if (isPro && mine() && activeConv) {
          const cut = codeLooksCut(acc);
          const plainDrop = dropped && !acc.includes("```");
          if (plainDrop || (cut && (dropped || hiddenRef.current))) {
            if (timer) clearTimeout(timer);
            flush();
            waiting = true;
            void waitForAnswer(activeConv, content.slice(0, 40), mySeq);
            return;
          }
        }

        if (timer) clearTimeout(timer);
        flush();
        setMsgs((m) => m.map((x) => (x.pending ? { ...x, pending: false } : x)));

        // finished a real web build → open the live preview full-screen by itself
        if (isPro && mine() && !codeLooksCut(acc)) {
          const page = extractHtml(acc);
          if (page && page.length > 1500 && /<(canvas|script|body)/i.test(page)) {
            setTimeout(() => setPreview(page), 350);
          }
        }
        // live voice chat: read the answer aloud, then listen again
        if (talkRef.current && !codeLooksCut(acc)) {
          const spoken = splitNext(acc).body;
          if (!speak(spoken, () => talkRef.current && startListeningRef.current())) {
            talkRef.current = false;
            setTalk(false);
          }
        }
        // refresh conversation list (title may be new)
        setTimeout(() => void loadConvs(), 400);
      } catch (e) {
        if (timer) clearTimeout(timer);
        if (!mine()) return; // superseded by "new chat" / another conversation
        if ((e as Error).name === "AbortError") {
          // user pressed stop: keep what was already written
          flush();
          setMsgs((m) =>
            m
              .filter((x) => !(x.pending && !x.content))
              .map((x) => (x.pending ? { ...x, pending: false } : x))
          );
        } else if (activeConv && (acc.length > 0 || res0Ok.current)) {
          // the connection dropped (app switch, weak network) but the server keeps working: fetch the saved answer
          waiting = true;
          void waitForAnswer(activeConv, content.slice(0, 40), mySeq);
          return;
        } else if (autoRetryRef.current < 2) {
          autoRetryRef.current += 1;
          setMsgs((m) => m.filter((x) => !x.pending));
          await new Promise((r) => setTimeout(r, 1400 * autoRetryRef.current));
          if (!mine()) return;
          abortRef.current = null;
          setStreaming(false);
          setTimeout(() => void sendRef.current(content, true), 50);
          return;
        } else {
          setMsgs((m) => m.filter((x) => !x.pending));
          setError("generic");
        }
      } finally {
        try {
          void (wake as WL | null)?.release();
        } catch {
          /* ignore */
        }
        if (mine()) {
          abortRef.current = null;
          if (!waiting) setStreaming(false);
        }
      }
    },
    [msgs, streaming, convId, authFetch, applyHeaders, loadConvs, waitForAnswer, files, isPro, deep, tier, persona, mode, pro.defaultAsk]
  );

  sendRef.current = send;

  const regenerate = useCallback(() => {
    if (streaming) return;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    void send(msgs[idx].content, false, msgs.slice(0, idx));
  }, [msgs, streaming, send]);

  const regenRef = useRef(regenerate);
  regenRef.current = regenerate;
  const onRegen = useCallback(() => regenRef.current(), []);
  const onSuggest = useCallback((q: string) => void sendRef.current(q), []);

  /* ---------- Pro: attachments, voice, export ---------- */

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      if (!isPro) {
        setProHint(true);
        return;
      }
      setNotice(null);
      let cur = files;
      for (const f of Array.from(list)) {
        if (cur.length >= MAX_FILES) {
          setNotice(pro.attachedMax);
          break;
        }
        const r = await prepareFile(f);
        if (!r.ok) {
          setNotice(r.problem === "big" ? pro.fileTooBig : pro.fileBad);
          continue;
        }
        if (payloadSize([...cur, r.file]) > MAX_PAYLOAD) {
          setNotice(pro.totalTooBig);
          continue;
        }
        cur = [...cur, r.file];
        setFiles(cur);
      }
    },
    [isPro, files, pro]
  );

  const fileDrop = useFileDrop((list) => void addFiles(list));

  const removeFile = (id: number) => {
    setFiles((fs) => {
      const gone = fs.find((f) => f.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return fs.filter((f) => f.id !== id);
    });
    setNotice(null);
  };

  const beginListening = useCallback(() => {
    if (!isPro) {
      setProHint(true);
      return;
    }
    const Ctor = getSpeech();
    if (!Ctor) return;
    stopSpeaking();
    const r = new Ctor();
    r.lang = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US";
    r.interimResults = true;
    r.continuous = false;
    const base = talkRef.current || !input.trim() ? "" : `${input.trim()} `;
    transcriptRef.current = "";
    r.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      transcriptRef.current = base + txt;
      setInput(base + txt);
    };
    r.onend = () => {
      setListening(false);
      // live voice chat: whatever was said is sent by itself
      if (talkRef.current && transcriptRef.current.trim()) {
        const said = transcriptRef.current.trim();
        silenceRef.current = 0;
        transcriptRef.current = "";
        setInput("");
        void sendRef.current(said);
      } else if (talkRef.current && !transcriptRef.current.trim()) {
        // silence: keep the conversation open for a few more turns, then rest
        silenceRef.current += 1;
        if (silenceRef.current > 4) {
          talkRef.current = false;
          setTalk(false);
        } else {
          setTimeout(() => talkRef.current && !abortRef.current && startListeningRef.current(), 400);
        }
      }
    };
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, [isPro, locale, input]);
  startListeningRef.current = beginListening;

  // stop the microphone when leaving the page
  useEffect(
    () => () => {
      talkRef.current = false;
      recRef.current?.stop();
      stopSpeaking();
    },
    []
  );

  // never leave a request running after leaving the page
  useEffect(() => () => abortRef.current?.abort(), []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const empty = msgs.length === 0;
  const canSend = (input.trim().length > 0 || files.length > 0) && !streaming;

  const errText: Record<ErrKind, string> = {
    quota: t.app.quotaTitle + " — " + t.app.quotaSub,
    nokey: t.app.aiOff,
    busy: t.app.serverBusy,
    generic: t.common.error,
    pro: pro.proOnly,
  };

  /* ---------- conversation list ---------- */

  const convPanel = (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-500">{t.app.recentChats}</span>
        <button
          type="button"
          onClick={resetChat}
          aria-label={t.app.newChat}
          className="grid h-9 w-9 place-items-center rounded-xl text-brand-300 transition hover:bg-brand-500/15"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      </div>
      <div className="scroll-y flex-1 space-y-1 pe-1">
        {loadingConvs ? (
          <div className="space-y-2 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer-line h-11 rounded-xl" />
            ))}
          </div>
        ) : convs.length === 0 ? (
          <p className="px-2 pt-4 text-xs leading-relaxed text-slate-500">
            {t.app.noChats}
          </p>
        ) : (
          convs.map((c) => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => void openConv(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openConv(c.id);
                }
              }}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition",
                convId === c.id ? "bg-white/[0.08]" : "hover:bg-white/5"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-200">
                  {c.title || t.app.newChat}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatDay(c.updatedAt, locale)}
                </p>
              </div>
              {/* always reachable on touch screens; hover-reveal only where hover exists */}
              <button
                type="button"
                aria-label={t.app.deleteChat}
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteConv(c.id);
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 opacity-70 transition hover:bg-rose-500/15 hover:text-rose-300 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div
      className="relative flex h-full"
      {...(isPro ? fileDrop.bind : {})}
    >
      <DropOverlay show={fileDrop.dragging} />
      {/* desktop conversations */}
      <aside className="hidden w-60 shrink-0 border-e border-white/6 bg-ink-950/60 p-3 xl:block">
        {convPanel}
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 xl:hidden"
              onClick={() => setDrawer(false)}
            />
            <motion.div
              initial={{ x: dir === "rtl" ? "-100%" : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: dir === "rtl" ? "-100%" : "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed inset-y-0 end-0 z-50 w-72 border-s border-white/8 bg-ink-900 p-4 pt-[max(1rem,env(safe-area-inset-top))] xl:hidden"
            >
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label={t.common.close}
                className="mb-3 grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
              {convPanel}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* main column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* messages */}
        <div ref={scrollRef} onScroll={onScroll} className="scroll-y flex-1">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-4 pt-4 sm:px-6">
            {/* mobile conv toggle */}
            <div className="mb-4 flex items-center justify-between xl:hidden">
              <button
                type="button"
                onClick={() => setDrawer(true)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-slate-300"
              >
                <PanelRight className="h-4 w-4" />
                {t.app.recentChats}
              </button>
              <div className="flex items-center gap-1.5">
                {isPro && (
                  <Link
                    href="/app/settings/memory"
                    aria-label="ذاكرة Nexus AI v8.4"
                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-amber-200"
                  >
                    <Brain className="h-4 w-4" />
                  </Link>
                )}
                {isPro && <VoiceSettings />}
                {isPro && msgs.some((m) => m.content) && (
                  <ExportMenu
                    label={pro.exportChat}
                    messages={msgs.map((m) => ({ role: m.role, content: m.content }))}
                  />
                )}
                <button
                  type="button"
                  onClick={resetChat}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-500/15 px-3.5 py-2 text-xs font-bold text-brand-300 ring-1 ring-brand-400/25"
                >
                  <SquarePen className="h-3.5 w-3.5" />
                  {t.app.newChat}
                </button>
              </div>
            </div>

            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45 }}
                  className="mb-6"
                >
                  <Logo size={64} withText={false} />
                </motion.div>
                <h1 className="text-2xl font-bold text-white sm:text-4xl">
                  {t.app.welcomeTitle}
                </h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
                  {t.app.welcomeSub}
                </p>
                <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
                  {t.app.suggestions.map((s, i) => {
                    const Icon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="flex items-start gap-3 rounded-2xl border border-aqua-300/10 bg-ink-900/80 px-4 py-3.5 text-start text-sm font-medium leading-relaxed text-slate-300 transition hover:border-brand-500/50 hover:text-white active:scale-[0.99]"
                      >
                        <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-400" />
                        <span>{s}</span>
                      </button>
                    );
                  })}
                </div>
                {isPro && (
                  <div className="mt-3 flex w-full max-w-2xl flex-wrap justify-center gap-2">
                    {pro.proQuick.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setInput(q + "\n\n");
                          taRef.current?.focus();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-3.5 py-2 text-xs font-bold text-amber-100 transition hover:border-amber-300/50"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-300" />
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {msgs.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    isLast={i === msgs.length - 1}
                    buildIntent={i > 0 && msgs[i - 1].role === "user" && BUILD_RE.test(msgs[i - 1].content)}
                    onPreview={setPreview}
                    onRegenerate={onRegen}
                    onSuggest={onSuggest}
                    name={user?.displayName ?? null}
                    photo={user?.photoURL ?? null}
                    thinking={t.app.thinking}
                    copyLabel={t.common.copy}
                    copiedLabel={t.common.copied}
                    pro={!!isPro}
                  />
                ))}

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-center"
                  >
                    {error === "quota" || error === "pro" ? (
                      <Crown className="mx-auto mb-2.5 h-6 w-6 text-amber-300" />
                    ) : (
                      <AlertTriangle className="mx-auto mb-2.5 h-6 w-6 text-amber-300" />
                    )}
                    <p className="text-sm font-bold text-amber-100">{errText[error]}</p>
                    {errDetail && error !== "quota" && error !== "pro" && (
                      <p
                        dir="ltr"
                        className="mx-auto mt-2 max-w-md break-words text-start text-[11px] leading-relaxed text-amber-200/60"
                      >
                        {errDetail}
                      </p>
                    )}
                    {error === "quota" || error === "pro" ? (
                      <Link href="/app/upgrade" className="btn-primary mt-4 px-6 py-2.5 text-sm">
                        {error === "pro" ? pro.upgrade : t.app.quotaBtn}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void send(lastTextRef.current, true)}
                        className="btn-ghost mt-4 px-5 py-2 text-sm"
                      >
                        <RotateCcw className="h-4 w-4" />
                        {t.common.retry}
                      </button>
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* jump to latest */}
        <AnimatePresence>
          {showJump && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                stickRef.current = true;
                scrollToEnd(true);
              }}
              aria-label={t.app.jumpToEnd}
              className="absolute inset-x-0 bottom-[11rem] z-10 mx-auto grid h-10 w-10 place-items-center rounded-full border border-aqua-300/20 bg-ink-800 text-slate-200 shadow-lg shadow-black/40"
            >
              <ArrowDown className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* composer */}
        <div className="relative shrink-0 bg-gradient-to-t from-ink-950 via-ink-950/92 to-transparent px-2.5 pb-1 pt-3 sm:px-6 sm:pb-3">
          <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl">
            {proHint && !isPro && (
              <div className="mb-2 flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3.5">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-amber-100">{pro.proOnly}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-100/70">
                    {pro.proOnlyHint}
                  </p>
                  <Link href="/app/upgrade" className="btn-primary mt-2.5 px-4 py-2 text-xs">
                    {pro.upgrade}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => setProHint(false)}
                  aria-label={t.common.close}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-amber-100/60 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {notice && (
              <p className="mb-2 px-2 text-xs font-bold text-rose-300">{notice}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,application/pdf,.zip,application/zip,text/*,.md,.json,.js,.jsx,.ts,.tsx,.mjs,.py,.php,.java,.kt,.swift,.c,.h,.cpp,.cs,.go,.rs,.rb,.sh,.sql,.html,.css,.scss,.vue,.svelte,.yml,.yaml,.xml,.csv,.log,.toml,.ini"
              onChange={(e) => {
                const list = e.target.files;
                if (list && list.length > 0) void addFiles(Array.from(list));
                e.target.value = "";
              }}
            />

            <div className="rounded-[1.75rem] border border-white/12 bg-ink-900/95 shadow-[0_20px_60px_-26px_rgba(0,0,0,0.95)] backdrop-blur transition focus-within:border-white/40 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.06),0_20px_60px_-26px_rgba(0,0,0,0.95)]">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {files.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex max-w-[15rem] items-center gap-2 rounded-xl border border-white/10 bg-ink-800 py-1 pe-1 ps-1.5 text-xs font-semibold text-slate-200"
                    >
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt="" className="h-8 w-8 rounded-md object-cover" />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-md bg-white/8">
                          <FileText className="h-4 w-4 text-brand-300" />
                        </span>
                      )}
                      <span dir="ltr" className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        aria-label={pro.remove}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* model switch: its own full-width row so no button is ever clipped (MAX included) */}
              <div
                role="radiogroup"
                aria-label="النموذج"
                className="flex w-full items-center gap-1.5 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none]"
              >
                {(isPro
                  ? ([["v5", "Nexus 5"], ["v6", "Nexus 6"], ["v8", "Nexus 8"], ["max", "MAX"]] as const)
                  : ([["v4", "Nexus 4"], ["v5", "Nexus 5"], ["v6", "Nexus 6"], ["v8", "Nexus 8"], ["max", "MAX"]] as const)
                ).map(([id, label]) => {
                  const on = (isPro ? tier : "v4") === id;
                  const locked = !isPro && id !== "v4";
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickTier(id)}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[14px] font-black transition active:scale-95",
                        id === "max"
                          ? on
                            ? "max-pill border-transparent shadow-[0_8px_22px_-6px_rgba(255,100,0,0.95)]"
                            : "border-orange-500 bg-orange-500/15 text-orange-600 ring-1 ring-orange-400/50"
                          : on
                            ? id === "v8"
                              ? "v8-pill border-transparent shadow-[0_6px_18px_-6px_rgba(251,191,36,0.9)]"
                              : "border-transparent bg-gradient-to-r from-brand-500 to-aqua-400 text-white"
                            : "border-white/15 bg-white/[0.06] text-slate-300 hover:text-slate-100"
                      )}
                    >
                      {locked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : id === "max" ? (
                        <Rocket className="h-4 w-4" />
                      ) : id === "v8" ? (
                        <Crown className="h-4 w-4" />
                      ) : id === "v6" ? (
                        <Sparkles className="h-4 w-4" />
                      ) : null}
                      {label}
                    </button>
                  );
                })}
              </div>

              <details className="group px-3 pt-1.5">
                <summary className="cursor-pointer list-none text-[12px] font-bold text-slate-400 hover:text-brand-300">
                  ما الفرق بين Nexus 5 و6 و8 وMAX؟
                </summary>
                <TierCompare className="mt-2 max-h-[46dvh] overflow-y-auto pb-2" />
              </details>

              {isPro && (tier === "v8" || tier === "max") && (
                <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 [scrollbar-width:none]" role="radiogroup" aria-label="Nexus">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={persona === p.id}
                      onClick={() => {
                        setPersona(p.id);
                        try {
                          localStorage.setItem("barq_persona", p.id);
                        } catch {
                          /* private mode */
                        }
                      }}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-black transition active:scale-95",
                        persona === p.id
                          ? "bg-gold-400/20 text-gold-200 ring-1 ring-gold-400/50"
                          : "text-slate-400 hover:bg-white/8 hover:text-slate-100"
                      )}
                    >
                      <span aria-hidden>{p.emoji}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              )}

              {isPro && mode && (
                <div className="flex items-center gap-2 px-3 pt-2.5">
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-500/15 px-3 text-xs font-black text-brand-300 ring-1 ring-brand-500/40">
                    {chatModeById(mode)?.label}
                    <button type="button" onClick={() => setMode(null)} aria-label="إلغاء الوضع" className="grid h-5 w-5 place-items-center rounded-full hover:bg-white/10">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              )}

              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 190)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                  // on phones Enter is a new line; the send button sends
                  if (window.matchMedia("(pointer: coarse)").matches) return;
                  e.preventDefault();
                  void send(input);
                }}
                onPaste={(e) => {
                  const fl = e.clipboardData?.files;
                  if (fl && fl.length > 0) {
                    e.preventDefault();
                    void addFiles(Array.from(fl));
                  }
                }}
                rows={1}
                enterKeyHint="send"
                autoComplete="off"
                placeholder={(mode && chatModeById(mode)?.placeholder) || t.app.inputPlaceholder}
                aria-label={t.app.inputPlaceholder}
                className="block max-h-[190px] min-h-[44px] w-full resize-none bg-transparent px-4 pb-0.5 pt-3 text-[16px] leading-relaxed text-slate-50 outline-none placeholder:text-slate-500"
              />

              {/* tools row: attach · voice · deep · model switch ........ send */}
              <div className="flex items-center gap-0.5 px-2 pb-1.5 pt-0.5">
                {voiceOk && !streaming && !talk && (
                  <VoiceRecorder
                    lang={locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US"}
                    getBase={() => input}
                    onText={(txt) => {
                      setInput(txt);
                      const el = taRef.current;
                      if (el) {
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
                      }
                    }}
                    onBeforeStart={() => true}
                  />
                )}
                <select
                  id="modelSelect"
                  value={freeModel}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!isFreeModel(v) && !(isPro && orIds.has(v))) return;
                    setFreeModel(v);
                    try {
                      localStorage.setItem("nexus_model", v);
                    } catch {
                      /* private mode */
                    }
                  }}
                  aria-label="AI model"
                  title="AI model"
                  dir="ltr"
                  className="h-8 w-[104px] shrink-0 truncate rounded-full border border-white/12 bg-transparent px-2 text-[11px] font-bold text-slate-300 outline-none focus:border-aqua-300"
                >
                  {FREE_MODEL_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.models.map((m) => (
                        <option key={m.id} value={m.id} disabled={!isPro && !FREE_ALLOWED.has(m.id)}>
                          {!isPro && !FREE_ALLOWED.has(m.id) ? `🔒 ${m.label}` : m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {isPro && orModels.length > 0 && (
                    <optgroup label={`🌐 OpenRouter — كل النماذج (${orModels.length})`}>
                      {orModels
                        .filter((m) => !ALL_IDS.has(m.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.free ? "🆓 " : ""}
                            {m.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => (isPro ? fileRef.current?.click() : setProHint(true))}
                  aria-label={pro.attach}
                  title={pro.attach}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/8 hover:text-brand-300 active:scale-90"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setToolsOpen(true)}
                  aria-label="أدوات الإنشاء"
                  title="صور · فيديو · موسيقى · Canvas · Deep Research"
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90",
                    mode ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/50" : "text-slate-400 hover:bg-white/8 hover:text-brand-300"
                  )}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => (isPro ? setCall(true) : setProHint(true))}
                  aria-pressed={call}
                  aria-label="مكالمة صوتية"
                  title="مكالمة صوتية مباشرة: تكلّم مع Nexus AI v8.4 ويرد عليك بصوته"
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90",
                    call
                      ? "animate-pulse bg-aqua-400/25 text-aqua-200 ring-1 ring-aqua-300/50"
                      : "text-slate-400 hover:bg-white/8 hover:text-aqua-300"
                  )}
                >
                  <Headphones className="h-4 w-4" />
                </button>
                {isPro && (tier === "v5" || tier === "v8" || tier === "max") && (
                  <button
                    type="button"
                    onClick={() => setDeep((v) => !v)}
                    aria-pressed={deep}
                    aria-label={pro.deepOn}
                    title={pro.deepHint}
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full transition active:scale-90",
                      deep
                        ? "bg-amber-300/20 text-amber-200 ring-1 ring-amber-300/50"
                        : "text-slate-400 hover:bg-white/8 hover:text-amber-200"
                    )}
                  >
                    <Brain className="h-4 w-4" />
                  </button>
                )}

                <span className="flex-1" />

                {streaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    aria-label={t.app.stop}
                    title={t.app.stop}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-aqua-300 to-aqua-500 text-ink-950 shadow-[0_6px_20px_-6px_rgba(34,211,238,0.8)] transition active:scale-90"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label={t.app.send}
                    title={t.app.send}
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-150 active:scale-90",
                      canSend
                        ? "bg-gradient-to-br from-brand-500 to-aqua-400 text-white shadow-[0_8px_24px_-8px_rgba(0,180,255,0.9)] hover:brightness-110"
                        : "bg-white/[0.07] text-slate-500"
                    )}
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2.6} />
                  </button>
                )}
              </div>
            </div>
          </form>
          {profile && profile.plan !== "pro" && (
            <div className="mx-auto mt-1 flex max-w-3xl items-center gap-2.5 px-2">
              {(

                <>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={profile.dailyLimit}
                    aria-valuenow={profile.creditsLeft}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        profile.creditsLeft <= 15 ? "bg-amber-400" : "bg-brand-500"
                      )}
                      style={{
                        width: `${Math.max(0, Math.min(100, (profile.creditsLeft / profile.dailyLimit) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                    {meterLabel(profile)}
                  </span>
                </>
              )}
            </div>
          )}
          <p className="mx-auto mt-1.5 hidden max-w-3xl px-2 text-center text-[11px] text-slate-600 sm:block">
            <Info className="me-1 inline h-3 w-3" />
            {t.app.disclaimer}
          </p>
        </div>
      </div>

      {preview && <FullPreview html={preview} onClose={() => setPreview(null)} />}

      <ToolsMenu
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        isPro={isPro}
        activeMode={mode}
        onSelect={(id: ToolMenuId) => {
          setToolsOpen(false);
          if (id === "upload") {
            if (isPro) fileRef.current?.click();
            else setProHint(true);
            return;
          }
          if (!isPro) {
            router.push("/app/upgrade");
            return;
          }
          if (id === "personal") {
            router.push("/app/settings/memory");
            return;
          }
          if (id === "image") {
            setImgOpen(true);
            return;
          }
          if (CHAT_MODES.some((m) => m.id === id)) {
            setMode(id);
            setTimeout(() => taRef.current?.focus(), 60);
          }
        }}
      />
      <ImageStudio
        open={imgOpen}
        onClose={() => setImgOpen(false)}
        tier={tier === "v5" || tier === "v6" || tier === "v8" || tier === "max" ? tier : "v5"}
        initialPrompt={input.trim().slice(0, 600)}
      />

      <VoiceCall
        open={call}
        locale={locale}
        onClose={(id) => {
          setCall(false);
          if (id) {
            void loadConvs();
            // the server saves the last spoken answer a moment after the stream ends
            setTimeout(() => void openConv(id), 900);
          }
        }}
      />
    </div>
  );
}
