"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  صانع الألعاب الفوري — NEXUS SMITH
 * ══════════════════════════════════════════════════════════════════════════
 *  A different way to make a game. Not "describe it and wait for a model":
 *  pick a real engine blueprint, tune it, and a complete playable file exists
 *  in under a second — deterministic, offline, and never half-finished.
 *
 *  Three tabs: اصنع (factory) · خزنتي (vault) · الصدارة (leaderboards).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  Anvil, Blocks, Bot, Coins, Copy, Download, Dumbbell, Gamepad2, Gauge, Grid3x3,
  Layers, Maximize2, Compass, Mountain, PartyPopper, PersonStanding, Play, RefreshCw,
  Rocket, Share2, ShieldCheck, Sparkles, Trash2, Trophy, Wand2, Waypoints, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { BLUEPRINTS, DIFFICULTY_LABEL, type BlueprintId, type Difficulty } from "@/lib/smith/blueprints";
import { SMITH_THEMES } from "@/lib/smith/skins";

/* ------------------------------------------------------------------ types */

type Visibility = "private" | "unlisted" | "public";

interface VaultGame {
  id: string;
  slug: string;
  title: string;
  blueprint: BlueprintId;
  theme: string;
  visibility: Visibility;
  plays: number;
  likes: number;
  bestScore: number;
  bytes?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface BoardRow { handle: string; score: number; level: number; at: string }

interface XpToast { amount: number; level: number; badges: string[] }

const BLUEPRINT_ICON: Record<string, unknown> = {
  PersonStanding, Blocks, Waypoints, Rocket, Mountain, Compass, Grid3x3, Layers,
};

const KNOB_LABEL_AR: Record<string, string> = {
  difficulty: "الصعوبة",
  speed: "السرعة",
  levels: "عدد المراحل",
  endless: "وضع لانهائي",
  powerups: "القوى الخاصة",
  boss: "زعماء",
  size: "حجم اللوحة",
  target: "الهدف",
  wrap: "لفّ حول الشاشة",
  walls: "جدران قاتلة",
  portals: "بوابات نقل",
  timed: "مؤقّت",
  autofire: "إطلاق تلقائي",
};

const DIFFS: Difficulty[] = ["easy", "normal", "hard", "insane"];

/* ------------------------------------------------------------------ page */

export default function SmithPage() {
  const { authFetch, user } = useAuth();
  const { refresh } = useCredits();

  const [tab, setTab] = useState<"build" | "vault" | "board">("build");
  const [blueprint, setBlueprint] = useState<BlueprintId>("runner");
  const [theme, setTheme] = useState("neon");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [speed, setSpeed] = useState(1);
  const [levels, setLevels] = useState(12);
  const [size, setSize] = useState(4);
  const [target, setTarget] = useState(2048);
  const [heroName, setHeroName] = useState("");
  const [gameLang, setGameLang] = useState<"ar" | "fr" | "en">("ar");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 999_999) + 1);
  const [toggles, setToggles] = useState({
    powerups: true, boss: true, endless: false, wrap: true, walls: true,
    portals: true, timed: true, autofire: true, sound: true, mobile: true,
  });

  const [html, setHtml] = useState("");
  const [built, setBuilt] = useState<{ slug: string; title: string; bytes: number; id: string | null; saved: boolean } | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [runKey, setRunKey] = useState(0);
  const [vault, setVault] = useState<VaultGame[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [boardGame, setBoardGame] = useState<string>("");
  const [globalBoard, setGlobalBoard] = useState<{ name: string; xp: number; level: number; me?: boolean; gamesBuilt: number; bestScore: number; streak: number }[]>([]);
  const [toast, setToast] = useState<XpToast | null>(null);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const def = useMemo(() => BLUEPRINTS.find((b) => b.id === blueprint) ?? BLUEPRINTS[0], [blueprint]);
  const knobs = def.knobs;

  const config = useMemo(
    () => ({
      blueprint, theme, difficulty, speed, levels,
      // `size` means "grid" for merge/memory and "board width" for snake
      size: blueprint === "snake" ? Math.max(12, Math.min(24, size + 12)) : size,
      target,
      heroName: heroName.trim() || user?.displayName || "بطل",
      lang: gameLang,
      seed,
      sound: toggles.sound,
      mobile: toggles.mobile,
      powerups: toggles.powerups,
      boss: toggles.boss,
      endless: toggles.endless,
      wrap: toggles.wrap,
      walls: toggles.walls,
      portals: toggles.portals,
      timed: toggles.timed,
      autofire: toggles.autofire,
    }),
    [blueprint, theme, difficulty, speed, levels, size, target, heroName, user?.displayName, gameLang, seed, toggles]
  );

  /* ── build ──────────────────────────────────────────────────────── */
  const build = useCallback(
    async (visibility: Visibility = "private") => {
      setBuilding(true);
      setError("");
      try {
        const r = await authFetch("/api/smith/build", {
          method: "POST",
          body: JSON.stringify({ config, save: true, visibility }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(
            d?.code === "VAULT_FULL"
              ? `الخزينة ممتلئة (${d.max ?? 120} لعبة) — احذف بعض الألعاب أولًا.`
              : d?.code === "RATE"
                ? "صبرت شوية… صنعت ألعاب كثيرة في دقيقة واحدة."
                : `تعذّر البناء (${d?.code ?? r.status})`
          );
          return;
        }
        setHtml(d.game.html);
        setBuilt({
          slug: d.game.slug,
          title: d.game.title,
          bytes: d.game.bytes,
          id: d.game.id,
          saved: !!d.game.saved,
        });
        setRunKey((k) => k + 1);
        setTab("build");
        if (d.xp) {
          setToast({ amount: d.xp.gained, level: d.xp.level, badges: (d.xp.newBadges ?? []).map((b: { id: string }) => b.id) });
          setTimeout(() => setToast(null), 5200);
        }
        void refresh?.().catch(() => undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ في الشبكة");
      } finally {
        setBuilding(false);
      }
    },
    [authFetch, config, refresh]
  );

  /* ── vault ──────────────────────────────────────────────────────── */
  const loadVault = useCallback(async (markLoading = false) => {
    // the loading flag is only raised by an explicit user action, so mounting
    // the tab never sets state synchronously inside an effect
    if (markLoading) setVaultLoading(true);
    try {
      const r = await authFetch("/api/smith/games");
      const d = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(d.games)) setVault(d.games as VaultGame[]);
    } catch {
      /* offline is fine — the factory still works */
    } finally {
      setVaultLoading(false);
    }
  }, [authFetch]);

  const loadGlobalBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/smith/score?global=1");
      const d = await r.json().catch(() => ({}));
      if (Array.isArray(d.board)) setGlobalBoard(d.board);
    } catch {
      /* the board is a nice-to-have, never a blocker */
    }
  }, []);

  /** tab data is fetched on the click, not in an effect: no cascading renders */
  const openTab = useCallback(
    (id: "build" | "vault" | "board") => {
      setTab(id);
      if (id === "vault") void loadVault(true);
      if (id === "board") void loadGlobalBoard();
    },
    [loadVault, loadGlobalBoard]
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await authFetch(`/api/smith/games?id=${id}`, { method: "DELETE" });
      if (r.ok) {
        setVault((v) => v.filter((g) => g.id !== id));
        if (built?.id === id) { setBuilt(null); setHtml(""); }
      }
    },
    [authFetch, built]
  );

  const setVisibility = useCallback(
    async (id: string, visibility: Visibility) => {
      setPublishing(id);
      try {
        const r = await authFetch("/api/smith/games", {
          method: "PATCH",
          body: JSON.stringify({ id, visibility }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setVault((v) => v.map((g) => (g.id === id ? { ...g, visibility } : g)));
          if (d.xp?.newBadges?.length)
            setToast({ amount: d.xp.gained, level: d.xp.level, badges: d.xp.newBadges.map((b: { id: string }) => b.id) });
        }
      } finally {
        setPublishing(null);
      }
    },
    [authFetch]
  );

  const openVaultGame = useCallback(
    async (g: VaultGame) => {
      setTab("build");
      setError("");
      const r = await authFetch(`/api/smith/games?id=${g.id}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.game?.html) {
        setHtml(d.game.html);
        setBuilt({ slug: g.slug, title: g.title, bytes: g.bytes ?? d.game.html.length, id: g.id, saved: true });
        setRunKey((k) => k + 1);
      } else setError("تعذّر فتح اللعبة من الخزينة.");
    },
    [authFetch]
  );

  const loadBoard = useCallback(async (slug: string) => {
    setBoardGame(slug);
    try {
      const r = await fetch(`/api/smith/score?slug=${encodeURIComponent(slug)}`);
      const d = await r.json().catch(() => ({}));
      setBoard(Array.isArray(d.board) ? d.board : []);
    } catch {
      setBoard([]);
    }
  }, []);

  /* ── talk to the running game (scores, XP for playing) ───────────── */
  const reportedRef = useRef<{ start?: number; score?: number }>({});
  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { source?: string; kind?: string; slug?: string; value?: unknown } | null;
      if (!d || d.source !== "nexus-smith" || !built?.slug) return;
      if (d.kind === "start") {
        const last = reportedRef.current.start ?? 0;
        if (Date.now() - last > 45_000) {
          reportedRef.current.start = Date.now();
          void authFetch("/api/mastery/award", {
            method: "POST",
            body: JSON.stringify({ action: "smith_play", slug: built.slug }),
          }).catch(() => undefined);
        }
      }
      if (d.kind === "score") {
        const v = d.value as { score?: number; level?: number; time?: number } | null;
        const score = Math.round(Number(v?.score ?? 0));
        if (!Number.isFinite(score) || score <= 0) return;
        if ((reportedRef.current.score ?? 0) >= score) return;
        reportedRef.current.score = score;
        void (async () => {
          try {
            const r = await authFetch("/api/smith/score", {
              method: "POST",
              body: JSON.stringify({
                slug: built!.slug,
                score,
                level: Math.max(1, Math.round(Number(v?.level ?? 1))),
                durationMs: Math.max(0, Math.round(Number(v?.time ?? 0)) * 1000),
                handle: user?.displayName || undefined,
              }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j.xp) {
              setToast({
                amount: j.xp.gained,
                level: j.xp.level,
                badges: (j.xp.newBadges ?? []).map((b: { id: string }) => b.id),
              });
              setTimeout(() => setToast(null), 5200);
              setBoard((b) => (b.length ? b : b));
            }
          } catch { /* a failed score post must never disturb play */ }
        })();
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [authFetch, built, user?.displayName]);

  /* ── download / share ───────────────────────────────────────────── */
  const download = useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(built?.title ?? "nexus-game").replace(/[^\w\u0600-\u06FF-]+/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, [html, built]);

  const shareUrl = built ? `${typeof window !== "undefined" ? window.location.origin : ""}/play/${built.slug}` : "";
  const copyShare = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [shareUrl]);

  const game = html ? { html, slug: built?.slug ?? "" } : null;

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div className="v12-page flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="scroll-y flex-1 px-3 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {/* header */}
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-200 to-gold-500 text-[#2a1700] shadow-[0_10px_30px_-10px_rgba(255,200,87,.9)]">
                <Anvil className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-black text-white sm:text-2xl">
                  <span className="gold-text">صانع الألعاب الفوري</span>
                  <span className="ml-2 align-middle text-[10px] font-bold tracking-widest text-slate-400">SMITH v17</span>
                </h1>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  قالب حقيقي + إعداداتك = لعبة كاملة تشتغل في أقل من ثانية — بلا انتظار وبلا أخطاء
                </p>
              </div>
            </div>
            <nav className="flex shrink-0 gap-1 rounded-2xl border border-white/10 bg-white/[.04] p-1">
              {([
                ["build", "اصنع", Wand2],
                ["vault", "خزنتي", Layers],
                ["board", "الصدارة", Trophy],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openTab(id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                    tab === id ? "bg-gold-400/90 text-[#2a1700]" : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </nav>
          </header>

          {/* XP toast */}
          {toast && (
            <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-3">
              <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-gold-400/40 bg-[#1a1408]/95 px-4 py-3 shadow-[0_20px_60px_-20px_rgba(255,200,87,.7)] backdrop-blur">
                <PartyPopper className="h-5 w-5 shrink-0 text-gold-300" />
                <div className="text-xs">
                  <div className="font-black text-gold-200">+{toast.amount} XP · المستوى {toast.level}</div>
                  {toast.badges.length > 0 && (
                    <div className="text-slate-300">شارة جديدة: {toast.badges.join(" · ")}</div>
                  )}
                </div>
                <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {tab === "build" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
              {/* ── left: factory ── */}
              <section className="flex min-w-0 flex-col gap-4">
                {/* blueprints */}
                <div className="v12-card p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-sm font-black text-white">
                      <Sparkles className="h-4 w-4 text-gold-300" /> 1 · اختر القالب
                    </h2>
                    <span className="text-[11px] text-slate-400">8 محركات حقيقية على نواة واحدة</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BLUEPRINTS.map((b) => {
                      const Icon = (BLUEPRINT_ICON[b.icon] ?? Gamepad2) as ComponentType<{ className?: string }>;
                      const on = b.id === blueprint;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBlueprint(b.id)}
                          className={`group relative overflow-hidden rounded-2xl border p-3 text-right transition ${
                            on
                              ? "border-gold-400/60 bg-gold-400/10 shadow-[0_0_0_1px_rgba(255,200,87,.25)]"
                              : "border-white/10 bg-white/[.03] hover:border-white/25 hover:bg-white/[.06]"
                          }`}
                          style={on ? { boxShadow: `0 12px 40px -18px ${b.accent}` } : undefined}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base"
                              style={{ background: `${b.accent}22`, color: b.accent }}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-black text-white">{b.emoji} {b.name.ar}</span>
                            </span>
                          </span>
                          <span className="mt-2 block text-[11px] leading-relaxed text-slate-400 line-clamp-2">{b.desc.ar}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-slate-400">
                    <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    <span>التحكم: <b className="text-slate-200">{def.controls.ar}</b></span>
                  </p>
                </div>

                {/* knobs */}
                <div className="v12-card p-3 sm:p-4">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                    <Gauge className="h-4 w-4 text-gold-300" /> 2 · اضبط اللعبة
                  </h2>

                  {/* theme */}
                  <div className="mb-3">
                    <div className="mb-1.5 text-[11px] font-bold text-slate-400">الهوية البصرية</div>
                    <div className="flex flex-wrap gap-2">
                      {SMITH_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id)}
                          title={t.name.ar}
                          className={`h-9 w-9 rounded-xl border-2 transition ${
                            theme === t.id ? "scale-110 border-white" : "border-white/15 hover:border-white/40"
                          }`}
                          style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.hero1} 45%, ${t.gold})` }}
                        >
                          <span className="sr-only">{t.name.ar}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* difficulty */}
                  <div className="mb-3">
                    <div className="mb-1.5 text-[11px] font-bold text-slate-400">{KNOB_LABEL_AR.difficulty}</div>
                    <div className="flex flex-wrap gap-2">
                      {DIFFS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDifficulty(d)}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                            difficulty === d
                              ? "border-gold-400/70 bg-gold-400/15 text-gold-200"
                              : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/[.07]"
                          }`}
                        >
                          {DIFFICULTY_LABEL[d].ar}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* sliders */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {knobs.includes("speed") && (
                      <Slider label={`${KNOB_LABEL_AR.speed} · ×${speed.toFixed(2)}`} min={0.7} max={1.6} step={0.05}
                        value={speed} onChange={setSpeed} />
                    )}
                    {knobs.includes("levels") && (
                      <Slider label={`${KNOB_LABEL_AR.levels} · ${levels}`} min={3} max={30} step={1}
                        value={levels} onChange={(v) => setLevels(Math.round(v))} />
                    )}
                    {knobs.includes("size") && blueprint !== "snake" && (
                      <Slider label={`${KNOB_LABEL_AR.size} · ${size}×${size}`} min={3} max={6} step={1}
                        value={size} onChange={(v) => setSize(Math.round(v))} />
                    )}
                    {knobs.includes("size") && blueprint === "snake" && (
                      <Slider label={`عرض لوحة الثعبان · ${size + 12}`} min={0} max={12} step={1}
                        value={size} onChange={(v) => setSize(Math.round(v))} />
                    )}
                    {knobs.includes("target") && (
                      <Slider label={`${KNOB_LABEL_AR.target} · ${target}`} min={128} max={4096} step={128}
                        value={target} onChange={(v) => setTarget(Math.round(v))} />
                    )}
                  </div>

                  {/* toggles */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {knobs.map((k) => {
                      if (k === "difficulty" || k === "speed" || k === "levels" || k === "size" || k === "target") return null;
                      const on = toggles[k as keyof typeof toggles];
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setToggles((t) => ({ ...t, [k]: !t[k as keyof typeof toggles] }))}
                          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                            on ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[.03] text-slate-400"
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-slate-600"}`} />
                          {KNOB_LABEL_AR[k] ?? k}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setToggles((t) => ({ ...t, sound: !t.sound }))}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                        toggles.sound ? "border-sky-400/50 bg-sky-400/10 text-sky-200" : "border-white/10 bg-white/[.03] text-slate-400"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${toggles.sound ? "bg-sky-400" : "bg-slate-600"}`} />
                      صوت وموسيقى
                    </button>
                  </div>

                  {/* name / lang / seed */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold text-slate-400">اسم البطل في اللعبة</span>
                      <input
                        value={heroName}
                        onChange={(e) => setHeroName(e.target.value.slice(0, 18))}
                        placeholder={user?.displayName || "بطل"}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-gold-400/50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold text-slate-400">لغة واجهة اللعبة</span>
                      <select
                        value={gameLang}
                        onChange={(e) => setGameLang(e.target.value as "ar" | "fr" | "en")}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-gold-400/50"
                      >
                        <option value="ar">العربية</option>
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold text-slate-400">البذرة (نفس البذرة = نفس اللعبة)</span>
                      <div className="flex gap-1.5">
                        <input
                          value={seed}
                          onChange={(e) => setSeed(Math.max(1, Math.min(2_000_000_000, Number(e.target.value.replace(/\D/g, "")) || 1)))}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-gold-400/50"
                        />
                        <button
                          type="button"
                          onClick={() => setSeed(Math.floor(Math.random() * 999_999) + 1)}
                          title="بذرة عشوائية"
                          className="grid w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-slate-300 transition hover:bg-white/10"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </label>
                  </div>

                  {/* build actions */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={building}
                      onClick={() => void build("private")}
                      className="btn-gold flex items-center gap-2 !rounded-xl !px-5 !py-2.5 text-sm font-black"
                    >
                      {building ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {building ? "جارٍ الصناعة…" : "اصنع اللعبة الآن ⚡"}
                    </button>
                    <button
                      type="button"
                      disabled={building}
                      onClick={() => void build("public")}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.05] px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      <Share2 className="h-3.5 w-3.5" /> اصنع وانشر في الساحة
                    </button>
                    <span className="text-[11px] text-slate-500">
                      {def.emoji} {def.name.ar} · {SMITH_THEMES.find((t) => t.id === theme)?.name.ar} · {DIFFICULTY_LABEL[difficulty].ar}
                    </span>
                  </div>
                  {error && (
                    <p className="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-200">
                      {error}
                    </p>
                  )}
                  <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                    الملف الناتج مستقل تمامًا: HTML واحد فيه المحرك والرسم والصوت، يشتغل بلا إنترنت وبلا أي مكتبة خارجية.
                  </p>
                </div>
              </section>

              {/* ── right: the game ── */}
              <section className="flex min-w-0 flex-col gap-3">
                <div
                  ref={stageRef}
                  className={`v12-card relative overflow-hidden p-0 ${full ? "fixed inset-0 z-50 rounded-none" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-black text-white">{built?.title ?? "اللعبة ستظهر هنا"}</div>
                      {built && (
                        <div className="truncate text-[10px] text-slate-400">
                          /play/{built.slug} · {(built.bytes / 1024).toFixed(0)} KB
                          {built.saved ? "" : " · غير محفوظة"}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {built && (
                        <>
                          <IconBtn label="إعادة التشغيل" onClick={() => setRunKey((k) => k + 1)}><Play className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label="تحميل HTML" onClick={download}><Download className="h-3.5 w-3.5" /></IconBtn>
                          <IconBtn label="نسخ رابط المشاركة" onClick={() => void copyShare()}>
                            {copied ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                          </IconBtn>
                        </>
                      )}
                      <IconBtn
                        label={full ? "تصغير" : "ملء الشاشة"}
                        onClick={() => {
                          if (!full) void stageRef.current?.requestFullscreen?.().catch(() => undefined);
                          else void document.exitFullscreen?.().catch(() => undefined);
                          setFull((f) => !f);
                        }}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </IconBtn>
                      {full && <IconBtn label="إغلاق" onClick={() => { setFull(false); void document.exitFullscreen?.().catch(() => undefined); }}><X className="h-3.5 w-3.5" /></IconBtn>}
                    </div>
                  </div>
                  <div className="relative aspect-[9/14] max-h-[70vh] w-full bg-[#05070f]">
                    {game ? (
                      <iframe
                        key={`${runKey}-${game.slug}`}
                        title={built?.title ?? "لعبة"}
                        srcDoc={game.html}
                        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                        allow="fullscreen; autoplay; gamepad"
                        className="absolute inset-0 h-full w-full border-0"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-gold-200/20 to-gold-500/10 text-3xl">
                          {def.emoji}
                        </span>
                        <div className="text-sm font-black text-white">{def.name.ar}</div>
                        <p className="max-w-[36ch] text-[11px] leading-relaxed text-slate-400">{def.desc.ar}</p>
                        <button
                          type="button"
                          onClick={() => void build("private")}
                          className="btn-primary !rounded-xl !px-4 !py-2 text-xs font-black"
                        >
                          اصنع أول لعبة ⚡
                        </button>
                      </div>
                    )}
                  </div>
                  {built && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-black/25 px-3 py-2">
                      <Link
                        href={`/play/${built.slug}`}
                        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.05] px-3 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-white/10"
                      >
                        <Share2 className="h-3 w-3" /> صفحة اللعب العامة
                      </Link>
                      <button
                        type="button"
                        onClick={() => void loadBoard(built.slug)}
                        className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[.05] px-3 py-1.5 text-[11px] font-bold text-slate-200 transition hover:bg-white/10"
                      >
                        <Trophy className="h-3 w-3" /> صدارة هذه اللعبة
                      </button>
                      {built.id && (
                        <button
                          type="button"
                          disabled={publishing === built.id}
                          onClick={() => void setVisibility(built.id!, "public")}
                          className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          <Bot className="h-3 w-3" /> انشرها في الساحة
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {boardGame && (
                  <div className="v12-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-xs font-black text-white">
                        <Trophy className="h-3.5 w-3.5 text-gold-300" /> صدارة {boardGame}
                      </h3>
                      <button type="button" onClick={() => { setBoardGame(""); setBoard([]); }} className="text-slate-400 hover:text-white">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <BoardList rows={board} />
                  </div>
                )}

                {/* how it differs from the AI builder */}
                <div className="v12-card p-3 text-[11px] leading-relaxed text-slate-400">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-black text-white">
                    <Dumbbell className="h-3.5 w-3.5 text-gold-300" /> الفرق بين SMITH وطلب لعبة من الذكاء الاصطناعي
                  </div>
                  <ul className="space-y-1">
                    <li>· <b className="text-slate-200">SMITH</b>: قالب مُبرمَج مسبقًا + إعداداتك ⇒ ملف جاهز في أقل من ثانية، يشتغل دائمًا، ونفس البذرة تعيد نفس اللعبة.</li>
                    <li>· <b className="text-slate-200">AI builder</b> في المحادثة: نموذج يكتب اللعبة من الصفر ⇒ أفكار جديدة كليًا، لكنها تحتاج وقتًا ونقاطًا.</li>
                    <li>· تستعمل الاثنين معًا: اصنع الأساس هنا، ثم اطلب من المحادثة تعديل فكرة أو إضافة طور جديد.</li>
                  </ul>
                </div>
              </section>
            </div>
          )}

          {tab === "vault" && (
            <section className="v12-card p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-black text-white">
                  <Layers className="h-4 w-4 text-gold-300" /> خزينة ألعابي ({vault.length})
                </h2>
                <button type="button" onClick={() => void loadVault(true)} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/10">
                  <RefreshCw className={`h-3 w-3 ${vaultLoading ? "animate-spin" : ""}`} /> تحديث
                </button>
              </div>
              {vault.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  {vaultLoading ? "جارٍ التحميل…" : "لا توجد ألعاب محفوظة بعد — اصنع واحدة من تبويب «اصنع»."}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {vault.map((g) => {
                    const b = BLUEPRINTS.find((x) => x.id === g.blueprint);
                    return (
                      <div key={g.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[.03] p-3">
                        <div className="flex items-start gap-2">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base" style={{ background: `${b?.accent ?? "#888"}22` }}>
                            {b?.emoji ?? "🎮"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-black text-white">{g.title}</div>
                            <div className="truncate text-[10px] text-slate-500">
                              {b?.name.ar} · {(g.plays ?? 0)} لعبة · ❤ {(g.likes ?? 0)} · أعلى نتيجة {g.bestScore ?? 0}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                            g.visibility === "public" ? "bg-emerald-400/15 text-emerald-200"
                              : g.visibility === "unlisted" ? "bg-sky-400/15 text-sky-200" : "bg-white/10 text-slate-400"
                          }`}>
                            {g.visibility === "public" ? "منشورة" : g.visibility === "unlisted" ? "برابط" : "خاصة"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <MiniBtn onClick={() => void openVaultGame(g)}><Play className="h-3 w-3" /> العب</MiniBtn>
                          <MiniBtn onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/play/${g.slug}`).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                            <Copy className="h-3 w-3" /> رابط
                          </MiniBtn>
                          {g.visibility !== "public" ? (
                            <MiniBtn onClick={() => void setVisibility(g.id, "public")}><Share2 className="h-3 w-3" /> انشر</MiniBtn>
                          ) : (
                            <MiniBtn onClick={() => void setVisibility(g.id, "private")}><ShieldCheck className="h-3 w-3" /> إخفاء</MiniBtn>
                          )}
                          <MiniBtn onClick={() => void loadBoard(g.slug)}><Trophy className="h-3 w-3" /> صدارة</MiniBtn>
                          <MiniBtn danger onClick={() => void remove(g.id)}><Trash2 className="h-3 w-3" /> حذف</MiniBtn>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {boardGame && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black text-white">صدارة {boardGame}</h3>
                    <button type="button" onClick={() => setBoardGame("")} className="text-slate-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <BoardList rows={board} />
                </div>
              )}
            </section>
          )}

          {tab === "board" && (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="v12-card p-3 sm:p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                  <Trophy className="h-4 w-4 text-gold-300" /> لوحة الشرف — أعلى XP
                </h2>
                {globalBoard.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">لا توجد بيانات بعد — كن أول من يصنع لعبة.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {globalBoard.map((r, i) => (
                      <li key={i} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${r.me ? "border-gold-400/50 bg-gold-400/10" : "border-white/10 bg-white/[.03]"}`}>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/40 text-[11px] font-black text-gold-200">#{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black text-white">{r.me ? `${r.name} (أنت)` : r.name}</span>
                          <span className="block text-[10px] text-slate-500">
                            المستوى {r.level} · {r.gamesBuilt} لعبة · أفضل نتيجة {r.bestScore} · سلسلة {r.streak} يوم
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-black text-gold-200">{r.xp.toLocaleString("en")} XP</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="v12-card p-3 sm:p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-white">
                  <Coins className="h-4 w-4 text-gold-300" /> كيف تكسب XP
                </h2>
                <ul className="space-y-2 text-[11px] text-slate-400">
                  {[
                    ["تصنع لعبة في SMITH", 60, Wand2],
                    ["تنشر لعبة في الساحة", 45, Share2],
                    ["تولّد لعبة بالذكاء الاصطناعي", 120, Bot],
                    ["تسجّل نتيجة في الصدارة", 25, Trophy],
                    ["تلعب لعبة من الخزينة", 6, Play],
                    ["تستعمل قوة الفهم 🧠", 4, Sparkles],
                    ["أول نشاط في اليوم (سلسلة)", 30, ShieldCheck],
                  ].map(([label, xp, Icon]) => {
                    const I = Icon as ComponentType<{ className?: string }>;
                    return (
                      <li key={String(label)} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                        <I className="h-3.5 w-3.5 shrink-0 text-gold-300" />
                        <span className="min-w-0 flex-1 truncate text-slate-200">{String(label)}</span>
                        <span className="shrink-0 font-black text-gold-200">+{String(xp)}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link href="/app/mastery" className="btn-gold mt-3 flex w-full items-center justify-center gap-2 !rounded-xl !py-2.5 text-xs font-black">
                  <Trophy className="h-3.5 w-3.5" /> افتح مسار الإتقان والشارات
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
      <span className="mb-1 block text-[11px] font-bold text-slate-300">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold-400"
      />
    </label>
  );
}

function IconBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/[.04] text-slate-300 transition hover:bg-white/10 active:scale-90"
    >
      {children}
    </button>
  );
}

function MiniBtn({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
        danger
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
          : "border-white/10 bg-white/[.04] text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function BoardList({ rows }: { rows: BoardRow[] }) {
  if (!rows.length) return <p className="py-4 text-center text-[11px] text-slate-500">لا نتائج مسجّلة بعد — كن الأول.</p>;
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-black/40 text-[10px] font-black text-gold-200">#{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{r.handle}</span>
          <span className="shrink-0 text-[10px] text-slate-500">م{r.level}</span>
          <span className="shrink-0 text-[11px] font-black text-gold-200">{r.score.toLocaleString("en")}</span>
        </li>
      ))}
    </ol>
  );
}
