"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  الساحة العامة — /play/:slug
 * ══════════════════════════════════════════════════════════════════════════
 *  A shared SMITH game, playable by anyone with the link: no login, no install,
 *  no app shell. The game itself is served by /api/smith/play/:slug under a
 *  strict CSP and framed here, with its leaderboard and a like button beside it.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Anvil, Heart, Maximize2, Play, RefreshCw, Share2, ShieldCheck, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface BoardRow { handle: string; score: number; level: number; at: string }
interface GameInfo {
  slug: string;
  title: string;
  visibility: string;
  plays: number;
  likes: number;
  mine: boolean;
}

export default function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { authFetch, user } = useAuth();

  const [info, setInfo] = useState<GameInfo | null>(null);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [me, setMe] = useState<{ best: number; runs: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "gone" | "private" | "error">("loading");
  const [runKey, setRunKey] = useState(0);
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reported, setReported] = useState<{ score: number; rank?: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/smith/score?slug=${encodeURIComponent(slug)}`);
      if (r.status === 404) { setStatus("gone"); return; }
      if (r.status === 403) { setStatus("private"); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setStatus("error"); return; }
      setInfo(d.game ?? null);
      setBoard(Array.isArray(d.board) ? d.board : []);
      setMe(d.me ?? null);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  /* the game posts its score when a run ends — show it and refresh the board */
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; value?: unknown } | null;
      if (!d || d.source !== "nexus-smith") return;
      if (d.kind === "score") {
        const v = d.value as { score?: number } | null;
        const score = Math.round(Number(v?.score ?? 0));
        if (score > 0) setReported({ score });
      }
      if (d.kind === "start" && user) {
        void authFetch("/api/mastery/award", {
          method: "POST",
          body: JSON.stringify({ action: "smith_play", slug }),
        }).catch(() => undefined);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [authFetch, slug, user]);

  /* after the game reports a score, submit it (needs a signed-in player) */
  useEffect(() => {
    if (!reported || !user) return;
    void (async () => {
      try {
        const r = await authFetch("/api/smith/score", {
          method: "POST",
          body: JSON.stringify({ slug, score: reported.score, level: 1, durationMs: 30_000 }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setReported({ score: reported.score, rank: d.rank });
          void load();
        }
      } catch {
        /* a score that cannot be saved must not break play */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reported?.score, user]);

  const like = useCallback(async () => {
    if (!user || liked) return;
    const r = await authFetch("/api/mastery/award", {
      method: "POST",
      body: JSON.stringify({ action: "smith_like", slug }),
    }).catch(() => null);
    if (r?.ok) {
      setLiked(true);
      setInfo((i) => (i ? { ...i, likes: i.likes + 1 } : i));
    }
  }, [authFetch, liked, slug, user]);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/play/${slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [slug]);

  if (status === "gone" || status === "private" || status === "error") {
    return (
      <main className="v12-page grid min-h-dvh place-items-center px-4 py-10">
        <div className="v12-card w-full max-w-md p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[.05] text-2xl">
            {status === "gone" ? "🕳️" : status === "private" ? "🔒" : "⚠️"}
          </div>
          <h1 className="mt-4 text-lg font-black text-white">
            {status === "gone" ? "اللعبة غير موجودة" : status === "private" ? "هذه اللعبة خاصة" : "تعذّر تحميل الصفحة"}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {status === "gone"
              ? "الرابط قديم أو تم حذف اللعبة من الخزينة."
              : status === "private"
                ? "صاحبها لم ينشرها بعد — اطلب منه تغيير الرؤية إلى «منشورة»."
                : "تحقق من الاتصال ثم أعد المحاولة."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn-gold !rounded-xl !px-4 !py-2 text-xs font-black">الصفحة الرئيسية</Link>
            <Link href="/app/smith" className="btn-primary !rounded-xl !px-4 !py-2 text-xs font-black">اصنع لعبتك ⚡</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="v12-page min-h-dvh px-3 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-200 to-gold-500 text-[#2a1700]">
              <Anvil className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-white sm:text-xl">{info?.title ?? slug}</h1>
              <p className="truncate text-[11px] text-slate-400">
                لعبة من <span className="font-bold text-gold-200">Nexus SMITH</span>
                {info ? ` · ${info.plays} لعبة · ❤ ${info.likes}` : ""}
                {me ? ` · أفضل نتيجة لك ${me.best.toLocaleString("en")}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRunKey((k) => k + 1)}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.05] px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> إعادة
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.05] px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:bg-white/10"
            >
              {copied ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? "نُسخ الرابط" : "مشاركة"}
            </button>
            <button
              type="button"
              disabled={!user || liked || info?.mine}
              onClick={() => void like()}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition disabled:opacity-45 ${
                liked ? "border-rose-400/50 bg-rose-400/15 text-rose-200" : "border-white/15 bg-white/[.05] text-slate-200 hover:bg-white/10"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? "fill-rose-400" : ""}`} />
              {liked ? "أعجبتك" : info?.mine ? "لعبتك" : user ? "إعجاب" : "سجّل الدخول للإعجاب"}
            </button>
            <Link href="/app/smith" className="btn-gold flex items-center gap-1.5 !rounded-xl !px-3 !py-2 text-[11px] font-black">
              <Play className="h-3.5 w-3.5" /> اصنع مثلها
            </Link>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <section className="v12-card relative overflow-hidden p-0">
            <div className="relative aspect-[9/14] max-h-[78vh] w-full bg-[#05070f]">
              {status === "ok" ? (
                <iframe
                  key={`${slug}-${runKey}`}
                  title={info?.title ?? slug}
                  src={`/api/smith/play/${encodeURIComponent(slug)}`}
                  allow="fullscreen; autoplay; gamepad"
                  className="absolute inset-0 h-full w-full border-0"
                />
              ) : (
                <div className="shimmer-line absolute inset-0" />
              )}
            </div>
            {reported && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
                <div className="rounded-2xl border border-gold-400/40 bg-black/80 px-4 py-2 text-center text-xs font-black text-gold-200 backdrop-blur">
                  نتيجتك {reported.score.toLocaleString("en")}
                  {reported.rank ? ` · الترتيب #${reported.rank}` : user ? "" : " · سجّل الدخول لتُحفظ في الصدارة"}
                </div>
              </div>
            )}
          </section>

          <aside className="flex min-w-0 flex-col gap-3">
            <section className="v12-card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                <Trophy className="h-4 w-4 text-gold-300" /> صدارة هذه اللعبة
              </h2>
              {board.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-500">لا نتائج بعد — كن أول من يسجّل.</p>
              ) : (
                <ol className="space-y-1.5">
                  {board.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/40 text-[10px] font-black text-gold-200">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{r.handle}</span>
                      <span className="shrink-0 text-[10px] text-slate-500">م{r.level}</span>
                      <span className="shrink-0 text-[11px] font-black text-gold-200">{r.score.toLocaleString("en")}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="v12-card p-4 text-[11px] leading-relaxed text-slate-400">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-black text-white">
                <Maximize2 className="h-3.5 w-3.5 text-gold-300" /> كيف تلعب
              </h2>
              <ul className="space-y-1">
                <li>· على الحاسوب: الأسهم أو WASD، مسافة للفعل، P للإيقاف، M للصوت.</li>
                <li>· على الهاتف: أزرار اللمس أسفل الشاشة، أو اسحب إصبعك مباشرة في اللعبة.</li>
                <li>· النتيجة تُحفظ تلقائيًا في هذا المتصفح، وتُرفع إلى الصدارة إذا كنت مسجّل الدخول.</li>
              </ul>
              <Link href="/signup" className="btn-primary mt-3 flex w-full items-center justify-center gap-2 !rounded-xl !py-2 text-[11px] font-black">
                أنشئ حسابًا مجانيًا واحفظ نتائجك
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
