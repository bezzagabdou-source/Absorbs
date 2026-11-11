"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCheck, Loader2, SendHorizonal } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { cn, friendlyError, messageTimeAr } from "@/lib/utils";
import type { DmThread, Message, Profile } from "@/lib/types";

export default function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: threadId } = use(params);
  const { user } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const scrollToBottom = (smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  };

  const markRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .neq("sender_id", user.id)
      .is("read_at", null);
  }, [supabase, threadId, user]);

  /* initial load: thread + peer profile + history */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: thread } = await supabase.from("dm_threads").select("*").eq("id", threadId).maybeSingle();
      if (!thread) {
        if (!cancelled) setLoading(false);
        return;
      }
      const t = thread as DmThread;
      const otherId = t.user_low === user.id ? t.user_high : t.user_low;
      const [{ data: profile }, { data: history }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", otherId).maybeSingle(),
        supabase.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }).limit(300),
      ]);
      if (cancelled) return;
      setOther((profile as Profile | null) ?? null);
      setMessages((history ?? []) as Message[]);
      setLoading(false);
      scrollToBottom(false);
      void markRead();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, threadId, user, markRead]);

  /* realtime messages + typing indicator */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`room-${threadId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const msg = payload.new as unknown as Message;
          setMessages((prev) => {
            const withoutTemp = prev.filter((m) => !(m.id.startsWith("temp-") && m.content === msg.content && m.sender_id === msg.sender_id));
            return withoutTemp.some((m) => m.id === msg.id) ? withoutTemp : [...withoutTemp, msg];
          });
          scrollToBottom();
          if (msg.sender_id !== user.id) void markRead();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const updated = payload.new as unknown as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        },
      )
      .on("broadcast", { event: "typing" }, (payload: { payload: { userId?: string } }) => {
        if (payload.payload?.userId === user.id) return;
        setPeerTyping(true);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setPeerTyping(false), 2600);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, threadId, user, markRead]);

  const broadcastTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1800) return;
    lastTypingSent.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: user?.id } });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !user || sending) return;
    const optimistic: Message = {
      id: `temp-${crypto.randomUUID()}`,
      thread_id: threadId,
      sender_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    scrollToBottom();
    setSending(true);
    const { error } = await supabase.from("messages").insert({ thread_id: threadId, sender_id: user.id, content: text });
    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      toast(friendlyError(error, "تعذّر إرسال الرسالة"), "error");
    }
  };

  return (
    <div className="flex h-[calc(100dvh-92px)] flex-col">
      {/* chat header */}
      <div className="glass-strong animate-fade-up flex items-center gap-2.5 rounded-[24px] px-2.5 py-2">
        <Link href="/messages" aria-label="رجوع" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition hover:bg-white/[0.06] active:scale-90">
          <ArrowRight className="h-5 w-5" />
        </Link>
        {other ? (
          <Link href={`/u/${other.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar profile={other} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-5 text-white">{other.display_name}</span>
              <span className="block truncate text-[11px] text-white/45" dir="ltr" style={{ textAlign: "start" }}>
                {peerTyping ? "يكتب الآن…" : `@${other.username}`}
              </span>
            </span>
          </Link>
        ) : (
          <span className="flex-1 text-sm text-white/50">{loading ? "جارٍ فتح المحادثة…" : "محادثة خاصة"}</span>
        )}
        <span className="me-1.5 flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          مباشر
        </span>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="mt-3 flex-1 overflow-y-auto px-1 pb-2" aria-live="polite">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/45">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الرسائل…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Avatar profile={other} size="xl" ring />
            <p className="mt-1 font-bold text-white">{other?.display_name}</p>
            <p className="max-w-[240px] text-xs leading-5 text-white/45">هذه بداية محادثتكما الخاصة على Absorbs. قل مرحبًا 👋</p>
          </div>
        ) : (
          <ul className="space-y-1.5 pt-2">
            {messages.map((msg, i) => {
              const mine = msg.sender_id === user?.id;
              const prev = messages[i - 1];
              const showTime = !prev || new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
              return (
                <li key={msg.id}>
                  {showTime && <p className="py-2 text-center text-[10px] font-medium text-white/30">{messageTimeAr(msg.created_at)}</p>}
                  <div className={cn("flex", mine ? "justify-start flex-row-reverse" : "justify-start")}>
                    <div
                      className={cn(
                        "animate-bubble-in max-w-[78%] px-3.5 py-2.5 text-[14.5px] leading-6 shadow-lg",
                        mine
                          ? "rounded-[22px] rounded-es-md bg-gradient-to-br from-violet-600 via-fuchsia-600 to-fuchsia-500 text-white"
                          : "glass rounded-[22px] rounded-ss-md text-white/92",
                        msg.id.startsWith("temp-") && "opacity-60",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      {mine && (
                        <span className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] text-white/65">
                          {msg.read_at ? (
                            <>
                              <CheckCheck className="h-3 w-3 text-cyan-200" /> تمت القراءة
                            </>
                          ) : msg.id.startsWith("temp-") ? (
                            "جارٍ الإرسال…"
                          ) : (
                            <>
                              <Check className="h-3 w-3" /> تم الإرسال
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {peerTyping && (
              <li className="flex justify-start pt-1">
                <span className="glass flex items-center gap-1 rounded-[22px] rounded-ss-md px-3.5 py-3">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/70" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-white/70" />
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="glass-nav mb-[max(0.4rem,env(safe-area-inset-bottom))] flex items-end gap-2 rounded-[28px] p-2"
      >
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, 1000));
            if (e.target.value) broadcastTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={other ? `راسل ${other.display_name.split(" ")[0]}…` : "اكتب رسالتك…"}
          className="max-h-28 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-white outline-none placeholder:text-white/35"
          aria-label="نص الرسالة"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="إرسال"
          className="btn-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizonal className="h-5 w-5 -scale-x-100" />}
        </button>
      </form>
    </div>
  );
}
