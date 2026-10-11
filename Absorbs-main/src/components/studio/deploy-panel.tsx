"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { ZipFile } from "@/lib/zip";

type Provider = "vercel" | "github";
const KEY = (p: Provider) => `barq-deploy-token-${p}`;
const MAX_BYTES = 3_500_000;

const ERR: Record<string, string> = {
  BAD_TOKEN: "المفتاح (Token) غير صحيح أو منتهي.",
  TOKEN_SCOPE: "المفتاح لا يملك صلاحية إنشاء مستودع (repo).",
  REPO_EXISTS: "اسم المستودع مستخدم عندك — اختر اسماً آخر.",
  BAD_REPO_NAME: "اسم المستودع: حروف إنجليزية وأرقام و - _ . فقط.",
  RATE: "تمهّل قليلاً ثم أعد المحاولة.",
  NETWORK: "تعذّر الوصول إلى الخدمة. أعد المحاولة.",
};

export function DeployPanel({ files, title, onClose, onNetlify }: { files: ZipFile[]; title: string; onClose: () => void; onNetlify: () => void }) {
  const { authFetch } = useAuth();
  const [provider, setProvider] = useState<Provider>("vercel");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [name, setName] = useState("barq-project");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    try {
      setToken(localStorage.getItem(KEY(provider)) ?? "");
    } catch {
      setToken("");
    }
    setErr("");
    setUrl("");
  }, [provider]);

  const text = files.filter((f): f is ZipFile & { data: string } => typeof f.data === "string");
  const bytes = text.reduce((n, f) => n + new TextEncoder().encode(f.data).length, 0);
  const tooBig = bytes > MAX_BYTES;

  const run = async () => {
    if (busy || tooBig || token.trim().length < 20) return;
    setBusy(true);
    setErr("");
    setUrl("");
    try {
      const res = await authFetch("/api/deploy", {
        method: "POST",
        body: JSON.stringify({
          provider,
          token: token.trim(),
          name,
          title,
          files: text.map((f) => ({ path: f.path, data: f.data })),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { url?: string; code?: string; detail?: string };
      if (res.ok && out.url) {
        setUrl(out.url);
        try {
          if (remember) localStorage.setItem(KEY(provider), token.trim());
          else localStorage.removeItem(KEY(provider));
        } catch {
          /* storage unavailable */
        }
      } else {
        setErr((out.code && ERR[out.code]) || `فشل النشر${out.detail ? `: ${out.detail}` : "."}`);
      }
    } catch {
      setErr(ERR.NETWORK);
    } finally {
      setBusy(false);
    }
  };

  const tab = (p: Provider, label: string) => (
    <button type="button" role="tab" aria-selected={provider === p} onClick={() => setProvider(p)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", provider === p ? "bg-white text-ink-950" : "text-slate-300 hover:text-white")}>
      {label}
    </button>
  );

  return (
    <div className="absolute inset-x-3 top-14 z-30 rounded-2xl border border-white/10 bg-ink-950/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:end-4 sm:w-80" role="dialog" aria-label="نشر المشروع">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">نشر بنقرة واحدة</p>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div role="tablist" className="mt-2 inline-flex gap-1 rounded-xl bg-white/[0.06] p-1">
        {tab("vercel", "Vercel")}
        {tab("github", "GitHub")}
      </div>

      <div className="mt-3 space-y-2">
        <label className="block text-[11px] text-slate-400">
          {provider === "vercel" ? "Vercel Token (vercel.com/account/tokens)" : "GitHub Token — صلاحية repo (github.com/settings/tokens)"}
          <input type="password" autoComplete="off" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} className="input-base mt-1 !py-1.5 !text-sm" />
        </label>
        <label className="block text-[11px] text-slate-400">
          {provider === "vercel" ? "اسم المشروع" : "اسم المستودع الجديد"}
          <input dir="ltr" value={name} onChange={(e) => setName(e.target.value)} className="input-base mt-1 !py-1.5 !text-sm" />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-white" />
          احفظ المفتاح على هذا الجهاز فقط
        </label>
      </div>

      {tooBig && <p className="mt-2 text-[11px] text-rose-300">المشروع أكبر من 3.5MB — حمّل ZIP وانشره يدوياً.</p>}
      {err && <p className="mt-2 text-[11px] text-rose-300">{err}</p>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 break-all text-xs font-semibold text-emerald-300 underline" dir="ltr">
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          {url}
        </a>
      )}

      <button type="button" onClick={() => void run()} disabled={busy || tooBig || token.trim().length < 20} className="btn-primary mt-3 flex w-full items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "جاري النشر…" : provider === "vercel" ? "انشر على Vercel" : "ادفع إلى GitHub"}
      </button>
      <button type="button" onClick={onNetlify} className="mt-2 w-full text-center text-[11px] text-slate-500 underline hover:text-slate-300">
        بدون مفتاح: حمّل ZIP وافتح Netlify Drop
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-600">يُرسل المفتاح عبر HTTPS لتنفيذ هذه العملية فقط ولا يُخزَّن على خوادم Nexus AI v8.4.</p>
    </div>
  );
}
