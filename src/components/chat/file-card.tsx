"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive,
  Check,
  Download,
  Eye,
  FileCode2,
  Link2,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { buildFile, downloadTextFile, downloadUrl, fileKindMeta, sizeLabel } from "@/lib/atlas-files";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — بطاقة الملف (File Factory card)
 * ---------------------------------------------------------------------------
 * Rendered under any code block / deliverable in the chat:
 *   👁 معاينة   ⬇ تنزيل   🗜 ZIP   🔗 رابط   💾 حفظ في ملفاتي
 * Everything works offline (client-side blob) and gets *persisted* on the
 * server when the user clicks «حفظ» — then a public/preview link is available.
 */

export type SavedFile = {
  id: string;
  title: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  extras?: number;
  visibility?: string;
  createdAt?: string;
  head?: string;
};

export function FileCard({
  code,
  lang,
  title,
  compact = false,
  onSaved,
}: {
  code: string;
  lang: string;
  title?: string;
  compact?: boolean;
  onSaved?: (f: SavedFile) => void;
}) {
  const { authFetch } = useAuth();
  const file = buildFile({ code, lang, title });
  const meta = fileKindMeta(file.kind);
  const [busy, setBusy] = useState<"save" | "zip" | null>(null);
  const [saved, setSaved] = useState<SavedFile | null>(null);
  const [err, setErr] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => setErr(""), [code]);

  const save = useCallback(async () => {
    setBusy("save");
    setErr("");
    try {
      const res = await authFetch("/api/files", {
        method: "POST",
        body: JSON.stringify({ code, lang, title: file.title }),
      });
      const j = (await res.json()) as { file?: SavedFile; code?: string; detail?: string };
      if (!res.ok || !j.file) throw new Error(j.detail ?? j.code ?? "SAVE_FAILED");
      setSaved(j.file);
      onSaved?.(j.file);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ على السيرفر");
    } finally {
      setBusy(null);
    }
  }, [authFetch, code, lang, file.title, onSaved]);

  const zip = useCallback(async () => {
    setBusy("zip");
    try {
      if (saved?.id) {
        downloadUrl(`/api/files/deliver/${saved.id}?zip=1`, `${file.filename.replace(/\.[^.]+$/, "")}.zip`);
        return;
      }
      const { createZip } = await import("@/lib/zip");
      const blob = createZip([
        { path: file.filename, data: code },
        {
          path: "README.md",
          data: `# ${file.title}\n\nمولَّد بواسطة Nexus AI v18 ATLAS — من تطوير abdelrezakbezzag (الجزائر 🇩🇿).\n\n## التشغيل\nافتح \`${file.filename}\` في أي متصفح.\n`,
        },
      ]);
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `${file.filename.replace(/\.[^.]+$/, "")}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(null);
    }
  }, [saved, file.filename, file.title, code]);

  const share = useCallback(async () => {
    if (!saved) {
      await save();
      return;
    }
    const url = `${window.location.origin}/api/files/deliver/${saved.id}?mode=preview`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setErr("ما قدرناش ننسخو الرابط");
    }
  }, [saved, save]);

  const btn = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[11.5px] font-bold transition active:scale-95",
    "border border-slate-900/10 bg-white/70 text-slate-700 hover:border-brand-400/60 hover:text-brand-600",
    "dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-white"
  );

  return (
    <>
      <div
        className={cn(
          "atlas-file-card my-2 overflow-hidden rounded-2xl border border-brand-400/25 bg-gradient-to-l from-white/85 to-brand-50/60 shadow-[0_16px_36px_-28px_rgba(40,60,160,.6)]",
          "dark:from-white/[0.06] dark:to-brand-500/[0.08]",
          compact && "text-xs"
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-lg" aria-hidden>
            {meta.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-black text-slate-800 dark:text-slate-100">
              {saved?.title ?? file.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-slate-500 dark:text-slate-400" dir="ltr">
              <span className="font-bold text-brand-600/90 dark:text-brand-300">{meta.label}</span>
              <span>·</span>
              <span className="font-mono">{saved?.filename ?? file.filename}</span>
              <span>·</span>
              <span>{sizeLabel(saved?.bytes ?? file.bytes)}</span>
              {saved?.id && (
                <>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-300">محفوظ ✓</span>
                </>
              )}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-400/15 bg-white/50 px-2.5 py-2 dark:bg-black/10">
          <button type="button" className={btn} onClick={() => setShowPreview(true)}>
            <Eye className="size-3.5" /> معاينة
          </button>
          <button type="button" className={btn} onClick={() => downloadTextFile(file)}>
            <Download className="size-3.5" /> تنزيل {meta.ext.toUpperCase()}
          </button>
          <button type="button" className={btn} onClick={() => void zip()} disabled={busy === "zip"}>
            {busy === "zip" ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />} ZIP
          </button>
          <button type="button" className={btn} onClick={() => void share()}>
            {linkCopied ? <Check className="size-3.5 text-emerald-500" /> : <Link2 className="size-3.5" />}
            {linkCopied ? "نُسخ الرابط" : "رابط"}
          </button>
          {!saved?.id && (
            <button
              type="button"
              className={cn(btn, "border-brand-500/40 bg-brand-500/12 text-brand-700 dark:text-brand-200")}
              onClick={() => void save()}
              disabled={busy === "save"}
            >
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <FileCode2 className="size-3.5" />}
              حفظ في ملفاتي
            </button>
          )}
          {saved?.id && (
            <a className={btn} href={`/api/files/deliver/${saved.id}`} target="_blank" rel="noreferrer">
              <Download className="size-3.5" /> من السيرفر
            </a>
          )}
        </div>

        <AnimatePresence>
          {err && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-bold text-rose-600 dark:text-rose-300"
            >
              <X className="size-3" /> {err}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showPreview && (
          <FilePreview
            title={saved?.title ?? file.title}
            kind={file.kind}
            filename={saved?.filename ?? file.filename}
            code={code}
            serverId={saved?.id}
            onClose={() => setShowPreview(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Full-screen preview: real iframe for web formats, reader for text formats. */
export function FilePreview({
  title,
  kind,
  filename,
  code,
  serverId,
  onClose,
}: {
  title: string;
  kind: string;
  filename: string;
  code: string;
  serverId?: string;
  onClose: () => void;
}) {
  const meta = fileKindMeta(kind as never);
  const web = kind === "html" || kind === "svg";
  const [srcDoc, setSrcDoc] = useState<string>("");

  useEffect(() => {
    const CSP =
      "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'unsafe-inline'; img-src * data: blob:; media-src * data: blob:; font-src data: https://fonts.gstatic.com; connect-src 'none'; base-uri 'none'";
    if (kind === "svg") {
      setSrcDoc(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${code}</body></html>`
      );
      return;
    }
    if (kind === "html") {
      const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1">`;
      setSrcDoc(
        /<head[^>]*>/i.test(code)
          ? code.replace(/<head([^>]*)>/i, `<head$1>${head}`)
          : `<!doctype html><html><head>${head}</head><body>${code}</body></html>`
      );
    }
  }, [code, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex flex-col bg-[#0b0a14]/92 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-3 py-2.5 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-lg" aria-hidden>
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-white">{title}</h2>
          <p className="truncate text-[11px] text-slate-400" dir="ltr">
            {filename} · {meta.label} · {sizeLabel(new TextEncoder().encode(code).length)}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
          onClick={() => downloadTextFile({ filename, mime: meta.mime, content: code })}
        >
          <Download className="size-3.5" /> تنزيل
        </button>
        {serverId && (
          <a
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20"
            href={`/api/files/deliver/${serverId}?zip=1`}
            target="_blank"
            rel="noreferrer"
          >
            <Archive className="size-3.5" /> ZIP
          </a>
        )}
        <button
          type="button"
          aria-label="إغلاق المعاينة"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-rose-500/30 active:scale-95"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 bg-white">
        {web ? (
          <iframe
            title={title}
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
            srcDoc={srcDoc}
            className="h-full w-full border-0"
          />
        ) : kind === "markdown" || kind === "text" ? (
          <pre className="h-full w-full overflow-auto whitespace-pre-wrap bg-[#0d0c17] p-5 font-mono text-[12.5px] leading-7 text-slate-100">
            {code}
          </pre>
        ) : (
          <pre className="h-full w-full overflow-auto bg-[#0d0c17] p-5 font-mono text-[12.5px] leading-6 text-emerald-100" dir="ltr">
            {code}
          </pre>
        )}
      </div>
    </motion.div>
  );
}

/** Small destructive button used by the files page. */
export function DeleteFileButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="حذف الملف"
      disabled={busy}
      className="grid size-8 place-items-center rounded-lg border border-rose-500/25 text-rose-500 transition hover:bg-rose-500/12 active:scale-95 disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          await authFetch(`/api/files?id=${encodeURIComponent(id)}`, { method: "DELETE" });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}
