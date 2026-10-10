"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
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
import { ModelSelector } from "@/components/app/model-selector";
import { UpgradeModal } from "@/components/app/upgrade-modal";
import { DEFAULT_SELECTION, isProProvider, loadSelection, saveSelection, type ModelOption, type ModelSelection } from "@/lib/model-access";
import { Markdown } from "@/components/markdown";
import { ExportMenu } from "@/components/chat/export-menu";
import { VoiceRecorder, VoiceSettings } from "@/components/chat/voice-recorder";
import { DropOverlay, useFileDrop } from "@/components/chat/drop-overlay";
import dynamic from "next/dynamic";
// heavy, rarely-used panels load AFTER the chat is on screen (smaller first load, faster on weak phones)
const ImageStudio = dynamic(() => import("@/components/app/image-studio").then((m) => m.ImageStudio), { ssr: false });
import { ToolsMenu, type ToolMenuId } from "@/components/app/tools-menu";
import { TierCompare } from "@/components/app/tier-compare";
import { CHAT_MODES, chatModeById, resolveChatMode, type ChatModeId } from "@/lib/chat-modes";
import { isBuildRequest } from "@/lib/build-intent";
import { appendChunk } from "@/lib/stream-marks";
import { speak, stopSpeaking } from "@/lib/voice";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
const FullPreview = dynamic(() => import("@/components/game-preview").then((m) => m.FullPreview), { ssr: false });
import { wantsPromptText } from "@/lib/design-canvas";
import {
  isGameRequest as isForgeRequest,
  newCheckpoint,
  advanceCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  isComplete as forgeComplete,
  type ForgeCheckpoint,
} from "@/lib/game-forge";
import { notifyBuildDone } from "@/lib/notify";
import { bundleProject, hardIssues, issuesToPrompt, latestProject, verifyProject, REPAIR_PREFIX } from "@/lib/game-bundle";
const VoiceCall = dynamic(() => import("@/components/voice/voice-call").then((m) => m.VoiceCall), { ssr: false });
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
import { CallButton } from "@/components/chat/call-button";
import { SafeBoundary } from "@/components/safe-boundary";
import { generateInlineImage, INLINE_IMAGE_ERRORS } from "@/lib/inline-image";

/** v8: "generate me an image" requests (the image engine is not available yet). */
const IMAGE_INTENT =
  /(ولّ?د|اصنع|أنشئ|انشئ|صمّ?م|ارسم|اعمل|سوّ?ي|توليد|generate|create|make|draw|génère|genere|crée|cree|dessine)\s+(لي\s+|لنا\s+|me\s+|moi\s+)?(an?\s+|une?\s+|des\s+)?(صور[ةه]?|صور|image|images|picture|pictures|photo|photos)(?![\w\u0600-\u06FF])/i;

type Msg = {
  id: number;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  /** names of files attached to a user message (display only) */
  files?: string[];
  /** deliverable mode (music / video / canvas) that really applied to this user message */
  mode?: ChatModeId;
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

/** the conversation on screen survives leaving to the studio / other pages and closing the app */
const ACTIVE_CONV_KEY = "nexus_active_conv";

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

/** v15: only two engines ship — Nexus 6 (free) and Nexus 8 PRO. */
type TierId = "v6" | "v8";
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

/** Instant, tiny "typing" indicator: no long message, no skeleton — the answer streams in right after it. */
function TypingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-3 py-2" role="status" aria-label={label}>
      <span className="think-orb" aria-hidden />
      <span className="think-bar" aria-hidden />
    </span>
  );
}

