"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  Check,
  Code2,
  Copy,
  Feather,
  Lightbulb,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNexus, type ChatMessage } from "@/lib/store";
import { Markdown } from "@/components/markdown";
import { NexusMark } from "@/components/logo";
import { Tooltip, TypingDots } from "@/components/ui";

/* ── suggestion cards (empty state) ─────────────────────────── */

const SUGGESTIONS = [
  {
    icon: Feather,
    title: "كتابة محتوى",
    hint: "منشور احترافي جاهز للنشر",
    prompt: "اكتب لي منشور LinkedIn احترافي عن إطلاق منتج تقني جديد في الجزائر",
    tint: "from-indigo-500/15 to-indigo-500/0 text-indigo-400",
  },
  {
    icon: Code2,
    title: "كود وتطوير",
    hint: "مكوّن React بضغطة",
    prompt: "اصنع لي component زر تفاعلي بـ React و Tailwind بتصميم زجاجي",
    tint: "from-cyan-500/15 to-cyan-500/0 text-cyan-400",
  },
  {
    icon: Lightbulb,
    title: "أفكار وخطط",
    hint: "خطة مشروع في دقائق",
    prompt: "أعطني خطة عمل مفصلة لإطلاق تطبيق توصيل طعام في ولايتي",
    tint: "from-amber-500/15 to-amber-500/0 text-amber-400",
  },
  {
    icon: Languages,
    title: "ترجمة فورية",
    hint: "عربية · دارجة · فرنسية",
    prompt: "Traduire ce texte en arabe: « La technologie rapproche les gens et simplifie la vie quotidienne »",
    tint: "from-violet-500/15 to-violet-500/0 text-violet-400",
  },
];

function Welcome() {
  const { send } = useNexus();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pt-10 pb-6 sm:pt-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="relative"
      >
        <NexusMark size={76} className="drop-shadow-[0_0_30px_rgba(109,141,255,0.45)]" />
        <span
          className="absolute -inset-6 -z-10 rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(109,141,255,0.28), transparent 70%)" }}
        />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 text-center text-[26px] leading-tight font-extrabold tracking-tight sm:text-[34px]"
      >
        <span className="text-gradient">كيف نقدر نعاونك اليوم؟</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-3 max-w-md text-center text-[14px] leading-relaxed text-(--ink-2)"
      >
        Nexus يفهم العربية والدارجة والفرنسية والإنجليزية — اكتب، ابرمج، خطّط، وترجم في مكان واحد.
      </motion.p>

      <div className="mt-9 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 + i * 0.07, type: "spring", stiffness: 260, damping: 22 }}
            onClick={() => void send(s.prompt)}
            className="glass hover-lift press group cursor-pointer rounded-2xl p-4 text-start"
          >
            <span className={cn("mb-3 inline-grid size-9 place-items-center rounded-xl bg-gradient-to-b", s.tint)}>
              <s.icon className="size-4.5" />
            </span>
            <span className="block text-[14px] font-bold text-(--ink) transition-colors group-hover:text-(--accent)">
              {s.title}
            </span>
            <span className="mt-0.5 block text-[12px] text-(--ink-3)">{s.hint}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ── message actions ────────────────────────────────────────── */

function ActionBar({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const { regenerate, streaming } = useNexus();
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      /* noop */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100">
      <Tooltip label={copied ? "تم النسخ" : "نسخ"}>
        <button
          onClick={copy}
          aria-label="نسخ"
          className="press grid size-7.5 cursor-pointer place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink)"
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        </button>
      </Tooltip>
      {isLast && (
        <Tooltip label="إعادة التوليد">
          <button
            onClick={() => void regenerate()}
            disabled={streaming}
            aria-label="إعادة التوليد"
            className="press grid size-7.5 cursor-pointer place-items-center rounded-lg text-(--ink-3) hover:bg-(--glass-hi) hover:text-(--ink) disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </Tooltip>
      )}
      <Tooltip label="إجابة جيدة">
        <button
          onClick={() => setVote(vote === "up" ? null : "up")}
          aria-label="إجابة جيدة"
          className={cn(
            "press grid size-7.5 cursor-pointer place-items-center rounded-lg hover:bg-(--glass-hi)",
            vote === "up" ? "text-(--accent)" : "text-(--ink-3) hover:text-(--ink)",
          )}
        >
          <ThumbsUp className="size-3.5" fill={vote === "up" ? "currentColor" : "none"} />
        </button>
      </Tooltip>
      <Tooltip label="إجابة ضعيفة">
        <button
          onClick={() => setVote(vote === "down" ? null : "down")}
          aria-label="إجابة ضعيفة"
          className={cn(
            "press grid size-7.5 cursor-pointer place-items-center rounded-lg hover:bg-(--glass-hi)",
            vote === "down" ? "text-red-400" : "text-(--ink-3) hover:text-(--ink)",
          )}
        >
          <ThumbsDown className="size-3.5" fill={vote === "down" ? "currentColor" : "none"} />
        </button>
      </Tooltip>
      {(message.engine || message.model) && (
        <span className="ms-1 max-w-40 truncate text-[10px] font-semibold tracking-wide text-(--ink-3)" dir="ltr" title={message.engine ?? undefined}>
          {message.engine ?? message.model}
        </span>
      )}
    </div>
  );
}

