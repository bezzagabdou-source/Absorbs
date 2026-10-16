/**
 * NEXUS FORGE v19 — الفحص الآلي والإصلاح (QA + repair)
 * ---------------------------------------------------------------------------
 * "تشتغل بدون مشاكل" is a build property, not a hope. Every module is checked the
 * moment it lands (syntax, completeness, size, forbidden patterns) and the whole
 * assembled file is checked again (ids, handlers, tags, braces). Failures become a
 * precise repair brief that another engine fixes — the user never sees a broken build.
 *
 * Parsing only: JavaScript is compiled with `new Function` (never executed).
 */
import type { ForgeFile, ForgeIssue, ForgeModule, ForgePlan, ForgeQa } from "@/lib/forge/types";
import { countLines, lazyHits } from "@/lib/forge/types";
import { checkHtml } from "@/lib/code-check";
import { integrity } from "@/lib/titan";

export const QA_MAX_ISSUES = 40;

/** Compiles JS without running it. Returns the SyntaxError message, or null. */
export function jsSyntaxError(code: string): string | null {
  try {
    new Function(code);
    return null;
  } catch (e) {
    if (e instanceof SyntaxError) return e.message.slice(0, 160);
    // a CSP that forbids eval throws EvalError — not the code's fault
    return null;
  }
}

