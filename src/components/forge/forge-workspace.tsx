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
  AlertTriangle,
  Anvil,
  BrainCircuit,
  Clock,
  TerminalSquare,
  Boxes,
  Check,
  ChevronRight,
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
  /** v20 — DUO: exactly two engines + a locally computed plan (fastest path) */
  const [duo, setDuo] = useState(true);
  /** v20 — show the engines' real reasoning while they work */
  const [thinking, setThinking] = useState(true);
  const [thinkOpen, setThinkOpen] = useState<Record<string, boolean>>({});
  const [ui, setUi] = useState<ForgeUi>(initialForgeUi);
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("full");
  const [activeFile, setActiveFile] = useState("index.html");
  const [engines, setEngines] = useState<Engine[]>([]);
  /** real size of the local recipe database, reported by the API */
  const [recipes, setRecipes] = useState(0);
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
        const j = r?.ok ? ((await r.json()) as { lineup?: Engine[]; recipes?: number }) : null;
        if (alive && j?.lineup) setEngines(j.lineup);
        if (alive && typeof j?.recipes === "number") setRecipes(j.recipes);
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
        body: JSON.stringify({ prompt: text, extra, kind: kind || undefined, scale, internet, publish, duo, thinking }),
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
  }, [prompt, extra, kind, scale, internet, publish, duo, thinking, running, user, loadSites]);

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
  const totals = useMemo(() => {
    const perModel = modelTotals(ui);
    return {
      perModel,
      models: perModel.length,
      lines: perModel.reduce((n, m) => n + m.lines, 0),
      files: perModel.reduce((n, m) => n + m.files, 0),
    };
  }, [ui]);
  const tree = ui.tree.length ? ui.tree : ui.html ? [{ path: "index.html", data: ui.html }] : [];
  const current = tree.find((f) => f.path === activeFile) ?? tree[0];
  const secs = running ? (elapsed / 1000).toFixed(1) : ui.meta ? formatMs(ui.meta.ms) : elapsed ? (elapsed / 1000).toFixed(1) : "";
  const qaErrors = ui.qa ? ui.qa.issues.filter((i) => i.level === "error").length : 0;

  /* ------------------------------------------------------- v20 timeline */
  /**
   * One honest transcript: every entry comes from a real event the engine sent
   * (nothing is simulated, nothing is padded). Sorted by the time it happened,
   * exactly like a coding agent's conversation.
   */
  type Entry =
    | { k: "user"; at: number; text: string }
    | { k: "think"; at: number; id: string; model: string; role: string; text: string; done: boolean; ms: number }
    | { k: "tool"; at: number; icon: "plan" | "duo" | "net" | "file" | "swap" | "qa" | "live" | "warn"; title: string; sub?: string; state: "run" | "ok" | "warn" | "bad"; metrics?: [string, string][]; code?: string }
    | { k: "result"; at: number };

  const timeline = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const t0at = ui.startedAt || Date.now();
    if (prompt.trim() || ui.phase !== "idle") out.push({ k: "user", at: t0at - 1, text: prompt.trim() || "…" });

    if (ui.duo)
      out.push({
        k: "tool",
        at: t0at + 1,
        icon: "duo",
        title: `DUO — محرّكان يكتبان معًا: ${ui.duo.a.label} + ${ui.duo.b.label}`,
        sub: "خطة محلية دقيقة (بلا انتظار مهندس) ⇒ أول سطر كود في ثوانٍ",
        state: "ok",
        metrics: [
          ["الوحدات", String(ui.duo.modules)],
          ["الهدف", `${ui.duo.target.toLocaleString("en")} سطر`],
          ["زمن الخطة", `${ui.duo.planMs}ms`],
        ],
      });

    if (ui.plan)
      out.push({
        k: "tool",
        at: t0at + 2,
        icon: "plan",
        title: `الخطة: ${ui.plan.title}`,
        sub: `${KIND_AR[ui.plan.kind] ?? ui.plan.kind} · ${ui.plan.language.toUpperCase()} · ${ui.plan.modules.length} وحدة · العقد ${ui.plan.contract.length} حرف`,
        state: "ok",
        metrics: [
          ["الهدف", `${ui.plan.target.lines.toLocaleString("en")} سطر`],
          ["الموجات", String(new Set(ui.plan.modules.map((m) => m.wave)).size)],
          ["الحجم", `${Math.round(ui.plan.target.kb)} KB`],
        ],
        code: ui.plan.modules.map((m) => `${m.path} — ${m.lines} سطر${m.needs.length ? ` (بعد ${m.needs.join("، ")})` : ""}`).join("\n"),
      });

    if (ui.net)
      out.push({
        k: "tool",
        at: t0at + 3,
        icon: "net",
        title: "وسائط حقيقية من الويب المفتوح",
        sub: ui.net.source,
        state: "ok",
        metrics: [
          ["صور", String(ui.net.images)],
          ["صوت", String(ui.net.audio)],
        ],
      });

    for (const th of ui.think)
      out.push({ k: "think", at: th.at, id: `${th.key}:${th.role}:${th.at}`, model: th.model, role: ROLE_AR[th.role] ?? th.role, text: th.text, done: th.done, ms: th.ms });

    for (const m of ui.models)
      if (m.state === "fail" || m.state === "retry")
        out.push({
          k: "tool",
          at: m.at,
          icon: "swap",
          title: `${m.model} ما أرضاش النتيجة${m.path ? ` في ${m.path}` : ""} — تحوّل تلقائي لمحرّك آخر`,
          sub: m.note ? `السبب الحقيقي: ${m.note}` : undefined,
          state: "warn",
        });

    for (const f of ui.files)
      out.push({
        k: "tool",
        at: f.at,
        icon: "file",
        title: f.path,
        sub: f.model ? `كتبه ${f.model}` : undefined,
        state: f.state === "fallback" ? "bad" : f.state === "issues" || f.state === "repaired" ? "warn" : "ok",
        metrics: [
          ["الأسطر", f.lines.toLocaleString("en")],
          ["الحجم", `${f.kb} KB`],
          ["الحالة", f.state === "merged" ? "مدموج" : f.state === "repaired" ? "أُصلح" : f.state === "issues" ? "فيه ملاحظات" : f.state === "fallback" ? "احتياطي" : "سليم"],
        ],
      });

    if (ui.qa)
      out.push({
        k: "tool",
        at: (ui.files[ui.files.length - 1]?.at ?? t0at) + 1,
        icon: "qa",
        title: `الفحص الآلي: ${ui.qa.score}/100`,
        sub: `${ui.qa.issues.filter((i) => i.level === "error").length} خطأ · ${ui.qa.issues.filter((i) => i.level === "warn").length} تنبيه · ${ui.qa.repaired} إصلاح`,
        state: ui.qa.issues.some((i) => i.level === "error") ? "warn" : "ok",
        code: ui.qa.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n"),
      });

    if (ui.live)
      out.push({
        k: "tool",
        at: (ui.endedAt || Date.now()) - 1,
        icon: "live",
        title: "الرابط الحي جاهز",
        sub: ui.live.url,
        state: "ok",
        metrics: [["النوع", ui.live.kind === "portable" ? "محمول (بلا قاعدة بيانات)" : "دائم"]],
      });

    if (ui.error)
      out.push({ k: "tool", at: ui.endedAt || Date.now(), icon: "warn", title: "البناء توقف", sub: ui.error, state: "bad" });

    if (ui.html) out.push({ k: "result", at: ui.endedAt || Date.now() });

    return out.sort((a, b) => a.at - b.at);
  }, [ui, prompt]);

  /* real progress: files actually written / modules actually planned */
  const planned = ui.plan?.modules.length ?? ui.duo?.modules ?? 0;
  const written = ui.files.filter((f) => f.state !== "merged").length;
  const linesSoFar = ui.files.filter((f) => f.state !== "merged").reduce((n, f) => n + f.lines, 0);
  const pctReal = planned > 0 ? Math.min(100, Math.round((written / planned) * 100)) : running ? Math.min(95, ui.pct) : ui.html ? 100 : 0;
  const activeThink = ui.think.filter((t) => !t.done);

  const TOOL_ICON = {
    plan: Layers,
    duo: Zap,
    net: Globe2,
    file: FileCode2,
    swap: RefreshCw,
    qa: ShieldCheck,
    live: Link2,
    warn: AlertTriangle,
  } as const;

  /* ---------------------------------------------------------------- render */
  return (
    <div className="fc-page">
      {/* living glass backdrop — GPU only (transform/opacity), never layout */}
      <div className="fc-bg" aria-hidden>
        <span className="fc-bg-a" />
        <span className="fc-bg-b" />
        <span className="fc-bg-c" />
        <span className="fc-bg-grid" />
      </div>

      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-4 px-3 pb-6 pt-4 sm:px-5">
        {/* ══════════ header ══════════ */}
        <header className="fc-head fg-fade">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="fc-logo" aria-hidden>
              <TerminalSquare className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-black tracking-tight text-[var(--v12-text)] sm:text-[22px]">
                Nexus Code
              </h1>
              <p className="truncate text-[11.5px] text-[var(--v12-faint)]">
                ورشة بناء بمحرّكات متعددة · {engines.length} محرّك جاهز
                {recipes > 0 ? ` · ${recipes} وصفة كود جاهزة` : ""} · حتى {SCALE_META.titan.total.toLocaleString("en")} سطر
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {duo && ui.duo && (
              <span className="fc-pill fc-pill-live" title="المحرّكان اللذان كتبا هذا البناء">
                <Zap className="size-3" /> {ui.duo.a.label} + {ui.duo.b.label}
              </span>
            )}
            {running && (
              <span className="fc-pill fc-pill-live">
                <span className="fc-dot-run" /> {written}/{planned || "…"} وحدة · {linesSoFar.toLocaleString("en")} سطر
              </span>
            )}
            {ui.meta && (
              <span className="fc-pill" title="المدة الحقيقية الكاملة">
                <Clock className="size-3" /> {formatMs(ui.meta.ms)}
              </span>
            )}
            {totals.lines > 0 && (
              <span className="fc-pill" title="مجموع الأسطر الحقيقية المكتوبة">
                <Code2 className="size-3" /> {totals.lines.toLocaleString("en")} سطر
              </span>
            )}
            {!isPro && (
              <a href="/app/upgrade" className="fc-pill fc-pill-pro">
                <Crown className="size-3" /> Pro
              </a>
            )}
          </div>
        </header>

        {/* ══════════ body: thread + rail ══════════ */}
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          {/* ---------- conversation ---------- */}
          <section className="fc-thread fg-fade" aria-live="polite">
            {timeline.length === 0 && (
              <div className="fc-empty">
                <span className="fc-empty-ico" aria-hidden>
                  <Anvil className="size-7" />
                </span>
                <h2 className="text-[17px] font-black text-[var(--v12-text)]">صف المشروع، والورشة تكتبه</h2>
                <p className="max-w-xl text-[13px] leading-relaxed text-[var(--v12-dim)]">
                  كل وحدة يكتبها محرّك مختلف بالتوازي، ثم فحص آلي وإصلاح تلقائي، ثم ملف واحد يشتغل مباشرة ورابط حي.
                  وضع <b className="text-[var(--v12-text)]">DUO</b> يشغّل محرّكين فقط بخطة محلية — أسرع طريق لأول سطر كود.
                </p>
                <div className="fc-starters">
                  {STARTERS.map((st) => (
                    <button
                      key={st.label}
                      type="button"
                      className="fc-starter"
                      onClick={() => {
                        setPrompt(st.prompt);
                        setKind(st.kind);
                        setScale(st.scale);
                      }}
                    >
                      <st.icon className="size-4" />
                      <span>{st.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {timeline.map((e, i) => {
              if (e.k === "user")
                return (
                  <article key={`u${i}`} className="fc-msg fc-msg-user">
                    <span className="fc-avatar" aria-hidden>
                      أنت
                    </span>
                    <div className="fc-bubble" dir="auto">
                      {e.text}
                    </div>
                    <div className="fc-msg-meta">
                      <span className="fc-pill">{SCALE_META[scale]?.ar ?? scale}</span>
                      {kind && <span className="fc-pill">{KIND_AR[kind]}</span>}
                      {duo && <span className="fc-pill fc-pill-live"><Zap className="size-3" /> DUO</span>}
                      {internet && <span className="fc-pill"><Globe2 className="size-3" /> إنترنت</span>}
                    </div>
                  </article>
                );

              if (e.k === "think") {
                const open = thinkOpen[e.id] ?? !e.done;
                return (
                  <article key={`t${e.id}`} className="fc-think">
                    <button
                      type="button"
                      className="fc-think-h"
                      onClick={() => setThinkOpen((m) => ({ ...m, [e.id]: !open }))}
                      aria-expanded={open}
                    >
                      <BrainCircuit className={cn("size-4", !e.done && "fc-pulse")} />
                      <span className="fc-think-t">{e.done ? `فكّر ${e.model}` : `${e.model} يفكّر…`}</span>
                      <span className="fc-think-role">{e.role}</span>
                      {e.ms > 0 && <span className="fc-think-ms" dir="ltr">{(e.ms / 1000).toFixed(1)}s</span>}
                      <ChevronRight className={cn("size-4 ms-auto transition-transform", open && "rotate-90 rtl:-rotate-90")} />
                    </button>
                    {open && (
                      <pre className="fc-think-b fg-scroll" dir="auto">
                        {e.text || "…"}
                        {!e.done && <span className="fc-caret" aria-hidden />}
                      </pre>
                    )}
                  </article>
                );
              }

              if (e.k === "result")
                return (
                  <article key={`r${i}`} className="fc-result">
                    <div className="fc-result-h">
                      <span className="fc-result-ico" aria-hidden>
                        <Check className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-black text-[var(--v12-text)]">{ui.title || "المشروع جاهز"}</h3>
                        <p className="text-[11.5px] text-[var(--v12-faint)]">
                          {ui.files.filter((f) => f.state !== "merged").length} ملف · {mergedLines.toLocaleString("en")} سطر في index.html ·{" "}
                          {totals.models} محرّك · {secs}
                        </p>
                      </div>
                    </div>
                    <div className="fc-result-grid">
                      {[
                        ["الأسطر", totals.lines.toLocaleString("en")],
                        ["الملفات", String(tree.length)],
                        ["الحجم", formatBytes(ui.html ? new Blob([ui.html]).size : 0)],
                        ["الفحص", ui.qa ? `${ui.qa.score}/100` : "—"],
                        ["المحاولات", String(ui.stats?.retries ?? 0)],
                        ["الإصلاحات", String(ui.stats?.repairs ?? 0)],
                      ].map(([k, v]) => (
                        <div key={k} className="fc-metric">
                          <span>{k}</span>
                          <b>{v}</b>
                        </div>
                      ))}
                    </div>
                    <div className="fc-result-a">
                      <button type="button" className="fc-btn fc-btn-primary" onClick={() => setTab("preview")}>
                        <Eye className="size-4" /> معاينة
                      </button>
                      <button type="button" className="fc-btn" onClick={() => download(ui.html, `${(ui.title || "nexus").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40)}.html`)}>
                        <Download className="size-4" /> تنزيل HTML
                      </button>
                      {tree.length > 1 && (
                        <button type="button" className="fc-btn" onClick={() => download(ui.html, `${(ui.title || "nexus").slice(0, 30)}.html`)}>
                          <FolderTree className="size-4" /> {tree.length} ملف
                        </button>
                      )}
                      <button type="button" className="fc-btn" onClick={() => void copy(ui.html, "الكود كاملًا")}>
                        <Copy className="size-4" /> نسخ
                      </button>
                      {!ui.live && (
                        <button type="button" className="fc-btn" onClick={() => void publishNow()}>
                          <Globe2 className="size-4" /> انشر
                        </button>
                      )}
                      {ui.live && (
                        <a className="fc-btn fc-btn-live" href={ui.live.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" /> افتح الرابط الحي
                        </a>
                      )}
                    </div>
                  </article>
                );

              const Ico = TOOL_ICON[e.icon];
              return (
                <article key={`e${i}`} className="fc-tool" data-state={e.state}>
                  <span className="fc-tool-ico" aria-hidden>
                    <Ico className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h4 className="text-[13px] font-extrabold text-[var(--v12-text)]" dir="auto">
                        {e.title}
                      </h4>
                      {e.sub && (
                        <span className="truncate text-[11.5px] text-[var(--v12-faint)]" dir="auto">
                          {e.sub}
                        </span>
                      )}
                    </div>
                    {e.metrics && (
                      <div className="fc-tool-m">
                        {e.metrics.map(([k, v]) => (
                          <span key={k}>
                            {k} <b>{v}</b>
                          </span>
                        ))}
                      </div>
                    )}
                    {e.code && (
                      <details className="fc-tool-d">
                        <summary>التفاصيل</summary>
                        <pre className="fg-scroll" dir="ltr">
                          {e.code}
                        </pre>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}

            {/* live status line — the only indicator, and it is driven by real counts */}
            {running && (
              <div className="fc-live-line">
                <span className="fc-orb" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="fc-bar" role="progressbar" aria-valuenow={pctReal} aria-valuemin={0} aria-valuemax={100}>
                    <span className="fc-bar-fill" style={{ width: `${pctReal}%` }} data-indeterminate={planned === 0 ? "1" : "0"} />
                  </div>
                  <p className="fc-live-t">
                    {activeThink.length > 0
                      ? `${activeThink.map((t) => t.model).join(" · ")} يفكّر…`
                      : ui.stages[ui.stages.length - 1]?.label ?? "جارٍ البناء…"}
                    <span className="fc-live-n" dir="ltr">
                      {planned > 0 ? ` ${written}/${planned} وحدة · ` : " "}
                      {linesSoFar.toLocaleString("en")} سطر · {pctReal}%
                    </span>
                  </p>
                </div>
                <button type="button" className="fc-btn fc-btn-stop" onClick={stop}>
                  <Square className="size-3.5" /> إيقاف
                </button>
              </div>
            )}
          </section>

          {/* ---------- rail: preview / files / qa / sites ---------- */}
          <aside className="fc-rail fg-fade">
            <div className="fc-tabs">
              {(
                [
                  { id: "preview", label: "معاينة", icon: Eye },
                  { id: "files", label: `الملفات${tree.length ? ` (${tree.length})` : ""}`, icon: FolderTree },
                  { id: "qa", label: "الفحص", icon: ShieldCheck },
                  { id: "report", label: "التقرير", icon: Activity },
                ] as { id: Tab; label: string; icon: typeof Eye }[]
              ).map((t) => (
                <button key={t.id} type="button" className="fc-tab" data-on={tab === t.id ? 1 : 0} onClick={() => setTab(t.id)}>
                  <t.icon className="size-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "preview" && (
              <div className="fc-pane">
                {ui.html ? (
                  <>
                    <div className="fc-pane-h">
                      <div className="fc-devices">
                        {(
                          [
                            { id: "full", icon: Monitor },
                            { id: "tablet", icon: Tablet },
                            { id: "phone", icon: Smartphone },
                          ] as { id: Device; icon: typeof Monitor }[]
                        ).map((d) => (
                          <button key={d.id} type="button" className="fc-dev" data-on={device === d.id ? 1 : 0} onClick={() => setDevice(d.id)} aria-label={d.id}>
                            <d.icon className="size-4" />
                          </button>
                        ))}
                      </div>
                      <span className="fc-pane-m" dir="ltr">
                        {mergedLines.toLocaleString("en")} lines · {formatBytes(new Blob([ui.html]).size)}
                      </span>
                    </div>
                    <div className="fc-frame-wrap">
                      <iframe
                        key={`${device}-${ui.html.length}`}
                        className={cn("fc-frame", device === "phone" && "fc-frame-phone", device === "tablet" && "fc-frame-tablet")}
                        title="معاينة المشروع"
                        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
                        srcDoc={ui.html}
                      />
                    </div>
                  </>
                ) : (
                  <div className="fg-empty">المعاينة تظهر هنا فور انتهاء أول بناء — أو افتح مشروعًا منشورًا من الأسفل.</div>
                )}
              </div>
            )}

            {tab === "files" && (
              <div className="fc-pane">
                {tree.length === 0 ? (
                  <div className="fg-empty">لا توجد ملفات بعد.</div>
                ) : (
                  <>
                    <div className="fg-files">
                      {tree.map((f) => (
                        <button key={f.path} type="button" className="fg-file" data-on={activeFile === f.path ? 1 : 0} onClick={() => setActiveFile(f.path)}>
                          <span className="fg-file-p">{f.path}</span>
                          <span className="fg-file-m">
                            <span className="fg-dot fg-dot-ok" />
                            {f.data.split("\n").length.toLocaleString("en")} سطر · {formatBytes(f.data.length)}
                          </span>
                        </button>
                      ))}
                    </div>
                    {current && (
                      <div className="fg-code mt-2">
                        <div className="fg-code-h">
                          <Code2 className="size-3.5" />
                          <span className="fg-code-p">{current.path}</span>
                          <button type="button" className="fg-mini ms-auto" onClick={() => void copy(current.data, current.path)}>
                            نسخ
                          </button>
                          <button type="button" className="fg-mini" onClick={() => download(current.data, current.path.split("/").pop() ?? "file.txt", "text/plain;charset=utf-8")}>
                            تنزيل
                          </button>
                        </div>
                        <pre>{current.data.slice(0, 200_000)}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "qa" && (
              <div className="fc-pane">
                {ui.qa ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="fg-ring" style={{ ["--v" as string]: String(ui.qa.score) }}>
                        <b>{ui.qa.score}</b>
                      </div>
                      <div className="text-[12.5px] text-[var(--v12-dim)]">
                        <div className="font-extrabold text-[var(--v12-text)]">
                          {qaErrors === 0 ? "بلا أخطاء تمنع التشغيل" : `${qaErrors} خطأ يجب إصلاحه`}
                        </div>
                        <div>{ui.qa.issues.length} ملاحظة · {ui.qa.repaired} إصلاح تلقائي</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {ui.qa.checks.map((c) => (
                        <div key={c.name} className="fg-check" data-ok={c.ok ? 1 : 0}>
                          {c.ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                          <span className="text-[12px]">{c.name}</span>
                          {c.detail && <span className="ms-auto text-[11px] text-[var(--v12-faint)]">{c.detail}</span>}
                        </div>
                      ))}
                      {ui.qa.issues.slice(0, 40).map((is, i) => (
                        <div key={i} className="fg-issue">
                          <b>{is.level === "error" ? "خطأ" : "تنبيه"}</b> · {is.where} — {is.text}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="fg-empty">الفحص الآلي يشتغل بعد التجميع: أخطاء JS، نقص الوحدات، روابط ميتة، حشو مكرر.</div>
                )}
              </div>
            )}

            {tab === "report" && (
              <div className="fc-pane">
                <div className="fc-rep">
                  {ui.meta && (
                    <>
                      <div className="fc-metric"><span>المدة</span><b>{formatMs(ui.meta.ms)}</b></div>
                      <div className="fc-metric"><span>الوحدات</span><b>{ui.meta.modules}</b></div>
                      <div className="fc-metric"><span>الأسطر</span><b>{ui.meta.lines.toLocaleString("en")}</b></div>
                      <div className="fc-metric"><span>الحجم</span><b>{formatBytes(ui.meta.bytes)}</b></div>
                    </>
                  )}
                  {ui.stats && (
                    <>
                      <div className="fc-metric"><span>الاستدعاءات</span><b>{ui.stats.calls}</b></div>
                      <div className="fc-metric"><span>المحاولات</span><b>{ui.stats.retries}</b></div>
                      <div className="fc-metric"><span>الإصلاحات</span><b>{ui.stats.repairs}</b></div>
                      <div className="fc-metric"><span>الملفات</span><b>{ui.stats.files}</b></div>
                    </>
                  )}
                </div>
                {ui.models.length > 0 && (
                  <div className="fg-ticker mt-3">
                    {ui.models.slice(-40).reverse().map((m, i) => (
                      <div key={i} className="fg-tick">
                        <span className={cn("fg-dot", m.state === "fail" ? "fg-dot-bad" : m.state === "retry" ? "fg-dot-warn" : "fg-dot-ok")} />
                        <b>{m.model}</b>
                        <span>{ROLE_AR[m.role] ?? m.role}</span>
                        {m.path && <code>{m.path}</code>}
                        {m.ms ? <code>{formatMs(m.ms)}</code> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* real published projects — nothing here is decorative */}
            {(sites.length > 0 || gallery.length > 0) && (
              <div className="fc-pane fc-sites">
                <span className="fc-pane-t">مشاريعك المنشورة</span>
                <div className="fg-sites">
                  {sites.slice(0, 6).map((s) => (
                    <div key={s.slug} className="fg-site">
                      <span className="fg-site-t">{s.title}</span>
                      <span className="fg-site-m">
                        <span>{s.lines.toLocaleString("en")} سطر</span>·<span>{formatBytes(s.bytes)}</span>·<span>{s.views} مشاهدة</span>
                      </span>
                      <span className="fg-site-a">
                        <a className="fg-mini" href={`/live/${s.slug}`} target="_blank" rel="noreferrer">
                          فتح
                        </a>
                        <a className="fg-mini" href={`/live/${s.slug}?zip=1`}>
                          ZIP
                        </a>
                        <button type="button" className="fg-mini" onClick={() => void removeSite(s.slug)}>
                          حذف
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
                {gallery.length > 0 && (
                  <>
                    <span className="fc-pane-t mt-2">من المعرض العام</span>
                    <div className="fg-sites">
                      {gallery.slice(0, 4).map((s) => (
                        <a key={s.slug} className="fg-site" href={`/live/${s.slug}`} target="_blank" rel="noreferrer">
                          <span className="fg-site-t">{s.title}</span>
                          <span className="fg-site-m">
                            <span>{s.lines.toLocaleString("en")} سطر</span>·<span>{s.views} مشاهدة</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* ══════════ composer ══════════ */}
        <footer className="fc-composer fg-fade">
          <textarea
            className="fc-input fg-scroll"
            dir="auto"
            value={prompt}
            disabled={running}
            rows={2}
            placeholder={"صف المشروع بالتفصيل… مثال:\nصايب لي لعبة سيارة ضخمة في الصحراء الجزائرية: مستويات، أعداء، متجر، أصوات، حفظ، وتحكم باللمس والكيبورد"}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
          />

          <div className="fc-controls">
            <div className="fc-knobs">
              <button type="button" className="fc-knob" data-on={duo ? 1 : 0} onClick={() => setDuo((v) => !v)} title="محرّكان + خطة محلية ⇒ أسرع بداية">
                <Zap className="size-3.5" /> DUO — محرّكان
              </button>
              <button type="button" className="fc-knob" data-on={thinking ? 1 : 0} onClick={() => setThinking((v) => !v)} title="يعرض التفكير الحقيقي الذي يرسله المحرّك">
                <BrainCircuit className="size-3.5" /> التفكير
              </button>
              <button type="button" className="fc-knob" data-on={internet ? 1 : 0} onClick={() => setInternet((v) => !v)} title="يجلب صورًا وأصواتًا حقيقية من الويب المفتوح">
                <Globe2 className="size-3.5" /> إنترنت
              </button>
              <button type="button" className="fc-knob" data-on={publish ? 1 : 0} onClick={() => setPublish((v) => !v)} title="ينشر المشروع ويعطيك رابطًا حيًا">
                <Link2 className="size-3.5" /> رابط حي
              </button>

              <span className="fc-sep" aria-hidden />

              <div className="fc-seg" role="radiogroup" aria-label="الحجم">
                {SCALES.map((sc) => (
                  <button key={sc} type="button" role="radio" aria-checked={scale === sc} className="fc-seg-b" data-on={scale === sc ? 1 : 0} onClick={() => setScale(sc)}>
                    {SCALE_AR[sc]}
                  </button>
                ))}
              </div>

              <select className="fc-select" value={kind} onChange={(e) => setKind(e.target.value as ForgeKind | "")} aria-label="نوع المشروع">
                <option value="">نوع تلقائي</option>
                {FORGE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {KIND_AR[k.id] ?? k.ar}
                  </option>
                ))}
              </select>
            </div>

            <div className="fc-go-wrap">
              <span className="fc-hint">
                {user ? (
                  <>
                    <kbd className="nx-kbd">Ctrl</kbd> + <kbd className="nx-kbd">Enter</kbd> للبناء
                  </>
                ) : (
                  "سجّل الدخول لتشغيل الورشة"
                )}
              </span>
              {running ? (
                <button type="button" className="fc-btn fc-btn-stop fc-btn-big" onClick={stop}>
                  <Square className="size-4" /> إيقاف البناء
                </button>
              ) : (
                <button type="button" className="fc-btn fc-btn-primary fc-btn-big" disabled={!prompt.trim() || !user} onClick={() => void run()}>
                  {duo ? <Zap className="size-4" /> : <Hammer className="size-4" />}
                  {duo ? "ابنِ بمحرّكين" : "ابنِ المشروع"}
                </button>
              )}
            </div>
          </div>

          {engines.length > 0 && (
            <div className="fc-engines">
              {engines.map((e) => {
                const hot = ui.models.some((m) => m.key === e.key && (m.state === "start" || m.state === "retry"));
                const used = ui.models.some((m) => m.key === e.key && m.state === "done");
                return (
                  <span key={e.key} className="fc-engine" data-hot={hot ? 1 : 0} data-used={used ? 1 : 0} title={e.roles.map((r) => ROLE_AR[r] ?? r).join(" · ")}>
                    {hot ? <Loader2 className="size-3 animate-spin" /> : <span className={cn("fc-dot", used ? "fc-dot-ok" : "")} />}
                    {e.label}
                  </span>
                );
              })}
            </div>
          )}
        </footer>
      </div>

      {notice && <div className="ds-toast">{notice}</div>}
      {restored && !running && (
        <button type="button" className="fc-restored" onClick={() => setRestored(false)}>
          <RefreshCw className="size-3.5" /> استرجعنا آخر بناء — اضغط لإخفاء هذا الشريط
        </button>
      )}
    </div>
  );
}
