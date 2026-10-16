"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  Check,
  Download,
  Eye,
  ExternalLink,
  FolderOpen,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { StatPill } from "@/components/ui/controls";
import { fileKindMeta, sizeLabel } from "@/lib/atlas-files";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — خزنة الملفات
 * Every deliverable Nexus produced (or the agent saved with `save_file`) lives
 * here: preview inside the app, download, ZIP bundle, public share link, delete.
 */

type FileRow = {
  id: string;
  title: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  extras?: number;
  visibility?: string;
  views?: number;
  downloads?: number;
  createdAt?: string;
  head?: string;
};

const KIND_FILTERS = [
  { id: "all", label: "الكل" },
  { id: "html", label: "صفحات HTML" },
  { id: "svg", label: "رسوم SVG" },
  { id: "markdown", label: "مستندات" },
  { id: "json", label: "JSON" },
  { id: "csv", label: "CSV" },
  { id: "code", label: "كود" },
  { id: "text", label: "نص" },
];

export default function FilesVaultPage() {
  const { authFetch, user } = useAuth();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [byKind, setByKind] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await authFetch(`/api/files?limit=200${kind === "all" ? "" : `&kind=${kind}`}`);
      const j = (await r.json()) as { files?: FileRow[]; byKind?: Record<string, number>; total?: number; bytes?: number; code?: string };
      if (!r.ok) {
        setErr(j.code === "UNAUTHENTICATED" ? "سجّل الدخول لرؤية ملفاتك" : "تعذّر تحميل الملفات");
        setFiles([]);
      } else {
        setFiles(j.files ?? []);
        setByKind(j.byKind ?? {});
        setTotal(j.total ?? 0);
        setBytes(j.bytes ?? 0);
      }
    } catch {
      setErr("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }, [authFetch, kind, user?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return files;
    return files.filter((f) => `${f.title} ${f.filename}`.toLowerCase().includes(s));
  }, [files, q]);

  const copyLink = async (f: FileRow) => {
    const url = `${window.location.origin}/api/files/deliver/${f.id}?mode=preview`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(f.id);
      window.setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 2200);
    } catch {
      /* ignore */
    }
  };

  const remove = async (f: FileRow) => {
    if (!window.confirm(`حذف «${f.title}» نهائيًا؟`)) return;
    setFiles((cur) => cur.filter((x) => x.id !== f.id));
    try {
      await authFetch(`/api/files?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      setTotal((t) => Math.max(0, t - 1));
    } catch {
      void load();
    }
  };

  const clearAll = async () => {
    if (!window.confirm("حذف كل الملفات المحفوظة؟ لا يمكن التراجع.")) return;
    setBusy(true);
    try {
      await authFetch("/api/files?all=1", { method: "DELETE" });
      setFiles([]);
      setTotal(0);
      setBytes(0);
      setByKind({});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="atlas-hero mb-6 p-5 sm:p-7">
        <p className="relative text-[11px] font-black tracking-widest text-white/80">NEXUS ATLAS · FILE FACTORY</p>
        <h1 className="relative mt-1 flex items-center gap-2 text-2xl font-black text-white sm:text-3xl">
          <FolderOpen className="size-6" /> خزنة الملفات
        </h1>
        <p className="relative mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/80">
          كل ما يصنعه Nexus يصبح ملفًا حقيقيًا: معاينة داخل التطبيق، تنزيل، حزمة ZIP، ورابط مشاركة آمن.
        </p>
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="ملفات محفوظة" value={total} icon={<FolderOpen className="size-4" />} />
          <StatPill label="الحجم" value={sizeLabel(bytes)} icon={<Archive className="size-4" />} />
          <StatPill label="صفحات HTML" value={byKind.html ?? 0} icon={<Eye className="size-4" />} />
          <StatPill label="أنواع" value={Object.keys(byKind).length} icon={<Download className="size-4" />} />
        </div>
      </motion.header>

      <div className="glass mb-4 rounded-3xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" />
            <input className="input-base !ps-9" placeholder="ابحث في ملفاتك…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
          </div>
          <button type="button" onClick={() => void load()} className="btn-ghost inline-flex items-center gap-2 !rounded-2xl">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} تحديث
          </button>
          {total > 0 && (
            <button type="button" onClick={() => void clearAll()} className="btn-ghost inline-flex items-center gap-2 !rounded-2xl border-rose-400/40 text-rose-300">
              <Trash2 className="size-4" /> حذف الكل
            </button>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={cn(
                "rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition active:scale-95",
                kind === k.id
                  ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white"
                  : "border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/28 hover:text-white"
              )}
            >
              {k.label}
              {k.id !== "all" && byKind[k.id] ? <span className="ms-1 text-[9.5px] opacity-70">{byKind[k.id]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="mb-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">{err}</p>}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {shown.map((f, i) => {
            const meta = fileKindMeta(f.kind as never);
            return (
              <motion.article
                key={f.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.26, delay: Math.min(i, 10) * 0.02 }}
                className="atlas-grid-item glass flex flex-col rounded-3xl p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/8 text-xl">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13.5px] font-black text-white">{f.title}</h2>
                    <p className="truncate text-[10.5px] text-slate-400" dir="ltr">
                      {f.filename} · {sizeLabel(f.bytes)} · {meta.label}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] text-slate-500">
                      {f.createdAt && <span>{new Date(f.createdAt).toLocaleString("ar-DZ")}</span>}
                      {!!f.views && <span>· {f.views} معاينة</span>}
                      {!!f.downloads && <span>· {f.downloads} تنزيل</span>}
                      {!!f.extras && <span>· {f.extras} ملف إضافي</span>}
                    </p>
                  </div>
                </div>

                {f.head && (
                  <pre className="mt-2.5 max-h-20 overflow-hidden rounded-2xl border border-white/8 bg-black/25 p-2 font-mono text-[10px] leading-relaxed text-slate-400" dir="ltr">
                    {f.head}
                  </pre>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setPreview(f)} className={btn}>
                    <Eye className="size-3.5" /> معاينة
                  </button>
                  <a className={btn} href={`/api/files/deliver/${f.id}?mode=download`} target="_blank" rel="noreferrer">
                    <Download className="size-3.5" /> تنزيل
                  </a>
                  <a className={btn} href={`/api/files/deliver/${f.id}?zip=1`} target="_blank" rel="noreferrer">
                    <Archive className="size-3.5" /> ZIP
                  </a>
                  <button type="button" onClick={() => void copyLink(f)} className={btn}>
                    {copied === f.id ? <Check className="size-3.5 text-emerald-400" /> : <Link2 className="size-3.5" />}
                    {copied === f.id ? "نُسخ" : "رابط"}
                  </button>
                  <a className={btn} href={`/api/files/deliver/${f.id}?mode=preview`} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> فتح
                  </a>
                  <button type="button" onClick={() => void remove(f)} className={cn(btn, "border-rose-400/30 text-rose-300 hover:border-rose-400/60")}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>

      {!busy && shown.length === 0 && (
        <div className="glass rounded-3xl px-4 py-12 text-center">
          <p className="text-3xl">🗂️</p>
          <p className="mt-2 text-sm font-bold text-white">{total === 0 ? "لا توجد ملفات محفوظة بعد" : "لا نتيجة لهذا البحث"}</p>
          <p className="mt-1 text-xs text-slate-400">
            اطلب من Nexus «اصنع لي صفحة HTML» وسيظهر ملفها مباشرة في المحادثة مع أزرار المعاينة والتنزيل.
          </p>
        </div>
      )}

      <AnimatePresence>
        {preview && <ServerPreview file={preview} onClose={() => setPreview(null)} />}
      </AnimatePresence>
    </div>
  );
}

const btn =
  "inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-white/30 hover:bg-white/10 hover:text-white active:scale-95";

/** Full-screen preview served by /api/files/deliver (sandboxed, unique origin). */
function ServerPreview({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const { authFetch } = useAuth();
  const meta = fileKindMeta(file.kind as never);
  const web = file.kind === "html" || file.kind === "svg";
  const [text, setText] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(file.visibility === "private");
  const [tokenUrl, setTokenUrl] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!web) {
        try {
          const r = await authFetch(`/api/files/deliver/${file.id}?mode=preview`);
          if (r.ok) {
            const t = await r.text();
            if (alive) setText(t.length > 400_000 ? `${t.slice(0, 400_000)}\n\n… (مقتطع)` : t);
          } else if (alive) setNeedsAuth(true);
        } catch {
          if (alive) setNeedsAuth(true);
        }
        return;
      }
      /* web content: load through authFetch, then render into a sandboxed iframe */
      try {
        const r = await authFetch(`/api/files/deliver/${file.id}?mode=preview`);
        if (!r.ok) {
          if (alive) setNeedsAuth(true);
          return;
        }
        const html = await r.text();
        if (!alive) return;
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        setTokenUrl(url);
      } catch {
        if (alive) setNeedsAuth(true);
      }
    })();
  }, [authFetch, file.id, web]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex flex-col bg-[#0b0a14]/94 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={file.title}
    >
      <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-3 py-2.5 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-lg">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-white">{file.title}</h2>
          <p className="truncate text-[11px] text-slate-400" dir="ltr">
            {file.filename} · {sizeLabel(file.bytes)} · {meta.label}
          </p>
        </div>
        <a className={btn} href={`/api/files/deliver/${file.id}?zip=1`} target="_blank" rel="noreferrer">
          <Archive className="size-3.5" /> ZIP
        </a>
        <a className={btn} href={`/api/files/deliver/${file.id}?mode=download`} target="_blank" rel="noreferrer">
          <Download className="size-3.5" /> تنزيل
        </a>
        <button type="button" className={btn} onClick={onClose} aria-label="إغلاق">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 bg-white/[0.02] p-2 sm:p-4">
        {needsAuth && !tokenUrl && text === null && (
          <div className="grid h-full place-items-center">
            <div className="glass max-w-sm rounded-3xl p-5 text-center">
              <p className="text-sm font-bold text-white">الملف خاص</p>
              <p className="mt-1 text-xs text-slate-400">سجّل الدخول بنفس الحساب الذي أنشأ الملف لفتحه.</p>
            </div>
          </div>
        )}

        {web && tokenUrl && (
          <iframe
            title={file.title}
            src={tokenUrl}
            className="h-full w-full rounded-2xl border border-white/10 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        )}

        {!web && text !== null && (
          <pre className="h-full w-full overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-slate-200" dir="ltr">
            {text}
          </pre>
        )}

        {!web && text === null && !needsAuth && (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-6 animate-spin text-white/60" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
