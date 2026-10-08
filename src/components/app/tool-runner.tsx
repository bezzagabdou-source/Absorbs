"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Loader2,
  Lock,
  PenLine,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { loc, type ToolDef } from "@/lib/tools";
import { useCredits } from "@/components/app/app-shell";
import { ACCENTS } from "@/components/tool-card";
import { Markdown } from "@/components/markdown";
import { FullPreview, GamePreview } from "@/components/game-preview";
import { usePro } from "@/lib/pro-i18n";
import { extractHtml } from "@/lib/attachments";
import { EMPTY_TOOL_STATE, cutOff, toolGet, toolPatch, toolResume, toolRun, toolSubscribe, type ToolRunOpts } from "@/lib/tool-store";
import { cn } from "@/lib/utils";

type ErrKind = "quota" | "nokey" | "busy" | "generic" | "pro" | null;

function defaultsOf(tool: ToolDef): Record<string, string> {
  const d: Record<string, string> = {};
  for (const f of tool.fields) {
    if (f.type === "select" && f.options?.[0]) d[f.key] = f.options[0].value;
  }
  return d;
}

export function ToolRunner({ tool }: { tool: ToolDef }) {
  const { t, locale, dir } = useI18n();
  const { authFetch } = useAuth();
  const { applyHeaders, profile } = useCredits();
  const pro = usePro();

  // the whole run lives in a module-level store: leaving this page never stops or loses it
  const st = useSyncExternalStore(
    toolSubscribe,
    () => toolGet(tool.id),
    () => EMPTY_TOOL_STATE
  );
  const { outLang, streaming, result, ran, error, errDetail, part, note, modelUsed } = st;
  const [missing, setMissing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // selects show their first option, so that option must also be the real value
  const values: Record<string, string> = { ...defaultsOf(tool), ...st.values };
  const setOutLang = (v: string) => toolPatch(tool.id, { outLang: v });

  const accent = ACCENTS[tool.accent];
  const Icon = tool.icon;
  const isPro = profile?.plan === "pro";
  const locked = false; // v10: every tool is open to free accounts
  const gameHtml =
    tool.kind === "game" && !streaming && result ? extractHtml(result) : null;
  // a finished build opens by itself in a full-screen live preview
  const [autoFull, setAutoFull] = useState<string | null>(null);
  const autoSeen = useRef("");
  useEffect(() => {
    if (gameHtml && gameHtml.length > 1500 && autoSeen.current !== gameHtml) {
      autoSeen.current = gameHtml;
      const id = setTimeout(() => setAutoFull(gameHtml), 300);
      return () => clearTimeout(id);
    }
  }, [gameHtml]);

  const setVal = (k: string, v: string) => {
    setMissing(null);
    toolPatch(tool.id, { values: { ...values, [k]: v } });
  };

  const opts = (): ToolRunOpts => ({
    authFetch,
    toolId: tool.id,
    isGame: tool.kind === "game",
    title: (loc(tool.name, locale) + " · " + (tool.fields.filter((f) => f.required).map((f) => values[f.key]).find(Boolean) ?? "")).slice(0, 80),
    locale,
    applyHeaders,
    save: true,
  });

  const resume = () => void toolResume(tool.id, opts());

  const run = () => {
    const req = tool.fields.find((f) => f.required && !(values[f.key] ?? "").trim());
    if (req) {
      setMissing(req.key);
      return;
    }
    toolPatch(tool.id, { values });
    void toolRun(tool.id, opts());
  };

  const errText: Record<Exclude<ErrKind, null>, string> = {
    quota: t.app.quotaTitle + " — " + t.app.quotaSub,
    nokey: t.app.aiOff,
    busy: t.app.serverBusy,
    generic: t.common.error,
    pro: pro.proOnly,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      {/* header */}
      <div className="mb-7">
        <Link
          href="/app/tools"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 transition hover:text-brand-300"
        >
          <ArrowLeft className={cn("h-4 w-4", dir === "ltr" && "rotate-180")} />
          {t.app.tools}
        </Link>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid h-14 w-14 place-items-center rounded-2xl border",
              accent.chip
            )}
          >
            <Icon className={cn("h-7 w-7", accent.icon)} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
              {loc(tool.name, locale)}
              {tool.pro && (
                <span className="rounded-md bg-gradient-to-b from-gold-200 to-gold-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-[#2a1700]">
                  PRO
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-400">{loc(tool.desc, locale)}</p>
          </div>
        </div>
      </div>

      {locked ? (
        <div className="glass mx-auto max-w-lg rounded-3xl p-8 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-300" />
          <h2 className="text-lg font-black text-white">{pro.toolLockedTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {pro.toolLockedSub}
          </p>
          <Link href="/app/upgrade" className="btn-primary mt-6 px-7 py-3 text-sm">
            {pro.upgrade}
          </Link>
        </div>
      ) : (
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* form */}
        <div className="glass h-fit rounded-3xl p-6">
          <div className="space-y-4.5">
            {tool.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1.5 block text-xs font-black text-slate-300">
                  {loc(f.label, locale)}
                  {f.required && <span className="text-brand-300"> *</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    rows={f.rows ?? 4}
                    dir={f.mono ? "ltr" : undefined}
                    spellCheck={f.mono ? false : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    placeholder={f.placeholder ? loc(f.placeholder, locale) : ""}
                    className={cn(
                      "input-base resize-y",
                      f.mono && "font-mono text-[13px] leading-relaxed",
                      missing === f.key && "border-rose-400/60"
                    )}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={values[f.key] ?? f.options?.[0]?.value ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    className="input-base"
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {loc(o.label, locale)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[f.key] ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    placeholder={f.placeholder ? loc(f.placeholder, locale) : ""}
                    className={cn(
                      "input-base",
                      missing === f.key && "border-rose-400/60"
                    )}
                  />
                )}
                {missing === f.key && (
                  <p className="mt-1 text-xs font-bold text-rose-300">
                    {t.app.required}
                  </p>
                )}
              </div>
            ))}

            {/* output language */}
            <div>
              <label className="mb-1.5 block text-xs font-black text-slate-300">
                {t.app.outputLang}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "auto", label: t.app.outputAuto },
                  { v: "ar", label: t.app.outAr },
                  { v: "dz", label: t.app.outDz },
                  { v: "fr", label: t.app.outFr },
                  { v: "en", label: t.app.outEn },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setOutLang(o.v)}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-[11px] font-bold transition",
                      outLang === o.v
                        ? "border-brand-400/60 bg-brand-500/20 text-[#fff]"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25",
                      o.v === "auto" && "col-span-2"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void run()}
              disabled={streaming}
              className="btn-primary w-full py-3.5"
            >
              {streaming ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PenLine className="h-4.5 w-4.5" />
              )}
              {streaming ? t.common.generating : ran ? t.app.rerun : t.app.run}
            </button>
          </div>
        </div>

        {/* result */}
        <div className="glass-deep min-h-[420px] rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-300">
              <PenLine className="h-4 w-4 text-brand-400" />
              {t.app.result}
              {isPro && modelUsed && !streaming && (
                <span
                  dir="ltr"
                  className="ms-1 inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200"
                >
                  <Zap className="h-3 w-3" />
                  {modelUsed}
                </span>
              )}
            </h3>
            {result && !streaming && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(result).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-brand-400/40 hover:text-white"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? t.common.copied : t.common.copy}
              </button>
            )}
          </div>

          {!ran ? (
            <div className="grid h-[340px] place-items-center text-center">
              <p className="max-w-xs text-sm leading-relaxed text-slate-500">
                {t.app.emptyResult}
              </p>
            </div>
          ) : error ? (
            <div className="grid h-[340px] place-items-center">
              <div className="max-w-sm text-center">
                {error === "quota" ? (
                  <Crown className="mx-auto mb-3 h-7 w-7 text-amber-300" />
                ) : (
                  <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-amber-300" />
                )}
                <p className="text-sm font-bold text-amber-100">
                  {errText[error]}
                </p>
                {errDetail && error !== "quota" && (
                  <p
                    dir="ltr"
                    className="mx-auto mt-2 max-w-sm break-words text-start text-[11px] leading-relaxed text-amber-200/60"
                  >
                    {errDetail}
                  </p>
                )}
                {error === "quota" && (
                  <Link
                    href="/app/upgrade"
                    className="btn-primary mt-5 px-6 py-2.5 text-sm"
                  >
                    {t.app.quotaBtn}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {streaming && !result && (
                <div className="space-y-3">
                  <div className="shimmer-line h-4 w-3/4 rounded-full" />
                  <div className="shimmer-line h-4 w-full rounded-full" />
                  <div className="shimmer-line h-4 w-2/3 rounded-full" />
                  <div className="shimmer-line h-4 w-5/6 rounded-full" />
                </div>
              )}
              {tool.kind === "game" && streaming && result && (
                <div className="flex items-center gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/10 p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-300" />
                  <div>
                    <p className="text-sm font-black text-white">{pro.gameBuilding}</p>
                    <p dir="ltr" className="text-xs tabular-nums text-slate-400">
                      {result.split("\n").length.toLocaleString()} سطر · {result.length.toLocaleString()} chars{part > 1 ? ` · الجزء ${part}` : ""}
                    </p>
                  </div>
                </div>
              )}
              {tool.kind === "game" && !streaming && result && !gameHtml && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
                  <p className="flex-1 text-sm font-bold text-amber-200">
                    {cutOff(result) ? "توقّف الكود قبل نهايته. اضغط لإكمال اللعبة من حيث وصل." : pro.gameNoCode}
                    {note ? ` (${note})` : ""}
                  </p>
                  {cutOff(result) && (
                    <button type="button" onClick={resume} className="btn-primary px-5 py-2.5 text-sm">
                      أكمل اللعبة
                    </button>
                  )}
                </div>
              )}
              {gameHtml && <GamePreview html={gameHtml} className="mb-5" height={520} />}
              {autoFull && <FullPreview html={autoFull} onClose={() => setAutoFull(null)} />}
              {result && !(tool.kind === "game" && streaming) && (
                <>
                  <Markdown pro={isPro} plainCode={streaming}>
                    {result}
                  </Markdown>
                  {streaming && (
                    <span className="mt-1 inline-block h-4 w-2 animate-blink bg-aqua-300" />
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
