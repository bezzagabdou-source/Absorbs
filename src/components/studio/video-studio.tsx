"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Crown, Download, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { trackEvent } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type Aspect = "16:9" | "9:16" | "1:1";
type Provider = "auto" | "replicate" | "gemini";
type Job = { provider: "replicate" | "gemini"; id: string };
type Clip = { id: number; prompt: string; aspect: Aspect; src: string; blob: boolean };
type Phase = { kind: "idle" } | { kind: "running"; since: number } | { kind: "error"; code: string };

const POLL_MS = 4000;
const GIVE_UP_MS = 6 * 60_000;

const ERRORS: Record<string, string> = {
  PRO_ONLY: "توليد الفيديو متاح لمشتركي Pro.",
  NO_PROVIDER: "لم يُضبط مزوّد الفيديو على الخادم. أضف REPLICATE_API_TOKEN أو فعّل Veo عبر GEMINI_API_KEY.",
  BLOCKED: "رفض النموذج الوصف لأسباب السلامة. غيّر الصياغة وجرّب مجددًا.",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  FAILED: "تعذّر إنشاء الفيديو الآن. أعد المحاولة بعد لحظات.",
  TIMEOUT: "استغرق الإنشاء وقتًا أطول من المعتاد وتوقفنا عن الانتظار. جرّب وصفًا أبسط أو مدة أقصر.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
};

const ASPECTS: { id: Aspect; label: string }[] = [
  { id: "16:9", label: "عرضي 16:9" },
  { id: "9:16", label: "طولي 9:16" },
  { id: "1:1", label: "مربّع 1:1" },
];

