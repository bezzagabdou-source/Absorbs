"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AudioLines,
  Check,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Image as ImageIcon,
  Info,
  Loader2,
  MessageSquarePlus,
  Play,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StatPill } from "@/components/ui/controls";
import type { MediaAsset } from "@/lib/net/media";
import { sizeLabel } from "@/lib/atlas-files";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — باحث الوسائط
 * The internet engine, exposed as a screen: find free-licence images, sounds,
 * datasets and documents, preview them, download them, or push them into the
 * user's data vault so Nexus can quote them.
 */

const KINDS = [
  { id: "image", label: "صور", icon: ImageIcon },
  { id: "audio", label: "أصوات", icon: AudioLines },
  { id: "data", label: "بيانات", icon: Database },
  { id: "document", label: "وثائق", icon: FileText },
] as const;

type KindId = (typeof KINDS)[number]["id"];

const IDEAS = [
  "الجزائر",
  "قصر الثقافة مفدي زكريا",
  "الصحراء الكبرى",
  "مخطوط عربي",
  "أذان",
  "موسيقى أمازيغية",
  "إحصائيات السكان",
  "خريطة إفريقيا",
];

export default function MediaFinderPage() {
  const { authFetch, user } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState<KindId>("image");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MediaAsset[]>([]);
  const [providers, setProviders] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [limit, setLimit] = useState(12);
  const [playing, setPlaying] = useState<string | null>(null);

  const run = useCallback(
    async (query: string, k: KindId) => {
      const term = query.trim();
      if (!term) return;
      setBusy(true);
      setErr(null);
      setNote(null);
      try {
        const p = new URLSearchParams({ q: term, kind: k, limit: String(limit) });
        const r = await authFetch(`/api/internet/media?${p}`);
        const j = (await r.json()) as { results?: MediaAsset[]; providers?: Record<string, boolean>; code?: string };
        if (!r.ok) {
          setErr(j.code === "UNAUTHENTICATED" ? "سجّل الدخول أولًا" : j.code === "RATE" ? "تمهل قليلًا — تجاوزت حد الطلبات" : "تعذّر البحث");
          setResults([]);
          return;
        }
        setResults(j.results ?? []);
        setProviders(j.providers ?? {});
        if (!(j.results ?? []).length) setErr("ما لقينا شيء — جرّب كلمة بالإنجليزية أو الفرنسية (المصادر دولية)");
      } catch {
        setErr("تعذّر الاتصال بالخادم");
      } finally {
        setBusy(false);
      }
    },
    [authFetch, limit]
  );

  useEffect(() => {
    if (!user?.uid) return;
    const t = window.setTimeout(() => void run(q, kind), 380);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, limit, user?.uid]);

  const download = async (a: MediaAsset, save: boolean) => {
    setBusyId(a.id);
    setErr(null);
    try {
      const r = await authFetch("/api/internet/media", {
        method: "POST",
        body: JSON.stringify({ url: a.url, name: a.title.slice(0, 120), kind, save }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        dataUrl?: string;
        text?: string;
        bytes?: number;
        mime?: string;
        saveNote?: string;
        saved?: { id: string; name: string } | null;
        code?: string;
      };
      if (!r.ok || !j.ok) {
        setErr(j.code === "FETCH_FAILED" ? "المصدر رفض التنزيل أو الرابط ميت" : "تعذّر التنزيل");
        return;
      }
      if (save && j.saved) {
        setSavedIds((cur) => [...cur, a.id]);
        setNote(`«${j.saved.name}» دخلت خزنة بياناتك — Nexus يقدر يقتبس منها.`);
      } else if (j.dataUrl) {
        const link = document.createElement("a");
        link.href = j.dataUrl;
        link.download = (a.title || "asset").slice(0, 80) + (j.mime?.includes("png") ? ".png" : j.mime?.includes("wav") ? ".wav" : j.mime?.includes("mpeg") ? ".mp3" : "");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setNote(`نزّلنا ${sizeLabel(j.bytes ?? 0)} · ${j.mime ?? ""}`);
      } else {
        setNote(j.saveNote ?? "تم التنزيل");
      }
    } catch {
      setErr("تعذّر الاتصال بالخادم");
    } finally {
      setBusyId(null);
    }
  };

  const ask = (text: string) => {
    router.push(`/app?q=${encodeURIComponent(text)}`);
  };

  const active = Object.entries(providers).filter(([, on]) => on).map(([k]) => k);

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="atlas-hero mb-6 p-5 sm:p-7">
        <p className="relative text-[11px] font-black tracking-widest text-white/80">NEXUS ATLAS · INTERNET ENGINE</p>
        <h1 className="relative mt-1 flex items-center gap-2 text-2xl font-black text-white sm:text-3xl">
          <Globe2 className="size-6" /> باحث الوسائط
        </h1>
        <p className="relative mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/80">
          Nexus يفهم «زيدلي صور» و«جيبلي صوت» ويروح يبحث وحده. هنا تقدر تعملها بيدك: صور وأصوات وبيانات ووثائق حرة
          الحقوق من Openverse وWikimedia Commons وInternet Archive، مع ذكر المصدر دائمًا.
        </p>
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="نتائج" value={results.length} icon={<Search className="size-4" />} />
          <StatPill label="مصادر فعّالة" value={active.length || "—"} icon={<Globe2 className="size-4" />} />
          <StatPill label="محفوظة في الخزنة" value={savedIds.length} icon={<Database className="size-4" />} />
          <StatPill label="النوع" value={KINDS.find((k) => k.id === kind)?.label ?? ""} icon={<ImageIcon className="size-4" />} />
        </div>
      </motion.header>

      <div className="glass mb-4 rounded-3xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
            <input
              className="input-base !ps-9"
              placeholder={kind === "image" ? "صور: الجزائر، صحراء، مخطوط…" : kind === "audio" ? "أصوات: أذان، موسيقى، مؤثرات…" : "ابحث…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run(q, kind)}
              aria-label="بحث في الوسائط"
            />
          </div>
          <button type="button" onClick={() => void run(q, kind)} className="btn-primary inline-flex items-center gap-2 !rounded-2xl">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} بحث
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setKind(k.id);
                  if (q.trim()) void run(q, k.id);
                }}
                aria-pressed={kind === k.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-[11.5px] font-bold transition active:scale-95",
                  kind === k.id
                    ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white shadow-md shadow-black/25"
                    : "border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/28 hover:text-white"
                )}
              >
                <Icon className="size-3.5" /> {k.label}
              </button>
            );
          })}
          <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
          {[8, 12, 24].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              aria-pressed={limit === n}
              className={cn(
                "rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition",
                limit === n ? "border-white/40 bg-white/12 text-white" : "border-white/10 text-slate-400 hover:text-white"
              )}
            >
              {n} نتيجة
            </button>
          ))}
        </div>

        {!q && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-slate-400">أفكار:</span>
            {IDEAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQ(s);
                  void run(s, kind);
                }}
                className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <p className="mb-3 flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200"><Info className="size-3.5" /> {err}</p>}
      {note && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200">
          <Check className="size-3.5" /> {note}
        </p>
      )}

      {busy && results.length === 0 && (
        <div className="grid h-40 place-items-center">
          <Loader2 className="size-6 animate-spin text-white/60" />
        </div>
      )}

      <div className={cn("grid gap-3", kind === "image" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
        <AnimatePresence initial={false}>
          {results.map((a, i) => (
            <motion.article
              key={a.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.28, delay: Math.min(i, 10) * 0.025 }}
              className="atlas-grid-item glass flex flex-col overflow-hidden rounded-3xl"
            >
              {kind === "image" && (a.thumb || a.url) ? (
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.thumb ?? a.url}
                    alt={a.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 hover:scale-[1.04]"
                  />
                </div>
              ) : kind === "audio" ? (
                <div className="relative bg-black/25 px-3 py-3">
                  {playing === a.id ? (
                    <audio src={a.url} controls autoPlay className="w-full" onEnded={() => setPlaying(null)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPlaying(a.id)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-3 text-xs font-bold text-white transition hover:border-white/30"
                    >
                      <Play className="size-4" /> تشغيل {a.durationMs ? `· ${(a.durationMs / 1000).toFixed(0)} ثانية` : ""}
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid place-items-center bg-black/25 px-3 py-6 text-3xl">
                  {kind === "data" ? "📊" : "📄"}
                </div>
              )}

              <div className="flex flex-1 flex-col p-3">
                <h2 className="line-clamp-2 text-[12.5px] font-black text-white">{a.title || "بلا عنوان"}</h2>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-slate-400">
                  {a.attribution ?? `${a.source}${a.author ? ` · ${a.author}` : ""}${a.license ? ` · ${a.license}` : ""}`}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-slate-500" dir="ltr">
                  {a.bytes ? <span>{sizeLabel(a.bytes)}</span> : null}
                  {a.width && a.height ? <span>· {a.width}×{a.height}</span> : null}
                  {a.mime ? <span>· {a.mime}</span> : null}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void download(a, false)} disabled={busyId === a.id} className={btn}>
                    {busyId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} تنزيل
                  </button>
                  <button
                    type="button"
                    onClick={() => void download(a, true)}
                    disabled={busyId === a.id || savedIds.includes(a.id)}
                    className={cn(btn, savedIds.includes(a.id) && "border-emerald-400/40 text-emerald-300")}
                  >
                    {savedIds.includes(a.id) ? <Check className="size-3.5" /> : <Database className="size-3.5" />}
                    {savedIds.includes(a.id) ? "في الخزنة" : "احفظ في الخزنة"}
                  </button>
                  <a className={btn} href={a.page ?? a.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> المصدر
                  </a>
                  <button type="button" onClick={() => ask(`استعمل هذا المصدر في مشروع: ${a.url}`)} className={btn}>
                    <MessageSquarePlus className="size-3.5" /> استخدمه
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      {!busy && results.length > 0 && (
        <p className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
          كل النتائج من مصادر حرة الحقوق (CC0 / CC-BY / Public Domain). ذكر المصدر يبقى واجبًا عند النشر — النص الجاهز
          موجود تحت كل نتيجة.
        </p>
      )}
    </div>
  );
}

const btn =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-50";
