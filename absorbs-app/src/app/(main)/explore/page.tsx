"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Loader2, Search, TrendingUp, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchFeed } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { PostCard } from "@/components/feed/post-card";
import { SetupNotice } from "@/components/feed/setup-notice";
import { UserRow } from "@/components/social/user-actions";
import { EmptyState, PostSkeleton } from "@/components/ui/feedback";
import { isSchemaMissing, normalizeUsername } from "@/lib/utils";
import type { Post, Profile } from "@/lib/types";

export default function ExplorePage() {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [suggested, setSuggested] = useState<Profile[]>([]);
  const [trending, setTrending] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [{ data: people }, feed] = await Promise.all([
          supabase.from("profiles").select("*").neq("id", user.id).order("created_at", { ascending: false }).limit(8),
          fetchFeed(supabase, user.id, 40),
        ]);
        setSuggested((people ?? []) as Profile[]);
        setTrending([...feed].sort((a, b) => b.like_count + b.comment_count * 2 - (a.like_count + a.comment_count * 2)).slice(0, 5));
      } catch (err) {
        if (isSchemaMissing(err as { code?: string; message?: string })) setSchemaMissing(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, user]);

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
        .limit(20);
      setResults(((data ?? []) as Profile[]).filter((p) => p.id !== user?.id));
      setSearching(false);
    }, 350);
  }, [query, supabase, user?.id]);

  const isSearchingMode = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="animate-fade-up px-1 pt-1">
        <h1 className="flex items-center gap-2 text-[22px] font-black text-white">
          <Compass className="h-6 w-6 text-violet-300" /> اكتشف
        </h1>
        <p className="mt-1 text-sm text-white/50">ابحث عن أي شخص باسم المستخدم وابدأ محادثة خاصة فورًا.</p>
      </div>

      {schemaMissing && <SetupNotice />}

      {/* search */}
      <div className="glass animate-fade-up flex items-center gap-2 rounded-full py-1 pe-1.5 ps-4">
        <Search className="h-5 w-5 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو @username…"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-white outline-none placeholder:text-white/35"
          aria-label="بحث عن مستخدمين"
        />
        {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-300" />}
        {query && (
          <button onClick={() => setQuery("")} className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-white/70 transition hover:bg-white/10">
            مسح
          </button>
        )}
      </div>

      {isSearchingMode ? (
        <section className="space-y-2.5">
          <h2 className="flex items-center gap-2 px-1 text-sm font-black text-white">
            <UsersRound className="h-4 w-4 text-cyan-300" /> نتائج البحث {results.length > 0 && `(${results.length})`}
          </h2>
          {!searching && results.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="لا توجد نتائج مطابقة"
              description="تأكد من كتابة اسم المستخدم صحيحًا — يمكنك البحث بالاسم الظاهر أيضًا."
            />
          ) : (
            <div className="stagger space-y-2.5">
              {results.map((person) => (
                <UserRow key={person.id} person={person} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {suggested.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-2 px-1 text-sm font-black text-white">
                <UsersRound className="h-4 w-4 text-cyan-300" /> أشخاص قد تعرفهم
              </h2>
              <div className="stagger space-y-2.5">
                {suggested.map((person) => (
                  <UserRow key={person.id} person={person} subtitle={person.bio ?? `@${person.username}`} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 px-1 pt-2 text-sm font-black text-white">
              <TrendingUp className="h-4 w-4 text-orange-300" /> المنشورات الرائجة
            </h2>
            {loading ? (
              <PostSkeleton />
            ) : trending.length === 0 ? (
              <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="لا منشورات رائجة بعد" description="انشر وتفاعل وستظهر هنا أكثر المنشورات إعجابًا وتعليقًا." />
            ) : (
              trending.map((post) => <PostCard key={post.id} post={post} />)
            )}
          </section>
        </>
      )}
    </div>
  );
}
