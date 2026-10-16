/**
 * NEXUS FORGE v19 — ورشة البناء (the orchestrator)
 * ---------------------------------------------------------------------------
 * architect → parallel module waves (a different engine per module) → automatic QA
 * → repair with another engine → assemble one self-contained file + a real tree.
 *
 * `forgeBuild()` is an async generator of NDJSON-friendly events so the browser can
 * watch every stage, every model and every line as they happen.
 *
 * Server-only.
 */
import {
  FORGE_MAX_FILE_LINES,
  FORGE_MAX_MODULES,
  SCALE_META,
  byteLength,
  countLines,
  qualityOf,
  type ForgeEvent,
  type ForgeFile,
  type ForgeKind,
  type ForgeMeta,
  type ForgeModule,
  type ForgePlan,
  type ForgePlanDto,
  type ForgeQa,
  type ForgeRequest,
  type ForgeRole,
  type ForgeScale,
  type ForgeStats,
  type ModelRef,
} from "@/lib/forge/types";
import { defaultPlan, guessKind, guessLanguage, guessScale, normalizePlan, parseForgePlan, planUserPrompt } from "@/lib/forge/plan";
import { askForgeModel, askRole, duoEngines, forgeConcurrency, forgePool, thinkTap, type ForgeModel } from "@/lib/forge/pool";
import { assembleSingleFile, assembleTree, stripFence, type Assembled } from "@/lib/forge/assemble";
import { architectSystem, builderSystem } from "@/lib/forge/contract";
import { patternBlock, patternsFor } from "@/lib/forge/patterns";
import { qaModule, qaProject, repairBrief } from "@/lib/forge/qa";
import { forgeNetHint } from "@/lib/forge/net";
import type { PlanId } from "@/lib/model-access";

/* ------------------------------------------------------------------ *
 * tiny event queue (lets parallel workers feed one generator)
 * ------------------------------------------------------------------ */
const CLOSE = Symbol("close");
class Queue {
  private items: (ForgeEvent | typeof CLOSE)[] = [];
  private waiters: ((v: ForgeEvent | typeof CLOSE) => void)[] = [];
  push(e: ForgeEvent) {
    const w = this.waiters.shift();
    if (w) w(e);
    else this.items.push(e);
  }
  close() {
    this.items.push(CLOSE);
    while (this.waiters.length) this.waiters.shift()!(CLOSE);
  }
  next(): Promise<ForgeEvent | typeof CLOSE> {
    const it = this.items.shift();
    if (it) return Promise.resolve(it);
    return new Promise((res) => this.waiters.push(res));
  }
}

/** Combines the client abort signal with a per-call timeout. */
function anySignal(base: AbortSignal | undefined, ms: number): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  const onAbort = () => ac.abort();
  base?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ac.signal,
    clear: () => {
      clearTimeout(t);
      base?.removeEventListener("abort", onAbort);
    },
  };
}

const MODULE_TIMEOUT: Record<ForgeScale, number> = { standard: 150_000, big: 210_000, titan: 260_000 };
const RETRIES_PER_MODULE = 2;
const KINDS: ForgeKind[] = ["game", "site", "system", "app", "tool", "landing"];

/* ------------------------------------------------------------------ *
 * digests — how parallel modules stay coherent without huge prompts
 * ------------------------------------------------------------------ */
