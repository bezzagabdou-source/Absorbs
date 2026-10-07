"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, FileText, Globe, Image as ImageIcon, Loader2, Plus, Send, Square, Upload, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { Markdown } from "@/components/markdown";
import { MAX_FILES, MAX_PAYLOAD, payloadSize, prepareFile, type PendingFile } from "@/lib/attachments";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "model"; text: string };

const ERRORS: Record<string, string> = {
  PRO_ONLY: "مساحة الملفات متاحة لمشتركي Pro.",
  NO_PROVIDER: "لم تُضبط مفاتيح النماذج على الخادم بعد (GEMINI_API_KEY).",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  TOO_BIG: "حجم المواد كبير على طلب واحد. احذف ملفًا أو قسّم العمل.",
  NO_MATERIAL: "لم أستطع قراءة أي مادة. تأكد من الملفات أو الروابط وأعد المحاولة.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
  ERROR: "حدث خطأ غير متوقع. أعد المحاولة.",
};

const SUGGESTIONS = ["لخّص المواد في نقاط مرتبة", "ما أهم المشاكل أو الأخطاء فيها؟", "استخرج الأرقام والتواريخ المهمة", "اشرح هذا لمبتدئ خطوة بخطوة"];

export function Workspace() {
  const { authFetch } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const filesRef = useRef<PendingFile[]>([]);
  filesRef.current = files;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
      for (const f of filesRef.current) if (f.preview) URL.revokeObjectURL(f.preview);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length]);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    setNote("");
    const incoming = Array.from(list);
    let skipped = 0;
    for (const f of incoming) {
      if (filesRef.current.length >= MAX_FILES + 16) {
        skipped += 1;
        continue;
      }
      const r = await prepareFile(f);
      if (!aliveRef.current) return;
      if (!r.ok) {
        skipped += 1;
        continue;
      }
      if (payloadSize([...filesRef.current, r.file]) > MAX_PAYLOAD) {
        if (r.file.preview) URL.revokeObjectURL(r.file.preview);
        skipped += 1;
        continue;
      }
      setFiles((cur) => [...cur, r.file]);
    }
    if (skipped) setNote(`تعذّرت إضافة ${skipped} ملف (كبير أو غير مدعوم).`);
  }, []);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void addFiles(e.target.files);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: number) =>
    setFiles((cur) => {
      const f = cur.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return cur.filter((x) => x.id !== id);
    });

  const addUrl = () => {
    const v = urlInput.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(v) || urls.length >= 4 || urls.includes(v)) return;
    setUrls((u) => [...u, v]);
    setUrlInput("");
  };

  const stop = () => abortRef.current?.abort();

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (text.length < 2 || streaming) return;
      if (files.length === 0 && urls.length === 0) {
        setError("أضف ملفًا أو رابطًا أولًا.");
        return;
      }
      setError("");
      setQuestion("");
      const history = turns;
      setTurns((t) => [...t, { role: "user", text }, { role: "model", text: "" }]);
      setStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await authFetch("/api/ai/workspace", {
          method: "POST",
          signal: ac.signal,
          body: JSON.stringify({
            question: text,
            docs: files.filter((f) => f.kind === "text").map((f) => ({ name: f.name, text: f.text })),
            files: files.filter((f) => f.kind !== "text").map((f) => ({ mime: f.mime, data: f.data })),
            urls,
            history,
          }),
        });
        if (!res.ok || !res.body) {
          const d = (await res.json().catch(() => ({}))) as { code?: string };
          throw new Error(d.code ?? "ERROR");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          if (!aliveRef.current) return;
          const snapshot = acc;
          setTurns((t) => {
            const next = t.slice();
            next[next.length - 1] = { role: "model", text: snapshot };
            return next;
          });
        }
      } catch (e) {
        if (!aliveRef.current) return;
        const aborted = e instanceof DOMException && e.name === "AbortError";
        if (!aborted) {
          const code = e instanceof Error ? e.message : "ERROR";
          setError(ERRORS[code] ?? ERRORS.ERROR);
          setTurns((t) => (t[t.length - 1]?.text === "" ? t.slice(0, -2) : t));
        }
      } finally {
        if (aliveRef.current) setStreaming(false);
        abortRef.current = null;
      }
    },
    [authFetch, files, urls, turns, streaming]
  );

  const hasMaterial = files.length > 0 || urls.length > 0;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[340px_1fr] lg:py-12">
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <header>
          <h1 className="flex items-center gap-2.5 text-3xl font-black text-white">
            <FileText className="h-7 w-7 text-gold-400" />
            مساحة الملفات
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            ارفع PDF أو كودًا أو صورًا أو أرشيف ZIP، وأضف روابط صفحات. اسأل عنها كلها معًا، والأجوبة تذكر مصدرها.
          </p>
        </header>

        {!isPro && (
          <Link href="/app/upgrade" className="gold-border flex items-center gap-3 rounded-2xl p-3.5 text-sm font-black text-white">
            <Crown className="h-5 w-5 text-gold-300" />
            متاحة لمشتركي Pro
          </Link>
        )}

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            "neo-panel flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 p-6 text-center transition",
            drag && "neon-ring"
          )}
        >
          <Upload className="h-6 w-6 text-gold-300" />
          <span className="text-sm font-black text-white">اسحب الملفات هنا أو اضغط للاختيار</span>
          <span className="text-[11px] text-slate-500">PDF حتى 2.5MB · ZIP حتى 12MB · نصوص وأكواد · صور</span>
          <input type="file" multiple className="sr-only" onChange={onPick} />
        </label>

        {note && <p className="text-xs text-orange-300" role="status">{note}</p>}

        <ul className="flex flex-col gap-2" aria-label="المواد">
          <AnimatePresence initial={false}>
            {files.map((f, i) => (
              <motion.li
                key={f.id}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                className="neo-panel flex items-center gap-3 rounded-xl p-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06] text-slate-300">
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                  ) : f.kind === "pdf" ? (
                    <FileText className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{f.name}</span>
                  <span className="text-[11px] text-slate-500" dir="ltr">D{i + 1} · {f.kind}</span>
                </span>
                <button type="button" aria-label="إزالة" onClick={() => removeFile(f.id)} className="text-slate-500 hover:text-rose-300">
                  <X className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {urls.map((u) => (
            <li key={u} className="neo-panel flex items-center gap-3 rounded-xl p-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-slate-300">
                <Globe className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-300" dir="ltr">{u}</span>
              <button type="button" aria-label="إزالة" onClick={() => setUrls((x) => x.filter((y) => y !== u))} className="text-slate-500 hover:text-rose-300">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && (e.preventDefault(), addUrl())}
            placeholder="https://… رابط صفحة"
            dir="ltr"
            inputMode="url"
            className="neo-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          <button type="button" onClick={addUrl} aria-label="إضافة الرابط" className="btn-ghost grid h-11 w-11 shrink-0 place-items-center">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <section className="flex min-h-[60vh] min-w-0 flex-col">
        <div className="flex flex-1 flex-col gap-4" aria-live="polite">
          {turns.length === 0 && (
            <div className="neo-panel rounded-2xl p-6">
              <p className="text-sm font-black text-white">
                {hasMaterial ? "المواد جاهزة. اطرح سؤالك:" : "ابدأ برفع مادة، ثم اسأل عنها."}
              </p>
              {hasMaterial && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => void ask(s)} className="neo-chip rounded-full px-3.5 py-2 text-xs font-bold">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="neo-chip-on self-start rounded-2xl rounded-ss-md px-4 py-3 text-sm font-bold text-white">{t.text}</div>
            ) : (
              <div key={i} className="neo-panel min-w-0 rounded-2xl p-4 text-[15px] leading-relaxed text-slate-100">
                {t.text ? (
                  <Markdown pro plainCode={streaming && i === turns.length - 1}>{t.text}</Markdown>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> يقرأ المواد…
                  </span>
                )}
              </div>
            )
          )}
          {error && <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200" role="alert">{error}</p>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="neo-panel sticky bottom-3 mt-4 flex items-end gap-2 rounded-2xl p-2"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(question);
              }
            }}
            rows={1}
            placeholder={hasMaterial ? "اسأل عن المواد…" : "أضف مادة أولًا"}
            className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          {streaming ? (
            <button type="button" onClick={stop} aria-label="إيقاف" className="btn-ghost grid h-11 w-11 shrink-0 place-items-center">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!isPro || !hasMaterial || question.trim().length < 2} aria-label="إرسال" className="btn-primary grid h-11 w-11 shrink-0 place-items-center">
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
