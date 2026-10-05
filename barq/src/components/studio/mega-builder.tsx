"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Check, Crown, Download, Loader2, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MEGA_MAX_FILES, MEGA_MAX_TOTAL } from "@/lib/mega";
import { buildZip, bytesOf, inlinePreview, newJob, requeueFailed } from "@/lib/mega-client";
import {
  MEGA_SERVER_STATE,
  megaDiscard,
  megaGet,
  megaInit,
  megaStart,
  megaStop,
  megaSubscribe,
  type MegaState,
} from "@/lib/mega-store";
import { downloadBlob } from "@/lib/zip";
import { cn } from "@/lib/utils";

const IDEAS = [
  "لعبة RPG كاملة بعشرة مستويات ونظام معارك ومتجر",
  "موقع شركة عقارات متعدد الصفحات مع لوحة تحكم",
  "منصة تعليمية بدروس واختبارات وتتبع للتقدم",
  "لعبة استراتيجية بخريطة وموارد وذكاء اصطناعي للأعداء",
];

const mb = (n: number) => (n / 1_048_576).toFixed(2);
const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "barq-project";

export function MegaBuilder({ isPro }: { isPro: boolean }) {
  const { authFetch } = useAuth();
  // the build runs in a module-level store: it keeps going when this page is closed
  const st: MegaState = useSyncExternalStore(megaSubscribe, megaGet, () => MEGA_SERVER_STATE);
  const { job, live, running } = st;
  const [input, setInput] = useState("");

  useEffect(() => {
    void megaInit();
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const start = () => {
    const text = input.trim();
    if (text.length < 6 || running) return;
    setInput("");
    void megaStart(authFetch, newJob(text));
  };

  const resume = () => job && void megaStart(authFetch, { ...job, status: "building", note: "" });
  const retry = () => job && void megaStart(authFetch, requeueFailed(job));
  const stop = () => megaStop();
  const reset = async () => {
    await megaDiscard();
  };
  const download = () => job && downloadBlob(buildZip(job), `${slug(job.plan?.title ?? "barq-project")}.zip`);
  const preview = () => {
    if (!job) return;
    const html = inlinePreview(job.files);
    if (!html) return;
    window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
  };

  if (!isPro) {
    return (
      <div className="glass-deep rounded-2xl p-6 text-center">
        <Crown className="mx-auto h-8 w-8 text-amber-300" />
        <h2 className="mt-3 text-lg font-bold text-white">المشاريع الضخمة — Pro</h2>
        <p className="mt-1 text-sm text-slate-400">حتى {MEGA_MAX_FILES} ملف وبحجم يصل إلى {mb(MEGA_MAX_TOTAL)}MB داخل ZIP واحد.</p>
        <Link href="/app/upgrade" className="btn-primary mt-4 inline-flex px-5 py-2.5 text-sm">
          فعّل Pro
        </Link>
      </div>
    );
  }

  const plan = job?.plan ?? null;
  const total = plan?.files.length ?? 0;
  const done = job ? Object.keys(job.files).length : 0;
  const used = job ? bytesOf(job.files) : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const canDownload = done > 0;
  const hasLeft = !!job && (job.status === "stopped" || job.status === "error");
  const idle = !job;

  return (
    <div className="flex flex-col gap-3">
      {idle && (
        <div className="glass-deep rounded-2xl p-3">
          <p className="px-1 pb-2 text-sm text-slate-300">
            صف مشروعاً كبيراً — يخطّط برق الملفات ثم يكتب كل ملف على حدة بلا توقف، وتحصل على ZIP (حتى {MEGA_MAX_FILES} ملف / {mb(MEGA_MAX_TOTAL)}MB — الألعاب لا تقل عن 3MB).
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            dir="auto"
            placeholder="مثال: لعبة مغامرات كاملة بـ 12 مستوى و8 أنواع أعداء ونظام ترقيات… (يمكنك تحديد عدد الملفات أو الحجم)"
            className="w-full resize-none rounded-xl bg-black/30 px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" onClick={() => setInput(idea)} className="rounded-full border border-brand-400/20 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-brand-300/60 hover:text-white">
                {idea}
              </button>
            ))}
          </div>
          <button type="button" onClick={start} disabled={input.trim().length < 6} className="btn-primary mt-3 w-full px-4 py-3 text-sm disabled:opacity-50">
            ابدأ البناء الضخم
          </button>
        </div>
      )}

      {job && (
        <div className="glass-deep rounded-2xl p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-white">{plan?.title ?? "جاري التخطيط…"}</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {total > 0 ? `${done} / ${total} ملف · ${mb(used)}MB من ${mb(MEGA_MAX_TOTAL)}MB` : "المهندس يرسم شجرة الملفات والعقد المشترك…"}
              </p>
            </div>
            {running && <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-slate-300" />}
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {job.note && <p className="mt-2 text-xs text-slate-300">{job.note}</p>}

          {plan && (
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pe-1 text-xs" dir="ltr">
              {plan.files.map((f) => {
                const text = job.files[f.path];
                const l = live[f.path];
                const failed = job.failed.includes(f.path);
                const skipped = job.skipped.includes(f.path);
                return (
                  <li key={f.path} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", l ? "bg-white/[0.07]" : "bg-white/[0.03]")}>
                    {text !== undefined ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    ) : l ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-300" />
                    ) : failed || skipped ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-300" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-slate-200">{f.path}</span>
                    <span className="shrink-0 text-slate-500">
                      {text !== undefined ? `${(text.length / 1024).toFixed(1)} KB` : l ? `${(l.chars / 1024).toFixed(1)} KB${l.attempt > 1 ? ` · #${l.attempt}` : ""}` : `~${f.kb} KB`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {running ? (
              <button type="button" onClick={stop} className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                <Square className="h-4 w-4 fill-current" />
                إيقاف
              </button>
            ) : (
              <>
                {hasLeft && (
                  <button type="button" onClick={resume} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                    <Play className="h-4 w-4" />
                    متابعة
                  </button>
                )}
                {job.failed.length > 0 && (
                  <button type="button" onClick={retry} className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                    <RotateCcw className="h-4 w-4" />
                    أعد المحاولة ({job.failed.length})
                  </button>
                )}
              </>
            )}
            <button type="button" onClick={download} disabled={!canDownload} className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-40">
              <Download className="h-4 w-4" />
              تحميل ZIP
            </button>
            {job.files["index.html"] !== undefined && (
              <button type="button" onClick={preview} className="btn-ghost px-4 py-2.5 text-sm">
                معاينة
              </button>
            )}
            {!running && (
              <button type="button" onClick={() => void reset()} aria-label="مشروع جديد" className="btn-ghost inline-flex items-center gap-2 px-3 py-2.5 text-sm">
                <Trash2 className="h-4 w-4" />
                جديد
              </button>
            )}
          </div>
          {running && <p className="mt-2 text-[11px] text-slate-500">يمكنك مغادرة هذه الصفحة: البناء يكمل في الخلفية ويُحفظ كل ملف على جهازك تلقائياً.</p>}
        </div>
      )}
    </div>
  );
}