export function digestOf(path: string, kind: string, code: string): string {
  const out: string[] = [];
  if (kind === "js") {
    const names = new Set<string>();
    for (const m of code.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of code.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
    for (const m of code.matchAll(/(?:window|NX|globalThis)\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(`NX.${m[1]}`);
    for (const m of code.matchAll(/(?:^|\n)\s*class\s+([A-Za-z_$][\w$]*)/g)) names.add(`class ${m[1]}`);
    out.push(`js ${path} defines: ${Array.from(names).slice(0, 70).join(", ") || "(none)"}`);
  } else if (kind === "html") {
    const ids = [...code.matchAll(/\sid\s*=\s*["']([\w-]+)["']/gi)].map((m) => m[1]);
    out.push(`html ${path} ids: ${Array.from(new Set(ids)).slice(0, 140).join(", ") || "(none)"}`);
  } else if (kind === "css") {
    const cls = [...code.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    const vars = [...code.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    out.push(`css ${path} classes: ${Array.from(new Set(cls)).slice(0, 90).join(", ")}`);
    out.push(`css ${path} tokens: ${Array.from(new Set(vars)).slice(0, 50).join(", ")}`);
  } else if (kind === "json") {
    try {
      const j = JSON.parse(code) as Record<string, unknown>;
      const keys = Array.isArray(j) ? `array[${j.length}]` : Object.keys(j).slice(0, 40).join(", ");
      out.push(`json ${path} top-level: ${keys}`);
    } catch {
      out.push(`json ${path}: (unparsed)`);
    }
  }
  return out.join("\n");
}

/* ------------------------------------------------------------------ *
 * prompts
 * ------------------------------------------------------------------ */
function modulePrompt(o: {
  mod: ForgeModule;
  plan: ForgePlan;
  digests: string[];
  extra: string;
  netHint: string;
  retry?: { issues: string[]; previousTail: string };
}): string {
  const { mod, plan } = o;
  const p = plan.design.palette;
  const parts: string[] = [];

  parts.push(`PROJECT: ${plan.title}`);
  parts.push(`KIND: ${plan.kind} · LANGUAGE: ${plan.language} · WHOLE PROJECT: ${plan.target.lines.toLocaleString("en")} lines across ${plan.modules.length} modules`);
  if (plan.summary) parts.push(`WHAT THE USER ASKED FOR:\n${plan.summary.slice(0, 1600)}`);
  parts.push(
    `DESIGN SYSTEM (use these exact values):\nbackground ${p.bg} · surface ${p.surface} · text ${p.text} · muted ${p.muted} · accent ${p.accent} · accent2 ${p.accent2}\ntypography: ${plan.design.typography}\nmotion: ${plan.design.motion}\nlayout: ${plan.design.layout}\n${plan.design.notes}`.slice(0, 1800)
  );
  parts.push(`PROJECT CONTRACT (obey every name in it):\n${plan.contract.slice(0, 6000)}`);

  if ((mod.kind === "html" || mod.kind === "css") && plan.shell) parts.push(`PAGE STRUCTURE:\n${plan.shell.slice(0, 2500)}`);
  if (o.digests.length) parts.push(`ALREADY WRITTEN BY OTHER ENGINES (do not redefine these, use these names):\n${o.digests.join("\n").slice(0, 4200)}`);

  parts.push(`\n═══ YOUR MODULE ═══\nid: ${mod.id}\nfile: ${mod.path}\ntype: ${mod.kind}\ntitle: ${mod.title}\nTARGET SIZE: ${mod.lines} lines of real working code (this is a floor, not a wish)`);
  parts.push(`SPEC — implement ALL of it:\n${mod.spec.slice(0, 5000)}`);

  // v20 — the local recipe database: only the entries that match this module
  const recipes = patternBlock(patternsFor({ kind: plan.kind, spec: mod.spec, title: mod.title, path: mod.path }));
  if (recipes) parts.push(recipes);
  if (mod.needs.length) parts.push(`DEPENDS ON: ${mod.needs.join(", ")} (their digest is above)`);
  if (o.extra) parts.push(`EXTRA REQUIREMENTS FROM THE USER:\n${o.extra.slice(0, 2500)}`);
  if (o.netHint) parts.push(o.netHint.slice(0, 4000));

  if (o.retry) {
    parts.push(
      `\n⚠ A PREVIOUS ANSWER FOR THIS MODULE WAS REJECTED by the automatic verifier:\n${o.retry.issues.join("\n")}\n\nIts ending was:\n${o.retry.previousTail}\n\nWrite the module again — complete, correct, at least ${mod.lines} lines, same public names.`
    );
  }

  parts.push(`\nOUTPUT: ONE fenced code block (\`\`\`${mod.kind === "html" ? "html" : mod.kind}) containing the COMPLETE file, and nothing else. No explanation before or after.`);
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ *
 * model rotation — spread the work across every engine
 * ------------------------------------------------------------------ */
class Rotation {
  private i = 0;
  constructor(private pool: ForgeModel[]) {}
  /** Next engine for a module, preferring one that has not written it yet. */
  next(used: Set<string>): ForgeModel {
    const p = this.pool;
    if (!p.length) throw new Error("NO_ENGINE");
    for (let k = 0; k < p.length; k++) {
      const m = p[(this.i + k) % p.length];
      if (!used.has(m.key)) {
        this.i = (this.i + k + 1) % p.length;
        return m;
      }
    }
    const m = p[this.i % p.length];
    this.i = (this.i + 1) % p.length;
    return m;
  }
}

/* ------------------------------------------------------------------ *
 * context shared by the pipeline and its workers
 * ------------------------------------------------------------------ */
type Ctx = {
  q: Queue;
  req: ForgeRequest;
  plan: PlanId;
  signal?: AbortSignal;
  scale: ForgeScale;
  models: ModelRef[];
  files: Map<string, ForgeFile>;
  digests: Map<string, string>;
  startedAt: number;
  calls: number;
  retries: number;
  repairs: number;
};

/**
 * v20 — streams the reasoning an engine actually emitted.
 * The tap only forwards text that arrived inside <think>/<thinking>/<reasoning>,
 * so nothing here is invented: no reasoning in the answer ⇒ no thinking block.
 */
function thinkEmitter(c: Ctx, role: ForgeRole) {
  const q = c.q;
  const buf = new Map<string, { model: string; text: string; last: number }>();
  return (m: ForgeModel, d: string) => {
    const tap = thinkTap((piece) => {
      const b = buf.get(m.key) ?? { model: m.label, text: "", last: 0 };
      b.text += piece;
      const now = Date.now();
      // flush at most ~8×/second per engine, and always flush a long buffer
      if (b.text.length >= 220 || now - b.last > 120) {
        q.push({ t: "think", key: m.key, model: m.label, role, d: b.text });
        b.text = "";
        b.last = now;
      }
      buf.set(m.key, b);
    });
    tap(d);
  };
}

/** Flushes whatever reasoning is still buffered and marks the block finished. */
function thinkDone(c: Ctx, m: ForgeModel | null, role: ForgeRole) {
  if (m) c.q.push({ t: "think", key: m.key, model: m.label, role, d: "", done: true });
}

async function pipeline(c: Ctx) {
  const { q, req } = c;
  const scale = c.scale;
  const kind: ForgeKind = req.kind && KINDS.includes(req.kind) ? req.kind : guessKind(req.prompt);
  const language = guessLanguage(req.prompt);
  const meta = SCALE_META[scale];

  q.push({ t: "start", scale, kind, language, target: meta.total, engines: forgePool(c.plan).length, plan: c.plan });
  q.push({ t: "log", text: `الورشة جاهزة: ${forgePool(c.plan).length} نموذج · الهدف ${meta.total.toLocaleString("en")} سطر في ${meta.modules[0]}–${meta.modules[1]} وحدة` });

  /* ---------- real assets from the open web when the request needs them ---------- */
  let netHint = "";
  if (req.internet !== false) {
    try {
      const h = await forgeNetHint({ prompt: req.prompt, signal: c.signal });
      netHint = h.text;
      if (h.images.length || h.audio.length) q.push({ t: "net", images: h.images.length, audio: h.audio.length, source: h.source });
    } catch {
      /* a build never dies because media search failed */
    }
  }

  /* ---------- 1. PLAN ---------- */
  const tArch = Date.now();
  let plan: ForgePlan | null = null;
  const duo = req.duo === true;
  const onThink = req.thinking === false ? undefined : thinkEmitter(c, "architect");

  if (duo) {
    /* DUO fast path: the plan is computed locally (deterministic, exact module
       and line targets) so the two engines start writing immediately — no
       architect round-trip, no JSON parsing, no waiting. */
    plan = normalizePlan(defaultPlan(req.prompt, kind, scale, language), scale);
    const pair = duoEngines(c.plan);
    q.push({
      t: "duo",
      a: { key: pair[0]?.key ?? "titan", label: pair[0]?.label ?? "Nexus Titan" },
      b: { key: pair[1]?.key ?? pair[0]?.key ?? "titan", label: pair[1]?.label ?? pair[0]?.label ?? "Nexus Titan" },
      planMs: Date.now() - tArch,
      modules: plan.modules.length,
      target: plan.modules.reduce((n, m) => n + m.lines, 0),
    });
    q.push({
      t: "log",
      text: `وضع DUO السريع: محرّكان (${pair.map((m) => m.label).join(" + ")}) وخطة محلية دقيقة — ${plan.modules.length} وحدة · الهدف ${plan.modules
        .reduce((n, m) => n + m.lines, 0)
        .toLocaleString("en")} سطر`,
    });
    q.push({ t: "stage", stage: "contract", label: "الخطة المحلية جاهزة (بلا انتظار المهندس)", pct: 6, state: "done" });
  } else {
    q.push({ t: "stage", stage: "architect", label: "المهندس المعماري يرسم خطة المشروع", pct: 4, state: "working" });
    let archModel: ForgeModel | null = null;
    const arch = await askRole("architect", {
      plan: c.plan,
      system: architectSystem({ kind, scale }),
      prompt: planUserPrompt({ prompt: req.prompt, kind, scale, language, extra: req.extra }),
      maxTokens: 8_000,
      signal: c.signal,
      accept: (r) => Boolean(parseForgePlan(r.text, { prompt: req.prompt, kind, scale })),
      onChunk: onThink,
      onTry: (m, state, note) => {
        c.calls++;
        archModel = m;
        q.push({ t: "model", model: m.label, key: m.key, role: "architect", state: state === "start" ? "start" : state === "done" ? "done" : "fail", note });
        if (state === "done" || state === "fail") thinkDone(c, m, "architect");
      },
    });
    thinkDone(c, archModel, "architect");
    if (arch) {
      plan = parseForgePlan(arch.text, { prompt: req.prompt, kind, scale });
      c.models.push({ key: arch.key, label: arch.model, role: "architect", ms: arch.ms });
    }
    if (!plan) {
      plan = defaultPlan(req.prompt, kind, scale, language);
      q.push({ t: "log", text: "الخطة الاحتياطية الدقيقة استُعملت (المهندس لم يُرجع JSON صالحًا) — البناء مستمر بنفس الحجم" });
    }
  }
  const finalPlan: ForgePlan = duo ? (plan as ForgePlan) : normalizePlan(plan as ForgePlan, scale);
  const modules = finalPlan.modules.slice(0, FORGE_MAX_MODULES);
  finalPlan.modules = modules;

  q.push({ t: "stage", stage: "contract", label: "العقد الموحّد بين النماذج جاهز", pct: 8, state: "done" });
  q.push({ t: "plan", plan: planDto(plan), ms: Date.now() - tArch });

  /* ---------- 2. BUILD WAVES ---------- */
  const waves = Array.from(new Set(modules.map((m) => m.wave))).sort((a, b) => a - b);
  /* DUO writes with exactly the two engines announced in the `duo` event. */
  const builders = duo ? duoEngines(c.plan) : forgePool(c.plan).filter((m) => m.roles.includes("builder"));
  const rotation = new Rotation(builders.length ? builders : forgePool(c.plan));
  const sys = builderSystem({ kind: plan.kind, scale, language: plan.language });
  const concurrency = duo ? Math.min(2, builders.length || 1) : forgeConcurrency(c.plan, scale);

  for (const w of waves) {
    const batch = modules.filter((m) => m.wave === w);
    if (!batch.length) continue;
    q.push({ t: "wave", wave: w, total: waves.length, modules: batch.map((m) => m.path) });
    q.push({
      t: "stage",
      stage: "build",
      label: `الموجة ${w + 1}/${waves.length}: ${batch.length} وحدة بالتوازي`,
      pct: 10 + Math.round((w / Math.max(1, waves.length)) * 60),
      state: "working",
    });

    let idx = 0;
    const workers = Array.from({ length: Math.max(1, Math.min(concurrency, batch.length)) }, async () => {
      for (;;) {
        const i = idx++;
        if (i >= batch.length || c.signal?.aborted) return;
        await buildModule(c, plan as ForgePlan, batch[i], rotation, sys, netHint);
      }
    });
    await Promise.all(workers);
  }

  /* ---------- 3. ASSEMBLE ---------- */
  q.push({ t: "stage", stage: "assemble", label: "تجميع الوحدات في ملف واحد يشتغل مباشرة", pct: 78, state: "working" });
  let files = modules.map((m) => c.files.get(m.path)).filter((f): f is ForgeFile => !!f);
  if (!files.length) {
    q.push({ t: "error", code: "NO_OUTPUT", detail: "لم يُنتج أي نموذج ملفًا صالحًا — جرّب مرة أخرى أو اختر حجمًا أصغر" });
    return;
  }
  let single: Assembled = assembleSingleFile(plan as ForgePlan, files);
  q.push({ t: "file", path: "index.html", kind: "html", lines: single.lines, kb: Math.round(single.bytes / 1024), state: "merged", note: `${files.length} وحدة · ${single.scripts} سكربت · ${single.styles} تنسيق` });
  q.push({ t: "html", html: single.html, lines: single.lines, bytes: single.bytes, scripts: single.scripts, styles: single.styles });

  /* ---------- 4. QA + REPAIR ---------- */
  q.push({ t: "stage", stage: "qa", label: "الفحص الآلي الشامل", pct: 84, state: "working" });
  let qa: ForgeQa = qaProject(single.html, plan as ForgePlan, files);
  q.push({ t: "qa", qa });

  const maxRounds = scale === "titan" ? 2 : 1;
  let round = 0;
  while (qa.issues.some((i) => i.level === "error") && round < maxRounds && !c.signal?.aborted) {
    round++;
    c.repairs++;
    q.push({ t: "stage", stage: "repair", label: `إصلاح آلي — الجولة ${round}`, pct: 86 + round * 3, state: "working" });

    const byWhere = new Map<string, string[]>();
    for (const i of qa.issues.filter((x) => x.level === "error")) {
      const list = byWhere.get(i.where) ?? [];
      list.push(i.text);
      byWhere.set(i.where, list);
    }
    const owned = modules.filter((m) => byWhere.has(m.path)).slice(0, 4);
    const targets = owned.length ? owned : modules.slice(0, 2);

    await Promise.all(
      targets.map(async (m) => {
        const cur = c.files.get(m.path);
        if (!cur) return;
        const texts = byWhere.get(m.path) ?? qa.issues.slice(0, 6).map((i) => i.text);
        const issues = texts.map((t) => ({ level: "error" as const, where: m.path, text: t }));
        const r = await askRole("repair", {
          plan: c.plan,
          system: `${sys}\n\nYou are the REPAIR engineer: fix exactly what is listed, keep everything else byte-identical, return the complete file.`,
          prompt: repairBrief(m, cur.code, issues, (plan as ForgePlan).contract),
          maxTokens: Math.min(FORGE_MAX_FILE_LINES * 40, 24_000),
          signal: c.signal,
          avoid: [cur.model],
          accept: (x) => qaModule(m, stripFence(x.text, m.kind)).filter((i) => i.level === "error").length === 0,
          onTry: (mm, state, note) => {
            c.calls++;
            q.push({ t: "model", model: mm.label, key: mm.key, role: "repair", path: m.path, state: state === "start" ? "start" : state === "done" ? "done" : "fail", note });
          },
        });
        if (!r) return;
        const code = stripFence(r.text, m.kind);
        c.retries++;
        c.models.push({ key: r.key, label: r.model, role: "repair", module: m.path, ms: r.ms });
        c.files.set(m.path, { ...cur, code, lines: countLines(code), bytes: byteLength(code), model: r.model, ms: cur.ms + r.ms, quality: qualityOf(code, m.lines) });
        c.digests.set(m.path, digestOf(m.path, m.kind, code));
        q.push({ t: "file", path: m.path, kind: m.kind, lines: countLines(code), kb: Math.round(byteLength(code) / 1024), state: "repaired", model: r.model });
      })
    );

    files = modules.map((m) => c.files.get(m.path)).filter((f): f is ForgeFile => !!f);
    single = assembleSingleFile(plan as ForgePlan, files);
    qa = qaProject(single.html, plan as ForgePlan, files);
    qa.repaired = round;
    q.push({ t: "html", html: single.html, lines: single.lines, bytes: single.bytes, scripts: single.scripts, styles: single.styles });
    q.push({ t: "qa", qa });
  }

  /* ---------- 5. TREE + STATS ---------- */
  const tree = assembleTree(plan as ForgePlan, files, single);
  q.push({ t: "tree", files: tree });

  const perModel = new Map<string, { model: string; files: number; lines: number }>();
  for (const f of files) {
    const e = perModel.get(f.model) ?? { model: f.model, files: 0, lines: 0 };
    e.files++;
    e.lines += f.lines;
    perModel.set(f.model, e);
  }
  const stats: ForgeStats = {
    ms: Date.now() - c.startedAt,
    lines: files.reduce((s, f) => s + f.lines, 0),
    bytes: files.reduce((s, f) => s + f.bytes, 0),
    files: files.length,
    models: Array.from(perModel.values()).sort((a, b) => b.lines - a.lines),
    calls: c.calls,
    retries: c.retries,
    repairs: c.repairs,
  };
  const metaOut: ForgeMeta = {
    scale,
    kind: (plan as ForgePlan).kind,
    language: (plan as ForgePlan).language,
    modules: files.length,
    lines: stats.lines,
    bytes: stats.bytes,
    singleLines: single.lines,
    singleBytes: single.bytes,
    models: c.models,
    ms: stats.ms,
    qa,
    stats,
  };
  q.push({ t: "stats", meta: metaOut });
  q.push({ t: "stage", stage: "done", label: "اكتمل البناء", pct: 100, state: "done" });
  q.push({ t: "done", ok: true, title: (plan as ForgePlan).title, lines: single.lines, files: files.length });
}

/** The plan as the browser receives it. */
function planDto(plan: ForgePlan): ForgePlanDto {
  return {
    title: plan.title,
    kind: plan.kind,
    language: plan.language,
    summary: plan.summary,
    design: plan.design,
    target: plan.target,
    contract: plan.contract,
    shell: plan.shell,
    modules: plan.modules.map((m) => ({ id: m.id, path: m.path, kind: m.kind, title: m.title, lines: m.lines, wave: m.wave, needs: m.needs })),
  };
}

/** Writes ONE module: best engine → QA → retry with another engine → keep the best. */
async function buildModule(c: Ctx, plan: ForgePlan, mod: ForgeModule, rotation: Rotation, sys: string, netHint: string) {
  const { q } = c;
  const used = new Set<string>();
  const digests: string[] = [];
  for (const n of mod.needs) {
    const dep = plan.modules.find((m) => m.id === n);
    const d = dep ? c.digests.get(dep.path) : undefined;
    if (d) digests.push(d);
  }
  // markup + design system are useful context for every module
  for (const p of ["index.html", "css/styles.css"]) {
    const d = c.digests.get(p);
    if (d && !digests.includes(d)) digests.push(d);
  }

  let best: { file: ForgeFile; errors: number } | null = null;
  const prompt0 = modulePrompt({ mod, plan, digests, extra: c.req.extra ?? "", netHint });

  for (let attempt = 0; attempt <= RETRIES_PER_MODULE; attempt++) {
    if (c.signal?.aborted) return;
    let m: ForgeModel;
    try {
      m = rotation.next(used);
    } catch {
      break;
    }
    used.add(m.key);
    q.push({ t: "model", model: m.label, key: m.key, role: "builder", path: mod.path, state: attempt ? "retry" : "start" });
    q.push({ t: "stage", stage: "build", label: `${m.label} يكتب ${mod.path}`, pct: 0, state: "working", model: m.label, path: mod.path });

    const guard = anySignal(c.signal, MODULE_TIMEOUT[c.scale]);
    const prompt =
      attempt === 0
        ? prompt0
        : modulePrompt({
            mod,
            plan,
            digests,
            extra: c.req.extra ?? "",
            netHint,
            retry: {
              issues: best ? qaModule(mod, best.file.code).map((i) => `- [${i.level}] ${i.text}`) : ["- the previous answer was empty or unusable"],
              previousTail: best?.file.code.slice(-900) ?? "",
            },
          });

    try {
      const r = await askForgeModel(m, {
        system: sys,
        prompt,
        maxTokens: Math.min(Math.max(8_000, Math.round(mod.lines * 40)), 32_000),
        signal: guard.signal,
        onChunk: c.req.thinking === false ? undefined : thinkEmitter(c, "builder").bind(null, m),
      });
      guard.clear();
      thinkDone(c, m, "builder");
      c.calls++;
      c.models.push({ key: m.key, label: r.model, role: "builder", module: mod.path, ms: r.ms });

      const code = stripFence(r.text, mod.kind);
      const lines = countLines(code);
      const issues = qaModule(mod, code);
      const errors = issues.filter((i) => i.level === "error").length;
      if (attempt) c.retries++;

      const file: ForgeFile = {
        path: mod.path,
        kind: mod.kind,
        title: mod.title,
        wave: mod.wave,
        code,
        lines,
        bytes: byteLength(code),
        model: r.model,
        ms: r.ms,
        retries: attempt,
        quality: qualityOf(code, mod.lines),
      };

      q.push({
        t: "file",
        path: mod.path,
        kind: mod.kind,
        lines,
        kb: Math.round(file.bytes / 1024),
        state: errors ? "issues" : "ok",
        model: r.model,
        note: `${lines}/${mod.lines} سطر${issues.length ? ` · ${issues.slice(0, 2).map((i) => i.text).join(" | ")}` : ""}`,
      });
      q.push({ t: "model", model: m.label, key: m.key, role: "builder", path: mod.path, state: errors ? "fail" : "done", lines, ms: r.ms, note: errors ? issues[0]?.text : undefined });

      if (!best || errors < best.errors || (errors === best.errors && lines > best.file.lines)) best = { file, errors };
      if (errors === 0 && lines >= mod.lines * 0.6) break;
    } catch (e) {
      guard.clear();
      const msg = (e as Error)?.message?.slice(0, 100) ?? "error";
      q.push({ t: "model", model: m.label, key: m.key, role: "builder", path: mod.path, state: "fail", note: msg });
      q.push({ t: "log", text: `${m.label} فشل على ${mod.path}: ${msg}` });
    }
  }

  if (!best) {
    best = { file: fallbackFile(mod), errors: 0 };
    q.push({ t: "file", path: mod.path, kind: mod.kind, lines: best.file.lines, kb: 0, state: "fallback", model: "forge-fallback", note: "وحدة احتياطية آمنة" });
  }

  c.files.set(mod.path, best.file);
  c.digests.set(mod.path, digestOf(mod.path, mod.kind, best.file.code));
  q.push({ t: "stage", stage: "build", label: `${mod.path} جاهز (${best.file.lines} سطر)`, pct: 0, state: "done", path: mod.path });
}

/** A module that still assembles safely even if every engine failed on it. */
function fallbackFile(mod: ForgeModule): ForgeFile {
  const code =
    mod.kind === "css"
      ? `/* ${mod.path} — safe fallback so the design never breaks */\n:root{--nx-fallback:1}\n`
      : mod.kind === "json"
        ? "{}"
        : mod.kind === "html"
          ? `<!-- ${mod.path} — safe fallback -->\n<main style="padding:24px"><h1>${mod.title}</h1><p>هذه الوحدة لم تكتمل.</p></main>`
          : `/* ${mod.path} — safe fallback: registers the module so boot never breaks */\n(function(){\n  window.NX = window.NX || {};\n  window.NX[${JSON.stringify(mod.id)}] = { ok: false, missing: true };\n})();\n`;
  return {
    path: mod.path,
    kind: mod.kind,
    title: mod.title,
    wave: mod.wave,
    code,
    lines: countLines(code),
    bytes: byteLength(code),
    model: "forge-fallback",
    ms: 0,
    retries: 0,
    quality: 0,
  };
}

/* ------------------------------------------------------------------ *
 * public entry points
 * ------------------------------------------------------------------ */
export async function* forgeBuild(req: ForgeRequest, opts: { plan: PlanId; userId?: string; signal?: AbortSignal }): AsyncGenerator<ForgeEvent> {
  const q = new Queue();
  const scale: ForgeScale = req.scale && SCALE_META[req.scale] ? req.scale : guessScale(req.prompt, opts.plan === "pro" ? "titan" : "big");
  const c: Ctx = {
    q,
    req: { ...req, userId: opts.userId },
    plan: opts.plan,
    signal: opts.signal,
    scale,
    models: [],
    files: new Map(),
    digests: new Map(),
    startedAt: Date.now(),
    calls: 0,
    retries: 0,
    repairs: 0,
  };

  const run = (async () => {
    try {
      await pipeline(c);
    } catch (e) {
      const err = e as Error;
      const aborted = err?.name === "AbortError" || c.signal?.aborted;
      q.push({ t: "error", code: aborted ? "ABORTED" : "ENGINE_DOWN", detail: (err?.message ?? "خطأ غير معروف").slice(0, 300) });
    } finally {
      q.close();
    }
  })();

  for (;;) {
    const item = await q.next();
    if (item === CLOSE) break;
    yield item;
  }
  await run;
}

/** Non-streaming helper (tests, CLI, deploy). */
export async function forgeOnce(req: ForgeRequest, opts: { plan: PlanId; userId?: string; signal?: AbortSignal }) {
  const events: ForgeEvent[] = [];
  let html = "";
  let tree: { path: string; data: string }[] = [];
  let meta: ForgeMeta | null = null;
  let plan: ForgePlanDto | null = null;
  let error: { code: string; detail?: string } | null = null;
  for await (const e of forgeBuild(req, opts)) {
    events.push(e);
    if (e.t === "html") html = e.html;
    else if (e.t === "tree") tree = e.files;
    else if (e.t === "stats") meta = e.meta;
    else if (e.t === "plan") plan = e.plan;
    else if (e.t === "error") error = { code: e.code, detail: e.detail };
  }
  return { events, html, tree, meta, plan, error };
}
