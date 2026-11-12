"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Copy, Eraser, Lightbulb, PenLine, SendHorizonal, Sparkles, User, Wand2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const CHIPS: Array<{ icon: React.ReactNode; label: string; prompt: string }> = [
  { icon: <PenLine className="h-3.5 w-3.5" />, label: "اكتب لي منشورًا", prompt: "اكتب لي منشورًا قصيرًا وجميلًا عن صباح جميل في الجزائر مع هاشتاغات." },
  { icon: <Lightbulb className="h-3.5 w-3.5" />, label: "أفكار محتوى", prompt: "أعطني 5 أفكار محتوى جذابة لحسابي على Dz connect هذا الأسبوع." },
  { icon: <Sparkles className="h-3.5 w-3.5" />, label: "كيف أنمو؟", prompt: "كيف أزيد التفاعل والمتابعين على حسابي في Dz connect؟ أعطني خطة عملية قصيرة." },
  { icon: <Wand2 className="h-3.5 w-3.5" />, label: "نصيحة سريعة", prompt: "أعطني نصيحة ذكية واحدة لتحسين بروفايلي وصوري على منصات التواصل." },
];

const WELCOME: ChatMsg = {
  role: "assistant",
  content:
    "أهلًا بيك في **Dz connect ai** ✨ أنا مساعدك الذكي داخل Dz connect. نقدر نعاونك تكتب منشورات رائعة، نلقى أفكار محتوى، نصيغ ردود ذكية على الرسائل، ولا نجاوبك على أي سؤال… جرّب تسألني أي حاجة!",
};

/** Dz connect ai — in-app assistant (Meta AI style), powered server-side. */
export default function AiPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: { ai?: { configured: boolean; reachable: boolean } }) => setAvailable(Boolean(d.ai?.configured && d.ai?.reachable)))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== WELCOME).slice(-12) }),
      });
      const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
      if (!data.ok || !data.text) throw new Error(data.error ?? "حدث خطأ.");
      setMessages((prev) => [...prev, { role: "assistant", content: data.text! }]);
      setAvailable(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "تعذّر الاتصال بالمساعد.", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("تم النسخ — الصقه في منشور جديد 📝");
    } catch {
      toast("تعذّر النسخ", "error");
    }
  };

  return (
    <div className="animate-fade-up flex min-h-0 flex-1 flex-col">
      {/* header */}
      <div className="glass relative overflow-hidden rounded-[26px] p-4">
        <div className="pointer-events-none absolute -top-10 end-0 h-32 w-32 rounded-full bg-cyan-400/20 blur-[50px]" />
        <div className="pointer-events-none absolute -bottom-12 start-6 h-32 w-32 rounded-full bg-emerald-400/20 blur-[50px]" />
        <div className="relative flex items-center gap-3">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 text-white shadow-[0_10px_28px_rgba(20,184,166,0.4)]">
            <Sparkles className="h-6 w-6" />
            <span className="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-300 ring-2 ring-[#0b1512]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-black text-white" dir="ltr" style={{ textAlign: "start" }}>
              Dz connect ai
            </h1>
            <p className="text-xs text-white/50">
              {available === null ? "جارٍ الاتصال…" : available ? "متصل — اسألني أي شيء، أنا هنا ✨" : "غير متاح حاليًا — سنعود قريبًا"}
            </p>
          </div>
          {messages.length > 1 && (
            <button
              onClick={() => setMessages([WELCOME])}
              className="ms-auto flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/60 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <Eraser className="h-3.5 w-3.5" /> محادثة جديدة
            </button>
          )}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="stagger mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pe-0.5">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex items-end gap-2", msg.role === "user" ? "justify-start flex-row-reverse" : "justify-start")}>
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                msg.role === "user" ? "bg-white/[0.08] text-white/70" : "bg-gradient-to-br from-emerald-400 to-cyan-600",
              )}
            >
              {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </span>
            <div
              className={cn(
                "group max-w-[80%] rounded-[22px] px-3.5 py-2.5 text-[14.5px] leading-7 shadow-lg",
                msg.role === "user"
                  ? "rounded-ee-md bg-gradient-to-l from-emerald-500 to-teal-600 text-white"
                  : "glass rounded-es-md text-white/90",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content.replace(/\*\*/g, "")}</p>
              {msg.role === "assistant" && i > 0 && (
                <button
                  onClick={() => void copyText(msg.content.replace(/\*\*/g, ""))}
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-teal-300/80 transition hover:text-teal-200"
                >
                  <Copy className="h-3 w-3" /> نسخ / استخدام كمنشور
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-600 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <span className="glass flex items-center gap-1 rounded-[22px] rounded-es-md px-3.5 py-3.5">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* chips + composer */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1">
        {CHIPS.map((chip) => (
          <button
            key={chip.label}
            onClick={() => void send(chip.prompt)}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-2 text-xs font-bold text-teal-200 ring-1 ring-teal-300/20 transition hover:bg-teal-400/10 active:scale-95 disabled:opacity-40"
          >
            {chip.icon} {chip.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="glass-nav mb-[max(0.4rem,env(safe-area-inset-bottom))] flex items-end gap-2 rounded-[28px] p-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={profile ? `اسأل Dz connect ai يا ${profile.display_name.split(" ")[0]}…` : "اسأل Dz connect ai…"}
          className="max-h-28 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-white outline-none placeholder:text-white/35"
          aria-label="رسالتك إلى Dz connect ai"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="إرسال إلى Dz connect ai"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 text-white shadow-[0_10px_26px_rgba(20,184,166,0.45)] transition active:scale-90 disabled:opacity-40"
        >
          <SendHorizonal className="h-5 w-5 -scale-x-100" />
        </button>
      </form>
    </div>
  );
}
