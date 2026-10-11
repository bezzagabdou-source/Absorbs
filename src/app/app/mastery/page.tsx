"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  مسار الإتقان — NEXUS MASTERY
 * ══════════════════════════════════════════════════════════════════════════
 *  One honest dashboard: your level and rank, your daily streak, every badge
 *  with its real progress, what you actually ask the platform for (read from
 *  MIND telemetry), when you are most active, and the hall of honour.
 *
 *  All charts are hand-drawn SVG — no chart library, no client bundle cost.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity, Anvil, Award, Brain, CalendarDays, Crown, Flame, Gamepad2, Loader2,
  MessageSquare, Sparkles, Trophy, Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { INTENT_LABEL_AR } from "@/lib/mind";
import { BADGES, RANKS, type BadgeDef, type Rank } from "@/lib/mastery-rules";

interface Progress { level: number; into: number; need: number; pct: number; nextAt: number }
interface BadgeCell { def: BadgeDef; unlocked: boolean; value: number; pct: number; at?: string }

interface Stats {
  mastery: {
    xp: number;
    level: number;
    progress: Progress;
    rank: Rank;
    gamesBuilt: number;
    gamesPlayed: number;
    runsSubmitted: number;
    mindReads: number;
    bestScore: number;
    streak: number;
    longestStreak: number;
    badgeGrid: BadgeCell[];
  } | null;
  leaderboard: { name: string; xp: number; level: number; me?: boolean; gamesBuilt: number; bestScore: number; streak: number }[];
  insights: {
    intents: { intent: string; n: number }[];
    languages: { lang: string; n: number }[];
    hours: { h: number; n: number }[];
    tools: { tool: string; n: number }[];
    bestRuns: { score: number; level: number; title: string; slug: string; at: string }[];
  };
  counts: { conversations: number; myAnswers: number; toolRuns: number; projects: number; mindReads: number };
  smith: { built: number; published: number; totalPlays: number; totalLikes: number; topByPlays: { title: string; slug: string; plays: number; likes: number }[] };
  offline: string[];
}

const LANG_AR: Record<string, string> = {
  ar: "العربية الفصحى", "ar-dz": "الدارجة الجزائرية", fr: "الفرنسية", en: "الإنجليزية", mixed: "خليط لغات",
};

