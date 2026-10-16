"use client";

/**
 * NEXUS CODE — ورشة FORGE v19
 * ---------------------------------------------------------------------------
 * Claude-Code-style workspace: describe the project → watch a team of models
 * write it in parallel, module by module → inspect every file → run the live
 * preview → publish it to a permanent public link.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Anvil,
  Boxes,
  Check,
  Code2,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Flame,
  FolderTree,
  Gauge,
  Globe2,
  Hammer,
  Layers,
  Link2,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { FORGE_KINDS, SCALES, SCALE_META, type ForgeKind, type ForgeScale } from "@/lib/forge/types";
import {
  applyEvent,
  clearForgeSession,
  formatBytes,
  formatMs,
  initialForgeUi,
  loadForgeSession,
  makeForgeParser,
  modelTotals,
  saveForgeSession,
  KIND_AR,
  ROLE_AR,
  SCALE_AR,
  type ForgeUi,
} from "@/lib/forge/client";
import { cn } from "@/lib/utils";

type Tab = "preview" | "files" | "qa" | "report";
type Device = "phone" | "tablet" | "full";
type Engine = { key: string; label: string; roles: string[] };
type Site = { slug: string; title: string; kind: string; bytes: number; lines: number; views: number; createdAt: string; visibility: string };

const STARTERS: { label: string; icon: typeof Flame; prompt: string; kind: ForgeKind; scale: ForgeScale }[] = [
  { label: "لعبة تيتان", icon: Flame, kind: "game", scale: "titan", prompt: "صايب لي لعبة مغامرات ضخمة في الصحراء الجزائرية: بطل يتسلق الكثبان ويجمع الماء، أعداء متعددون، 3 وحوش كبار، متجر، مستويات، حفظ، موسيقى وأصوات، وتحكم باللمس والكيبورد. تصميم حديث وجميل." },
  { label: "متجر كامل", icon: Boxes, kind: "site", scale: "titan", prompt: "موقع متجر إلكتروني جزائري كامل بالعربية: واجهة أنيقة، كتالوج 60 منتجا مع صور، بحث وفلاتر، سلة وشراء، حساب المستخدم، عروض، تقييمات، وأسئلة شائعة. تصميم عصري مع حركات." },
  { label: "نظام + قاعدة بيانات", icon: Layers, kind: "system", scale: "titan", prompt: "نظام إدارة مخزون وفواتير لشركة جزائرية بالعربية: لوحة تحكم بإحصائيات ورسوم بيانية، قاعدة بيانات محلية IndexedDB مع 300 سجل، إضافة/تعديل/حذف، بحث وفلاتر وترقيم صفحات، فواتير قابلة للطباعة، وتصدير JSON/CSV." },
  { label: "تطبيق ويب", icon: Wand2, kind: "app", scale: "big", prompt: "تطبيق ويب لإدارة المهام والعادات بالعربية: لوحة اليوم، مشاريع، تذكيرات، إحصائيات أسبوعية برسوم، وضع ليلي/نهاري، سحب وإفلات، اختصارات لوحة مفاتيح، وحفظ محلي." },
  { label: "صفحة هبوط", icon: Rocket, kind: "landing", scale: "big", prompt: "صفحة هبوط احترافية بالعربية لخدمة توصيل طلبات في الجزائر: عنوان قوي، إثبات اجتماعي، كيف يعمل، الأسعار بالدينار، آراء العملاء، أسئلة شائعة، ونموذج اتصال يعمل." },
  { label: "أداة", icon: Gauge, kind: "tool", scale: "standard", prompt: "أداة حاسبة متعددة بالعربية: تحويل العملات (دينار/أورو/دولار)، حاسبة الزكاة، تحويل التاريخ الهجري والميلادي، وحساب المعدل الدراسي. واجهة نظيفة وسريعة." },
];

export default function ForgeWorkspace() {
  const { user } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  const [prompt, setPrompt] = useState("");
  const [extra, setExtra] = useState("");
  const [kind, setKind] = useState<ForgeKind | "">("");
  const [scale, setScale] = useState<ForgeScale>(isPro ? "titan" : "big");
  const [internet, setInternet] = useState(true);
  const [publish, setPublish] = useState(true);
  const [ui, setUi] = useState<ForgeUi>(initialForgeUi);
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("full");
  const [activeFile, setActiveFile] = useState("index.html");
  const [engines, setEngines] = useState<Engine[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [gallery, setGallery] = useState<Site[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const t0 = useRef(0);
  const railBox = useRef<HTMLDivElement | null>(null);
  const tickBox = useRef<HTMLDivElement | null>(null);

  const running = ui.phase === "running";
  const hasBuild = !!ui.html;

  /* ---------------------------------------------------------------- load */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/ai/forge?lineup=1", { credentials: "same-origin" }).catch(() => null);
        const j = r?.ok ? ((await r.json()) as { lineup?: Engine[] }) : null;
        if (alive && j?.lineup) setEngines(j.lineup);
      } catch {
        /* the page still works without the lineup */
      }
      try {
        const g = await fetch("/api/live?gallery=1").catch(() => null);
        const gj = g?.ok ? ((await g.json()) as { sites?: Site[] }) : null;
        if (alive && gj?.sites) setGallery(gj.sites.slice(0, 8));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* restore the last build after a refresh (deferred: never setState during the effect body) */
  useEffect(() => {
    const s = loadForgeSession();
    if (!s) return;
    const t = setTimeout(() => setUi({
      ...initialForgeUi(),
      phase: "done",
      scale: s.scale,
      kind: s.kind,
      title: s.title,
      html: s.html,
      files: s.files,
      tree: s.tree,
      qa: s.qa,
      meta: s.meta,
      stats: s.meta?.stats ?? null,
      live: s.live,
      plan: s.plan,
      pct: 100,
      endedAt: s.at,
    }), 0);
    const t2 = setTimeout(() => {
      setPrompt(s.prompt);
      setRestored(true);
      setTab("preview");
    }, 0);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, []);

  /* my published sites */
  const loadSites = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/live?list=1", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const j = (await r.json()) as { sites?: Site[] };
        setSites(j.sites ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [user]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch result, not a synchronous cascade
    void loadSites();
  }, [loadSites]);

  /* timer */
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setElapsed(Date.now() - t0.current), 200);
    return () => clearInterval(i);
  }, [running]);

  /* keep the rails pinned to the newest line */
  useEffect(() => {
    if (railBox.current) railBox.current.scrollTop = railBox.current.scrollHeight;
  }, [ui.stages.length]);
  useEffect(() => {
    if (tickBox.current) tickBox.current.scrollTop = 0;
  }, [ui.models.length]);

  /* persist a finished build */
  useEffect(() => {
    if (ui.phase === "done" && ui.html) saveForgeSession(ui, prompt);
  }, [ui, prompt]);

  useEffect(() => () => abort.current?.abort(), []);

  /* ---------------------------------------------------------------- build */
  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setUi((s) => (s.phase === "running" ? { ...s, phase: "done", endedAt: Date.now() } : s));
  }, []);

  const run = useCallback(async () => {
    const text = prompt.trim();
    if (!text || running || !user) return;
    setNotice("");
    setRestored(false);
    setUi(initialForgeUi());
    setElapsed(0);
    t0.current = Date.now();
    setTab("preview");

    const ctl = new AbortController();
    abort.current = ctl;
    const parse = makeForgeParser((e) => setUi((s) => applyEvent(s, e)));

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: text, extra, kind: kind || undefined, scale, internet, publish }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        setUi((s) => ({
          ...s,
          phase: "error",
          error:
            res.status === 401
              ? "انتهت الجلسة — سجّل الدخول من جديد"
              : res.status === 429
                ? body.includes("QUOTA")
                  ? "وصلت للحد اليومي من البناء. رقِّ إلى Pro لمزيد من المشاريع الضخمة."
                  : "استنى شوية — كثرت الطلبات على الورشة."
                : `تعذّر فتح الورشة (${res.status}) ${body.slice(0, 120)}`,
        }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) parse(value);
      }
      setUi((s) => (s.phase === "running" ? { ...s, phase: "done", endedAt: Date.now(), pct: 100 } : s));
      void loadSites();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        setUi((s) => ({ ...s, phase: "error", error: "انقطع الاتصال بالورشة — جرّب مرة أخرى" }));
      }
    } finally {
      abort.current = null;
    }
  }, [prompt, extra, kind, scale, internet, publish, running, user, loadSites]);

  /* ---------------------------------------------------------------- actions */
  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3200);
  };

  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`تم نسخ ${what}`);
      } catch {
        flash("تعذّر النسخ — المتصفح منع الوصول إلى الحافظة");
      }
    },
    []
  );

  const download = useCallback(
    (data: string, filename: string, mime = "text/html;charset=utf-8") => {
      try {
        const blob = new Blob([data], { type: mime });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        flash(`نُزّل ${filename}`);
      } catch {
        flash("تعذّر التنزيل");
      }
    },
    []
  );

  const publishNow = useCallback(async () => {
    if (!user || !ui.html) return;
    flash("جارٍ النشر…");
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: ui.title || prompt.slice(0, 60) || "مشروع Nexus",
          kind: ui.kind || kind || "site",
          language: ui.language || "ar",
          html: ui.html,
          files: ui.tree,
          models: ui.meta?.models ?? [],
        }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; mode?: string; detail?: string; code?: string } | null;
      if (r.ok && j?.ok && j.url) {
        setUi((s) => ({ ...s, live: { url: j.url as string, slug: (j.url as string).split("/live/")[1] ?? "", kind: (j.mode === "portable" ? "portable" : "db") as "db" | "portable" } }));
        flash("الرابط الحي جاهز ✅");
        void loadSites();
      } else {
        flash(j?.detail || "تعذّر النشر");
      }
    } catch {
      flash("تعذّر النشر — تحقق من الاتصال");
    }
  }, [user, ui.html, ui.title, ui.kind, ui.language, ui.tree, ui.meta, prompt, kind, loadSites]);

  const removeSite = useCallback(
    async (slug: string) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        await fetch(`/api/live?slug=${encodeURIComponent(slug)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        setSites((s) => s.filter((x) => x.slug !== slug));
        flash("حُذف الموقع");
      } catch {
        flash("تعذّر الحذف");
      }
    },
    [user]
  );

  /* ---------------------------------------------------------------- derived */
  const totalLines = useMemo(() => ui.files.filter((f) => f.state !== "merged").reduce((s, f) => s + f.lines, 0), [ui.files]);
  const mergedLines = ui.html ? ui.html.split("\n").length : 0;
  const totals = useMemo(() => modelTotals(ui), [ui]);
  const tree = ui.tree.length ? ui.tree : ui.html ? [{ path: "index.html", data: ui.html }] : [];
  const current = tree.find((f) => f.path === activeFile) ?? tree[0];
  const secs = running ? (elapsed / 1000).toFixed(1) : ui.meta ? formatMs(ui.meta.ms) : elapsed ? (elapsed / 1000).toFixed(1) : "";
  const qaErrors = ui.qa ? ui.qa.issues.filter((i) => i.level === "error").length : 0;

  /* ---------------------------------------------------------------- render */
  return (
    <div className="fg-page mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-3 pb-14 pt-4 sm:px-5">
      <div className="fg-aura" />

      {/* ══════════ header ══════════ */}
      <header className="fg-fade">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="v12-eyebrow">ميزة v19</span>
          <span className="fg-chip" style={{ cursor: "default" }}>
            <Anvil className="h-3.5 w-3.5" /> FORGE — بناء متعدد النماذج
          </span>
          {engines.length > 0 && (
            <span className="fg-chip" style={{ cursor: "default" }}>
              <Zap className="h-3.5 w-3.5" /> {engines.length} نموذج جاهز
            </span>
          )}
          {!isPro && (
            <a href="/app/upgrade" className="fg-chip">
              <Crown className="h-3.5 w-3.5" /> Pro: تيتان 12 000 سطر
            </a>
          )}
        </div>
        <h1 className="v12-display flex items-center gap-3 text-[clamp(28px,5.4vw,44px)]">
          <Code2 className="h-8 w-8 text-[var(--v12-accent)]" />
          Nexus Code
        </h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-[var(--v12-dim)]">
          اطلب مشروعًا كاملًا بالدارجة أو العربية أو الفرنسية — الورشة توزّعه على <b className="text-[var(--v12-text)]">مهندس معماري</b> و<b className="text-[var(--v12-text)]">فريق من أقوى النماذج</b> يكتبون الوحدات
          بالتوازي، ثم فحص آلي وإصلاح تلقائي، ثم <b className="text-[var(--v12-text)]">ملف واحد يشتغل مباشرة</b> و<b className="text-[var(--v12-text)]">رابط حي دائم</b>.
        </p>
      </header>

      {/* ══════════ engines ══════════ */}
      {engines.length > 0 && (
        <div className="fg-engines fg-fade">
          {engines.map((e) => {
            const hot = ui.models.some((m) => m.key === e.key && (m.state === "start" || m.state === "retry"));
            return (
              <span key={e.key} className="fg-engine" data-hot={hot ? "1" : "0"} title={e.roles.map((r) => ROLE_AR[r] ?? r).join(" · ")}>
                {hot ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="fg-dot fg-dot-ok" />}
                {e.label}
              </span>
            );
          })}
        </div>
      )}

      {/* ══════════ composer ══════════ */}
      <section className="fg-card fg-fade p-3.5 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-3">
            <textarea
              className="fg-input fg-scroll"
              dir="auto"
              value={prompt}
              disabled={running}
              placeholder={"اكتب المشروع الذي تريده بالتفصيل… مثال:\nصايب لي لعبة سيارة ضخمة في الصحراء الجزائرية بمستويات وأعداء ومتجر وأصوات، تشتغل في الموبايل والكمبيوتر"}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void run();
                }
              }}
            />

            <div className="flex flex-wrap gap-2">
              <span className="fg-card-s self-center">أمثلة جاهزة:</span>
              {STARTERS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    disabled={running}
                    className="fg-chip"
                    onClick={() => {
                      setPrompt(s.prompt);
                      setKind(s.kind);
                      setScale(s.scale);
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>

            <input
              className="fg-input fg-scroll"
              dir="auto"
              style={{ minHeight: 46 }}
              value={extra}
              disabled={running}
              placeholder="متطلبات إضافية صارمة (اختياري): الألوان، اللغة، الميزات الإجبارية، ما لا تريده…"
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          {/* controls */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="fg-card-s mb-1.5">حجم البناء</div>
              <div className="flex flex-wrap gap-1.5">
                {SCALES.map((s) => (
                  <button key={s} type="button" disabled={running} className="fg-chip" aria-pressed={scale === s} onClick={() => setScale(s)}>
                    {SCALE_AR[s]}
                    <span style={{ opacity: 0.75, fontWeight: 600 }}>{SCALE_META[s].total.toLocaleString("en")} سطر</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="fg-card-s mb-1.5">نوع المشروع</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={running} className="fg-chip" aria-pressed={kind === ""} onClick={() => setKind("")}>
                  تلقائي
                </button>
                {FORGE_KINDS.map((k) => (
                  <button key={k.id} type="button" disabled={running} className="fg-chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                    <span>{k.emoji}</span> {k.ar}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="fg-chip w-full justify-start" style={{ cursor: running ? "not-allowed" : "pointer" }}>
                <input type="checkbox" checked={internet} disabled={running} onChange={(e) => setInternet(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--v12-accent)]" />
                <Globe2 className="h-3.5 w-3.5" /> صور وأصوات حقيقية من الإنترنت
              </label>
              <label className="fg-chip w-full justify-start" style={{ cursor: running ? "not-allowed" : "pointer" }}>
                <input type="checkbox" checked={publish} disabled={running} onChange={(e) => setPublish(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--v12-accent)]" />
                <Link2 className="h-3.5 w-3.5" /> انشر رابطًا حيًا في النهاية
              </label>
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          {running ? (
            <button type="button" className="fg-stop" onClick={stop}>
              <Square className="inline h-4 w-4" /> أوقف البناء
            </button>
          ) : (
            <button type="button" className="fg-go" disabled={!prompt.trim() || !user} onClick={() => void run()}>
              <Hammer className="h-5 w-5" /> ابنِ المشروع
              <span style={{ opacity: 0.7, fontWeight: 700, fontSize: 12 }}>Ctrl/⌘ + Enter</span>
            </button>
          )}
          {!user && <span className="fg-card-s">سجّل الدخول لبدء البناء</span>}
          {restored && !running && (
            <span className="fg-card-s">
              <Check className="inline h-3.5 w-3.5 text-emerald-500" /> استُرجع آخر بناء من هذا الجهاز
            </span>
          )}
          {notice && <span className="fg-card-s text-[var(--v12-accent-2)]">{notice}</span>}
          {ui.error && (
            <span className="fg-card-s text-red-500" role="alert">
              {ui.error}
            </span>
          )}
        </div>
      </section>

      {/* ══════════ live build ══════════ */}
      {(running || (hasBuild && ui.phase !== "idle")) && (
        <section className="fg-card fg-fade overflow-hidden">
          <div className="fg-card-h">
            <div className={cn("fg-forge", ui.phase === "done" && "fg-forge-done")}>
              <i>{running ? "⚒️" : ui.phase === "error" ? "⚠️" : "✅"}</i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="fg-pct">{Math.round(ui.pct)}%</span>
                <span className="fg-card-t truncate">{running ? ui.stages[ui.stages.length - 1]?.label ?? "الورشة تعمل…" : ui.phase === "error" ? "توقف البناء" : ui.title || "المشروع جاهز"}</span>
              </div>
              <div className="fg-card-s mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>⏱ {secs}</span>
                {ui.plan && (
                  <span>
                    {ui.plan.modules.length} وحدة · {ui.plan.target.lines.toLocaleString("en")} سطر مخطط
                  </span>
                )}
                <span>✍️ {totalLines.toLocaleString("en")} سطر مكتوب</span>
                {mergedLines > 0 && <span>📦 {mergedLines.toLocaleString("en")} سطر في الملف النهائي</span>}
                {ui.scale && <span>🎯 {SCALE_AR[ui.scale] ?? ui.scale}</span>}
                {ui.kind && <span>🧩 {KIND_AR[ui.kind] ?? ui.kind}</span>}
                {ui.net && <span>🌐 {ui.net.images} صورة · {ui.net.audio} صوت</span>}
              </div>
            </div>
            <div className="hidden w-40 sm:block">
              <div className="fg-bar">
                <div className="fg-bar-fill" style={{ width: `${Math.max(3, ui.pct)}%` }} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-3.5 lg:grid-cols-[1.15fr_1fr]">
            {/* files as they land */}
            <div className="flex flex-col gap-2">
              <div className="fg-card-t flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-[var(--v12-accent)]" /> الوحدات ({ui.files.length}
                {ui.plan ? `/${ui.plan.modules.length}` : ""})
              </div>
              {ui.files.length === 0 ? (
                <div className="fg-empty" style={{ minHeight: 120 }}>
                  {running ? "النماذج تكتب الآن… أول وحدة ستظهر هنا" : "لا توجد وحدات"}
                </div>
              ) : (
                <div className="fg-files fg-scroll" style={{ maxHeight: 260, overflow: "auto" }}>
                  {ui.files
                    .slice()
                    .reverse()
                    .map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        className="fg-file"
                        data-on={activeFile === f.path ? "1" : "0"}
                        onClick={() => {
                          setActiveFile(f.path);
                          setTab("files");
                        }}
                        title={f.note ?? ""}
                      >
                        <span className="fg-file-p">{f.path}</span>
                        <span className="fg-file-m">
                          <span className={cn("fg-dot", f.state === "ok" || f.state === "merged" ? "fg-dot-ok" : f.state === "issues" ? "fg-dot-warn" : f.state === "fallback" ? "fg-dot-bad" : "fg-dot-run")} />
                          {f.lines.toLocaleString("en")} سطر · {f.kb} KB
                          {f.model && <span className="truncate">· {f.model}</span>}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {ui.plan && ui.plan.modules.length > ui.files.length && running && (
                <div className="fg-card-s">
                  في الانتظار: {ui.plan.modules.filter((m) => !ui.files.some((f) => f.path === m.path)).map((m) => m.path).join("، ")}
                </div>
              )}
            </div>

            {/* stage rail + model ticker */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="fg-card-t mb-1.5 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--v12-accent)]" /> خط الورشة
                </div>
                <div className="fg-rail fg-scroll" ref={railBox}>
                  {ui.stages.slice(-26).map((s, i) => (
                    <div key={`${s.at}-${i}`} className="fg-step" data-on={s.state === "working" ? "1" : "0"}>
                      <span className="fg-step-dot" />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {s.model && <span className="fg-card-s">{s.model}</span>}
                    </div>
                  ))}
                  {ui.logs.slice(-6).map((l, i) => (
                    <div key={`log-${i}`} className="fg-step">
                      <span className="fg-step-dot" />
                      <span className="min-w-0 flex-1">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="fg-card-t mb-1.5 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--v12-accent)]" /> من يكتب الآن
                </div>
                <div className="fg-ticker fg-scroll" ref={tickBox}>
                  {ui.models
                    .slice()
                    .reverse()
                    .slice(0, 14)
                    .map((m, i) => (
                      <div key={`${m.at}-${i}`} className="fg-tick">
                        {m.state === "start" || m.state === "retry" ? <Loader2 className="h-3 w-3 animate-spin text-[var(--v12-accent)]" /> : m.state === "done" ? <Check className="h-3 w-3 text-emerald-500" /> : <span className="fg-dot fg-dot-bad" />}
                        <b>{m.model}</b>
                        <span style={{ opacity: 0.8 }}>{ROLE_AR[m.role] ?? m.role}</span>
                        {m.path && <code>{m.path}</code>}
                        {typeof m.lines === "number" && <span>· {m.lines.toLocaleString("en")} سطر</span>}
                        {m.note && <span className="truncate text-red-400/80">· {m.note.slice(0, 40)}</span>}
                      </div>
                    ))}
                  {ui.models.length === 0 && <div className="fg-card-s">لم يبدأ أي نموذج بعد</div>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════ live link ══════════ */}
      {ui.live && (
        <div className="fg-live fg-fade">
          <span className="fg-live-dot" />
          <div className="min-w-0 flex-1">
            <div className="fg-card-t">الرابط الحي — يعمل الآن</div>
            <a href={ui.live.url} target="_blank" rel="noreferrer noopener">
              {ui.live.url}
            </a>
            {ui.live.kind === "portable" && <div className="fg-card-s">رابط محمول: يحمل المشروع كاملًا داخله (لا يحتاج قاعدة بيانات)</div>}
          </div>
          <button type="button" className="fg-chip" onClick={() => void copy(ui.live!.url, "الرابط")}>
            <Copy className="h-3.5 w-3.5" /> نسخ
          </button>
          <a className="fg-chip" href={ui.live.url} target="_blank" rel="noreferrer noopener">
            <ExternalLink className="h-3.5 w-3.5" /> فتح
          </a>
          {ui.live.kind === "db" && (
            <a className="fg-chip" href={`/live/${ui.live.slug}?zip=1`}>
              <Download className="h-3.5 w-3.5" /> ZIP
            </a>
          )}
        </div>
      )}

      {/* ══════════ workspace ══════════ */}
      {hasBuild && (
        <section className="fg-card fg-fade overflow-hidden">
          <div className="fg-card-h flex-wrap gap-2">
            <div className="fg-tabs">
              {(
                [
                  { id: "preview", label: "المعاينة", icon: Eye },
                  { id: "files", label: "الملفات", icon: FolderTree },
                  { id: "qa", label: "الفحص", icon: ShieldCheck },
                  { id: "report", label: "التقرير", icon: Gauge },
                ] as { id: Tab; label: string; icon: typeof Eye }[]
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" className="fg-tab" data-on={tab === t.id ? "1" : "0"} onClick={() => setTab(t.id)}>
                    <Icon className="me-1 inline h-3.5 w-3.5" />
                    {t.label}
                    {t.id === "qa" && ui.qa ? ` (${ui.qa.score})` : t.id === "files" ? ` (${tree.length})` : ""}
                  </button>
                );
              })}
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="fg-chip" onClick={() => download(ui.html, `${(ui.title || "nexus-project").replace(/[^\w\u0621-\u064A\-]+/g, "_").slice(0, 60)}.html`)}>
                <Download className="h-3.5 w-3.5" /> تنزيل HTML
              </button>
              <button type="button" className="fg-chip" onClick={() => void copy(ui.html, "الملف الكامل")}>
                <Copy className="h-3.5 w-3.5" /> نسخ الكود
              </button>
              <button type="button" className="fg-chip" onClick={() => void publishNow()}>
                <Rocket className="h-3.5 w-3.5" /> {ui.live ? "إعادة النشر" : "نشر رابط حي"}
              </button>
              {ui.live && (
                <a className="fg-chip" href={ui.live.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> فتح الموقع
                </a>
              )}
            </div>
          </div>

          {/* ---- preview ---- */}
          {tab === "preview" && (
            <div className="p-3.5">
              <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: "phone", label: "موبايل", icon: Smartphone },
                    { id: "tablet", label: "تابلت", icon: Tablet },
                    { id: "full", label: "شاشة كاملة", icon: Monitor },
                  ] as { id: Device; label: string; icon: typeof Monitor }[]
                ).map((d) => {
                  const Icon = d.icon;
                  return (
                    <button key={d.id} type="button" className="fg-chip" aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>
                      <Icon className="h-3.5 w-3.5" /> {d.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="fg-chip"
                  onClick={() => {
                    const f = document.getElementById("fg-frame") as HTMLIFrameElement | null;
                    if (f) f.srcdoc = ui.html;
                    flash("أُعيد تحميل المعاينة");
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> إعادة التشغيل
                </button>
                <button type="button" className="fg-chip" onClick={() => void openInTab(ui.html)}>
                  <Play className="h-3.5 w-3.5" /> فتح في تبويب
                </button>
                <span className="fg-card-s ms-auto">
                  {mergedLines.toLocaleString("en")} سطر · {formatBytes(new Blob([ui.html]).size)}
                </span>
              </div>
              <div className="fg-frame-wrap">
                <iframe
                  id="fg-frame"
                  key={`${ui.html.length}-${device}`}
                  title={ui.title || "معاينة المشروع"}
                  srcDoc={ui.html}
                  className={cn("fg-frame", device === "phone" && "fg-frame-phone", device === "tablet" && "fg-frame-tablet", device === "full" && "fg-frame-full")}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
                />
              </div>
              <p className="fg-card-s mt-2">
                المعاينة تعمل في صندوق معزول تمامًا (بلا وصول إلى حسابك). الألعاب تحتاج نقرة واحدة لتفعيل الصوت.
              </p>
            </div>
          )}

          {/* ---- files ---- */}
          {tab === "files" && (
            <div className="grid gap-3 p-3.5 lg:grid-cols-[240px_1fr]">
              <div className="fg-scroll flex max-h-[62vh] flex-col gap-1 overflow-auto">
                {tree.map((f) => {
                  const meta = ui.files.find((x) => x.path === f.path);
                  return (
                    <button key={f.path} type="button" className="fg-file" data-on={current?.path === f.path ? "1" : "0"} onClick={() => setActiveFile(f.path)}>
                      <span className="fg-file-p">{f.path}</span>
                      <span className="fg-file-m">
                        {f.data.split("\n").length.toLocaleString("en")} سطر · {formatBytes(new Blob([f.data]).size)}
                        {meta?.model && <span className="truncate">· {meta.model}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="min-w-0">
                {current ? (
                  <div className="fg-code">
                    <div className="fg-code-h">
                      <span className="fg-code-p">{current.path}</span>
                      <span className="fg-card-s">
                        {current.data.split("\n").length.toLocaleString("en")} سطر · {formatBytes(new Blob([current.data]).size)}
                      </span>
                      <span className="flex-1" />
                      <button type="button" className="fg-mini" onClick={() => void copy(current.data, current.path)}>
                        نسخ
                      </button>
                      <button
                        type="button"
                        className="fg-mini"
                        onClick={() => download(current.data, current.path.split("/").pop() ?? "file.txt", current.path.endsWith(".css") ? "text/css;charset=utf-8" : current.path.endsWith(".js") ? "text/javascript;charset=utf-8" : current.path.endsWith(".json") ? "application/json" : "text/plain;charset=utf-8")}
                      >
                        تنزيل
                      </button>
                    </div>
                    <pre className="fg-scroll">{current.data}</pre>
                  </div>
                ) : (
                  <div className="fg-empty">اختر ملفًا من القائمة</div>
                )}
              </div>
            </div>
          )}

          {/* ---- qa ---- */}
          {tab === "qa" && (
            <div className="grid gap-4 p-3.5 lg:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-2">
                <div className="fg-ring" style={{ ["--v" as string]: String(ui.qa?.score ?? 0) }}>
                  <b>{ui.qa?.score ?? "—"}</b>
                </div>
                <div className="fg-card-s text-center">
                  نقطة الجودة
                  <br />
                  {qaErrors === 0 ? <span className="text-emerald-500">بلا أخطاء قاتلة ✅</span> : <span className="text-red-400">{qaErrors} خطأ</span>}
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {(ui.qa?.checks ?? []).map((c) => (
                    <div key={c.name} className="fg-check" data-ok={c.ok ? "1" : "0"}>
                      {c.ok ? <Check className="h-3.5 w-3.5 flex-none text-emerald-500" /> : <span className="fg-dot fg-dot-bad flex-none" />}
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {c.detail && <span className="fg-card-s max-w-[45%] truncate">{c.detail}</span>}
                    </div>
                  ))}
                  {!ui.qa && <div className="fg-empty">لا يوجد فحص بعد</div>}
                </div>
                {(ui.qa?.issues.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="fg-card-t">ملاحظات الفحص</div>
                    {ui.qa!.issues.map((i, n) => (
                      <div key={n} className="fg-issue">
                        <b>{i.level === "error" ? "خطأ" : "تنبيه"}</b> · {i.where}: {i.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---- report ---- */}
          {tab === "report" && (
            <div className="flex flex-col gap-4 p-3.5">
              <div className="fg-kv">
                <div className="fg-k">
                  <b>{(ui.meta?.lines ?? totalLines).toLocaleString("en")}</b>
                  <span>سطر مكتوب</span>
                </div>
                <div className="fg-k">
                  <b>{formatBytes(ui.meta?.bytes ?? ui.files.reduce((s, f) => s + f.kb * 1024, 0))}</b>
                  <span>حجم المشروع</span>
                </div>
                <div className="fg-k">
                  <b>{ui.meta?.modules ?? ui.files.length}</b>
                  <span>وحدة</span>
                </div>
                <div className="fg-k">
                  <b>{mergedLines.toLocaleString("en")}</b>
                  <span>سطر في الملف الواحد</span>
                </div>
                <div className="fg-k">
                  <b>{totals.length}</b>
                  <span>نموذج مشارك</span>
                </div>
                <div className="fg-k">
                  <b>{formatMs(ui.meta?.ms ?? elapsed)}</b>
                  <span>مدة البناء</span>
                </div>
                <div className="fg-k">
                  <b>{ui.meta?.stats.calls ?? "—"}</b>
                  <span>نداء نموذج</span>
                </div>
                <div className="fg-k">
                  <b>{ui.meta?.stats.retries ?? 0}</b>
                  <span>إعادة محاولة</span>
                </div>
              </div>

              <div>
                <div className="fg-card-t mb-2">من كتب ماذا</div>
                <div className="fg-files">
                  {totals.map((m) => (
                    <div key={m.model} className="fg-file" style={{ cursor: "default" }}>
                      <span className="fg-file-p" style={{ fontFamily: "inherit" }}>
                        {m.model}
                      </span>
                      <span className="fg-file-m">
                        {m.files} ملف · {m.lines.toLocaleString("en")} سطر
                        {m.roles.length > 0 && <span>· {m.roles.map((r) => ROLE_AR[r] ?? r).join("، ")}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {ui.plan && (
                <details className="fg-card p-3">
                  <summary className="fg-card-t cursor-pointer">
                    <Layers className="me-1 inline h-4 w-4" /> خطة المهندس المعماري ({ui.plan.modules.length} وحدة)
                  </summary>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {ui.plan.modules.map((m) => (
                      <div key={m.id} className="fg-issue">
                        <b>
                          <code style={{ direction: "ltr" }}>{m.path}</code>
                        </b>{" "}
                        · {m.title} · الهدف {m.lines.toLocaleString("en")} سطر · الموجة {m.wave + 1}
                        {m.needs.length > 0 && <span> · يحتاج {m.needs.join("، ")}</span>}
                      </div>
                    ))}
                  </div>
                  {ui.plan.contract && (
                    <div className="fg-code mt-2.5">
                      <div className="fg-code-h">
                        <span className="fg-code-p">CONTRACT</span>
                        <span className="flex-1" />
                        <button type="button" className="fg-mini" onClick={() => void copy(ui.plan!.contract, "العقد")}>
                          نسخ
                        </button>
                      </div>
                      <pre className="fg-scroll" style={{ maxHeight: 240 }}>
                        {ui.plan.contract}
                      </pre>
                    </div>
                  )}
                </details>
              )}

              {ui.plan?.design && (
                <details className="fg-card p-3">
                  <summary className="fg-card-t cursor-pointer">
                    <Wand2 className="me-1 inline h-4 w-4" /> نظام التصميم
                  </summary>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {Object.entries(ui.plan.design.palette).map(([k, v]) => (
                      <span key={k} className="fg-engine">
                        <span className="fg-dot" style={{ background: v, width: 12, height: 12 }} /> {k}: <code style={{ direction: "ltr" }}>{v}</code>
                      </span>
                    ))}
                  </div>
                  <p className="fg-card-s mt-2 leading-relaxed">
                    {ui.plan.design.typography} · {ui.plan.design.motion} · {ui.plan.design.layout} {ui.plan.design.notes}
                  </p>
                </details>
              )}
            </div>
          )}
        </section>
      )}

      {/* ══════════ my sites ══════════ */}
      {(sites.length > 0 || gallery.length > 0) && (
        <section className="fg-card fg-fade overflow-hidden">
          <div className="fg-card-h">
            <Globe2 className="h-4 w-4 text-[var(--v12-accent)]" />
            <span className="fg-card-t">مواقع منشورة بروابط حية</span>
            <span className="fg-card-s">{sites.length} موقع لك</span>
            <span className="flex-1" />
            <button type="button" className="fg-chip" onClick={() => void loadSites()}>
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
          </div>
          <div className="flex flex-col gap-4 p-3.5">
            {sites.length > 0 && (
              <div className="fg-sites">
                {sites.map((s) => (
                  <div key={s.slug} className="fg-site">
                    <div className="fg-site-t" title={s.title}>
                      {s.title}
                    </div>
                    <div className="fg-site-m">
                      <span>{KIND_AR[s.kind] ?? s.kind}</span>
                      <span>{s.lines.toLocaleString("en")} سطر</span>
                      <span>{formatBytes(s.bytes)}</span>
                      <span>👁 {s.views}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString("ar-DZ")}</span>
                    </div>
                    <div className="fg-site-a">
                      <a className="fg-chip" href={`/live/${s.slug}`} target="_blank" rel="noreferrer noopener">
                        <ExternalLink className="h-3.5 w-3.5" /> فتح
                      </a>
                      <button type="button" className="fg-chip" onClick={() => void copy(`${location.origin}/live/${s.slug}`, "الرابط")}>
                        <Copy className="h-3.5 w-3.5" /> نسخ الرابط
                      </button>
                      <a className="fg-chip" href={`/live/${s.slug}?zip=1`}>
                        <Download className="h-3.5 w-3.5" /> ZIP
                      </a>
                      <button type="button" className="fg-chip" onClick={() => void removeSite(s.slug)}>
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {gallery.length > 0 && (
              <div>
                <div className="fg-card-t mb-2">من المجتمع</div>
                <div className="fg-sites">
                  {gallery.map((s) => (
                    <a key={s.slug} className="fg-site" href={`/live/${s.slug}`} target="_blank" rel="noreferrer noopener" style={{ textDecoration: "none" }}>
                      <div className="fg-site-t">{s.title}</div>
                      <div className="fg-site-m">
                        <span>{KIND_AR[s.kind] ?? s.kind}</span>
                        <span>{s.lines.toLocaleString("en")} سطر</span>
                        <span>👁 {s.views}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════ footer ══════════ */}
      <footer className="fg-card-s flex flex-wrap items-center gap-2 px-1">
        <ShieldCheck className="h-3.5 w-3.5" />
        كل بناء يمر على فحص آلي (صياغة JavaScript، الوسوم، المعرفات، الحشو، الحجم) ويُصلَح تلقائيًا قبل أن يصل إليك.
        <span className="flex-1" />
        Nexus AI v19 FORGE — من تطوير <b className="text-[var(--v12-text)]">abdelrezakbezzag</b> · الجزائر 🇩🇿
        {ui.html && (
          <button
            type="button"
            className="fg-chip"
            onClick={() => {
              clearForgeSession();
              setUi(initialForgeUi());
              setPrompt("");
              setRestored(false);
              flash("مُسح البناء المحفوظ");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> مسح الجلسة
          </button>
        )}
      </footer>
    </div>
  );
}

/** Opens the built document in a real tab (useful for games that need fullscreen). */
function openInTab(html: string) {
  try {
    const w = window.open("", "_blank");
    if (!w) return Promise.resolve(false);
    w.document.open();
    w.document.write(html);
    w.document.close();
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}
