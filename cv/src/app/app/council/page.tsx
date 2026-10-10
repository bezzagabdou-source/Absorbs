"use client";

/**
 * Nexus AI v12 — THE COUNCIL.
 * Four models answer live, side by side. Then they are scored, then merged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Code2,
  Crown,
  Gavel,
  Languages,
  Loader2,
  Scale,
  Sparkles,
  Square,
  Trophy,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { COUNCIL_PRESETS, DEFAULT_PRESET, makeEventParser, type CouncilEvent } from "@/lib/council";
import { SPEED_META, type SpeedClass } from "@/lib/models-v12";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Scale> = {
  scale: Scale,
  code: Code2,
  zap: Zap,
  languages: Languages,
};

interface SeatState {
  id: string;
  label: string;
  blurb: string;
  speed: SpeedClass;
  text: string;
  ms?: number;
  score?: number;
  reasons?: string[];
  error?: string;
  done: boolean;
}

export default function CouncilPage() {
  const { user } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [input, setInput] = useState("");
  const [seats, setSeats] = useState<SeatState[]>([]);
  const [verdict, setVerdict] = useState("");
  const [winner, setWinner] = useState("");
  const [phase, setPhase] = useState<"idle" | "drafting" | "scoring" | "merging" | "done">("idle");
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const abort = useRef<AbortController | null>(null);
  const verdictBox = useRef<HTMLDivElement>(null);
  const t0 = useRef(0);

  const busy = phase === "drafting" || phase === "scoring" || phase === "merging";

  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setElapsed(Date.now() - t0.current), 100);
    return () => clearInterval(i);
  }, [busy]);

  useEffect(() => {
    if (phase === "merging" && verdictBox.current) {
      verdictBox.current.scrollTop = verdictBox.current.scrollHeight;
    }
  }, [verdict, phase]);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPhase((p) => (p === "idle" ? p : "done"));
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !user) return;

    setErr("");
    setSeats([]);
    setVerdict("");
    setWinner("");
    setPhase("drafting");
    t0.current = Date.now();
    setElapsed(0);

    const ctl = new AbortController();
    abort.current = ctl;

    const onEvent = (e: CouncilEvent) => {
      switch (e.t) {
        case "open":
          setSeats(
            e.seats.map((s) => ({
              id: s.id,
              label: s.label,
              blurb: s.blurb,
              speed: s.speed as SpeedClass,
              text: "",
              done: false,
            }))
          );
          break;
        case "delta":
          setSeats((prev) => prev.map((s) => (s.id === e.id ? { ...s, text: s.text + e.d } : s)));
          break;
        case "seat-done":
          setSeats((prev) => prev.map((s) => (s.id === e.id ? { ...s, done: true, ms: e.ms } : s)));
          break;
        case "seat-error":
          setSeats((prev) =>
            prev.map((s) => (s.id === e.id ? { ...s, done: true, error: e.message } : s))
          );
          break;
        case "scores":
          setPhase("scoring");
          setWinner(e.winner);
          setSeats((prev) =>
            prev.map((s) => {
              const f = e.scores.find((x) => x.id === s.id);
              return f ? { ...s, score: f.score, reasons: f.reasons } : s;
            })
          );
          break;
        case "verdict-open":
          setPhase("merging");
          break;
        case "verdict":
          setVerdict((v) => v + e.d);
          break;
        case "done":
          setPhase("done");
          break;
        case "error":
          setErr(e.message);
          setPhase("done");
          break;
      }
    };

    const parse = makeEventParser(onEvent);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/council", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, preset }),
        signal: ctl.signal,
      });

      if (!res.ok || !res.body) {
        const code = await res.text().catch(() => "");
        setErr(
          res.status === 429
            ? "وصلتي للحد اليومي. جرّب غدوة ولا رقّي لـ Pro."
            : `تعذّر فتح المجلس (${res.status}) ${code.slice(0, 80)}`
        );
        setPhase("done");
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) parse(value);
      }
      setPhase((p) => (p === "done" ? p : "done"));
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setErr("انقطع الاتصال بالمجلس.");
      }
      setPhase("done");
    } finally {
      abort.current = null;
    }
  }, [input, busy, user, preset]);

  const active = useMemo(() => COUNCIL_PRESETS.find((p) => p.id === preset)!, [preset]);
  const secs = (elapsed / 1000).toFixed(1);

  return (
    <div className="v12-page v12-grain mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-4 pb-8 pt-5 sm:px-6">
      <div className="v12-sky" />

      {/* ---- header ---- */}
      <header className="v12-in">
        <div className="mb-2 flex items-center gap-2">
          <span className="v12-eyebrow">ميزة v12</span>
          {!isPro && (
            <Link href="/app/upgrade" className="v12-chip v12-chip-pro">
              <Crown className="h-3 w-3" /> نماذج أقوى مع Pro
            </Link>
          )}
        </div>
        <h1 className="v12-display text-[clamp(30px,6vw,46px)]">مجلس النماذج</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--v12-dim)]">
          بدل ما تثق فنموذج واحد — أربعة يجاوبو على نفس السؤال فنفس الوقت، تشوفهم مباشرة،
          نقيّمهم، ونخرّجو جواب نهائي واحد أحسن منهم كلهم.
        </p>
      </header>

      {/* ---- presets ---- */}
      <div className="v12-stagger grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {COUNCIL_PRESETS.map((p) => {
          const Icon = ICONS[p.icon] ?? Scale;
          const on = p.id === preset;
          return (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => setPreset(p.id)}
              className={cn(
                "v12-card v12-card-hover flex flex-col gap-1.5 p-3.5 text-start disabled:opacity-50",
                on && "v12-ring"
              )}
              style={on ? { background: "rgba(217,119,87,0.12)" } : undefined}
            >
              <Icon
                className={cn("h-5 w-5", on ? "text-[var(--v12-accent-2)]" : "text-[var(--v12-faint)]")}
              />
              <span className="text-[13.5px] font-semibold text-[var(--v12-text)]">{p.label}</span>
              <span className="text-[11.5px] leading-snug text-[var(--v12-faint)]">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* ---- composer ---- */}
      <div className="v12-card v12-ring p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
          rows={3}
          disabled={busy}
          placeholder="اكتب سؤالك… المجلس كامل غادي يجاوب عليه فنفس الوقت."
          className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[var(--v12-text)] outline-none placeholder:text-[var(--v12-faint)]"
        />
        <div className="mt-1 flex items-center justify-between gap-3 px-1">
          <span className="text-[11.5px] text-[var(--v12-faint)]">
            {active.label} · {isPro ? "نماذج Pro" : "نماذج مجانية"}
            {busy && <> · {secs}s</>}
          </span>
          {busy ? (
            <button type="button" onClick={stop} className="v12-btn v12-btn-quiet !px-5 !py-2.5 !text-sm">
              <Square className="h-3.5 w-3.5" /> وقّف
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!input.trim()}
              className="v12-btn v12-btn-primary !px-5 !py-2.5 !text-sm disabled:opacity-40"
            >
              <Gavel className="h-4 w-4" /> اجمع المجلس
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="v12-card border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* ---- live seats ---- */}
      {seats.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 px-1">
            <Sparkles className="h-4 w-4 text-[var(--v12-accent-2)]" />
            <h2 className="text-sm font-semibold text-[var(--v12-text)]">
              {phase === "drafting" ? "الأعضاء كيكتبو…" : "مسودات الأعضاء"}
            </h2>
            <span className="text-[11.5px] text-[var(--v12-faint)]">
              {seats.filter((s) => s.done).length}/{seats.length}
            </span>
          </div>

          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {seats.map((s) => {
              const meta = SPEED_META[s.speed] ?? SPEED_META.balanced;
              const state = s.error ? "err" : winner && s.id === winner ? "win" : "ok";
              return (
                <article key={s.id} className="v12-seat h-[290px]" data-state={state}>
                  <div className="v12-seat-head">
                    <span className="truncate text-[var(--v12-text)]">{s.label}</span>
                    {state === "win" && <Trophy className="h-3.5 w-3.5 flex-none text-[var(--v12-gold)]" />}
                    <span className="ms-auto flex flex-none items-center gap-2">
                      {!s.done && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--v12-faint)]" />}
                      {s.ms != null && (
                        <span className="text-[10.5px] text-[var(--v12-faint)]">
                          {(s.ms / 1000).toFixed(1)}s
                        </span>
                      )}
                      <span className="v12-bars" data-on={meta.bars} style={{ color: meta.tone }}>
                        <i /><i /><i /><i />
                      </span>
                    </span>
                  </div>

                  <div className={cn("v12-seat-body", !s.done && s.text && "v12-caret")}>
                    {s.error ? (
                      <span className="text-red-300/80">⚠︎ {s.error}</span>
                    ) : s.text ? (
                      s.text
                    ) : (
                      <span className="text-[var(--v12-faint)]">فـ انتظار أول حرف…</span>
                    )}
                  </div>

                  {s.score != null && (
                    <div className="space-y-1.5 border-t border-[var(--v12-line)] px-3 py-2.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[var(--v12-faint)]">التقييم</span>
                        <span className="font-bold tabular-nums text-[var(--v12-text)]">{s.score}%</span>
                      </div>
                      <div className="v12-score">
                        <i style={{ width: `${s.score}%` }} />
                      </div>
                      {s.reasons && s.reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {s.reasons.map((r, i) => (
                            <span key={i} className="v12-chip !px-2 !py-0.5 !text-[10px]">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- verdict ---- */}
      {(verdict || phase === "merging") && (
        <section className="v12-in flex flex-col gap-2.5">
          <div className="flex items-center gap-2 px-1">
            <Gavel className="h-4 w-4 text-[var(--v12-gold)]" />
            <h2 className="text-sm font-semibold text-[var(--v12-text)]">القرار النهائي</h2>
            {phase === "merging" && (
              <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--v12-faint)]">
                <Loader2 className="h-3 w-3 animate-spin" /> كيدمج أحسن ما فالمسودات…
              </span>
            )}
            {phase === "done" && verdict && (
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(verdict)}
                className="ms-auto text-[11.5px] text-[var(--v12-faint)] hover:text-[var(--v12-text)]"
              >
                نسخ
              </button>
            )}
          </div>
          <div
            ref={verdictBox}
            className={cn(
              "v12-card v12-ring max-h-[460px] overflow-y-auto whitespace-pre-wrap break-words p-5 text-[15px] leading-[1.85] text-[var(--v12-text)]",
              phase === "merging" && "v12-caret"
            )}
          >
            {verdict || "…"}
          </div>
        </section>
      )}

      {phase === "done" && verdict && (
        <p className="pb-2 text-center text-[11.5px] text-[var(--v12-faint)]">
          المجلس خلص فـ {secs} ثانية · {seats.filter((s) => !s.error).length} أعضاء شاركو
        </p>
      )}
    </div>
  );
}