/** ES-module / TypeScript syntax that would break a classic inline script. */
export function forbiddenSyntax(code: string): string[] {
  const out: string[] = [];
  if (/^\s*import\s+[\w{*"'$]/m.test(code) || /^\s*import\s*\{/m.test(code)) out.push("يستعمل import (ES modules ممنوعة في ملف واحد)");
  if (/^\s*export\s+(default|const|function|class|type|interface)/m.test(code)) out.push("يستعمل export (ES modules ممنوعة)");
  if (/:\s*(string|number|boolean|any|void)\b\s*[=;,)]/m.test(code) && /interface\s+\w+\s*\{/.test(code)) out.push("فيه صياغة TypeScript");
  if (/<\w+\s*\/>/.test(code) && !/<(br|hr|img|input|meta|link|source|path|circle|rect|line|polyline|polygon|use|stop)\b/i.test(code)) {
    // JSX-ish self-closing custom tags inside a .js module
    if (/return\s*\(\s*</.test(code)) out.push("فيه JSX (ممنوع — اكتب HTML كنص أو createElement)");
  }
  return out;
}

/** Checks one freshly written module. Cheap enough to run on every retry. */
export function qaModule(mod: ForgeModule, code: string): ForgeIssue[] {
  const issues: ForgeIssue[] = [];
  const lines = countLines(code);
  const where = mod.path;

  if (!code.trim()) {
    issues.push({ level: "error", where, text: "الملف فارغ" });
    return issues;
  }
  if (/^\s*```/.test(code)) issues.push({ level: "warn", where, text: "مازال داخل كتلة markdown (```)" });

  const lazy = lazyHits(code);
  // "..." is legitimate inside strings/arrays — only count it when it looks like an omission
  const realLazy = lazy.filter((m) => m !== "..." || /\.\.\.\s*(<\/|\/\/|#|\n\s*\})/.test(code));
  if (realLazy.length) issues.push({ level: "error", where, text: `فيه علامات نقص: ${realLazy.slice(0, 4).join("، ")}` });

  const target = mod.lines;
  if (lines < target * 0.6) issues.push({ level: "error", where, text: `قصير جدًا: ${lines} سطر من أصل ${target}` });
  else if (lines < target * 0.92) issues.push({ level: "warn", where, text: `أقل من الهدف: ${lines}/${target} سطر` });

  if (mod.kind === "js") {
    const syn = jsSyntaxError(code);
    if (syn) issues.push({ level: "error", where, text: `خطأ صياغة JavaScript: ${syn}` });
    for (const f of forbiddenSyntax(code)) issues.push({ level: "error", where, text: f });
  }
  if (mod.kind === "json") {
    try {
      JSON.parse(code);
    } catch (e) {
      issues.push({ level: "error", where, text: `JSON غير صالح: ${(e as Error).message.slice(0, 90)}` });
    }
  }
  if (mod.kind === "css") {
    const open = (code.match(/\{/g) ?? []).length;
    const close = (code.match(/\}/g) ?? []).length;
    if (open !== close) issues.push({ level: "error", where, text: `أقواس CSS غير متوازنة (${open} فتح / ${close} غلق)` });
  }
  if (mod.kind === "html") {
    const ig = integrity(code);
    for (const t of ig.issues) issues.push({ level: "error", where, text: t });
  }

  // repeated-block padding (a model that copies one card 40 times to hit the target)
  const dup = duplicatedBlocks(code);
  if (dup > 6) issues.push({ level: "warn", where, text: `${dup} كتلة مكرّرة — حشو بدل محتوى حقيقي` });

  return issues.slice(0, 12);
}

/** Counts near-identical consecutive blocks (padding detector). */
export function duplicatedBlocks(code: string): number {
  const chunks = code.split(/\n\s*\n/).map((c) => c.replace(/\s+/g, " ").trim()).filter((c) => c.length > 60);
  const seen = new Map<string, number>();
  for (const c of chunks) seen.set(c, (seen.get(c) ?? 0) + 1);
  let dup = 0;
  for (const n of seen.values()) if (n > 1) dup += n - 1;
  return dup;
}

/** Checks the assembled single file. */
export function qaProject(html: string, plan: ForgePlan, files: ForgeFile[]): ForgeQa {
  const issues: ForgeIssue[] = [];
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  /* 1. the existing, battle-tested HTML checker (tags, ids, syntax, dupes) */
  const htmlIssues = checkHtml(html);
  for (const t of htmlIssues) issues.push({ level: "error", where: "index.html", text: t });
  checks.push({ name: "HTML/JS الآلي", ok: htmlIssues.length === 0, detail: htmlIssues.slice(0, 3).join(" · ") });

  /* 2. document integrity */
  const ig = integrity(html);
  checks.push({ name: "سلامة الوثيقة", ok: ig.ok, detail: ig.issues.join(" · ") });
  if (!/<\/html>\s*$/i.test(html.trim())) issues.push({ level: "error", where: "index.html", text: "لا ينتهي بـ </html>" });

  /* 3. size vs plan */
  const totalLines = countLines(html);
  const wantLines = Math.round(plan.target.lines * 0.7);
  checks.push({ name: "الحجم", ok: totalLines >= wantLines, detail: `${totalLines.toLocaleString("en")} سطر (الهدف ${plan.target.lines.toLocaleString("en")})` });
  if (totalLines < wantLines * 0.6) issues.push({ level: "warn", where: "المشروع", text: `أصغر من المطلوب: ${totalLines} سطر` });

  /* 4. lazy markers anywhere in the final file */
  const lazy = lazyHits(html).filter((m) => m !== "..." || /\.\.\.\s*(<\/|\/\/)/.test(html));
  checks.push({ name: "بلا حشو", ok: lazy.length === 0, detail: lazy.slice(0, 4).join("، ") });
  for (const m of lazy.slice(0, 6)) issues.push({ level: "warn", where: "index.html", text: `علامة نقص: ${m}` });

  /* 5. every module actually made it into the file */
  const missing = files.filter((f) => f.kind !== "md" && f.code.trim().length > 40 && !html.includes(markerOf(f.path)));
  checks.push({ name: "كل الوحدات مدمجة", ok: missing.length === 0, detail: missing.map((m) => m.path).join("، ") });

  /* 6. design tokens present (the contract's palette must survive assembly) */
  const tokenOk = /--accent\s*:/.test(html) && /--bg\s*:|--background\s*:/.test(html);
  checks.push({ name: "نظام التصميم", ok: tokenOk });
  if (!tokenOk) issues.push({ level: "warn", where: "css", text: "رموز التصميم (tokens) غير موجودة" });

  /* 7. RTL for Arabic projects */
  const rtlOk = plan.language !== "ar" || /dir=["']rtl["']/i.test(html);
  checks.push({ name: "RTL للعربية", ok: rtlOk });
  if (!rtlOk) issues.push({ level: "error", where: "index.html", text: 'مشروع عربي بدون dir="rtl"' });

  /* 8. no external fragility (images hotlinked / random CDNs) */
  const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  const allowed = ext.filter((u) => /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|unpkg\.com|cdn\.tailwindcss\.com)\//i.test(u));
  const risky = ext.filter((u) => !allowed.includes(u));
  checks.push({ name: "بلا تبعيات هشة", ok: risky.length === 0, detail: risky.slice(0, 2).join("، ") });
  for (const u of risky.slice(0, 4)) issues.push({ level: "warn", where: "index.html", text: `رابط خارجي قد يفشل: ${u.slice(0, 80)}` });

  /* 9. dead controls: buttons with no listener and no handler */
  const buttons = (html.match(/<button\b/gi) ?? []).length;
  const wired = (html.match(/addEventListener\(/g) ?? []).length + (html.match(/\son(click|change|input|submit|keydown|pointerdown)\s*=/gi) ?? []).length;
  checks.push({ name: "أزرار موصولة", ok: wired >= Math.min(buttons, 3) || buttons === 0, detail: `${buttons} زر · ${wired} ربط` });
  if (buttons > 4 && wired < 3) issues.push({ level: "warn", where: "js", text: `${buttons} زر بلا ربط ظاهر — تأكد أن كل زر يعمل` });

  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.max(
    0,
    Math.min(100, Math.round((passed / Math.max(1, checks.length)) * 70 + Math.max(0, 30 - errors * 9 - warns * 2.5)))
  );

  return { score, issues: issues.slice(0, QA_MAX_ISSUES), repaired: 0, checks };
}

/** The comment the assembler writes above each module — used to prove inclusion. */
export function markerOf(path: string): string {
  return `══ ${path}`;
}

/** A precise, minimal repair brief for one module. */
export function repairBrief(mod: ForgeModule, code: string, issues: ForgeIssue[], contract: string): string {
  const list = issues.map((i, n) => `${n + 1}. [${i.level.toUpperCase()}] ${i.text}`).join("\n");
  const tail = code.slice(-1400);
  return `REPAIR THIS MODULE — ${mod.path} (${mod.title})

The automatic verifier found these problems:
${list}

MODULE SPEC (what it must contain):
${mod.spec.slice(0, 3000)}

TARGET SIZE: ${mod.lines} lines of real, working code.

PROJECT CONTRACT (names you must keep exactly):
${contract.slice(0, 3500)}

CURRENT END OF THE FILE (last 1400 characters — continue/fix from here, keep every existing name):
${tail}

RULES
- Return the COMPLETE fixed file in one fenced code block (\`\`\`${mod.kind === "html" ? "html" : mod.kind}), nothing else.
- Fix every listed problem. Do not remove working features, do not shorten the file, do not rename anything.
- If the file was cut off, finish it properly and reach the target size.
- Classic scripts only, no ES modules, no placeholders, no TODO, no "...".`;
}

/** A brief for repairing the assembled file as a whole (last resort). */
export function projectRepairBrief(html: string, qa: ForgeQa): string {
  const list = qa.issues.slice(0, 14).map((i, n) => `${n + 1}. [${i.level}] ${i.where}: ${i.text}`).join("\n");
  return `FIX THIS COMPLETE PROJECT FILE.

Problems found by the verifier:
${list}

Return the FULL corrected HTML document in one \`\`\`html block — from <!doctype html> to </html>, nothing else.
Keep every feature, name, style and text; only fix the listed problems. Never shorten the file, never leave a placeholder.`;
}