/** Long-press (touch) / right-click (desktop) on a message → floating "copy" button. */
function useLongPressCopy(text: string) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event): void => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return;
      setOpen(false);
    };
    const auto = setTimeout(() => setOpen(false), 5000);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    return () => {
      clearTimeout(auto);
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => clear, [clear]);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        setDone(false);
        setOpen(true);
        try {
          navigator.vibrate?.(12);
        } catch {
          /* no haptics */
        }
      }, 450);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: () => {
      setDone(false);
      setOpen(true);
    },
  };

  const pill = open ? (
    <div ref={box} className="absolute -top-12 start-1 z-30 flex items-center gap-1 rounded-2xl border border-white/15 bg-ink-800/95 p-1 shadow-xl backdrop-blur">
      <button
        type="button"
        onClick={async () => {
          if (await copyText(text)) {
            setDone(true);
            setTimeout(() => setOpen(false), 700);
          }
        }}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-black text-white transition active:scale-95 hover:bg-white/10"
      >
        {done ? <Check className="h-4 w-4 text-emerald-300" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {done ? "تم النسخ" : "نسخ"}
      </button>
    </div>
  ) : null;

  return { handlers, pill };
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

/** the code box (thinking card / result card) is ONLY for real build requests or a deliverable mode */

type BuildFlavor = "web" | "music" | "video";
function flavorOf(userMsg: Msg | undefined): BuildFlavor {
  return userMsg?.mode === "music" ? "music" : userMsg?.mode === "video" ? "video" : "web";
}
const FLAVOR_STEPS: Record<Exclude<BuildFlavor, "web">, string[]> = {
  music: [
    "يحدّد النمط والإيقاع والمقام",
    "يؤلّف الكوردات واللحن",
    "يصمّم الطبول والباس",
    "يضيف المؤثرات والصدى",
    "يبني المشغّل والمرئيات",
    "يجهّز زر التحميل WAV",
    "يفحص الأخطاء سطراً بسطر",
    "يجهّز المعاينة",
  ],
  video: [
    "يكتب سيناريو المشاهد",
    "يصمّم الرسوم والانتقالات",
    "يبني المخطّط الزمني",
    "يولّد الصوت والمؤثرات",
    "يضيف أدوات التحكم",
    "يلمّع الحركات",
    "يفحص الأخطاء سطراً بسطر",
    "يجهّز المعاينة",
  ],
};

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

function BuildThinking({ info, flavor = "web" }: { info: CodeInfo | null; flavor?: BuildFlavor }) {
  const steps = flavor === "web" ? BUILD_STEPS : FLAVOR_STEPS[flavor];
  const [i, setI] = useState(0);
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => Math.min(steps.length - 1, v + 1)), 4200);
    const t = setInterval(() => setSec((v) => v + 1), 1000);
    return () => {
      clearInterval(id);
      clearInterval(t);
    };
  }, []);
  const lines = info?.lines ?? 0;
  const target = flavor === "web" ? 4200 : 600; // a track / clip is far smaller than a game
  const pct = Math.min(97, Math.max(5, Math.round((lines / target) * 100)));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return (
    <div className="nx-build mt-2">
      <div className="nx-build-sheen" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="nx-orb" aria-hidden>
          <span className="nx-orb-core" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14.5px] font-black text-slate-100">
            Nexus 8 <span className="nx-badge">PRO</span>
            <span className="text-slate-400">{flavor === "music" ? "يؤلّف ويبني…" : flavor === "video" ? "يخرج ويبني…" : "يفكّر ويبني…"}</span>
          </p>
          <p className="mt-0.5 truncate text-[12.5px] font-semibold text-brand-300">
            {steps[i]}
            <span className="nx-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-black/[0.05] px-2 py-1 text-[11.5px] font-black tabular-nums text-slate-400" dir="ltr">
          {mm}:{ss}
        </span>
      </div>

      <div className="nx-track mt-3.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="nx-fill" style={{ width: `${pct}%` }}>
          <span className="nx-fill-glow" />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] font-black text-slate-400">
        <span dir="ltr">{(info?.lines ?? 0).toLocaleString("en-US")} lines</span>
        <span dir="ltr">{((info?.chars ?? 0) / 1024).toFixed(0)} KB</span>
        <span className="text-brand-300">{pct}%</span>
        <span className="ms-auto text-emerald-500">لا تغلق الصفحة — البناء متواصل</span>
      </div>
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
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-[#fff]">
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
          <button type="button" onClick={onPreview} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-orange-500 to-amber-400 px-4 text-[13px] font-black text-[#fff] shadow-[0_8px_22px_-10px_rgba(234,88,12,0.9)] transition active:scale-95">
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
  flavor,
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
  flavor?: BuildFlavor;
  onPreview: (html: string) => void;
  onRegenerate: () => void;
  onSuggest: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const isUser = m.role === "user";
  const press = useLongPressCopy(m.content);
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
  const codeInfo = useMemo(() => (!isUser && pro && buildIntent ? analyseCode(body) : null), [isUser, pro, buildIntent, body]);

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
        <div className="relative max-w-[90%] min-w-0 sm:max-w-[82%]" {...press.handlers}>
          {press.pill}
          <div className="rounded-3xl rounded-se-lg bg-gradient-to-br from-brand-600 to-aqua-500 px-4.5 py-3 text-[16px] leading-[1.75] text-[#fff] shadow-[0_10px_30px_-14px_rgba(0,180,255,0.9)] ring-1 ring-white/20">
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.files && m.files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.files.map((f, i) => (
                  <span
                    key={`${f}-${i}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-lg bg-black/25 px-2 py-1 text-[11px] font-semibold text-[#fff]/90"
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
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-aqua-500 to-gold-400 text-base font-bold leading-none text-[#fff] ring-1 ring-white/20">
        ب
      </span>

      <div className="relative min-w-0 flex-1">
        {press.pill}
        <div className="text-[16px] leading-[1.85] text-slate-100" {...press.handlers}>
          {m.pending && !m.content ? (
            <div>
              <TypingDots label={thinking} />
            </div>
          ) : pro && m.pending && buildIntent ? (
            // while building: ONLY the thinking card (no long message, no raw code)
            <BuildThinking info={codeInfo ?? lineStats(body)} flavor={flavor} />
          ) : codeInfo && !showCode ? (
            <>
              {codeInfo.text && codeInfo.text.length <= 220 && (
                <SafeBoundary fallback={<p className="whitespace-pre-wrap">{codeInfo.text}</p>}>
                  <Markdown pro={pro} plainCode>
                    {codeInfo.text}
                  </Markdown>
                </SafeBoundary>
              )}
              {m.pending ? (
                <BuildThinking info={codeInfo} flavor={flavor} />
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
              <SafeBoundary resetKey={body.length} fallback={<p className="whitespace-pre-wrap" dir="auto">{body}</p>}>
                <Markdown pro={pro} plainCode={!!m.pending}>
                  {body}
                </Markdown>
              </SafeBoundary>
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
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-gold-400 text-[#fff]">
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
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgAuto, setImgAuto] = useState(0);
  const [selection, setSelection] = useState<ModelSelection>(DEFAULT_SELECTION);
  const [lockedModel, setLockedModel] = useState<ModelOption | null>(null);
  /** MAX / Pro: every OpenRouter model (loaded once from /api/ai/models) */
  const [orModels, setOrModels] = useState<{ id: string; name: string; ctx: number; free: boolean }[]>([]);
  useEffect(() => {
    setSelection(loadSelection());
  }, []);
  // a free account (or an expired Pro) never keeps a Pro-only provider selected
  useEffect(() => {
    if (!isPro && isProProvider(selection.provider)) {
      setSelection(DEFAULT_SELECTION);
      saveSelection(DEFAULT_SELECTION);
    }
  }, [isPro, selection.provider]);
  const changeSelection = (s: ModelSelection) => {
    setSelection(s);
    saveSelection(s);
  };
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
  // v15.2 — FORGE. A long multi-file build survives leaving the page: the
  // checkpoint lives in localStorage, so coming back offers "كمّل" instead of
  // silently starting the whole game again.
  const [forge, setForge] = useState<ForgeCheckpoint | null>(null);
  const forgeRef = useRef<ForgeCheckpoint | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("barq_tier");
      // v15 migration: v4/v5 -> v6, max -> v8. Only two engines exist now.
      const v: TierId = raw === "v6" || raw === "v4" || raw === "v5" ? "v6" : "v8";
      if (localStorage.getItem("barq_v15_default") !== "1") {
        localStorage.setItem("barq_v15_default", "1");
        localStorage.setItem("barq_tier", "v8");
      } else {
        setTier(v);
        localStorage.setItem("barq_tier", v);
      }
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
          if ((d.tier === "max" || d.tier === "v8") && isPro) {
            setTier("v8");
            try { localStorage.setItem("barq_tier", "v8"); } catch {}
          }
          setTimeout(() => taRef.current?.focus(), 60);
        }
      } catch {}
    };
    take();
    window.addEventListener("barq:prefill", take);
    return () => window.removeEventListener("barq:prefill", take);
  }, [isPro, profile]);
  // persona agents can be opened from the command palette (Ctrl+K): switches the chat to that mode
  useEffect(() => {
    const take = () => {
      try {
        const id = sessionStorage.getItem("nexus_open_mode");
        if (!id) return;
        sessionStorage.removeItem("nexus_open_mode");
        if (chatModeById(id)) {
          setMode(id as ChatModeId);
          setTimeout(() => taRef.current?.focus(), 60);
        }
      } catch {}
    };
    take();
    window.addEventListener("nexus:open-mode", take);
    return () => window.removeEventListener("nexus:open-mode", take);
  }, []);
  // "voice call" can also be started from the command palette (Ctrl+K)
  useEffect(() => {
    const open = () => {
      setCall(true);
    };
    window.addEventListener("barq:voice-call", open);
    return () => window.removeEventListener("barq:voice-call", open);
  }, []);
  // a free account always runs Nexus 6; Pro lands on Nexus 8
  useEffect(() => {
    if (!isPro && tier !== "v6") setTier("v6");
  }, [isPro, tier]);
  const pickTier = (v: TierId) => {
    if (v === "v8" && !isPro) {
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
  // automatic project repair rounds (max 2 per user request): the checker found a broken import / missing file
  const repairRef = useRef(0);
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
    try { localStorage.removeItem(ACTIVE_CONV_KEY); } catch {}
    setError(null);
    setStreaming(false);
    setDrawer(false);
    setFiles([]);
    setNotice(null);
    stickRef.current = true;
    // a half-finished build of the OLD chat must not leak into the new one
    forgeRef.current = null;
    setForge(null);
    setPreview(null);
    setShowJump(false);
    if (taRef.current) taRef.current.style.height = "auto";
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
        if (res.status === 404) {
          try { localStorage.removeItem(ACTIVE_CONV_KEY); } catch {}
        }
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

  // remember the open conversation; restore it when the chat page mounts again (studio → back, app closed → reopened)
  useEffect(() => {
    if (!convId) return;
    try { localStorage.setItem(ACTIVE_CONV_KEY, convId); } catch {}
  }, [convId]);
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !user || wantedConv || searchParams.get("q")) return;
    restoredRef.current = true;
    try {
      const id = localStorage.getItem(ACTIVE_CONV_KEY);
      if (id && /^[\w-]{6,80}$/.test(id)) void openConv(id);
    } catch {}
  }, [user, wantedConv, searchParams, openConv]);

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
      // "generate me an image": the picture is drawn right here in the chat (free + Pro)
      if (!retry && !baseOverride && IMAGE_INTENT.test(content)) {
        setInput("");
        setNotice(null);
        setError(null);
        const aid = nextId();
        const usedMode = resolveChatMode(mode, content);
        setMsgs((m) => [...m, { id: nextId(), role: "user", content, ...(usedMode?.oneShot ? { mode: usedMode.id } : {}) }, { id: aid, role: "assistant", content: "", pending: true }]);
        stickRef.current = true;
        void generateInlineImage(authFetch, content).then((r) => {
          const alt = content.slice(0, 80).replace(/[\[\]()]/g, " ");
          setMsgs((m) =>
            m.map((x) =>
              x.id === aid
                ? {
                    ...x,
                    pending: false,
                    content: r.ok
                      ? `![${alt}](${r.url})\n\n*رُسمت في ${(r.ms / 1000).toFixed(1)} ثانية. لتعديل عنصر فيها أو تغيير الأسلوب افتح «إنشاء صور» من زر +.*`
                      : `⚠️ ${INLINE_IMAGE_ERRORS[r.code] ?? INLINE_IMAGE_ERRORS.FAILED}`,
                  }
                : x
            )
          );
        });
        return;
      }
      lastTextRef.current = text.trim();
      lastFilesRef.current = sendFiles;
      if (!retry) autoRetryRef.current = 0;
      if (!text.startsWith(REPAIR_PREFIX)) repairRef.current = 0;
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

      // v15.2: a game build gets a checkpoint from the first token.
      if (isForgeRequest(content)) {
        const cp = forgeRef.current && !forgeComplete(forgeRef.current) ? forgeRef.current : newCheckpoint(content);
        forgeRef.current = cp;
        setForge(cp);
        saveCheckpoint(cp);
      }
      let acc = "";
      let activeConv: string | null = convId;
      let timer: ReturnType<typeof setTimeout> | null = null;
      // paint the answer ~16×/s instead of once per network chunk: far less
      // markdown re-parsing, so long answers stay smooth even on weak phones
      const flush = () => {
        timer = null;
        // a stale timer from a cancelled request must never overwrite the new chat
        if (abortRef.current !== controller) return;
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
      let reqDone = false;
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WL> } };
        nav.wakeLock
          ?.request("screen")
          .then((l) => {
            wake = l;
            if (reqDone) void l.release().catch(() => undefined);
          })
          .catch(() => undefined);
      } catch {
        /* not supported */
      }
      try {
        const res = await authFetch("/api/ai/chat", {
          method: "POST",
          body: JSON.stringify({
            conversationId: convId,
            messages: [...history, { role: "user", content }],
            ...(sendFiles.length > 0
              ? {
                  attachments: sendFiles
                    .filter((f) => f.data)
                    .map((f) => ({ name: f.name, mime: f.mime, data: f.data })),
                  textFiles: sendFiles
                    .filter((f) => f.text !== undefined)
                    .map((f) => ({ name: f.name, text: f.text })),
                }
              : {}),
            // model selector: gemini (default) | huggingface | grok | openrouter (grok / openrouter are Pro, enforced by the server)
            provider: selection.provider,
            model: selection.model ?? "auto",
            ...(isPro && deep ? { deep: true } : {}),
            ...(tier === "v6" ? { v6: true } : {}),
            ...(mode ? { mode } : {}),
            ...(isPro && tier === "v8" ? { v8: true, persona } : {}),
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
          if (code === "PRO_MODEL_REQUIRED") {
            // free account asked for a Pro model: show the upgrade modal and go back to Gemini
            setMsgs((m) => m.filter((x) => !x.pending));
            setStreaming(false);
            abortRef.current = null;
            setLockedModel(
              (selection.provider === "grok" || selection.provider === "openrouter") && selection.model
                ? { provider: selection.provider, id: selection.model, label: selection.model }
                : { provider: "openrouter", id: "auto", label: "This model" }
            );
            setSelection(DEFAULT_SELECTION);
            saveSelection(DEFAULT_SELECTION);
            return;
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
        // deliverable modes (music / video / canvas) serve ONE message, then the chat is normal again
        if (chatModeById(mode)?.oneShot) setMode(null);
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
            acc = appendChunk(acc, decoder.decode(value, { stream: true })); // a verified+repaired build replaces the draft
            // advance the forge checkpoint whenever a new file closes
            if (forgeRef.current && acc.length - (forgeRef.current.bytes || 0) > 4000) {
              const next = advanceCheckpoint(forgeRef.current, acc);
              if (next.done.length !== forgeRef.current.done.length) {
                forgeRef.current = next;
                setForge(next);
                saveCheckpoint(next);
              }
            }
            schedule();
          }
        } catch (re) {
          // connection dropped in the middle (screen lock, weak network, server time limit):
          // a Pro build is finished by the continuation loop below instead of stopping
          if ((re as Error).name === "AbortError" || !isPro || acc.length === 0) throw re;
          dropped = true;
        }
        acc = appendChunk(acc, decoder.decode());

        // NEVER STOP IN THE MIDDLE OF CODE: while the answer still ends inside a code
        // block (limit / network / screen lock), ask the server to finish it — up to 12 rounds,
        // surviving dropped connections; stops only when two rounds in a row bring nothing new.
        if (isPro && selection.provider === "gemini") {
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
                  ...(mode ? { mode } : {}),
                  ...(tier === "v8" ? { v8: true, persona } : {}),
                }),
                signal: controller.signal,
              });
              if (cres.ok && cres.body) {
                const cr = cres.body.getReader();
                try {
                  for (;;) {
                    const { done, value } = await cr.read();
                    if (done) break;
                    acc = appendChunk(acc, decoder.decode(value, { stream: true }));
                    schedule();
                  }
                } catch (ce) {
                  if ((ce as Error).name === "AbortError") throw ce;
                }
                acc = appendChunk(acc, decoder.decode());
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

        // v15.2: close out the forge checkpoint.
        if (forgeRef.current) {
          const fin = advanceCheckpoint(forgeRef.current, acc);
          forgeRef.current = fin;
          setForge(fin);
          saveCheckpoint(fin);
          if (forgeComplete(fin) || /NEXUS-FORGE-COMPLETE/.test(acc)) {
            void notifyBuildDone(fin.plan.title);
            clearCheckpoint(fin.id);
            forgeRef.current = null;
            setForge(null);
          }
        }

        // finished a real web build → open the live preview full-screen by itself
        // v15: only a REAL build opens the panel. Asking for a prompt, or for
        // an explanation that happens to quote some HTML, must stay as text.
        if (isPro && mine() && !codeLooksCut(acc) && !wantsPromptText(content)) {
          // multi-file project (Game Forge): check it, auto-repair what is broken, THEN open one bundled page
          const proj = latestProject([...history.filter((h) => h.role === "assistant").map((h) => h.content), acc], { keepOpen: true });
          if (proj.length >= 2 && proj.some((f) => /\.html?$/i.test(f.path))) {
            const hard = hardIssues(verifyProject(proj));
            if (hard.length > 0 && repairRef.current < 2) {
              repairRef.current += 1;
              const fix = issuesToPrompt(hard);
              setTimeout(() => void sendRef.current(fix), 500);
            } else {
              const bundled = bundleProject(proj.filter((f) => !f.open));
              if (bundled) setTimeout(() => setPreview(bundled), 350);
            }
          } else {
            const page = extractHtml(acc);
            const isRealApp =
              page &&
              page.length > 1500 &&
              /<(canvas|script|body)/i.test(page) &&
              /<html|<!doctype/i.test(page); // a full document, not a snippet
            if (isRealApp) {
              setTimeout(() => setPreview(page), 350);
            }
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
        reqDone = true;
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
    [msgs, streaming, convId, authFetch, applyHeaders, loadConvs, waitForAnswer, files, isPro, deep, tier, persona, mode, selection, pro.defaultAsk]
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
    [files, pro]
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
      {...fileDrop.bind}
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
          <div className="nx-wide flex min-h-full flex-col px-4 pb-4 pt-4 sm:px-6">
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
                    buildIntent={i > 0 && msgs[i - 1].role === "user" && (isBuildRequest(msgs[i - 1].content) || !!msgs[i - 1].mode)}
                    flavor={i > 0 && msgs[i - 1].role === "user" ? flavorOf(msgs[i - 1]) : "web"}
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
          <form onSubmit={onSubmit} className="nx-wide">
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
                {([["v6", "Nexus 6"], ["v8", "Nexus 8"]] as const).map(([id, label]) => {
                  const on = (isPro ? tier : "v6") === id;
                  const locked = !isPro && id === "v8";
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickTier(id)}
                      className={cn(
                        "inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[14px] font-black transition active:scale-95",
                        on
                          ? id === "v8"
                            ? "v8-pill border-transparent shadow-[0_8px_22px_-8px_rgba(217,164,32,0.9)]"
                            : "border-transparent bg-gradient-to-r from-brand-500 to-aqua-400 text-[#fff] shadow-[0_8px_22px_-10px_rgba(99,102,241,0.9)]"
                          : "border-black/10 bg-black/[0.03] text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {locked ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : id === "v8" ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {label}
                      {id === "v8" && (
                        <span className="rounded-full bg-black/15 px-1.5 text-[10px] font-black tracking-wide">PRO</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <details className="group px-3 pt-1.5">
                <summary className="cursor-pointer list-none text-[12px] font-bold text-slate-400 hover:text-brand-300">
                  ما الفرق بين Nexus 6 و Nexus 8 PRO؟
                </summary>
                <TierCompare className="mt-2 max-h-[46dvh] overflow-y-auto pb-2" />
              </details>

              {isPro && tier === "v8" && (
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
              <div className="flex min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden px-2 pb-1.5 pt-0.5">
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
                <ModelSelector
                  value={selection}
                  isPro={isPro}
                  orModels={orModels}
                  onChange={changeSelection}
                  onLocked={(o) => setLockedModel(o)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
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
                <CallButton active={call} onClick={() => setCall(true)} />
                {isPro && tier === "v8" && (
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

                <span className="min-w-0 flex-1" />

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
                        ? "bg-gradient-to-br from-brand-500 to-aqua-400 text-[#fff] shadow-[0_8px_24px_-8px_rgba(0,180,255,0.9)] hover:brightness-110"
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
            <div className="nx-wide mt-1 flex items-center gap-2.5 px-2">
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
          <p className="nx-wide mt-1.5 hidden px-2 text-center text-[11px] text-slate-600 sm:block">
            <Info className="me-1 inline h-3 w-3" />
            {t.app.disclaimer}
          </p>
        </div>
      </div>

      {preview && <FullPreview html={preview} onClose={() => setPreview(null)} />}

      <ToolsMenu
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        isPro
        activeMode={mode}
        onSelect={(id: ToolMenuId) => {
          setToolsOpen(false);
          if (id === "upload") {
            fileRef.current?.click();
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
        onClose={() => {
          setImgOpen(false);
          setImgPrompt("");
        }}
        tier={tier}
        initialPrompt={imgPrompt || input.trim().slice(0, 600)}
        autoStart={imgAuto}
      />

      <UpgradeModal open={lockedModel !== null} modelLabel={lockedModel?.label ?? ""} locale={locale} onClose={() => setLockedModel(null)} />

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
