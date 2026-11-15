"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleHeart, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchThreads } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { SetupNotice } from "@/components/feed/setup-notice";
import { UserRow } from "@/components/social/user-actions";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/feedback";
import { useOnlineUsers } from "@/components/social/use-presence";
import { cn, isSchemaMissing, messageTimeAr, normalizeUsername } from "@/lib/utils";
import { messagePreview } from "@/lib/message-format";
import type { DmThread, Profile } from "@/lib/types";

export default function MessagesPage() {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [query, setQuery] = useState("");
  const onlineUsers = useOnlineUsers();
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setThreads(await fetchThreads(supabase, user.id));
      setSchemaMissing(false);
    } catch (err) {
      if (isSchemaMissing(err as { code?: string; message?: string })) setSchemaMissing(true);
    } finally {
      setLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("threads-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_threads" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user, load]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const usernameLike = `%${normalizeUsername(q)}%`;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.${usernameLike},display_name.ilike.${like}`)
        .limit(15);
      setResults(((data ?? []) as Profile[]).filter((p) => p.id !== user?.id));
      setSearching(false);
    }, 300);
  }, [query, supabase, user?.id]);

  return (
    <div className="space-y-4">
      <div className="animate-fade-up px-1 pt-1">
        <h1 className="flex items-center gap-2 text-[22px] font-black text-slate-900">
          <MessageCircleHeart className="h-6 w-6 text-violet-600" /> الرسائل الخاصة
        </h1>
        <p className="mt-1 text-sm text-slate-900/50">محادثات فورية تصل في نفس اللحظة — ابحث باسم المستخدم وابدأ.</p>
      </div>

      {schemaMissing && <SetupNotice />}

      {/* start a new chat */}
      <div className="glass animate-fade-up flex items-center gap-2 rounded-full py-1 pe-1.5 ps-4">
        <Search className="h-5 w-5 shrink-0 text-slate-900/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="مراسلة جديدة: ابحث بـ @username…"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-slate-900 outline-none placeholder:text-slate-900/35"
          aria-label="بحث لبدء محادثة"
        />
        {searching ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-600" />
        ) : query ? (
          <button onClick={() => setQuery("")} aria-label="مسح البحث" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.07] text-slate-900/70">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {query.trim() ? (
        <div className="stagger space-y-2.5">
          {results.length === 0 && !searching ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="لم نجد هذا المستخدم" description="تأكد من اسم المستخدم — الحروف الإنجليزية الصغيرة والأرقام فقط." />
          ) : (
            results.map((person) => <UserRow key={person.id} person={person} />)
          )}
        </div>
      ) : loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass flex animate-pulse items-center gap-3 rounded-[24px] p-3">
              <div className="h-11 w-11 rounded-full bg-slate-900/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded-full bg-slate-900/10" />
                <div className="h-2.5 w-2/3 rounded-full bg-slate-900/[0.06]" />
              </div>
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessageCircleHeart className="h-6 w-6" />}
          title="لا محادثات بعد"
          description="ابحث في الأعلى عن اسم مستخدم أي صديق واضغط «مراسلة» لبدء أول محادثة خاصة فورية."
        />
      ) : (
        <ul className="stagger space-y-2.5">
          {threads.map((thread) => {
            const other = thread.other_user;
            const last = thread.last_message;
            const mine = last?.sender_id === user?.id;
            return (
              <li key={thread.id}>
                <Link
                  href={`/messages/${thread.id}?u=${encodeURIComponent(other?.username ?? "")}`}
                  className="glass flex items-center gap-3 rounded-[24px] p-3 transition hover:bg-slate-900/[0.05] active:scale-[0.99]"
                >
                  <span className="relative shrink-0">
                    <Avatar profile={other} size="lg" />
                        {other && onlineUsers.has(other.id) && (
                          <span className="absolute bottom-0.5 end-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-[#0C1322]" aria-label="متصل الآن" />
                        )}
                    {thread.unread_count > 0 && (
                      <span className="absolute -top-0.5 -end-0.5 h-3.5 w-3.5 rounded-full bg-indigo-400 ring-2 ring-[#0B1020]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-bold text-slate-900">{other?.display_name ?? "مستخدم"}</span>
                      {last && <span className="shrink-0 text-[10.5px] text-slate-900/40">{messageTimeAr(last.created_at)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={cn("truncate text-[13px]", thread.unread_count > 0 ? "font-bold text-slate-900" : "text-slate-900/50")}>
                        {last ? `${mine ? "أنت: " : ""}${messagePreview(last.content)}` : "ابدأ المحادثة 👋"}
                      </span>
                      {thread.unread_count > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-indigo-600 px-1.5 text-[10px] font-black text-slate-900">
                          {thread.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
