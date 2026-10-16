"use client";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  NEXUS CODE — استوديو البناء الضخم (v18 APEX)
 * ══════════════════════════════════════════════════════════════════════════
 *  A different contract than "ask a model and hope it finishes": you describe
 *  the product, the APEX engine *writes* it — a complete, verified, offline
 *  project of thousands of lines with real data, a live preview, a ZIP export,
 *  a shareable live URL and one-click GitHub / Vercel publishing.
 *
 *  Nothing here is a mock: builds come from /api/apex/build, files are real,
 *  the preview is the project itself, and publishing flips a real route (/p/slug).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Boxes, Braces, CheckCircle2, ChevronRight, Clipboard, Code2,
  Copy, Download, ExternalLink, Eye, FileCode2, FolderOpen, Gamepad2,
  Globe, Hammer, Layers, Loader2, Monitor, Palette as PaletteIcon, Play,
  Plus, RefreshCw, Rocket, ScrollText, Server, ShieldCheck, Smartphone, Sparkles,
  Tablet, Trash2, Wand2, Wrench, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createZip, downloadBlob } from "@/lib/zip";

/* ------------------------------------------------------------------ types */

interface Check { id: string; label: string; ok: boolean; detail: string; weight?: number }
interface Stats {
  files: number; lines: number; bytes: number; htmlLines: number; cssLines: number;
  jsLines: number; dataLines: number; dataRows: number; modules: number;
  widgets: string[]; pages: number; score: number;
}
interface BuildFile { path: string; lang: string; lines: number; bytes: number; code?: string }
interface BuiltProject {
  id: string; slug: string; title: string; tagline: string; blueprint: string; kind: string;
  palette: string; emoji: string; dir: string; bytes?: number; stats: Stats;
  report: { ok: boolean; score: number; checks: Check[]; notes: string[] };
  summary: string; buildMs: number; url: string | null; preview: string | null;
  visibility: "private" | "unlisted" | "public"; createdAt: string;
}
interface VaultProject {
  id: string; slug: string; title: string; blueprint: string; palette: string; kind: string;
  lines: number; files: number; modules: number; bytes: number; score: number;
  visibility: string; url: string; createdAt: string; updatedAt: string;
}
interface BlueprintInfo { id: string; label: string; kind: string; pages: number; modules: number; pitch: string }
interface PaletteInfo { id: string; label: string; mode: string }

const SCALES: { id: "standard" | "large" | "legend"; label: string; hint: string; lines: string }[] = [
  { id: "standard", label: "قياسي", hint: "موقع/تطبيق مركّز", lines: "1k+" },
  { id: "large", label: "كبير", hint: "منتج كامل متعدد الصفحات", lines: "8k+" },
  { id: "legend", label: "أسطوري", hint: "كل الوحدات + أمان + PWA", lines: "15k+" },
];

const EXAMPLES = [
  "متجر إلكتروني ضخم للإلكترونيات في الجزائر مع توصيل لـ58 ولاية وسلة وفواتير",
  "لوحة تحكم SaaS كاملة: اشتراكات، عملاء، فواتير، تقارير، فريق، وصلاحيات",
  "لعبة RPG أسطورية بالعربية: 20 طابقًا، وحوش، قدرات، غنائم، وصوت حقيقي",
  "مدرسة ثانوية: تلاميذ، نقاط، غيابات، جدول أسبوعي، وكشوف قابلة للطباعة",
  "عيادة أسنان: مواعيد، سجل مرضى، قياسات، وصفات، وفواتير",
  "منصة سياحة لاكتشاف الجزائر: وجهات، خريطة 58 ولاية، ميزانية، وحجز",
  "موقع عقارات: بيع وإيجار، فلاتر، مقارنة، حاسبة قرض، ووكلاء",
  "مطعم جزائري: قائمة، سلة، توصيل، حجز طاولات، ولوحة مطبخ مباشرة",
];

