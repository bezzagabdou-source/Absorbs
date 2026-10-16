"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpenText,
  ChevronDown,
  Database,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StatPill } from "@/components/ui/controls";
import { Markdown } from "@/components/markdown";
import type { KbEntry, KbLang, KbStats } from "@/lib/kb/types";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — قاعدة المعرفة
 * A browser for the built-in knowledge base: search (Arabic / Darija / French),
 * filter by category, open an entry to read the full answer with its sources.
 */

type Cat = { id: string; ar: string; fr: string; en: string; emoji: string };
type Hit = {
  id: string;
  category: string;
  title: Partial<Record<KbLang, string>> & { ar: string };
  summary?: Partial<Record<KbLang, string>>;
  snippet: string;
  score: number;
  matched: string[];
  tags: string[];
  source?: { name: string; url?: string };
  reliability?: number;
};

const STARTERS = [
  "شكون صنعك",
  "البكالوريا",
  "البطاقة الذهبية",
  "auto entrepreneur",
  "رخصة السياقة",
  "CNIE",
  "المنحة الجامعية",
  "الدفع الإلكتروني في الجزائر",
];

export default function KnowledgePage() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [stats, setStats] = useState<KbStats | null>(null);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [version, setVersion] = useState("18");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, KbEntry>>({});
  const [err, setErr] = useState<string | null>(null);

  /* boot: load the whole corpus once, then search is instant + server-backed */
  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const r = await fetch("/api/kb?all=1", { cache: "no-store" });
        const j = (await r.json()) as { version?: string; stats?: KbStats; categories?: Cat[]; entries?: KbEntry[] };
        if (!alive) return;
        setCats(j.categories ?? []);
        setStats(j.stats ?? null);
        setEntries(j.entries ?? []);
        setVersion(j.version ?? "18");
      } catch {
        if (alive) setErr("تعذّر تحميل قاعدة المعرفة");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const runSearch = useCallback(async (query: string, category: string) => {
    const term = query.trim();
    if (!term) {
      setHits(null);
      return;
    }
    setBusy(true);
    try {
      const p = new URLSearchParams({ q: term, limit: "24" });
      if (category !== "all") p.set("cat", category);
      const r = await fetch(`/api/kb?${p}`, { cache: "no-store" });
      const j = (await r.json()) as { hits?: Hit[] };
      setHits(j.hits ?? []);
    } catch {
      setErr("تعذّر البحث");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(q, cat), 220);
    return () => window.clearTimeout(t);
  }, [q, cat, runSearch]);

  const shown = useMemo<KbEntry[]>(() => {
    if (hits) {
      const byId = new Map(entries.map((e) => [e.id, e]));
      return hits.map((h) => byId.get(h.id)).filter((e): e is KbEntry => !!e);
    }
    return cat === "all" ? entries : entries.filter((e) => e.category === cat);
  }, [hits, entries, cat]);

  const hitOf = useCallback((id: string) => hits?.find((h) => h.id === id), [hits]);

  const open = useCallback(
    async (id: string) => {
      if (openId === id) {
        setOpenId(null);
        return;
      }
      setOpenId(id);
      if (full[id]) return;
      try {
        const r = await fetch(`/api/kb?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = (await r.json()) as { entry?: KbEntry };
        if (j.entry) setFull((f) => ({ ...f, [id]: j.entry as KbEntry }));
      } catch {
        /* the snippet is still shown */
      }
    },
    [openId, full]
  );

  const ask = (text: string) => {
    router.push(`/app?q=${encodeURIComponent(text)}`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="atlas-hero mb-6 p-5 sm:p-7"
      >
        <p className="relative text-[11px] font-black tracking-widest text-white/80">NEXUS ATLAS · KB {version}</p>
        <h1 className="relative mt-1 flex items-center gap-2 text-2xl font-black text-white sm:text-3xl">
          <Database className="size-6" /> قاعدة المعرفة
        </h1>
        <p className="relative mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/80">
          هذه هي القاعدة التي يستند إليها Nexus قبل أي جواب: إدارات الجزائر، الدراسة، الأعمال، القانون، التقنية وغيرها.
          يبحث فيها بالعربية والدارجة والفرنسية، ويقتبس منها بدقة مع ذكر المصدر.
        </p>

        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="مادة" value={stats?.entries ?? entries.length} icon={<BookOpenText className="size-4" />} />
          <StatPill label="تصنيف" value={stats?.categories ?? cats.length} icon={<Sparkles className="size-4" />} />
          <StatPill label="كلمة مفتاحية" value={stats?.tags ?? 0} icon={<Search className="size-4" />} />
          <StatPill label="كلمة في المتن" value={(stats?.words ?? 0).toLocaleString("ar-DZ")} icon={<ShieldCheck className="size-4" />} />
        </div>
      </motion.header>

      <div className="glass mb-4 rounded-3xl p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
            <input
              className="input-base !ps-9"
              placeholder="ابحث: باك، البطاقة الذهبية، auto entrepreneur، تأشيرة…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="البحث في قاعدة المعرفة"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute inset-y-0 end-3 my-auto size-4 text-slate-400 hover:text-white" aria-label="مسح">
                <X className="size-4" />
              </button>
            )}
          </div>
          {busy && <Loader2 className="size-4 animate-spin text-white/70" />}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip on={cat === "all"} onClick={() => setCat("all")} label={`الكل ${stats?.entries ?? entries.length}`} />
          {cats.map((c) => (
            <Chip
              key={c.id}
              on={cat === c.id}
              onClick={() => setCat(c.id)}
              label={`${c.emoji} ${c.ar}`}
              count={stats?.byCategory?.[c.id]}
            />
          ))}
        </div>

        {!q && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] text-slate-400">جرّب:</span>
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => setQ(s)} className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-slate-300 transition hover:border-white/30 hover:text-white">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <p className="mb-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">{err}</p>}

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {shown.map((e, i) => {
            const h = hitOf(e.id);
            const isOpen = openId === e.id;
            const body = full[e.id]?.body ?? e.body;
            const cmeta = cats.find((c) => c.id === e.category);
            return (
              <motion.article
                key={e.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.02 }}
                className="atlas-grid-item glass overflow-hidden rounded-3xl"
              >
                <button
                  type="button"
                  onClick={() => void open(e.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-3 px-4 py-3 text-right transition hover:bg-white/[0.04]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-white/8 text-lg">{cmeta?.emoji ?? "📌"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-black text-white">{e.title.ar}</span>
                      {h && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-black text-emerald-300">تطابق {Math.round(h.score * 100)}%</span>}
                      {e.reliability && e.reliability >= 4 && (
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9.5px] font-bold text-slate-300">مستقر</span>
                      )}
                    </span>
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-400">
                      {(e.summary?.ar ?? h?.snippet ?? e.body).slice(0, 190)}
                      {(e.summary?.ar ?? h?.snippet ?? e.body).length > 190 ? "…" : ""}
                    </span>
                    {h && h.matched.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {h.matched.slice(0, 6).map((m) => (
                          <span key={m} className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9.5px] text-slate-300">
                            {m}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn("mt-1 size-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-t border-white/8"
                    >
                      <div className="px-4 py-3">
                        {full[e.id]?.facts?.length ? (
                          <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
                            {full[e.id].facts?.map((f) => (
                              <div key={f.k} className="rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-1.5">
                                <span className="block text-[10px] text-slate-400">{f.k}</span>
                                <span className="block text-[12.5px] font-black text-white">
                                  {f.v}
                                  {f.u ? <span className="ms-1 text-[10px] font-bold text-slate-400">{f.u}</span> : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="md-body text-[12.5px] leading-relaxed">
                          <Markdown>{body}</Markdown>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                          {e.tags.slice(0, 10).map((t) => (
                            <button key={t} type="button" onClick={() => setQ(t)} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9.5px] text-slate-400 hover:border-white/30 hover:text-white">
                              #{t}
                            </button>
                          ))}
                          <span className="ms-auto flex items-center gap-2">
                            {e.source && (
                              <span className="text-[10px] text-slate-500">
                                المصدر: {e.source.name}
                                {e.source.url && (
                                  <a href={e.source.url} target="_blank" rel="noreferrer" className="ms-1 inline-flex items-center gap-0.5 text-slate-300 hover:text-white">
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                              </span>
                            )}
                            {e.updated && <span className="text-[10px] text-slate-500">آخر تحقق: {e.updated}</span>}
                            <button type="button" onClick={() => ask(`اشرح لي: ${e.title.ar}`)} className="btn-ghost inline-flex items-center gap-1.5 !h-8 !rounded-xl !px-2.5 !text-[11px]">
                              <MessageSquarePlus className="size-3.5" /> اسأل Nexus
                            </button>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </AnimatePresence>

        {!busy && shown.length === 0 && (
          <div className="glass rounded-3xl px-4 py-10 text-center">
            <p className="text-sm font-bold text-white">لا توجد نتيجة</p>
            <p className="mt-1 text-xs text-slate-400">
              جرّب كلمة أخرى، أو اطلب من Nexus البحث في الإنترنت مباشرة.
            </p>
            <button type="button" onClick={() => ask(q ? `ابحث في الإنترنت عن: ${q}` : "ابحث في الإنترنت عن")} className="btn-primary mt-3 inline-flex items-center gap-2 !rounded-2xl">
              <Search className="size-4" /> بحث في الإنترنت
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95",
        on
          ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white shadow-md shadow-black/25"
          : "border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/28 hover:text-white"
      )}
    >
      {label}
      {typeof count === "number" && <span className={cn("text-[9.5px]", on ? "text-white/75" : "text-slate-500")}>{count}</span>}
    </button>
  );
}