export default function MasteryPage() {
  const { authFetch } = useAuth();
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    // every setState here happens after an await, so mounting this page never
    // triggers a synchronous re-render inside the effect
    try {
      const r = await authFetch("/api/mastery/stats");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d?.code === "UNAUTHENTICATED" ? "سجّل الدخول أولًا." : `تعذّر التحميل (${d?.code ?? r.status})`);
        return;
      }
      setData(d as Stats);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ في الشبكة");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // same idiom as the other data pages in this app: an inline async block,
    // so nothing is set synchronously while mounting
    void (async () => {
      try {
        const res = await authFetch("/api/mastery/stats");
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          setData(d as Stats);
          setError("");
        } else {
          setError(d?.code === "UNAUTHENTICATED" ? "سجّل الدخول أولًا." : `تعذّر التحميل (${d?.code ?? res.status})`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ في الشبكة");
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch]);

  const m = data?.mastery;
  const unlocked = m?.badgeGrid.filter((b) => b.unlocked).length ?? 0;

  return (
    <div className="v12-page flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="scroll-y flex-1 px-3 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-200 to-gold-500 text-[#2a1700] shadow-[0_10px_30px_-10px_rgba(255,200,87,.9)]">
                <Crown className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black text-white sm:text-2xl">
                  <span className="gold-text">مسار الإتقان</span>
                  <span className="ml-2 align-middle text-[10px] font-bold tracking-widest text-slate-400">MASTERY v17</span>
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  كل ما تصنعه وتلعبه وتسأله يتحوّل إلى خبرة وشارات وسلسلة يومية
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/app/smith" className="btn-gold flex items-center gap-1.5 !rounded-xl !px-3 !py-2 text-xs font-black">
                <Anvil className="h-3.5 w-3.5" /> اصنع لعبة
              </Link>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="grid h-9 w-9 place-items-center rounded-xl border border-brand-400/30 bg-brand-500/10 text-slate-200 transition active:scale-90"
                aria-label="تحديث"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {error && (
            <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">{error}</p>
          )}
          {!m && !error && loading && (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-line h-28 rounded-2xl" />)}
            </div>
          )}
          {!m && !error && !loading && (
            <p className="rounded-2xl border border-white/10 bg-white/[.03] px-4 py-6 text-center text-xs text-slate-400">
              قاعدة البيانات غير متاحة الآن — المسار يعمل فور ربط DATABASE_URL.
            </p>
          )}

          {m && (
            <>
              {/* level card */}
              <section className="v12-card flex flex-wrap items-center gap-5 p-4">
                <LevelRing pct={m.progress.pct} level={m.level} emoji={m.rank.emoji} />
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-lg font-black text-white">المستوى {m.level}</h2>
                    <span className="rounded-lg bg-gold-400/15 px-2 py-0.5 text-[11px] font-black text-gold-200">
                      {m.rank.emoji} {m.rank.ar}
                    </span>
                    <span className="text-[11px] text-slate-400">{m.xp.toLocaleString("en")} XP</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-300 via-gold-400 to-brand-500 transition-[width] duration-700"
                      style={{ width: `${Math.max(2, m.progress.pct)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    باقي <b className="text-gold-200">{Math.max(0, m.progress.need - m.progress.into).toLocaleString("en")}</b> XP للمستوى {m.level + 1}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {RANKS.map((r) => (
                      <span
                        key={r.min}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
                          m.level >= r.min ? "border-gold-400/40 bg-gold-400/10 text-gold-200" : "border-white/10 bg-white/[.02] text-slate-500"
                        }`}
                      >
                        {r.emoji} {r.ar} · {r.min}+
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3">
                  <Stat icon={<Flame className="h-3.5 w-3.5" />} label="السلسلة" value={`${m.streak} يوم`} hint={`أطولها ${m.longestStreak}`} />
                  <Stat icon={<Anvil className="h-3.5 w-3.5" />} label="ألعاب مصنوعة" value={String(m.gamesBuilt)} hint={`${data?.smith.published ?? 0} منشورة`} />
                  <Stat icon={<Gamepad2 className="h-3.5 w-3.5" />} label="مرات اللعب" value={String(m.gamesPlayed)} hint={`${m.runsSubmitted} نتيجة`} />
                  <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="أفضل نتيجة" value={m.bestScore.toLocaleString("en")} hint="عبر كل الألعاب" />
                  <Stat icon={<Brain className="h-3.5 w-3.5" />} label="قراءات الفهم" value={String(m.mindReads)} hint="MIND" />
                  <Stat icon={<Award className="h-3.5 w-3.5" />} label="الشارات" value={`${unlocked}/${BADGES.length}`} hint="مفتوحة" />
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                {/* badges */}
                <section className="v12-card p-4">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                    <Award className="h-4 w-4 text-gold-300" /> الشارات ({unlocked}/{BADGES.length})
                  </h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {m.badgeGrid.map((b) => (
                      <div
                        key={b.def.id}
                        title={b.def.desc.ar}
                        className={`relative overflow-hidden rounded-2xl border p-2.5 transition ${
                          b.unlocked
                            ? "border-gold-400/50 bg-gradient-to-br from-gold-400/15 to-transparent"
                            : "border-white/10 bg-white/[.02] opacity-75"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-lg ${b.unlocked ? "" : "grayscale"}`}>{b.def.emoji}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-black text-white">{b.def.name.ar}</span>
                            <span className="block truncate text-[10px] text-slate-500">{b.unlocked ? "مفتوحة ✓" : `${b.value}/${b.def.goal}`}</span>
                          </span>
                        </div>
                        {!b.unlocked && (
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gold-400/70" style={{ width: `${Math.min(100, b.pct)}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex min-w-0 flex-col gap-4">
                  {/* what you ask for */}
                  <section className="v12-card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                      <Sparkles className="h-4 w-4 text-gold-300" /> ماذا تطلب من Nexus؟
                    </h2>
                    {data && data.insights.intents.length > 0 ? (
                      <BarList
                        rows={data.insights.intents.map((r) => ({
                          label: INTENT_LABEL_AR[r.intent as keyof typeof INTENT_LABEL_AR] ?? r.intent,
                          value: r.n,
                        }))}
                      />
                    ) : (
                      <Empty text="لا توجد قراءات بعد — اضغط 🧠 في المحادثة أو ابعث رسالة." />
                    )}
                  </section>

                  {/* languages */}
                  <section className="v12-card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                      <MessageSquare className="h-4 w-4 text-gold-300" /> لغاتك
                    </h2>
                    {data && data.insights.languages.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Donut
                          slices={data.insights.languages.map((l) => ({
                            label: LANG_AR[l.lang] ?? l.lang,
                            value: l.n,
                          }))}
                        />
                        <ul className="min-w-0 flex-1 space-y-1">
                          {data.insights.languages.map((l) => (
                            <li key={l.lang} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate text-slate-300">{LANG_AR[l.lang] ?? l.lang}</span>
                              <span className="shrink-0 font-black text-gold-200">{l.n}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <Empty text="لا بيانات لغوية بعد." />
                    )}
                  </section>

                  {/* activity hours */}
                  <section className="v12-card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                      <CalendarDays className="h-4 w-4 text-gold-300" /> متى تنشط؟
                    </h2>
                    {data && data.insights.hours.length > 0 ? <HourChart hours={data.insights.hours} /> : <Empty text="لا نشاط مسجّل بعد." />}
                  </section>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* hall of honour */}
                <section className="v12-card p-4">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                    <Trophy className="h-4 w-4 text-gold-300" /> لوحة الشرف
                  </h2>
                  {data && data.leaderboard.length > 0 ? (
                    <ol className="space-y-1.5">
                      {data.leaderboard.map((r, i) => (
                        <li
                          key={i}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                            r.me ? "border-gold-400/50 bg-gold-400/10" : "border-white/10 bg-white/[.03]"
                          }`}
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/40 text-[11px] font-black text-gold-200">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-black text-white">{r.me ? `${r.name} (أنت)` : r.name}</span>
                            <span className="block text-[10px] text-slate-500">
                              المستوى {r.level} · {r.gamesBuilt} لعبة · سلسلة {r.streak}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-black text-gold-200">{r.xp.toLocaleString("en")}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <Empty text="لا أحد في اللوحة بعد — افتح السباق." />
                  )}
                </section>

                <div className="flex min-w-0 flex-col gap-4">
                  {/* best runs */}
                  <section className="v12-card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                      <Gamepad2 className="h-4 w-4 text-gold-300" /> أفضل نتائجك
                    </h2>
                    {data && data.insights.bestRuns.length > 0 ? (
                      <ul className="space-y-1.5">
                        {data.insights.bestRuns.map((r, i) => (
                          <li key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{r.title}</span>
                            <span className="shrink-0 text-[10px] text-slate-500">م{r.level}</span>
                            <span className="shrink-0 text-[11px] font-black text-gold-200">{r.score.toLocaleString("en")}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Empty text="العب لعبة من خزنتك لتظهر نتائجك هنا." />
                    )}
                  </section>

                  {/* tools + totals */}
                  <section className="v12-card p-4">
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                      <Wrench className="h-4 w-4 text-gold-300" /> أدواتك الأكثر استعمالًا
                    </h2>
                    {data && data.insights.tools.length > 0 ? (
                      <BarList rows={data.insights.tools.map((t) => ({ label: t.tool, value: t.n }))} />
                    ) : (
                      <Empty text="لا استعمال أدوات في آخر 30 يومًا." />
                    )}
                    {data && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat icon={<MessageSquare className="h-3 w-3" />} label="محادثات" value={String(data.counts.conversations)} />
                        <Stat icon={<Wrench className="h-3 w-3" />} label="أدوات" value={String(data.counts.toolRuns)} />
                        <Stat icon={<Anvil className="h-3 w-3" />} label="ألعاب" value={String(data.smith.built)} />
                        <Stat icon={<Gamepad2 className="h-3 w-3" />} label="لعبات ألعابك" value={String(data.smith.totalPlays)} />
                      </div>
                    )}
                  </section>
                </div>
              </div>

              {data && data.offline.length > 0 && (
                <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
                  بعض الأقسام غير متاحة الآن (قاعدة البيانات): {data.offline.join(" · ")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */

function LevelRing({ pct, level, emoji }: { pct: number; level: number; emoji: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[116px] w-[116px] shrink-0">
      <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90">
        <circle cx="58" cy="58" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="9" />
        <circle
          cx="58" cy="58" r={r} fill="none" stroke="url(#lvl)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, pct)) / 100}
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
        <defs>
          <linearGradient id="lvl" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="55%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97757" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="text-xl leading-none">{emoji}</div>
          <div className="mt-1 text-lg font-black leading-none text-white">{level}</div>
          <div className="text-[9px] font-bold tracking-wider text-slate-500">LEVEL</div>
        </div>
      </div>
    </div>
  );
}

const DONUT_COLORS = ["#fbbf24", "#d97757", "#38bdf8", "#4ade80", "#a78bfa", "#f472b6"];

interface Arc { label: string; frac: number; offset: number; color: string }

function Donut({ slices }: { slices: { label: string; value: number }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = 34;
  const c = 2 * Math.PI * r;
  /* offsets are accumulated in a reduce so nothing is mutated during render */
  const arcs = slices.reduce<Arc[]>((acc, s, i) => {
    const prev = acc[acc.length - 1];
    acc.push({
      label: s.label,
      frac: s.value / total,
      offset: prev ? prev.offset + prev.frac : 0,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    });
    return acc;
  }, []);
  return (
    <svg viewBox="0 0 90 90" className="h-[90px] w-[90px] shrink-0">
      <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="13" />
      {arcs.map((a) => (
        <circle
          key={a.label}
          cx="45" cy="45" r={r} fill="none"
          stroke={a.color}
          strokeWidth="13"
          strokeDasharray={`${c * a.frac} ${c}`}
          strokeDashoffset={-c * a.offset}
          transform="rotate(-90 45 45)"
        />
      ))}
    </svg>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-slate-300">{r.label}</span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[.06]">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-gold-300 to-brand-500 transition-[width] duration-700"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-[11px] font-black text-gold-200">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function HourChart({ hours }: { hours: { h: number; n: number }[] }) {
  const byHour = new Array(24).fill(0) as number[];
  for (const h of hours) byHour[Math.max(0, Math.min(23, Math.round(h.h)))] = h.n;
  const max = Math.max(1, ...byHour);
  return (
    <div>
      <div className="flex h-16 items-end gap-[2px]">
        {byHour.map((n, i) => (
          <div
            key={i}
            title={`${i}:00 — ${n}`}
            className="flex-1 rounded-t bg-gradient-to-t from-brand-600/70 to-gold-300/90 transition-all"
            style={{ height: `${Math.max(3, (n / max) * 100)}%`, opacity: n ? 1 : 0.18 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-500">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
        <span className="text-gold-300">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-sm font-black text-white">{value}</div>
      {hint && <div className="truncate text-[9px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-[11px] text-slate-500">{text}</p>;
}
