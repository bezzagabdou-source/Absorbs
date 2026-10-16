"use client";

/**
 * NEXUS DESIGN v19 — استوديو فحص وتحسين المواقع
 * ---------------------------------------------------------------------------
 * 1) الفحص: محرّك قواعد محلي (design-kb + web-audit) يعمل في المتصفح أيضًا ⇒
 *    نقطة فورية أثناء اللصق، وبلا تكلفة.
 * 2) التحسين: /api/design/improve يبثّ الرموز حيّة من أقوى محرّك متاح، ثم
 *    يعيد الفحص ⇒ «قبل / بعد»، مع معاينة ومقارنة وتنزيل ورابط حي.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Crown,
  Download,
  Eye,
  Gauge,
  Globe2,
  Layers,
  Link2,
  Loader2,
  Monitor,
  Palette,
  Play,
  RefreshCw,
  ScanSearch,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Wand2,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { CAT_AR, SEV_AR, type DesignCat, type Severity } from "@/lib/design-kb";
import { auditHtml, makeImproveParser, type AuditReport, type ImproveEvent } from "@/lib/web-audit";
import { DEPTH_AR, type DesignDepth } from "@/lib/design-contract";

/* ------------------------------------------------------------------ types */
type Tab = "code" | "url" | "sites";
type Device = "desktop" | "tablet" | "phone";
type Site = { slug: string; title: string; kind: string; bytes: number; lines: number; views: number; createdAt: string; visibility: string };
type KbInfo = { rules: number; detectors: number; categories: { id: string; ar: string; rules: number }[] };

const SEV_ORDER: Severity[] = ["critical", "major", "minor", "polish"];
const LANGS = [
  { id: "ar", label: "العربية" },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];
const DEPTHS: DesignDepth[] = ["light", "deep", "rebuild"];
const DEPTH_SUB: Record<DesignDepth, string> = {
  light: "نفس البنية — ألوان وخطوط ومسافات وإتاحة وصول أنظف",
  deep: "نظام تصميم كامل: شبكة، تسلسل بصري، مكوّنات، حركة، استجابة",
  rebuild: "إعادة تنفيذ بنفس المحتوى بمستوى 2026 و900+ سطر",
};

/** مثال ضعيف مقصود — ليُجرّب المستخدم المحرّك فورًا ويشفر الفرق. */
const SAMPLE_HTML = `<!doctype html>
<html>
<head><title>متجري</title></head>
<body bgcolor="#ffffff">
<div style="width:100%">
  <div style="font-size:40px;color:#cccccc">متجر الصحراء</div>
  <div>مرحبا بكم في متجرنا نحن نبيع كل شيء</div>
  <div style="display:flex">
    <div style="border:1px solid black;padding:2px">منتج 1</div>
    <div style="border:1px solid black;padding:2px">منتج 2</div>
    <div style="border:1px solid black;padding:2px">منتج 3</div>
  </div>
  <form>
    <input type="text" placeholder="الاسم">
    <input type="email" placeholder="البريد">
    <button onclick="alert('ok')">ارسال</button>
  </form>
  <img src="logo.png">
  <div style="color:#dddddd">جميع الحقوق محفوظة</div>
</div>
</body>
</html>`;