export function VideoStudio() {
  const { authFetch } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [seconds, setSeconds] = useState<5 | 10>(5);
  const [provider, setProvider] = useState<Provider>("auto");
  const [available, setAvailable] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [enhancing, setEnhancing] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [tick, setTick] = useState(0);

  const aliveRef = useRef(true);
  const runRef = useRef(0); // bumps on every new run so an old poll loop stops itself
  const blobsRef = useRef<string[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    const blobs = blobsRef.current;
    return () => {
      aliveRef.current = false;
      runRef.current += 1;
      for (const b of blobs) URL.revokeObjectURL(b);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/ai/video?providers=1");
        if (r.ok && !cancelled) setAvailable(((await r.json()) as { providers: string[] }).providers);
      } catch {
        /* offline: the buttons stay usable, the server will answer later */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // elapsed-time counter while rendering
  useEffect(() => {
    if (phase.kind !== "running") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [phase.kind]);

  const enhance = useCallback(async () => {
    if (prompt.trim().length < 3 || enhancing) return;
    setEnhancing(true);
    try {
      const r = await authFetch("/api/ai/optimize", { method: "POST", body: JSON.stringify({ text: prompt, kind: "video" }) });
      if (r.ok) {
        const d = (await r.json()) as { text?: string };
        if (d.text && aliveRef.current) setPrompt(d.text.slice(0, 1200));
      }
    } catch {
      /* keep the original text */
    } finally {
      if (aliveRef.current) setEnhancing(false);
    }
  }, [authFetch, prompt, enhancing]);

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (text.length < 5 || phase.kind === "running") return;
    const run = ++runRef.current;
    const since = Date.now();
    setPhase({ kind: "running", since });
    setTick(0);
    const fail = (code: string) => {
      if (aliveRef.current && runRef.current === run) setPhase({ kind: "error", code });
    };
    try {
      const start = await authFetch("/api/ai/video", {
        method: "POST",
        body: JSON.stringify({ prompt: text, aspect, seconds, provider }),
      });
      if (!start.ok) {
        const d = (await start.json().catch(() => ({}))) as { code?: string };
        return fail(d.code ?? "FAILED");
      }
      const { job } = (await start.json()) as { job: Job };
      trackEvent("video_generate", { provider: job.provider });

      while (aliveRef.current && runRef.current === run) {
        if (Date.now() - since > GIVE_UP_MS) return fail("TIMEOUT");
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (!aliveRef.current || runRef.current !== run) return;
        const res = await authFetch(`/api/ai/video?provider=${job.provider}&id=${encodeURIComponent(job.id)}`);
        if (!res.ok) {
          if (res.status === 429) continue;
          return fail("FAILED");
        }
        const { status } = (await res.json()) as {
          status: { state: "running" } | { state: "done"; url: string; needsAuth: boolean } | { state: "failed"; code: string };
        };
        if (status.state === "running") continue;
        if (status.state === "failed") return fail(status.code);

        let src = status.url;
        let blob = false;
        if (status.needsAuth) {
          const f = await authFetch(status.url);
          if (!f.ok) return fail("FAILED");
          src = URL.createObjectURL(await f.blob());
          blobsRef.current.push(src);
          blob = true;
        }
        if (!aliveRef.current || runRef.current !== run) return;
        setClips((c) => [{ id: ++idRef.current, prompt: text, aspect, src, blob }, ...c].slice(0, 8));
        setPhase({ kind: "idle" });
        return;
      }
    } catch {
      fail("FAILED");
    }
  }, [authFetch, prompt, aspect, seconds, provider, phase.kind]);

  const running = phase.kind === "running";
  const elapsed = running ? tick : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <h1 className="flex items-center gap-2.5 text-3xl font-black text-white sm:text-4xl">
          <Clapperboard className="h-8 w-8 text-gold-400" />
          استوديو الفيديو
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
          اكتب مشهدًا، حسّن الوصف بضغطة، ثم أنشئ مقطعًا حقيقيًا بنموذج فيديو. الإنشاء يستغرق من دقيقة إلى بضع دقائق، ويمكنك البقاء في الصفحة.
        </p>
      </header>

      {!isPro && (
        <Link href="/app/upgrade" className="gold-border mb-5 flex items-center gap-3 rounded-2xl p-4 text-sm font-black text-white">
          <Crown className="h-5 w-5 text-gold-300" />
          توليد الفيديو لمشتركي Pro. فعّل Pro للبدء.
        </Link>
      )}

      <div className="neo-panel grid gap-5 rounded-3xl p-4 sm:p-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <label htmlFor="vprompt" className="text-sm font-black text-slate-200">وصف المشهد</label>
          <textarea
            id="vprompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 1200))}
            rows={7}
            placeholder="مثال: غروب فوق الصحراء الكبرى، قافلة جمال تعبر الكثبان ببطء، كاميرا تتحرك للأمام…"
            className="neo-input min-h-40 w-full resize-y rounded-2xl p-4 text-[16px] leading-relaxed text-white outline-none placeholder:text-slate-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void enhance()}
              disabled={enhancing || prompt.trim().length < 3}
              className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm font-black disabled:opacity-50"
            >
              {enhancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              حسّن الوصف
            </button>
            <span className="text-xs text-slate-500" dir="ltr">{prompt.length}/1200</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-black text-slate-200">الأبعاد</legend>
            <div className="grid grid-cols-3 gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAspect(a.id)}
                  aria-pressed={aspect === a.id}
                  className={cn("neo-chip rounded-xl px-2 py-2.5 text-xs font-black", aspect === a.id && "neo-chip-on")}
                >
                  {a.label}
                </button>
              ))}
            </div>
            {aspect === "1:1" && provider === "gemini" && (
              <p className="mt-2 text-[11px] text-slate-500">Veo لا يدعم المربّع، سيُنتج عرضيًا 16:9.</p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-black text-slate-200">المدة</legend>
            <div className="grid grid-cols-2 gap-2">
              {([5, 10] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeconds(s)}
                  aria-pressed={seconds === s}
                  className={cn("neo-chip rounded-xl px-2 py-2.5 text-xs font-black", seconds === s && "neo-chip-on")}
                >
                  {s} ثوانٍ
                </button>
              ))}
            </div>
            {provider === "gemini" && <p className="mt-2 text-[11px] text-slate-500">Veo يحدد المدة بنفسه (نحو 8 ثوانٍ).</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-black text-slate-200">المحرّك</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["auto", "replicate", "gemini"] as const).map((p) => {
                const off = available !== null && p !== "auto" && !available.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={off}
                    onClick={() => setProvider(p)}
                    aria-pressed={provider === p}
                    className={cn("neo-chip rounded-xl px-2 py-2.5 text-xs font-black disabled:opacity-35", provider === p && "neo-chip-on")}
                  >
                    {p === "auto" ? "تلقائي" : p === "replicate" ? "Replicate" : "Gemini Veo"}
                  </button>
                );
              })}
            </div>
            {available !== null && available.length === 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-orange-300">لا يوجد مزوّد فيديو مضبوط على الخادم بعد.</p>
            )}
          </fieldset>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={!isPro || running || prompt.trim().length < 5}
            className="btn-primary mt-auto inline-flex items-center justify-center gap-2 px-5 py-3 text-sm"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? "جارٍ الإنشاء…" : "أنشئ الفيديو"}
          </button>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {running && (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="neo-panel mt-5 flex items-center gap-4 rounded-2xl p-4"
            role="status"
          >
            <span className="neon-ring grid h-12 w-12 shrink-0 place-items-center rounded-xl">
              <Loader2 className="h-6 w-6 animate-spin text-gold-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white">يُنشأ الآن… {elapsed} ث</p>
              <div className="shimmer-line mt-2 h-1.5 rounded-full" />
              <p className="mt-2 text-xs text-slate-400">لا تُغلق الصفحة حتى يظهر المقطع هنا.</p>
            </div>
          </motion.div>
        )}
        {phase.kind === "error" && (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200"
            role="alert"
          >
            {ERRORS[phase.code] ?? ERRORS.FAILED}
          </motion.p>
        )}
      </AnimatePresence>

      {clips.length > 0 && (
        <section className="mt-8" aria-label="المقاطع">
          <h2 className="mb-3 text-sm font-black text-slate-300">مقاطعك في هذه الجلسة ({clips.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {clips.map((c) => (
              <article key={c.id} className="neo-panel overflow-hidden rounded-2xl">
                <video
                  src={c.src}
                  controls
                  playsInline
                  preload="metadata"
                  className={cn("w-full bg-black object-contain", c.aspect === "9:16" ? "max-h-[70vh]" : "max-h-80")}
                />
                <div className="flex items-center justify-between gap-3 p-3">
                  <p className="min-w-0 flex-1 truncate text-xs text-slate-400" title={c.prompt}>{c.prompt}</p>
                  <a
                    href={c.src}
                    download={`nexus-video-${c.id}.mp4`}
                    target={c.blob ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    className="btn-ghost inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-black"
                  >
                    <Download className="h-3.5 w-3.5" />
                    تنزيل
                  </a>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">المقاطع تُحفظ في الجلسة فقط. نزّل ما يعجبك قبل مغادرة الصفحة.</p>
        </section>
      )}
    </div>
  );
}