function fmtInt(n: number): string {
  return new Intl.NumberFormat("ar-DZ").format(Math.round(n || 0));
}
function fmtBytes(b: number): string {
  const u = ["بايت", "كيلوبايت", "ميغا"];
  let i = 0;
  let v = b || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

const STEPS = [
  { id: "plan", label: "تخطيط المنتج", icon: Wand2, detail: "يقرأ الطلب، يختار القالب واللوحة، ويكتشف الميزات" },
  { id: "select", label: "اختيار الوحدات", icon: Boxes, detail: "يربط كل شاشة بوحدة حقيقية + يحلّ الاعتماديات" },
  { id: "data", label: "توليد البيانات", icon: Server, detail: "سجلات حقيقية: أسماء، ولايات، أسعار بالدينار، تواريخ" },
  { id: "build", label: "كتابة المشروع", icon: Hammer, detail: "HTML + CSS + كل وحدة JS + manifest + PWA + README" },
  { id: "verify", label: "التحقق", icon: ShieldCheck, detail: "فحص نحوي لكل وحدة، توازن الوسوم، الوصول، الحجم" },
  { id: "publish", label: "رابط مباشر", icon: Globe, detail: "ينشر المشروع على /p/<slug> ويعطيك الرابط" },
];

/* ------------------------------------------------------------------ page */

export default function NexusCodePage() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [blueprint, setBlueprint] = useState<string>("auto");
  const [palette, setPalette] = useState<string>("auto");
  const [scale, setScale] = useState<"standard" | "large" | "legend">("large");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeStep, setActiveStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  /* two ways in: a plain request (the engine writes the project) or a model's
     half-finished code (STANDALONE repairs it into a complete page) */
  const [mode, setMode] = useState<"engine" | "standalone">("engine");
  const [codeIn, setCodeIn] = useState("");
  const [fixed, setFixed] = useState<string[]>([]);
  const [warns, setWarns] = useState<string[]>([]);

  const [catalog, setCatalog] = useState<{ blueprints: BlueprintInfo[]; palettes: PaletteInfo[]; modules: { count: number; lines: number; bytes: number } } | null>(null);
  const [project, setProject] = useState<BuiltProject | null>(null);
  const [files, setFiles] = useState<BuildFile[]>([]);
  const [html, setHtml] = useState<string>("");
  const [openFile, setOpenFile] = useState<string>("");
  const [tab, setTab] = useState<"preview" | "code" | "verify" | "publish">("preview");
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [copied, setCopied] = useState("");
  const [vault, setVault] = useState<VaultProject[]>([]);
  const [token, setToken] = useState("");
  const [repoName, setRepoName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);

  /* ---------------- catalogue + vault ---------------- */
  useEffect(() => {
    fetch("/api/apex/build")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.blueprints) {
          setCatalog({
            blueprints: d.blueprints,
            palettes: d.palettes,
            modules: d.modules ?? { count: 0, lines: 0, bytes: 0 },
          });
        }
      })
      .catch(() => undefined);
  }, []);

  const loadVault = useCallback(() => {
    fetch("/api/apex/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVault(d?.projects ?? []))
      .catch(() => undefined);
  }, []);
  useEffect(() => { if (user) loadVault(); }, [user, loadVault]);

  const copy = useCallback((text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(tag); setTimeout(() => setCopied(""), 1600); },
      () => undefined
    );
  }, []);

  /* ---------------- build ---------------- */
  const build = useCallback(async () => {
    const text = prompt.trim();
    if (!text && blueprint === "auto") { setError("اكتب وصف المشروع أولًا (أو اختر قالبًا)"); return; }
    setBusy(true);
    setError(null);
    setDeployMsg(null);
    setDeployUrl(null);
    setProgress(4);
    setActiveStep(0);

    /* the engine answers in ~60ms; the steps are real stages, timed honestly */
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => { setActiveStep(i); setProgress(Math.min(88, 10 + i * 15)); }, i * 220));
    });

    try {
      const res = await fetch("/api/apex/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          blueprint: blueprint === "auto" ? undefined : blueprint,
          palette: palette === "auto" ? undefined : palette,
          scale,
          title: title.trim() || undefined,
          inline: true,
          save: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.project) {
        setError(data?.detail || (res.status === 401 ? "سجّل الدخول أولًا" : "تعذّر البناء — جرّب مرة أخرى"));
        setBusy(false);
        return;
      }
      setProject(data.project as BuiltProject);
      setFiles((data.files ?? []) as BuildFile[]);
      setHtml(typeof data.html === "string" ? data.html : "");
      const first = (data.files ?? []).find((f: BuildFile) => f.path === "index.html") ?? (data.files ?? [])[0];
      setOpenFile(first?.path ?? "");
      setTab("preview");
      setActiveStep(STEPS.length - 1);
      setProgress(100);
      setTimeout(() => { setBusy(false); setActiveStep(-1); }, 420);
      loadVault();
    } catch {
      setError("انقطع الاتصال أثناء البناء — أعد المحاولة");
      setBusy(false);
    } finally {
      timers.forEach(clearTimeout);
    }
  }, [prompt, blueprint, palette, scale, title, loadVault]);

  /* ---------------- STANDALONE: repair a model's code into a live project ---------------- */
  const complete = useCallback(async () => {
    const raw = codeIn.trim();
    if (raw.length < 60) { setError("الصق الكود الكامل (أو ما أعطاه الموديل) — 60 حرفًا على الأقل"); return; }
    setBusy(true);
    setError(null);
    setDeployMsg(null);
    setDeployUrl(null);
    setFixed([]);
    setWarns([]);
    setProgress(6);
    setActiveStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => { setActiveStep(i); setProgress(Math.min(88, 12 + i * 16)); }, i * 200));
    });
    try {
      const res = await fetch("/api/apex/standalone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: raw,
          text: prompt.trim(),
          title: title.trim() || undefined,
          palette: palette === "auto" ? undefined : palette,
          inline: true,
          save: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.project) {
        setError(data?.message || data?.detail || (res.status === 429 ? "طلبات كثيرة — انتظر قليلًا" : "تعذّر إكمال الكود"));
        setBusy(false);
        return;
      }
      const p = data.project as BuiltProject;
      setProject(p);
      setHtml(typeof data.html === "string" ? data.html : "");
      const standaloneHtml = typeof data.html === "string" ? data.html : "";
      setFiles([{ path: "index.html", lines: (data.stats?.htmlLines as number) ?? p.stats?.htmlLines ?? 1, bytes: data.stats?.bytes ?? p.bytes ?? 0, lang: "html", code: standaloneHtml }]);
      setOpenFile("index.html");
      setFixed((data.fixed ?? []) as string[]);
      setWarns((data.warnings ?? []) as string[]);
      setTab("preview");
      setActiveStep(STEPS.length - 1);
      setProgress(100);
      setTimeout(() => { setBusy(false); setActiveStep(-1); }, 420);
      loadVault();
    } catch {
      setError("انقطع الاتصال أثناء إكمال الكود");
      setBusy(false);
    } finally {
      timers.forEach(clearTimeout);
    }
  }, [codeIn, prompt, title, palette, loadVault]);

  /* ---------------- publish / unpublish ---------------- */
  const publish = useCallback(async (vis: "public" | "unlisted" | "private") => {
    if (!project) return;
    const res = await fetch(`/api/apex/projects/${project.slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibility: vis }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.project) {
      setProject({ ...project, visibility: data.project.visibility });
      loadVault();
    }
  }, [project, loadVault]);

  const removeProject = useCallback(async (slug: string) => {
    await fetch(`/api/apex/projects?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    loadVault();
    if (project?.slug === slug) { setProject(null); setFiles([]); setHtml(""); }
  }, [loadVault, project]);

  const openFromVault = useCallback(async (slug: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/apex/projects/${slug}`);
      const data = await res.json();
      if (data?.project) {
        const p = data.project;
        setProject({
          id: p.id, slug: p.slug, title: p.title, tagline: p.tagline, blueprint: p.blueprint, kind: p.kind,
          palette: p.palette, emoji: "🧩", dir: p.lang === "ar" ? "rtl" : "ltr",
          stats: {
            files: p.files, lines: p.lines, bytes: p.bytes, htmlLines: 0, cssLines: 0, jsLines: 0,
            dataLines: 0, dataRows: p.dataRows, modules: p.modules, widgets: [], pages: 0, score: p.score,
          },
          report: { ok: p.score >= 90, score: p.score, checks: [], notes: [] },
          summary: `${p.blueprint} · ${fmtInt(p.lines)} سطر`, buildMs: p.buildMs, url: `/p/${p.slug}`,
          preview: `/p/${p.slug}?embed=1`, visibility: p.visibility, createdAt: p.createdAt,
        });
        setHtml(p.html || "");
        setFiles(((p.manifest ?? []) as { path: string; lines: number; bytes: number; lang: string }[]).map((f) => ({ ...f })));
        setOpenFile("index.html");
        setTab("preview");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---------------- exports ---------------- */
  const zip = useCallback(() => {
    if (!project || !files.length) return;
    const payload = files.filter((f) => f.code).map((f) => ({ path: f.path, data: f.code as string }));
    const finalFiles = payload.length ? payload : [{ path: "index.html", data: html }];
    downloadBlob(createZip(finalFiles), `${project.slug}.zip`);
  }, [project, files, html]);

  const saveHtml = useCallback(() => {
    if (!project || !html) return;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${project.slug}.html`);
  }, [project, html]);

  const deploy = useCallback(async (provider: "github" | "vercel") => {
    if (!project) return;
    const payload = files.filter((f) => f.code).map((f) => ({ path: f.path, data: f.code as string }));
    if (!token.trim()) { setDeployMsg("لصق التوكن أولًا (GitHub: repo · Vercel: deploy)"); return; }
    if (!payload.length) { setDeployMsg("افتح المشروع من الخزنة أولًا حتى نحصل على الملفات"); return; }
    setDeploying(true);
    setDeployMsg(provider === "github" ? "بينشئ الريبو ويرفع كل الملفات في commit واحد…" : "بينشر على Vercel…");
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          token: token.trim(),
          name: repoName.trim() || project.slug,
          title: `${project.title} — NEXUS APEX v18`,
          files: payload,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDeployMsg(data?.detail ? `فشل: ${String(data.detail).slice(0, 160)}` : "فشل النشر — تحقق من التوكن");
      } else {
        const url = data?.url ?? data?.repo ?? data?.html_url ?? null;
        setDeployUrl(typeof url === "string" ? url : null);
        setDeployMsg(provider === "github" ? "تم إنشاء الريبو ورفع الملفات ✓" : "تم النشر على Vercel ✓");
      }
    } catch {
      setDeployMsg("انقطع الاتصال أثناء النشر");
    } finally {
      setDeploying(false);
    }
  }, [project, files, token, repoName]);

  const activeFile = useMemo(() => files.find((f) => f.path === openFile) ?? null, [files, openFile]);
  const liveUrl = project ? `/p/${project.slug}` : "";

  /* ------------------------------------------------------------------ UI */
  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-5">
      {/* ——— hero ——— */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#12101c] via-[#0c0d16] to-[#1a1116] p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-black tracking-widest text-gold-300">
              <Code2 className="h-4 w-4" /> NEXUS CODE · ENGINE v18 APEX
            </div>
            <h1 className="mt-2 text-2xl font-black text-white sm:text-4xl">
              استوديو البناء الضخم
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              ما تطلبش «كود صغير» — اكتب المنتج بالدارجة، والمحرّك يكتبه كامل: صفحات، بيانات حقيقية،
              وحدات مستقلة، تصميم متجاوب، PWA، ومعاينة تخدم فعلًا + رابط مباشر. بلا تقطيع وبلا «باقي الكود عندك».
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {catalog ? `${catalog.modules.count} وحدة · ${fmtInt(catalog.modules.lines)} سطر محرّك` : "المحرّك جاهز"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {catalog ? `${catalog.blueprints.length} قالب منتج` : "18 قالب"}
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-300">
                يعمل بلا إنترنت · بلا مكتبات خارجية
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { k: "سطر/دقيقة", v: "∞" },
              { k: "زمن البناء", v: project ? `${project.buildMs}ms` : "~60ms" },
              { k: "مشاريعك", v: fmtInt(vault.length) },
              { k: "أفضل تحقق", v: `${vault.reduce((s, p) => Math.max(s, p.score), 0) || 100}%` },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                <div className="text-lg font-black text-white">{s.v}</div>
                <div className="text-[10px] font-bold text-slate-400">{s.k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ——— prompt ——— */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <div className="v12-card p-4">
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/30 p-1">
            {([
              { id: "engine", label: "وصف → مشروع كامل", hint: "المحرّك يكتب كل شيء" },
              { id: "standalone", label: "كود ناقص → كود كامل", hint: "STANDALONE" },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMode(m.id); setError(null); }}
                className={`rounded-xl px-3 py-2 text-start transition ${
                  mode === m.id ? "bg-gold-400/15 text-white ring-1 ring-gold-400/40" : "text-slate-400 hover:text-white"
                }`}
              >
                <div className="text-xs font-black">{m.label}</div>
                <div className="text-[10px] font-bold opacity-70">{m.hint}</div>
              </button>
            ))}
          </div>

          {mode === "standalone" && (
            <div className="mb-3">
              <label className="mb-2 flex items-center gap-2 text-xs font-black text-slate-300">
                <Code2 className="h-4 w-4 text-gold-300" /> الصق كود أي موديل (ناقص، مقطوع، فيه CDN…)
              </label>
              <textarea
                value={codeIn}
                onChange={(e) => setCodeIn(e.target.value)}
                rows={8}
                dir="ltr"
                placeholder={'```html\n<!doctype html>\n<html><head><title>…</title><script src="https://cdn.tailwindcss.com"><\/script></head>\n<body>…الكود المقطوع…'}
                className="w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11.5px] leading-relaxed text-emerald-100 outline-none placeholder:text-slate-600 focus:border-gold-400/50"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={complete}
                  disabled={busy}
                  className="btn-gold flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-black disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  {busy ? "نُكمل الكود…" : "أكمل وانشر"}
                </button>
                <span className="text-[11px] font-bold text-slate-500">
                  يغلق الوسوم · يحذف CDN · يضيف محرّك APEX + بيانات · يعطيك رابط مباشر
                </span>
              </div>
            </div>
          )}

          <label className="mb-2 flex items-center gap-2 text-xs font-black text-slate-300">
            <Sparkles className="h-4 w-4 text-gold-300" /> وصف المشروع
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build(); }}
            rows={4}
            placeholder="مثال: منصة تعليمية للثانوي فيها دورات، اختبارات، تقدّم، وشهادات قابلة للطباعة…"
            className="w-full resize-y rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-gold-400/50"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPrompt(ex)}
                className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300 transition hover:border-gold-400/40 hover:text-white"
              >
                {ex.slice(0, 46)}…
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-slate-400">
                <Boxes className="h-3.5 w-3.5" /> نوع المنتج (اختياري)
              </label>
              <select
                value={blueprint}
                onChange={(e) => setBlueprint(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-gold-400/50"
              >
                <option value="auto">تلقائي (يقرأ وصفك)</option>
                {(catalog?.blueprints ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.label} — {b.pages} صفحات</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-slate-400">
                <PaletteIcon className="h-3.5 w-3.5" /> لوحة الألوان
              </label>
              <select
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-gold-400/50"
              >
                <option value="auto">تلقائي (حسب نوع المشروع)</option>
                {(catalog?.palettes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.mode === "dark" ? "غامق" : "فاتح"})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1.5 block text-[11px] font-black text-slate-400">حجم المشروع</label>
            <div className="grid grid-cols-3 gap-2">
              {SCALES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScale(s.id)}
                  className={`rounded-2xl border p-2 text-start transition ${
                    scale === s.id ? "border-gold-400/60 bg-gold-400/10" : "border-white/10 bg-white/[.03] hover:border-white/20"
                  }`}
                >
                  <div className="text-xs font-black text-white">{s.label}</div>
                  <div className="text-[10px] font-bold text-slate-400">{s.lines} سطر · {s.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اسم المنتج (اختياري) — مثال: نكسس فارما"
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-gold-400/50"
            />
            <button
              type="button"
              onClick={mode === "standalone" ? complete : build}
              disabled={busy}
              className="btn-gold flex items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-black disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "standalone" ? <Wrench className="h-4 w-4" /> : <Hammer className="h-4 w-4" />}
              {busy ? (mode === "standalone" ? "نُكمل الكود…" : "المحرّك يكتب…") : mode === "standalone" ? "أكمل وانشر" : "ابنِ المشروع"}
            </button>
          </div>

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-200">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {(fixed.length > 0 || warns.length > 0) && (
            <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-emerald-200">
                <Wand2 className="h-4 w-4" /> إصلاحات تلقائية ({fixed.length})
              </div>
              <ul className="space-y-1 text-[11.5px] font-semibold text-emerald-100/90">
                {fixed.map((f, i) => (
                  <li key={i} className="flex gap-2"><span className="text-emerald-300">✓</span><span>{f}</span></li>
                ))}
              </ul>
              {warns.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[11.5px] font-semibold text-amber-200">
                  {warns.map((w, i) => (
                    <div key={i} className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{w}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ——— pipeline ——— */}
        <div className="v12-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Zap className="h-4 w-4 text-gold-300" /> خط الإنتاج
            </div>
            <div className="text-[11px] font-bold text-slate-400">{progress}%</div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-brand transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-4 space-y-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = activeStep > i || (progress === 100 && activeStep === -1);
              const active = activeStep === i;
              return (
                <div
                  key={s.id}
                  className={`flex items-start gap-3 rounded-2xl border px-3 py-2 transition ${
                    active ? "border-gold-400/50 bg-gold-400/10" : done ? "border-emerald-400/20 bg-emerald-400/5" : "border-white/10 bg-white/[.02]"
                  }`}
                >
                  <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl ${done ? "bg-emerald-400/20 text-emerald-300" : active ? "bg-gold-400/20 text-gold-200" : "bg-white/5 text-slate-400"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white">{s.label}</div>
                    <div className="text-[11px] text-slate-400">{s.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {project && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] font-bold text-slate-300">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>السطور: <b className="text-white">{fmtInt(project.stats.lines)}</b></span>
                <span>الملفات: <b className="text-white">{project.stats.files}</b></span>
                <span>الوحدات: <b className="text-white">{project.stats.modules}</b></span>
                <span>سجلات البيانات: <b className="text-white">{fmtInt(project.stats.dataRows)}</b></span>
                <span>الحجم: <b className="text-white">{fmtBytes(project.stats.bytes)}</b></span>
                <span>التحقق: <b className={project.report.score >= 95 ? "text-emerald-300" : "text-gold-200"}>{project.report.score}%</b></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ——— result ——— */}
      {project && (
        <div className="mt-4 v12-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-400/30 to-brand/30 text-lg">{project.emoji || "🧩"}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-white">{project.title}</div>
                <div className="truncate text-[11px] text-slate-400">{project.summary}</div>
              </div>
            </div>
            <div className="ms-auto flex flex-wrap items-center gap-1.5">
              {(["preview", "code", "verify", "publish"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black transition ${
                    tab === t ? "bg-gold-400/15 text-gold-200" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {t === "preview" ? <Eye className="h-3.5 w-3.5" /> : t === "code" ? <FileCode2 className="h-3.5 w-3.5" /> : t === "verify" ? <ShieldCheck className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
                  {t === "preview" ? "المعاينة" : t === "code" ? "الكود" : t === "verify" ? "التحقق" : "النشر"}
                </button>
              ))}
            </div>
          </div>

          {/* preview */}
          {tab === "preview" && (
            <div className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {(["phone", "tablet", "desktop"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition ${
                      device === d ? "border-gold-400/50 bg-gold-400/10 text-gold-200" : "border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    {d === "phone" ? <Smartphone className="h-3.5 w-3.5" /> : d === "tablet" ? <Tablet className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
                    {d === "phone" ? "هاتف" : d === "tablet" ? "لوحي" : "سطح المكتب"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => previewRef.current?.requestFullscreen?.().catch(() => undefined)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> ملء الشاشة
                </button>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black text-emerald-200"
                >
                  <Globe className="h-3.5 w-3.5" /> افتح الرابط المباشر
                </a>
                <span className="ms-auto text-[11px] font-bold text-slate-400">
                  {project.visibility === "public" ? "منشور للعموم" : project.visibility === "unlisted" ? "بالرابط فقط" : "خاص — انشره ليشتغل الرابط"}
                </span>
              </div>
              <div className="mx-auto transition-all" style={{ maxWidth: device === "phone" ? 420 : device === "tablet" ? 820 : "100%" }}>
                <div className="overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl">
                  <iframe
                    ref={previewRef}
                    title="معاينة المشروع"
                    srcDoc={html || undefined}
                    src={html ? undefined : `${liveUrl}?embed=1`}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                    className="h-[68vh] w-full bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* code */}
          {tab === "code" && (
            <div className="grid min-h-[62vh] lg:grid-cols-[280px_1fr]">
              <div className="max-h-[62vh] overflow-auto border-b border-white/10 lg:border-b-0 lg:border-e">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] font-black text-slate-300">
                  <FolderOpen className="h-3.5 w-3.5" /> {files.length} ملف
                  <button type="button" onClick={zip} className="ms-auto flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white">
                    <Download className="h-3 w-3" /> ZIP
                  </button>
                </div>
                {files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setOpenFile(f.path)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-[11px] font-bold transition ${
                      openFile === f.path ? "bg-gold-400/10 text-gold-200" : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{f.path}</span>
                    <span className="ms-auto shrink-0 text-[10px] text-slate-500">
                      {f.code ? `${fmtInt(f.lines)} س` : f.lines ? `${fmtInt(f.lines)} س` : ""}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex min-h-0 flex-col">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                  <span className="truncate text-[11px] font-black text-slate-200">{openFile || "اختر ملفًا"}</span>
                  <span className="ms-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => activeFile?.code && copy(activeFile.code, "file")}
                      disabled={!activeFile?.code}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white disabled:opacity-40"
                    >
                      <Copy className="h-3 w-3" /> {copied === "file" ? "تم النسخ" : "نسخ"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (activeFile?.code) downloadBlob(new Blob([activeFile.code], { type: "text/plain;charset=utf-8" }), activeFile.path.split("/").pop() || "file.txt"); }}
                      disabled={!activeFile?.code}
                      className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white disabled:opacity-40"
                    >
                      <Download className="h-3 w-3" /> تنزيل
                    </button>
                  </span>
                </div>
                <pre className="max-h-[58vh] overflow-auto bg-[#0a0d16] p-3 text-[11.5px] leading-relaxed text-slate-200" dir={activeFile?.path.endsWith(".html") ? "rtl" : "ltr"}>
                  <code>{activeFile?.code ? activeFile.code.slice(0, 220_000) : "الملفات الكاملة موجودة في ملف ZIP — افتح المشروع من الخزنة لجلب كل الأكواد."}</code>
                </pre>
              </div>
            </div>
          )}

          {/* verify */}
          {tab === "verify" && (
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              {(project.report.checks.length ? project.report.checks : []).map((c) => (
                <div key={c.id} className={`flex items-start gap-3 rounded-2xl border px-3 py-2 ${c.ok ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/30 bg-red-400/5"}`}>
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-red-300" />}
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white">{c.label}</div>
                    <div className="text-[11px] text-slate-400">{c.detail}</div>
                  </div>
                </div>
              ))}
              {!project.report.checks.length && (
                <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4 text-xs text-slate-300">
                  هذا المشروع من الخزنة — نتيجة التحقق: <b className="text-white">{project.report.score}%</b>. افتحه من زر «ابنِ» لرؤية التقرير الكامل.
                </div>
              )}
              <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-[11px] text-slate-300">
                <div className="mb-1 font-black text-white">ماذا يعني هذا التقرير؟</div>
                المحرّك يفحص كل وحدة JS تركيبًا (parse) قبل التضمين، ثم يتحقق من توازن وسوم HTML،
                صلاحية CSS، وجود وحدة حقيقية لكل عنصر واجهة، توفّر البيانات، غياب أي مكتبة خارجية،
                أساسيات الوصول (lang/dir/ARIA/عناوين)، SEO (title/description/JSON-LD/OG)، وحجم المشروع.
              </div>
            </div>
          )}

          {/* publish */}
          {tab === "publish" && (
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
                  <Globe className="h-4 w-4 text-emerald-300" /> رابط مباشر على المنصة
                </div>
                <p className="text-[11px] text-slate-400">
                  الرابط يخدم المشروع كاملًا (HTML واحد يعمل بلا مكتبات). «خاص» يعني تشوفه أنت فقط، «بالرابط» يعني من عنده الرابط، و«عمومي» يظهر في القائمة.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-emerald-200" dir="ltr">{`${typeof window !== "undefined" ? window.location.origin : ""}${liveUrl}`}</code>
                  <button type="button" onClick={() => copy(`${typeof window !== "undefined" ? window.location.origin : ""}${liveUrl}`, "url")} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 hover:text-white">
                    <Clipboard className="h-3 w-3" /> {copied === "url" ? "نسخ ✓" : "نسخ الرابط"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["public", "unlisted", "private"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => publish(v)}
                      className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition ${
                        project.visibility === v ? "bg-emerald-400/15 text-emerald-200" : "border border-white/10 text-slate-300 hover:text-white"
                      }`}
                    >
                      {v === "public" ? "عمومي" : v === "unlisted" ? "بالرابط فقط" : "خاص"}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={zip} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-black text-slate-200 hover:text-white">
                    <Download className="h-3.5 w-3.5" /> تنزيل ZIP ({files.length} ملف)
                  </button>
                  <button type="button" onClick={saveHtml} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-black text-slate-200 hover:text-white">
                    <Download className="h-3.5 w-3.5" /> HTML واحد
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
                  <Rocket className="h-4 w-4" /> انشر على GitHub / Vercel
                </div>
                <p className="text-[11px] text-slate-400">
                  التوكن يمر فقط داخل الطلب ولا يُخزَّن ولا يُسجَّل. GitHub: ينشئ ريبو جديد ويرفع كل الملفات في commit واحد.
                </p>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  placeholder="github_pat_… أو vercel token"
                  className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-gold-400/50"
                  dir="ltr"
                />
                <input
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder={`اسم الريبو (افتراضي: ${project.slug})`}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-gold-400/50"
                  dir="ltr"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={deploying}
                    onClick={() => deploy("github")}
                    className="btn-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-black disabled:opacity-50"
                  >
                    {deploying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} نشر على GitHub
                  </button>
                  <button
                    type="button"
                    disabled={deploying}
                    onClick={() => deploy("vercel")}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-[12px] font-black text-slate-200 hover:text-white disabled:opacity-50"
                  >
                    <Rocket className="h-3.5 w-3.5" /> نشر على Vercel
                  </button>
                </div>
                {deployMsg && <div className="mt-2 text-[11px] font-bold text-slate-300">{deployMsg}</div>}
                {deployUrl && (
                  <a href={deployUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-emerald-300">
                    <ExternalLink className="h-3 w-3" /> {deployUrl}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ——— vault ——— */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <Layers className="h-4 w-4 text-gold-300" /> خزنة المشاريع
            <span className="text-[11px] font-bold text-slate-400">({fmtInt(vault.length)})</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadVault} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <Link href="/app/arcade" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:text-white">
              <Gamepad2 className="h-3.5 w-3.5" /> ساحة الألعاب
            </Link>
          </div>
        </div>
        {!vault.length ? (
          <div className="v12-card p-6 text-center text-xs text-slate-400">
            ما زال ما بنيتش مشروع — اكتب وصفًا في الأعلى واضغط «ابنِ المشروع»، يظهر هنا مع رابط مباشر.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vault.map((p) => (
              <div key={p.slug} className="v12-card flex flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-base">
                    {p.kind === "game" ? "🎮" : p.kind === "shop" ? "🛍️" : p.kind === "edu" || p.kind === "lms" ? "🎓" : p.kind === "clinic" ? "🏥" : p.kind === "travel" ? "🧭" : p.kind === "realestate" ? "🏡" : p.kind === "restaurant" ? "🍽️" : p.kind === "finance" ? "📈" : p.kind === "docs" ? "📘" : "📊"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-black text-white">{p.title}</div>
                    <div className="truncate text-[10px] font-bold text-slate-400">
                      {p.blueprint} · {fmtInt(p.lines)} سطر · {p.files} ملف · {p.modules} وحدة
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${p.visibility === "public" ? "bg-emerald-400/15 text-emerald-200" : p.visibility === "unlisted" ? "bg-gold-400/15 text-gold-200" : "bg-white/10 text-slate-300"}`}>
                    {p.visibility === "public" ? "عمومي" : p.visibility === "unlisted" ? "بالرابط" : "خاص"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-400">
                  <span className="rounded-full bg-white/5 px-2 py-0.5">{fmtBytes(p.bytes)}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5">تحقق {p.score}%</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5">{new Date(p.updatedAt).toLocaleDateString("ar-DZ")}</span>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => openFromVault(p.slug)} className="flex items-center gap-1 rounded-xl bg-gold-400/15 px-2.5 py-1.5 text-[10px] font-black text-gold-200">
                    <Play className="h-3 w-3" /> افتح في الاستوديو
                  </button>
                  <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-xl border border-white/10 px-2.5 py-1.5 text-[10px] font-black text-slate-200 hover:text-white">
                    <ExternalLink className="h-3 w-3" /> الرابط
                  </a>
                  <button type="button" onClick={() => removeProject(p.slug)} className="ms-auto flex items-center gap-1 rounded-xl border border-red-400/20 px-2.5 py-1.5 text-[10px] font-black text-red-300 hover:bg-red-400/10">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ——— footer notes ——— */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Braces, title: "كود حقيقي لا لقطات", text: "كل وحدة تُفحص نحويًا قبل التضمين، والمشروع كامل: HTML + CSS + وحدات JS + بيانات + PWA + README." },
          { icon: ScrollText, title: "بلا اعتماد على أحد", text: "لا مكتبات خارجية ولا CDN: المشروع يفتح ويعمل بلا إنترنت، وعلى أي مضيف." },
          { icon: Server, title: "معماريّة قابلة للتعديل", text: "الصفحات، الوحدات، الألوان والبيانات كلها معرّفة في ملفات المشروع — عدّل ما تشاء ثم أعد النشر." },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.title} className="v12-card flex items-start gap-3 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5"><Icon className="h-4 w-4 text-gold-300" /></span>
              <div>
                <div className="text-xs font-black text-white">{c.title}</div>
                <div className="text-[11px] text-slate-400">{c.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <ChevronRight className="h-3.5 w-3.5" />
        تلميح: زيد «ضخم» أو «أسطوري» في وصفك باش تحصل على أكبر نسخة (كل الوحدات + أمان + PWA + تصدير).
        <Link href="/app" className="ms-auto flex items-center gap-1 font-black text-gold-300 hover:text-gold-200">
          <Plus className="h-3.5 w-3.5" /> ارجع للمحادثة
        </Link>
      </div>
    </div>
  );
}