const scoreColor = (n: number) => (n >= 85 ? "#22c55e" : n >= 70 ? "var(--v12-accent)" : n >= 50 ? "#f59e0b" : "#ef4444");
const sevColor = (s: Severity) => (s === "critical" ? "#ef4444" : s === "major" ? "#f59e0b" : s === "minor" ? "#38bdf8" : "#a78bfa");
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1_048_576).toFixed(2)} MB`);

export default function DesignStudio() {
  const { user, authFetch } = useAuth();
  const { profile, refresh } = useCredits();
  const isPro = profile?.plan === "pro";

  /* ------------------------------------------------------------- source */
  const [tab, setTab] = useState<Tab>("code");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [slug, setSlug] = useState("");
  const [kbInfo, setKbInfo] = useState<KbInfo | null>(null);

  /* ------------------------------------------------------------- options */
  const [depth, setDepth] = useState<DesignDepth>("deep");
  const [lang, setLang] = useState("ar");
  const [keep, setKeep] = useState("");
  const [publishOn, setPublishOn] = useState(true);

  /* ------------------------------------------------------------- results */
  const [report, setReport] = useState<AuditReport | null>(null);
  const [after, setAfter] = useState<AuditReport | null>(null);
  const [improved, setImproved] = useState("");
  const [live, setLive] = useState<{ url: string; slug: string } | null>(null);
  const [busy, setBusy] = useState<"" | "audit" | "improve">("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [stream, setStream] = useState("");
  const [chars, setChars] = useState(0);
  const [resultTab, setResultTab] = useState<"preview" | "compare" | "code">("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [view, setView] = useState<"before" | "after">("after");
  const [sevFilter, setSevFilter] = useState<Severity | "">("");
  const [catFilter, setCatFilter] = useState<DesignCat | "">("");

  const abortRef = useRef<AbortController | null>(null);
  const bufRef = useRef("");
  const lastPaint = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  /* ------------------------------------------------------------ bootstrap */
  const loadSites = useCallback(async () => {
    if (!user) return;
    try {
      const r = await authFetch("/api/live?list=1");
      if (r.ok) {
        const j = (await r.json()) as { sites?: Site[] };
        setSites(j.sites ?? []);
      }
    } catch {
      /* ignore */
    }
  }, [user, authFetch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async bootstrap, not a synchronous cascade
    void loadSites();
    let dead = false;
    void (async () => {
      try {
        const r = await fetch("/api/design/audit?check=1");
        if (r.ok && !dead) setKbInfo((await r.json()) as KbInfo);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      dead = true;
    };
  }, [loadSites]);

  /* ------------------------------------- instant local audit while typing */
  useEffect(() => {
    if (tab !== "code" || !code.trim()) return;
    const id = setTimeout(() => {
      try {
        setReport(auditHtml(code, { lang }));
        setErr("");
      } catch {
        /* ignore */
      }
    }, 420);
    return () => clearTimeout(id);
  }, [code, tab, lang]);

  /* ------------------------------------------------------------- payload */
  const sourceBody = useMemo<Record<string, unknown>>(() => {
    if (tab === "url") return { url: url.trim() };
    if (tab === "sites") return { slug };
    return { html: code };
  }, [tab, url, slug, code]);

  const canRun = tab === "code" ? code.trim().length > 40 : tab === "url" ? /^https?:\/\//i.test(url.trim()) : !!slug;

  /* --------------------------------------------------------------- audit */
  const runAudit = useCallback(async () => {
    if (!canRun) return;
    if (tab === "code") {
      try {
        setReport(auditHtml(code, { lang }));
        setAfter(null);
        setErr("");
        flash("تم الفحص محليًا — بلا تكلفة ⚡");
      } catch (e) {
        setErr(`تعذّر الفحص: ${(e as Error).message}`);
      }
      return;
    }
    setBusy("audit");
    setErr("");
    setAfter(null);
    try {
      const r = await authFetch("/api/design/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sourceBody, lang }),
      });
      const j = (await r.json().catch(() => null)) as { report?: AuditReport; code?: string; detail?: string } | null;
      if (!r.ok || !j?.report) throw new Error(j?.detail || j?.code || `HTTP ${r.status}`);
      setReport(j.report);
      flash("تم الفحص ✅");
    } catch (e) {
      setErr((e as Error).message || "تعذّر الفحص");
    } finally {
      setBusy("");
    }
  }, [canRun, tab, code, lang, authFetch, sourceBody, flash]);

  /* ------------------------------------------------------------- improve */
  const runImprove = useCallback(async () => {
    if (!user) {
      setErr("سجّل الدخول أولًا لاستعمال التحسين بالذكاء الاصطناعي");
      return;
    }
    if (!canRun) return;

    const ac = new AbortController();
    abortRef.current = ac;
    bufRef.current = "";
    lastPaint.current = 0;
    setBusy("improve");
    setErr("");
    setStages([]);
    setStream("");
    setChars(0);
    setAfter(null);
    setImproved("");
    setLive(null);
    setModel("");
    setResultTab("preview");

    let gotHtml = false;
    const paint = () => {
      setStream(bufRef.current.slice(-120_000));
      setChars(bufRef.current.length);
    };

    const onEvent = (e: ImproveEvent) => {
      switch (e.t) {
        case "start":
          setModel(e.model);
          setStages([`بدأ ${e.model} — النقطة قبل: ${e.before}/100 · ${e.findings} ملاحظة · ${e.lines} سطر`]);
          break;
        case "stage":
          setStages((s) => [...s, e.label]);
          break;
        case "delta":
          bufRef.current += e.d;
          if (Date.now() - lastPaint.current > 140) {
            lastPaint.current = Date.now();
            paint();
          }
          break;
        case "html":
          gotHtml = true;
          setImproved(e.html);
          paint();
          break;
        case "audit":
          setAfter(e.report);
          break;
        case "live":
          setLive({ url: e.url, slug: e.slug });
          break;
        case "done":
          setStages((s) => [...s, `انتهى في ${(e.ms / 1000).toFixed(1)} ثانية — ${e.before} ← ${e.after}`]);
          break;
        case "error":
          setErr(e.detail || e.code);
          break;
      }
    };

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/design/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...sourceBody, depth, lang, keep: keep.trim(), publish: publishOn }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { code?: string; detail?: string } | null;
        throw new Error(j?.detail || j?.code || `HTTP ${res.status}`);
      }
      const parse = makeImproveParser(onEvent);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const step = await reader.read();
        if (step.done) break;
        parse(dec.decode(step.value, { stream: true }));
      }
      parse(dec.decode());
      paint();
      // the stream was cut before the `html` event: salvage what the model wrote
      if (!gotHtml && bufRef.current.length > 200) setImproved(bufRef.current.trim());
      if (gotHtml) flash("التحسين جاهز ✨");
      void refresh();
    } catch (e) {
      if (ac.signal.aborted) flash("أُوقف التحسين");
      else setErr((e as Error).message || "تعذّر التحسين");
    } finally {
      setBusy("");
      abortRef.current = null;
    }
  }, [user, canRun, sourceBody, depth, lang, keep, publishOn, flash, refresh]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy("");
  }, []);

  /* --------------------------------------------------------------- publish */
  const publishNow = useCallback(async () => {
    if (!user || !improved) return;
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: `${report ? "تحسين" : "مشروع"} — ${new Date().toLocaleDateString("ar-DZ")}`, kind: "site", language: lang, html: improved }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; detail?: string } | null;
      if (r.ok && j?.ok && j.url) {
        setLive({ url: j.url, slug: j.url.split("/live/")[1] ?? "" });
        flash("الرابط الحي جاهز ✅");
        void loadSites();
      } else flash(j?.detail || "تعذّر النشر");
    } catch {
      flash("تعذّر النشر — تحقق من الاتصال");
    }
  }, [user, improved, report, lang, flash, loadSites]);

  const download = useCallback(() => {
    if (!improved) return;
    const blob = new Blob([improved], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-design.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash("نُزّل الملف ⬇️");
  }, [improved, flash]);

  const copyCode = useCallback(async () => {
    if (!improved) return;
    try {
      await navigator.clipboard.writeText(improved);
      flash("نُسخ الكود 📋");
    } catch {
      flash("تعذّر النسخ");
    }
  }, [improved, flash]);

  /* -------------------------------------------------------------- derived */
  const findings = useMemo(() => {
    const list = report?.findings ?? [];
    return list.filter((f) => (!sevFilter || f.sev === sevFilter) && (!catFilter || f.cat === catFilter));
  }, [report, sevFilter, catFilter]);

  const sevCount = useMemo(() => {
    const m: Record<Severity, number> = { critical: 0, major: 0, minor: 0, polish: 0 };
    for (const f of report?.findings ?? []) m[f.sev] += 1;
    return m;
  }, [report]);

  const delta = after && report ? after.score - report.score : null;
  const previewHtml = view === "after" && improved ? improved : tab === "code" ? code : "";
  const stats = report?.stats;

  /* --------------------------------------------------------------- render */
  return (
    <div className="fg-page mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-3 pb-14 pt-4 sm:px-5">
      <div className="fg-aura" />

      {/* ══════════ header ══════════ */}
      <header className="fg-fade">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="v12-eyebrow">ميزة v19</span>
          <span className="fg-chip" style={{ cursor: "default" }}>
            <Layers className="h-3.5 w-3.5" /> {kbInfo ? `${kbInfo.rules} قاعدة تصميم` : "قاعدة تصميم ضخمة"}
          </span>
          <span className="fg-chip" style={{ cursor: "default" }}>
            <ScanSearch className="h-3.5 w-3.5" /> {kbInfo?.detectors ?? 0} كاشف آلي
          </span>
          <span className="fg-chip" style={{ cursor: "default" }}>
            <Gauge className="h-3.5 w-3.5" /> WCAG 2.2 AA
          </span>
          {!isPro && (
            <a href="/app/upgrade" className="fg-chip">
              <Crown className="h-3.5 w-3.5" /> Pro: تحسينات أعمق
            </a>
          )}
        </div>
        <h1 className="v12-display flex items-center gap-3 text-[clamp(28px,5.4vw,44px)]">
          <Palette className="h-8 w-8 text-[var(--v12-accent)]" />
          استوديو التصميم
        </h1>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-[var(--v12-dim)]">
          الصق كود موقع، أو أعطِ رابطًا، أو اختر واحدًا من مواقعك المنشورة — نفحصه بـ<b className="text-[var(--v12-text)]">قاعدة بيانات تصميم ضخمة</b> (تخطيط، ألوان، خطوط، مسافات، حركة، إتاحة وصول، أداء، عربية/RTL…)
          ونعطيك نقطة من 100 مع <b className="text-[var(--v12-text)]">الدليل على كل ملاحظة</b>، ثم <b className="text-[var(--v12-text)]">نحسّنه بالذكاء الاصطناعي</b> ونريك الفرق قبل/بعد مع رابط حي.
        </p>
      </header>

      {/* ══════════ source + options ══════════ */}
      <section className="fg-card fg-fade flex flex-col gap-3 p-3.5 sm:p-4">
        <div className="fg-tabs">
          {(
            [
              { id: "code", label: "الصق الكود", icon: Code2 },
              { id: "url", label: "رابط موقع", icon: Globe2 },
              { id: "sites", label: "مواقعي المنشورة", icon: Link2 },
            ] as { id: Tab; label: string; icon: typeof Code2 }[]
          ).map((t) => (
            <button key={t.id} type="button" className="fg-tab inline-flex items-center gap-2" data-on={tab === t.id ? 1 : 0} onClick={() => setTab(t.id)}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.id === "sites" && sites.length > 0 ? ` (${sites.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "code" && (
          <div className="flex flex-col gap-2">
            <textarea
              className="fg-input fg-scroll min-h-[220px] font-mono text-[12.5px] [direction:ltr]"
              value={code}
              disabled={busy === "improve"}
              spellCheck={false}
              placeholder={"<!doctype html>\n<html lang=\"ar\" dir=\"rtl\">\n… الصق هنا كامل الملف (HTML/CSS/JS) …"}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--v12-faint)]">
              <span>{code.length.toLocaleString("en")} حرف</span>
              <span>·</span>
              <span>{code ? code.split("\n").length.toLocaleString("en") : 0} سطر</span>
              <button type="button" className="fg-mini" onClick={() => setCode(SAMPLE_HTML)}>
                جرّب مثالًا ضعيفًا
              </button>
              {code && (
                <button type="button" className="fg-mini" onClick={() => { setCode(""); setReport(null); }}>
                  مسح
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "url" && (
          <div className="flex flex-col gap-2">
            <input
              className="fg-input min-h-0 py-3 [direction:ltr] text-start font-mono text-[13px]"
              value={url}
              disabled={busy === "improve"}
              placeholder="https://example.com"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runAudit();
              }}
            />
            <p className="text-[11.5px] text-[var(--v12-faint)]">
              نجلب الصفحة من الخادم (حماية من الروابط الداخلية) ونفحص HTML الحقيقي كما يُرسَل للمتصفح.
            </p>
          </div>
        )}

        {tab === "sites" && (
          <div className="flex flex-col gap-2">
            {sites.length === 0 ? (
              <div className="fg-empty">
                لا توجد مواقع منشورة بعد — ابنِ واحدًا من <a href="/app/code" className="text-[var(--v12-accent)] underline underline-offset-4">Nexus Code</a> ثم ارجع هنا لتحسينه.
              </div>
            ) : (
              <div className="fg-sites">
                {sites.map((s) => (
                  <button key={s.slug} type="button" className="fg-site text-start" data-on={slug === s.slug ? 1 : 0} onClick={() => setSlug(s.slug)} style={slug === s.slug ? { borderColor: "color-mix(in srgb, var(--v12-accent) 55%, transparent)" } : undefined}>
                    <span className="fg-site-t">{s.title}</span>
                    <span className="fg-site-m">
                      <span>{s.lines.toLocaleString("en")} سطر</span>
                      <span>·</span>
                      <span>{kb(s.bytes)}</span>
                      <span>·</span>
                      <span>{s.views} مشاهدة</span>
                    </span>
                    <span className="fg-site-m">
                      <code style={{ direction: "ltr" }}>/live/{s.slug}</code>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* depth */}
        <div className="grid gap-2 sm:grid-cols-3">
          {DEPTHS.map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy === "improve"}
              onClick={() => setDepth(d)}
              className="ds-depth flex flex-col gap-1 p-3 text-start"
              data-on={depth === d ? 1 : 0}
            >
              <span className="flex items-center gap-2 text-[13px] font-extrabold text-[var(--v12-text)]">
                {d === "light" ? <Sparkles className="h-4 w-4" /> : d === "deep" ? <Wand2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                {DEPTH_AR[d]}
              </span>
              <span className="text-[11.5px] leading-relaxed text-[var(--v12-faint)]">{DEPTH_SUB[d]}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 lg:grid-cols-[1fr_220px]">
          <input
            className="fg-input min-h-0 py-3"
            value={keep}
            disabled={busy === "improve"}
            placeholder="ما الذي يجب أن يبقى كما هو؟ (اختياري) — مثال: لا تغيّر النصوص ولا الألوان الرئيسية"
            onChange={(e) => setKeep(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="fg-tabs flex-1">
              {LANGS.map((l) => (
                <button key={l.id} type="button" className="fg-tab flex-1" data-on={lang === l.id ? 1 : 0} onClick={() => setLang(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
            <button type="button" className="fg-chip" aria-pressed={publishOn} onClick={() => setPublishOn((v) => !v)} title="ينشر النسخة المحسَّنة ويعطيك رابطًا حيًا">
              <Globe2 className="h-3.5 w-3.5" /> رابط حي
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="fg-go" disabled={!canRun || busy !== ""} onClick={() => void runImprove()}>
            {busy === "improve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            حسّنه بالذكاء الاصطناعي
          </button>
          <button type="button" className="fg-stop inline-flex items-center gap-2" disabled={!canRun || busy !== ""} onClick={() => void runAudit()}>
            {busy === "audit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            افحص فقط (مجاني)
          </button>
          {busy === "improve" && (
            <button type="button" className="fg-stop inline-flex items-center gap-2" onClick={stop}>
              <Square className="h-4 w-4" /> إيقاف
            </button>
          )}
          <span className="text-[11.5px] text-[var(--v12-faint)]">الفحص محلي ومجاني · التحسين يستهلك رصيدًا كأي بناء</span>
        </div>

        {err && (
          <div className="ds-alert">
            <AlertTriangle className="h-4 w-4" /> {err}
          </div>
        )}
      </section>

      {/* ══════════ live improvement ══════════ */}
      {busy === "improve" && (
        <section className="fg-card fg-fade flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="fg-forge">
              <i>🎨</i>
            </span>
            <div className="flex-1">
              <div className="text-[14px] font-extrabold text-[var(--v12-text)]">جارٍ التحسين — {model || "…"}</div>
              <div className="text-[12px] text-[var(--v12-dim)]">
                {chars.toLocaleString("en")} حرف كُتبت · {stages.length} مرحلة · {DEPTH_AR[depth]}
              </div>
            </div>
            <span className="fg-pct" style={{ color: scoreColor(report?.score ?? 0) }}>
              {report?.score ?? 0}
            </span>
          </div>
          <div className="fg-bar">
            <div className="fg-bar-fill" style={{ width: `${Math.min(96, 8 + chars / 4000)}%` }} />
          </div>
          <div className="fg-rail">
            {stages.map((s, i) => (
              <div key={`${s}-${i}`} className="fg-step" data-on={i === stages.length - 1 ? 1 : 0}>
                <span className="fg-step-dot" />
                <span>{s}</span>
              </div>
            ))}
          </div>
          {stream && (
            <div className="fg-code">
              <div className="fg-code-h">
                <Play className="h-3.5 w-3.5" />
                <span className="fg-code-p">يُكتب الآن…</span>
              </div>
              <pre>{stream.slice(-9000)}</pre>
            </div>
          )}
        </section>
      )}

      {/* ══════════ report ══════════ */}
      {report && (
        <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="fg-card fg-fade flex flex-col gap-3 p-4">
            <div className="flex items-center gap-4">
              <div className="fg-ring" style={{ ["--v" as string]: String(report.score) }}>
                <b style={{ color: scoreColor(report.score) }}>{report.score}</b>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-extrabold text-[var(--v12-text)]">
                  النقطة: {report.grade} {after ? "→ " + after.grade : ""}
                </span>
                <span className="text-[12px] text-[var(--v12-dim)]">{report.findings.length} ملاحظة من {kbInfo?.rules ?? 0} قاعدة</span>
                {delta !== null && (
                  <span className="ds-delta" data-up={delta > 0 ? 1 : delta < 0 ? -1 : 0}>
                    {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "＝ بلا تغيير"} نقطة بعد التحسين
                  </span>
                )}
              </div>
            </div>

            {after && (
              <div className="ds-compare">
                <div className="ds-cmp">
                  <span>قبل</span>
                  <b style={{ color: scoreColor(report.score) }}>{report.score}</b>
                </div>
                <div className="ds-cmp-arrow">←</div>
                <div className="ds-cmp" data-win={after.score > report.score ? 1 : 0}>
                  <span>بعد</span>
                  <b style={{ color: scoreColor(after.score) }}>{after.score}</b>
                </div>
              </div>
            )}

            {stats && (
              <div className="ds-stats">
                {[
                  ["أسطر", stats.lines.toLocaleString("en")],
                  ["الحجم", kb(stats.bytes)],
                  ["عناصر", stats.nodes.toLocaleString("en")],
                  ["صور", String(stats.images)],
                  ["أزرار", String(stats.buttons)],
                  ["حقول", String(stats.inputs)],
                  ["أقسام", String(stats.sections)],
                  ["سكربتات", String(stats.scripts)],
                  ["تنسيقات", String(stats.styles)],
                  ["رموز CSS", String(stats.tokens)],
                  ["استعلامات الوسائط", String(stats.mediaQueries)],
                  ["عربية / RTL", `${stats.arabic ? "نعم" : "لا"} / ${stats.rtl ? "نعم" : "لا"}`],
                ].map(([k, v]) => (
                  <div key={k} className="ds-stat">
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* category scores */}
          <div className="fg-card fg-fade flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="fg-card-t">المحاور — الأضعف أولًا</span>
              {catFilter && (
                <button type="button" className="fg-mini" onClick={() => setCatFilter("")}>
                  إلغاء الفلتر
                </button>
              )}
            </div>
            <div className="ds-cats">
              {report.byCat.map((c) => (
                <button
                  key={c.cat}
                  type="button"
                  className="ds-cat"
                  data-on={catFilter === c.cat ? 1 : 0}
                  onClick={() => setCatFilter(catFilter === c.cat ? "" : c.cat)}
                  title={`${c.findings} ملاحظة في ${c.ar}`}
                >
                  <span className="ds-cat-n">{c.ar}</span>
                  <span className="fg-bar ds-cat-bar">
                    <span className="fg-bar-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score), animation: "none" }} />
                  </span>
                  <span className="ds-cat-s" style={{ color: scoreColor(c.score) }}>
                    {c.score}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {SEV_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="fg-chip"
                  aria-pressed={sevFilter === s}
                  onClick={() => setSevFilter(sevFilter === s ? "" : s)}
                  disabled={sevCount[s] === 0}
                >
                  <span className="ds-dot" style={{ background: sevColor(s) }} />
                  {SEV_AR[s]} · {sevCount[s]}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══════════ findings ══════════ */}
      {report && report.findings.length > 0 && (
        <section className="fg-card fg-fade flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="fg-card-t">
              الملاحظات ({findings.length}
              {findings.length !== report.findings.length ? ` من ${report.findings.length}` : ""})
            </span>
            <span className="fg-card-s">كل ملاحظة معها الدليل من كودك + الإصلاح</span>
          </div>
          <div className="ds-findings fg-scroll">
            {findings.slice(0, 120).map((f, i) => (
              <div key={`${f.ruleId}-${i}`} className="ds-find" data-sev={f.sev}>
                <div className="ds-find-h">
                  <span className="ds-sev" data-sev={f.sev} style={{ borderColor: `${sevColor(f.sev)}66`, color: sevColor(f.sev) }}>
                    {SEV_AR[f.sev]}
                  </span>
                  <span className="ds-cat-chip">{CAT_AR[f.cat]}</span>
                  <span className="ds-find-ar">{f.ar}</span>
                  {f.count > 1 && <span className="ds-count">×{f.count}</span>}
                </div>
                {f.evidence && <code className="ds-ev">{f.evidence}</code>}
                <div className="ds-fix">
                  <Check className="h-3.5 w-3.5" /> {f.fix}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {report && report.findings.length === 0 && (
        <section className="fg-card fg-fade p-6 text-center">
          <div className="text-[15px] font-extrabold text-[var(--v12-text)]">لا توجد ملاحظات — تصميم نظيف 🎉</div>
          <p className="mt-1 text-[13px] text-[var(--v12-dim)]">ما زال بإمكانك رفع المستوى بـ«إعادة بناء عصرية».</p>
        </section>
      )}

      {/* ══════════ result ══════════ */}
      {improved && (
        <section className="fg-card fg-fade flex flex-col gap-3 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="fg-tabs">
              {(
                [
                  { id: "preview", label: "معاينة", icon: Eye },
                  { id: "compare", label: "قبل / بعد", icon: Layers },
                  { id: "code", label: "الكود", icon: Code2 },
                ] as { id: typeof resultTab; label: string; icon: typeof Eye }[]
              ).map((t) => (
                <button key={t.id} type="button" className="fg-tab inline-flex items-center gap-2" data-on={resultTab === t.id ? 1 : 0} onClick={() => setResultTab(t.id)}>
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="fg-tabs">
              {(
                [
                  { id: "desktop", icon: Monitor },
                  { id: "tablet", icon: Tablet },
                  { id: "phone", icon: Smartphone },
                ] as { id: Device; icon: typeof Monitor }[]
              ).map((d) => (
                <button key={d.id} type="button" className="fg-tab" data-on={device === d.id ? 1 : 0} onClick={() => setDevice(d.id)} aria-label={d.id}>
                  <d.icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <div className="ms-auto flex flex-wrap items-center gap-2">
              <button type="button" className="fg-chip" onClick={download}>
                <Download className="h-3.5 w-3.5" /> تنزيل HTML
              </button>
              <button type="button" className="fg-chip" onClick={() => void copyCode()}>
                <Copy className="h-3.5 w-3.5" /> نسخ
              </button>
              {!live && (
                <button type="button" className="fg-chip" onClick={() => void publishNow()}>
                  <Globe2 className="h-3.5 w-3.5" /> انشر
                </button>
              )}
              <button type="button" className="fg-chip" onClick={() => setCode(improved)}>
                <RefreshCw className="h-3.5 w-3.5" /> اجعله المصدر
              </button>
            </div>
          </div>

          {live && (
            <div className="fg-live">
              <span className="fg-live-dot" />
              <a href={live.url} target="_blank" rel="noreferrer">
                {live.url}
              </a>
              <button type="button" className="fg-mini ms-auto" onClick={() => void navigator.clipboard.writeText(live.url).then(() => flash("نُسخ الرابط 🔗"))}>
                نسخ
              </button>
            </div>
          )}

          {resultTab === "preview" && (
            <>
              <div className="fg-tabs w-fit">
                {(["after", "before"] as const).map((v) => (
                  <button key={v} type="button" className="fg-tab" data-on={view === v ? 1 : 0} onClick={() => setView(v)}>
                    {v === "after" ? "بعد التحسين" : "الأصل"}
                  </button>
                ))}
              </div>
              <div className="fg-frame-wrap">
                <iframe
                  key={`${view}-${device}-${improved.length}`}
                  className={`fg-frame ${device === "phone" ? "fg-frame-phone" : device === "tablet" ? "fg-frame-tablet" : ""}`}
                  title="معاينة التصميم"
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  srcDoc={previewHtml}
                />
              </div>
            </>
          )}

          {resultTab === "compare" && (
            <div className="grid gap-3 lg:grid-cols-2">
              {[
                { k: "before", label: `قبل — ${report?.score ?? 0}/100`, html: tab === "code" ? code : "" },
                { k: "after", label: `بعد — ${after?.score ?? 0}/100`, html: improved },
              ].map((p) => (
                <div key={p.k} className="flex flex-col gap-2">
                  <span className="fg-card-t">{p.label}</span>
                  <div className="fg-frame-wrap">
                    {p.html ? (
                      <iframe className="fg-frame" style={{ height: "56vh" }} title={p.label} sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={p.html} />
                    ) : (
                      <div className="fg-empty">الأصل غير متوفّر محليًا (مصدره رابط أو موقع منشور) — عاين «بعد» في تبويب المعاينة.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {resultTab === "code" && (
            <div className="fg-code">
              <div className="fg-code-h">
                <Code2 className="h-3.5 w-3.5" />
                <span className="fg-code-p">nexus-design.html</span>
                <span className="fg-card-s ms-auto">
                  {improved.split("\n").length.toLocaleString("en")} سطر · {kb(new Blob([improved]).size)}
                </span>
              </div>
              <pre>{improved.slice(0, 400_000)}</pre>
            </div>
          )}
        </section>
      )}

      {/* ══════════ knowledge base ══════════ */}
      {kbInfo && (
        <section className="fg-card fg-fade flex flex-col gap-3 p-4">
          <span className="fg-card-t">قاعدة بيانات التصميم — {kbInfo.rules} قاعدة في {kbInfo.categories.length} محورًا</span>
          <div className="flex flex-wrap gap-2">
            {kbInfo.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="fg-chip"
                aria-pressed={catFilter === c.id}
                onClick={() => setCatFilter(catFilter === c.id ? "" : (c.id as DesignCat))}
              >
                <span className="ds-dot" style={{ background: report?.byCat.find((x) => x.cat === c.id) ? scoreColor(report.byCat.find((x) => x.cat === c.id)!.score) : "var(--v12-line-strong)" }} />
                {c.ar} · {c.rules}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] leading-relaxed text-[var(--v12-faint)]">
            كل قاعدة لها كاشف آلي (regex/تحليل دلالي) + وزن + إصلاح مكتوب. نفس القاعدة تُستعمل مرتين: مرة في الفحص لتسجيل الملاحظة، ومرة داخل النص النظامي للمحرّك
            كي يكون الإصلاح موجّهًا لما وُجد فعلًا في ملفك — لا نصائح عامة.
          </p>
        </section>
      )}

      {toast && <div className="ds-toast">{toast}</div>}
    </div>
  );
}
