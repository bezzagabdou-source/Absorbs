/**
 * Static self-check for generated single-file HTML (client-safe, never executes the code).
 * Used by the MAX auto-verify loop: errors found here are sent back to the model for a surgical repair.
 */

export const REPAIR_MARK = "🔧 فحص ماكس";

// elements whose end tag may legally be omitted, plus void elements: excluded from balance checks (no false alarms)
const SKIP = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
  "p", "li", "td", "th", "tr", "thead", "tbody", "tfoot", "colgroup", "option", "optgroup", "dd", "dt", "rp", "rt",
]);

const TAG_RE = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const MAX_ISSUES = 6;

function balance(markup: string, out: string[]): void {
  const stack: string[] = [];
  TAG_RE.lastIndex = 0;
  for (let m = TAG_RE.exec(markup); m; m = TAG_RE.exec(markup)) {
    if (!m[2]) continue; // comment
    const name = m[2].toLowerCase();
    if (SKIP.has(name) || m[3].trimEnd().endsWith("/")) continue;
    if (!m[1]) {
      stack.push(name);
      continue;
    }
    const at = stack.lastIndexOf(name);
    if (at === -1) {
      out.push(`وسم إغلاق زائد </${name}>`);
      continue;
    }
    for (const lost of stack.splice(at).slice(1)) out.push(`الوسم <${lost}> غير مغلق`);
  }
  for (const left of stack) out.push(`الوسم <${left}> غير مغلق`);
}

/** Returns a short list of concrete problems (empty = nothing found). */
export function checkHtml(html: string): string[] {
  const issues: string[] = [];
  try {
    if (!/<\/html>\s*$/i.test(html.trim())) issues.push("الملف لا ينتهي بـ </html> (مقطوع أو ناقص)");

    const scripts: { attrs: string; body: string }[] = [];
    for (const m of html.matchAll(SCRIPT_RE)) scripts.push({ attrs: m[1], body: m[2] });
    const markup = html.replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2>)/gi, "$1$3");

    balance(markup, issues);

    // duplicate ids
    const seen = new Map<string, number>();
    for (const m of markup.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
    for (const [id, n] of seen) if (n > 1) issues.push(`المعرّف id="${id}" مكرّر ${n} مرات`);

    // scripts: syntax (compile only, never run), classic-script rules, missing getElementById targets
    let js = "";
    for (const s of scripts) {
      if (/\bsrc\s*=/i.test(s.attrs)) {
        const src = s.attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
        if (/^https?:/i.test(src) && !/^https:\/\/cdnjs\.cloudflare\.com\//i.test(src)) issues.push(`مكتبة خارجية غير مسموحة: ${src.slice(0, 60)}`);
        continue;
      }
      if (/type\s*=\s*["'](?!text\/javascript|application\/javascript)/i.test(s.attrs)) continue; // module / json / template
      js += s.body + "\n";
      try {
        new Function(s.body); // compiles only: a SyntaxError is reported, nothing executes
      } catch (e) {
        if (e instanceof SyntaxError) issues.push(`خطأ صياغة JavaScript: ${e.message.slice(0, 90)}`);
        // EvalError (a CSP forbids eval) or anything else: skip silently
      }
    }
    const missing = new Set<string>();
    for (const m of js.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)) {
      const id = m[1];
      if (seen.has(id) || missing.has(id)) continue;
      const created = new RegExp(`\\bid\\s*[=:]\\s*\\\\?["'\`]${id}\\b|setAttribute\\(\\s*["']id["']\\s*,\\s*["'\`]${id}\\b`);
      if (!created.test(html)) missing.add(id);
    }
    for (const id of missing) issues.push(`الكود يطلب العنصر #${id} وهو غير موجود في الصفحة`);
  } catch {
    /* a checker bug must never block the user */
  }
  return issues.slice(0, MAX_ISSUES);
}

export function repairPrompt(issues: string[]): string {
  return `${REPAIR_MARK}: وجدت أخطاء في الملف الذي كتبته. أصلحها فقط وأعد الملف كاملًا في كتلة html واحدة بنفس الأسماء والتصميم دون أي تغيير آخر وبلا شرح:\n${issues.map((i) => `- ${i}`).join("\n")}`;
}