/* ── single message ─────────────────────────────────────────── */

function MessageRow({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const isUser = message.role === "user";
  const streamingEmpty = message.pending && message.role === "assistant" && !message.content;
  const streamingText = message.pending && !isUser && !!message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group/msg flex w-full flex-col", isUser ? "items-end" : "items-start")}
    >
      {isUser ? (
        <div className="max-w-[85%] sm:max-w-[72%]">
          <div
            className="rounded-3xl rounded-se-lg px-4.5 py-3 text-[15px] leading-relaxed text-white shadow-[0_10px_30px_-10px_rgba(90,110,255,0.55)]"
            style={{
              background: "linear-gradient(135deg, #5d74f2, #7d54e8 55%, #8f4df0)",
            }}
          >
            <div className="whitespace-pre-wrap" dir="auto">
              {message.content}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-full gap-3">
          <div className="mt-0.5 shrink-0">
            <NexusMark size={30} className={cn(streamingText && "animate-pulse")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="glass hairline rounded-3xl rounded-ss-lg px-5 py-4">
              {streamingEmpty ? (
                <TypingDots />
              ) : (
                <div className={cn(streamingText && "stream-caret")}>
                  <Markdown text={message.content} />
                </div>
              )}
            </div>
            {!message.pending && <ActionBar message={message} isLast={isLast} />}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ── thread skeleton ────────────────────────────────────────── */

function ThreadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      {[70, 45, 85].map((w, i) => (
        <div key={i} className={cn("flex flex-col gap-2", i % 2 ? "items-end" : "items-start")}>
          <div className="skeleton-shimmer h-4 rounded-lg" style={{ width: `${w * 0.6}%` }} />
          <div className="skeleton-shimmer h-4 rounded-lg" style={{ width: `${w}%` }} />
          <div className="skeleton-shimmer h-4 rounded-lg" style={{ width: `${w * 0.35}%` }} />
        </div>
      ))}
    </div>
  );
}

/* ── chat area ──────────────────────────────────────────────── */

export function ChatArea() {
  const { messages, loadingThread, streaming, activeId } = useNexus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  }, [messages]);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  /* follow the stream unless the user scrolled up */
  useEffect(() => {
    if (nearBottom.current) scrollToBottom(!streaming);
  }, [messages, streaming]);

  /* switching conversation: jump instantly */
  useEffect(() => {
    nearBottom.current = true;
    scrollToBottom(false);
  }, [activeId, loadingThread]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = distance < 140;
    setShowJump(distance > 260);
  };

  const empty = !loadingThread && messages.length === 0;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-slim h-full overflow-y-auto overscroll-contain"
      >
        {loadingThread ? (
          <ThreadSkeleton />
        ) : empty ? (
          <Welcome />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-8 pb-40 sm:px-6">
            {messages.map((m, i) => (
              <MessageRow key={m.id} message={m} isLast={i === lastAssistantIdx} />
            ))}
          </div>
        )}
      </div>

      {/* scroll-to-bottom pill */}
      <AnimatePresence>
        {showJump && !empty && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            onClick={() => {
              nearBottom.current = true;
              scrollToBottom();
            }}
            className="glass-pop press absolute bottom-6 left-1/2 z-20 grid size-10 -translate-x-1/2 cursor-pointer place-items-center rounded-full text-(--ink-2) hover:text-(--ink)"
            aria-label="النزول للأسفل"
          >
            <ArrowDown className="size-4.5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
