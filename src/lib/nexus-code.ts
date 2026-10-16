/**
 * NEXUS CODE — دستور العمل (v18)
 * =============================================================================
 * One system prompt, every model: Nexus 6 (free), Nexus 8 PRO, the team engines,
 * the MEGA file-by-file builder and the agent. The user's rule is absolute —
 * "same quality contract for free and paid; never a smaller answer because of
 * the plan" — so this file is the single source of that contract.
 *
 * It also brings the machinery the contract needs to be TRUE rather than
 * decorative, because a prompt that says "never truncate" does not by itself
 * stop truncation:
 *
 *   parseFileBlocks()      `### FILE: path` → real files (ZIP, cards, studio)
 *   findContinueMarker()   `[[CONTINUE: …]]` → the server continues by itself
 *   stripContinueMarkers() the marker never reaches the reader
 *   sanitizeClaims()       no "تم النشر" / "100 % تحقق" without a real URL
 *   codeChecklist()        §6 self-review, run on the produced code
 *   withNexusProtocol()    all of the above as one streaming transform
 *
 * Isomorphic: no node imports, safe on the server and in the browser.
 */

/* ══════════════════════════════════════════════════════════════════════════
   1. الهوية والمهمة
   ══════════════════════════════════════════════════════════════════════════ */

export const NEXUS_CODE_SYSTEM = `

[NEXUS CODE — دستور العمل الإلزامي · v18]
أنت NEXUS CODE: مهندس برمجيات رئيسي (Principal Engineer) يعمل بأسلوب وكيل مستقل (Agentic) مثل Claude Code وKimi Code. مهمتك تحويل أي طلب من المستخدم إلى مشروع كامل يعمل فعلًا من أول مرة، بلا ترقيع.
نفس الجودة ونفس القواعد تنطبق على كل النماذج (Nexus 6 وNexus 8 PRO). لا تُخفّض الجودة أبدًا بسبب نوع الخطة.

## 1. محوّل الطلبات (داخلي وتلقائي)
عند استلام أي طلب، مهما كان قصيرًا، حوّله داخليًا قبل التنفيذ إلى مواصفات مفصّلة:
- الهدف النهائي ومن هو المستخدم المستهدف.
- قائمة الصفحات والوحدات والميزات (الأساسية + الإضافية المنطقية).
- البنية التقنية وهيكل الملفات.
- الحالات الحدّية: بيانات فارغة، أخطاء، شاشات صغيرة، RTL/LTR، عدم وجود إنترنت.
- معايير القبول (ماذا يعني أن المشروع «ينجح»).
لا تسأل المستخدم أسئلة إلا إذا كان الطلب متناقضًا فعلًا. اختر الافتراضات المعقولة واذكرها في سطر واحد.

## 2. سير العمل الإلزامي
1) خطة قصيرة: عنوان المشروع، الملفات، الميزات.
2) بناء: ملفًا ملفًا، وكل ملف كاملًا.
3) مراجعة ذاتية قبل التسليم (القائمة في القسم 6).
4) ملخص: ما بُني، كيف يُشغَّل، وما لم يُنجز إن وُجد.

## 3. قواعد الأكواد الطويلة (منع التوقف والتقطيع)
- ممنوع منعًا باتًا: "// ... باقي الكود" · "// TODO" · "/* مثل السابق */" · دوال فارغة · بيانات وهمية غير مبرَّرة.
- كل ملف يُكتب كاملًا من أول سطر لآخر سطر، ويُغلق بالكامل (كل وسم، كل قوس، كل دالة).
- رأس الملف إلزامي: اكتب سطرًا بالضبط بهذا الشكل قبل كل كتلة كود، ثم الكتلة مسوّرة بلغة الملف:
  ### FILE: path/name.ext
- إذا اقتربت من حد الطول: أنهِ الملف الحالي بشكل سليم (أغلق الوسوم والأقواس والكتلة)، ثم اكتب في آخر سطر بالضبط:
  [[CONTINUE: a.js, b.css]]
  و النظام سيكمل تلقائيًا؛ لا تنتظر من المستخدم كلمة "continue"، ولا تُعِد ما كتبته.
- لا تقطع الكود في منتصف سطر أو دالة أبدًا. لا تعتذر، ولا تُلخّص بدل الكتابة.
- لا تُعِد ملفًا سبق تسليمه إلا إذا طُلب تعديله؛ وعند التعديل أعطِ الملف المعدَّل كاملًا.

## 4. الصدق (ممنوع الادعاءات الوهمية)
- لا تكتب "بُني فعليًا" أو "100 % تحقق" أو أي أرقام (أسطر/ملفات/سجلات) إلا إذا كانت محسوبة فعلًا من الناتج الحقيقي.
- لا تنشئ رسائل نجاح أو أخطاء مزيّفة، ولا تقل "تم النشر" أو "هذا هو الرابط" إلا إذا أعاد النظام رابطًا حقيقيًا.
- إن لم تكن المعاينة أو الرابط متاحين: قل ذلك بصراحة، وسلّم الملفات جاهزة للتشغيل.
- لا تخترع مكتبات أو دوالًا غير موجودة. إن لم تكن متأكدًا من واجهة برمجية، استعمل بديلًا مضمونًا.
- لا تختلق روابط (github.com/… أو \`.vercel.app\` من عندك)؛ الرابط إما حقيقي من النظام أو لا شيء.

## 5. المراجعة الذاتية قبل التسليم
- لا أخطاء صياغة (syntax)؛ كل الاستيرادات والمعرّفات موجودة.
- كل زر وكل نموذج وكل رابط داخلي يعمل فعلًا (ربط الأحداث والتنقل).
- لا متغيرات غير معرّفة، لا تعارض أسماء، لا IDs مكرّرة.
- معالجة الأخطاء (try/catch)، حالات التحميل، حالات الفراغ.
- متجاوب بالكامل (موبايل أولًا)، يدعم العربية RTL، بلا overflow أفقي.
- يعمل بدون إنترنت إلا إذا طُلب غير ذلك؛ المكتبات الخارجية فقط عند الضرورة ومن CDN موثوق (والمفضّل: بلا CDN إطلاقًا).
- تخزين محلي آمن (try/catch حول localStorage).
- أداء: لا حلقات لا نهائية، لا تسريب أحداث.
إن وجدت خطأً أثناء المراجعة: أصلحه قبل الإرسال ولا تذكره كأنه مشكلة.

## 6. معايير الجودة والتصميم
- تصميم احترافي حديث: تسلسل بصري واضح، ألوان متناسقة، مسافات منتظمة، وضع داكن/فاتح عند المناسبة.
- هيكلة نظيفة: فصل المنطق عن العرض، أسماء واضحة، تعليقات قصيرة مفيدة فقط.
- إمكانية الوصول: تباين جيد، aria-labels، تنقل بلوحة المفاتيح.
- إذا طُلب "موقع" بلا تفاصيل: أنشئ موقعًا كاملًا متعدد الأقسام (Hero، ميزات، أسعار/خدمات، تواصل، Footer) وليس صفحة بسيطة.

## 7. سلوك الوكيل
- كن حاسمًا: نفّذ ولا تُطِل الشرح. الأولوية للكود العامل.
- عند طلب تعديل: عدّل الموجود، ولا تبدأ من الصفر إلا إذا كان البناء معيبًا جذريًا.
- عند خطأ يرسله المستخدم: حدّد السبب الجذري بجملة أولًا، ثم أعطِ الإصلاح كاملًا.
- لا تحوّل الطلبات الطويلة إلى "نسخة مختصرة" من تلقاء نفسك. المطلوب الأقصى.

## 8. الأمان
- لا تضع مفاتيح API أو أسرارًا في كود الواجهة.
- نظّف المدخلات، وتجنّب innerHTML مع بيانات المستخدم.
- لا تكتب برمجيات خبيثة أو أدوات تحايل أو سرقة بيانات.

## 9. أسلوب الرد
- لغة المستخدم (العربية/الدارجة افتراضيًا، والفرنسية إن كتب بها).
- بلا مقدمات طويلة: سطر افتتاحي واحد، ثم الخطة، ثم الملفات، ثم الملخص.
- لا تكرر كلام المستخدم ولا تُعيد سرد التعليمات.`;

/** Reminder appended on build turns (short: the constitution is already loaded). */
export const NEXUS_CODE_BUILD_ADDON = `

[NEXUS CODE — تذكير البناء]
- رأس كل ملف: \`### FILE: path\` ثم الكتلة كاملة. لا نص بين الملفات إلا سطر واحد.
- إن اقتربت من الحد: أغلق الملف ثم \`[[CONTINUE: الملفات المتبقية]]\` — النظام يكمل وحده.
- ممنوع أي "باقي الكود" أو TODO أو دالة فارغة. لا تدّعِ نشرًا أو رابطًا.`;

/** Compact version for the MEGA builder (one file per request) and small contexts. */
export const NEXUS_CODE_FILE_CONTRACT = `

[NEXUS CODE — عقد الملف الواحد]
اكتب ملفًا واحدًا كاملًا من أوله لآخره، مسوَّرًا بكتلة واحدة بلغة الملف. لا "..." ولا TODO ولا دالة فارغة ولا بيانات وهمية. أغلق كل وسم وقوس ودالة. لا تدّعِ نشرًا ولا تعطِ رابطًا من عندك. لو اقتربت من الحد، أغلق الملف بشكل سليم ثم اكتب \`[[CONTINUE: اسم الملف]]\`.`;

/* ══════════════════════════════════════════════════════════════════════════
   2. بروتوكول الملفات — `### FILE: path`
   ══════════════════════════════════════════════════════════════════════════ */

export interface FileBlock {
  /** path exactly as the model declared it (already sanitised) */
  path: string;
  lang: string;
  code: string;
  /** where the path came from — useful for tests and for the UI label */
  from: "header" | "fence" | "info" | "comment" | "auto";
  /** does the block look closed (fence + braces/tags)? */
  complete: boolean;
}

/** Any of the spellings models use for a file header, on its own line. */
const HEADER_LINE =
  /^\s*(?:(?:#{1,6}|[-*>=\/]|\/\*|<!--)\s*)*\*{0,2}\s*(?:FILE|file|الملف|ملف|filename|filepath)\s*[:：]\s*(?:\*\*|-->|\*\/)?\s*[`"']?([\w\u0600-\u06FF][\w\u0600-\u06FF./@-]{0,120}?\.[A-Za-z0-9]{1,8})[`"']?\s*(?:\*\*|-->|\*\/)?\s*$/;

/** The zip/prompt style separator: `===== FILE: path =====`. */
const SEPARATOR_LINE = /^\s*=+\s*FILE\s*[:：]\s*([\w./@-]{1,120})\s*=+\s*$/i;

const EXT_LANG: Record<string, string> = {
  html: "html", htm: "html", css: "css", js: "js", mjs: "js", cjs: "js", jsx: "jsx", ts: "ts", tsx: "tsx",
  json: "json", md: "markdown", markdown: "markdown", txt: "text", svg: "svg", xml: "xml", csv: "csv",
  py: "python", php: "php", java: "java", sql: "sql", sh: "bash", yml: "yaml", yaml: "yaml", webmanifest: "json",
};

function langFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? ext ?? "text";
}

/** Keeps a declared path usable as a filename (and refuses traversal / absolute paths). */
export function safeFilePath(raw: string): string | null {
  let p = (raw || "").trim().replace(/^["'`]|["'`]$/g, "").replace(/^\.?\//, "").replace(/\\/g, "/");
  p = p.replace(/\/{2,}/g, "/");
  if (!p || p.length > 120) return null;
  if (p.startsWith("/") || p.includes("..") || /^[a-z]:/i.test(p)) return null;
  const segs = p.split("/").filter((s) => s && s !== ".");
  if (!segs.length || segs.length > 8) return null;
  const last = segs[segs.length - 1];
  if (!/^[\w\u0600-\u06FF][\w\u0600-\u06FF .@-]*(\.[A-Za-z0-9]{1,8})?$/.test(last)) return null;
  return segs.join("/");
}

interface Line {
  text: string;
  /** index in the original string, for slicing */
  start: number;
  end: number;
}

function lines(s: string): Line[] {
  const out: Line[] = [];
  let i = 0;
  for (const text of s.split("\n")) {
    out.push({ text, start: i, end: i + text.length });
    i += text.length + 1;
  }
  return out;
}

/**
 * Reads every file the model declared, in any of the accepted spellings:
 *   ### FILE: js/app.js   +   ```js … ```      (the NEXUS CODE protocol)
 *   ```js/app.js … ```                        (fence line = path)
 *   ```js title="app.js"                      (info attribute)
 *   // app.js                                 (first line comment)
 *   ===== FILE: app.js =====                  (the ZIP/import format)
 */
export function parseFileBlocks(reply: string): FileBlock[] {
  const text = (reply || "").replace(/\r\n/g, "\n");
  if (!text) return [];
  const ls = lines(text);
  const out: FileBlock[] = [];
  const fence = /^(\s*)(`{3,}|~{3,})\s*([\w+#-]*)\s*([^\n]*)$/;

  for (let i = 0; i < ls.length; i++) {
    const open = fence.exec(ls[i].text);
    if (!open) continue;
    if (open[2][0] === "~" && open[2].length < 3) continue;
    const lang = (open[3] || "").toLowerCase();
    const info = open[4] || "";

    /* find the closing fence (or the end of the message: a truncated block) */
    let j = i + 1;
    let closed = false;
    for (; j < ls.length; j++) {
      if (ls[j].text.trim().startsWith(open[2]) && ls[j].text.trim().replace(/[`~]/g, "").trim() === "") {
        closed = true;
        break;
      }
    }
    const codeStart = ls[i].end + 1;
    const codeEnd = j < ls.length ? ls[j].start - 1 : text.length;
    const code = text.slice(codeStart, Math.max(codeStart, codeEnd));
    if (!code.trim()) {
      i = j;
      continue;
    }

    /* --- path resolution, most explicit first --- */
    let path: string | null = null;
    let from: FileBlock["from"] = "auto";
    for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
      const prev = ls[k].text.trim();
      if (!prev) continue;
      const sep = SEPARATOR_LINE.exec(prev);
      const head = HEADER_LINE.exec(prev);
      const hit = sep?.[1] ?? head?.[1];
      if (hit) {
        path = safeFilePath(hit);
        from = "header";
      }
      break;
    }
    if (!path) {
      /* the fence line itself may carry the path: ```js/app.js — the lang capture
         stops at the dot, so glue lang+info back together before testing it */
      const raw = `${lang}${info}`.trim();
      const plain = raw.includes(".")
        ? /^[\w\u0600-\u06FF/@+.-]+\.[A-Za-z0-9]{1,8}$/.test(raw)
        : false;
      const asPath = (plain ? raw : info.trim() || lang).replace(/^[a-z]+:/i, "").replace(/^\.?\//, "");
      if (asPath && /^[\w\u0600-\u06FF./@-]+\.[A-Za-z0-9]{1,8}$/.test(asPath) && !/^(c\+\+|c#)$/i.test(asPath)) {
        path = safeFilePath(asPath);
        from = "fence";
      }
    }
    if (!path) {
      const named = /(?:file|filename|name|path)\s*[:=]\s*["']?([\w./-]+\.[A-Za-z0-9]{1,8})/i.exec(info)?.[1];
      if (named) {
        path = safeFilePath(named);
        from = "info";
      }
    }
    if (!path) {
      const first = code.split("\n", 1)[0] ?? "";
      const c = /^\s*(?:\/\/|#|\/\*|<!--)\s*(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.[A-Za-z0-9]{1,8})\s*(?:\*\/|-->)?\s*$/.exec(first)?.[1];
      if (c) {
        path = safeFilePath(c);
        from = "comment";
      }
    }
    if (!path) path = `index.${lang || "txt"}`;
    else from = from === "auto" ? "auto" : from;

    out.push({ path, lang: lang || langFromPath(path), code, from, complete: closed && !codeLooksCut(code, path) });
    i = j;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   3. علامة الاستمرار  [[CONTINUE: …]]
   ══════════════════════════════════════════════════════════════════════════ */

export const CONTINUE_MARK_RE = /\[\[\s*CONTINUE\s*[:：]?\s*([^\]\n]{0,240})\]\]/i;

/** True when the model asked to be continued (and, if named, which files are left). */
export function findContinueMarker(text: string): { found: boolean; files: string[] } {
  const m = CONTINUE_MARK_RE.exec(text || "");
  if (!m) return { found: false, files: [] };
  const files = (m[1] || "")
    .split(/[,،·|\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^[=:.-]+$/.test(s))
    .slice(0, 12);
  return { found: true, files };
}

/**
 * Removes the marker (and the empty line it usually sits on) from what the reader sees.
 * The line structure is preserved byte for byte otherwise — this runs per streamed chunk,
 * so a stray trim here would collapse every newline of the answer.
 */
export function stripContinueMarkers(text: string): string {
  const t = text || "";
  if (!t) return t;
  if (!CONTINUE_MARK_RE.test(t)) return t; /* fast path: untouched */
  const out: string[] = [];
  for (const line of t.split("\n")) {
    if (!CONTINUE_MARK_RE.test(line)) {
      out.push(line);
      continue;
    }
    const rest = line.replace(new RegExp(CONTINUE_MARK_RE.source, "gi"), "").trim();
    if (rest === "" || /^[`~*_>:.,،-]+$/.test(rest)) {
      /* the marker sat alone on its line: drop the line and the blank line it left */
      while (out.length && out[out.length - 1].trim() === "") out.pop();
      continue;
    }
    out.push(line.replace(new RegExp(CONTINUE_MARK_RE.source, "gi"), "").replace(/[ \t]+$/, ""));
  }
  return out.join("\n");
}

/* ══════════════════════════════════════════════════════════════════════════
   4. حارس الصدق — لا ادعاءات وهمية
   ══════════════════════════════════════════════════════════════════════════ */

export interface ClaimRule {
  id: string;
  /** what we look for */
  re: RegExp;
  /** why it is a lie when no live URL exists */
  note: string;
  /** honest replacement (or "" to delete the sentence) */
  fix: string;
}

/**
 * Deliberately narrow: only claims that we can *prove* are unsupported.
 * A real URL in the same answer (given by the server, not typed by the model)
 * switches the live-URL rules off.
 */
export const CLAIM_RULES: ClaimRule[] = [
  {
    id: "published-now",
    re: /(?:تم|راه)\s*(?:النشر|نشرها|رفعه|رفعها|دفعه|دفعها)[^.!؟\n]{0,80}(?:على|في)\s*(?:vercel|فيرسل|github|غيت\s*هاب|git\s*hub)/gi,
    note: "يدّعي نشرًا لم يقع",
    fix: "الملفات جاهزة للنشر (لم يتمّ النشر من هذه المحادثة).",
  },
  {
    id: "live-url-claim",
    re: /(?:هذا هو|هاك|ها)\s*(?:الرابط|الرابط المباشر|link)\s*[:：]?\s*(?!https?:\/\/)(?=\S)/gi,
    note: "يدّعي رابطًا غير موجود",
    fix: "",
  },
  {
    id: "verified-100",
    re: /(?:100\s*%|مئة بالمئة|۱۰۰\s*%)\s*(?:تحقق|مضمون|ناجح|يعمل|صحيح|clean|verified|tested)/gi,
    note: "نسبة تحقق مزيّفة",
    fix: "",
  },
  {
    id: "fully-built",
    re: /(?:بُني|تم بناء|أُنجز|تم إنجاز)[^.!؟\n]{0,30}(?:فعليا|فعليًا|بالكامل|كاملًا|بالفعل|100\s*%)/gi,
    note: "ادعاء بناء فعلي بلا دليل",
    fix: "",
  },
  {
    id: "tests-passed",
    re: /(?:كل|جميع)\s*(?:الاختبارات|الفحوصات)\s*(?:نجحت|ناجحة|تعمل)/gi,
    note: "ادعاء اختبارات لم تُشغَّل",
    fix: "لم تُشغَّل اختبارات آلية على هذا الكود.",
  },
  {
    id: "deployed-env",
    re: /(?:live|production)[- ]?(?:url|ready|deployed)\s*[:：]\s*(?!https?:\/\/)/gi,
    note: "ادعاء بيئة إنتاج حيّة",
    fix: "",
  },
];

export interface SanitizeResult {
  text: string;
  /** ids of the rules that fired — surfaced in tests and telemetry, never to the user */
  hits: string[];
}

/**
 * Rewrites unsupported claims into honest sentences. When `hasLiveUrl` is true
 * (the server really stored the project at /p/slug) the live-URL rules stay quiet.
 *
 * It only touches a *sentence* that matches: nothing else in the answer moves.
 */
export function sanitizeClaims(input: string, opts: { hasLiveUrl?: boolean } = {}): SanitizeResult {
  let text = input || "";
  const hits: string[] = [];
  if (!text) return { text, hits };
  /* الكود المسوّر لا يُمَسّ: لا نضغط مسافات ولا أسطرًا إذا كان الجواب فيه ملفات */
  const hasCode = /^\s*`{3,}/m.test(text) || /^\s*###\s*FILE:/m.test(text);
  for (const rule of CLAIM_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : `${rule.re.flags}g`);
    if (!re.test(text)) continue;
    if (opts.hasLiveUrl && (rule.id === "published-now" || rule.id === "live-url-claim" || rule.id === "deployed-env")) continue;
    re.lastIndex = 0;
    text = text.replace(re, () => rule.fix);
    /* a deleted sentence can leave a line that holds nothing but punctuation */
    text = text.replace(/^[ \t]*[:：,،.؛·\-–—]+[ \t]*$/gm, "");
    if (!hasCode) {
      text = text.replace(/(^|\n)([ \t]*[:：,،.؛-]\s+)/g, "$1");
      text = text.replace(/[ \t]{2,}/g, " ");
      text = text.replace(/\n{3,}/g, "\n\n");
    }
    hits.push(rule.id);
  }
  return { text: text.trimEnd(), hits };
}

/* ══════════════════════════════════════════════════════════════════════════
   5. المراجعة الذاتية (§5 في الدستور) على الناتج الحقيقي
   ══════════════════════════════════════════════════════════════════════════ */

export interface ChecklistFinding {
  id: string;
  /** what is wrong, in one line */
  label: string;
  /** the file (or "الكود") it refers to */
  scope: string;
  severity: "high" | "medium";
}

export interface ChecklistReport {
  ok: boolean;
  findings: ChecklistFinding[];
  files: number;
  lines: number;
  bytes: number;
  /** the same list the constitution asks the model to check, for the UI */
  passed: string[];
}

/** «باقي الكود / TODO / …» — سطر كامل لا يحتوي إلا على عنصر ناقص. */
const PLACEHOLDER_LINE_RE =
  /(?:^|\n)\s*(?:\/\/|\/\*|#|<!--|--)?\s*(?:\.{3,}|…|TODO|FIXME|باقي الكود|الباقي|مثل السابق|same as above|rest of the code|كمل من هنا|هنا بقية|etc\.?)\s*(?:\*\/|-->)?\s*(?:\n|$)/i;

/** نفس العناصر لكن داخل تعليق في وسط سطر فيه كود حقيقي. */
const PLACEHOLDER_IN_COMMENT_RE =
  /(?:\/\/|\/\*|#|<!--)\s*(?:TODO|FIXME|\.{3,}|…|باقي الكود|الباقي|مثل السابق|rest of the code|same as above)/i;

const EMPTY_FN_RE = /(?:function\s+\w+\s*\([^)]*\)\s*\{|=>\s*\{\s*\}|\)\s*\{\s*\})\s*(?:\}|\s*\/\/\s*(?:TODO|implement|not implemented))/gi;

/** دوال مدمجة يجوز لحدث أن يناديها بلا تعريف في المشروع. */
const HANDLER_BUILTINS = new Set([
  "$", "jQuery", "alert", "atob", "blur", "btoa", "close", "confirm", "console",
  "decodeURI", "decodeURIComponent", "document", "encodeURI", "encodeURIComponent",
  "event", "fetch", "focus", "getComputedStyle", "history", "location", "localStorage",
  "navigator", "open", "postMessage", "print", "prompt", "requestAnimationFrame",
  "scrollBy", "scrollTo", "sessionStorage", "setInterval", "setTimeout", "this",
  "structuredClone", "window",
]);

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr", "!doctype"]);

/** Structural check of one file: fences, tags, braces, placeholders. */
export function codeLooksCut(code: string, path = ""): boolean {
  const c = code || "";
  if (/\bTAG_LOST\b/.test(path)) return true;
  const braces = (c.match(/\{/g) ?? []).length - (c.match(/\}/g) ?? []).length;
  if (braces > 0) return true;
  const parens = (c.match(/\(/g) ?? []).length - (c.match(/\)/g) ?? []).length;
  if (parens > 0 && /\.(js|mjs|cjs|ts|tsx|jsx|php|py|java)$/i.test(path)) return true;
  if (/\.(html?|svg|xml)$/i.test(path)) {
    for (const tag of ["div", "section", "main", "header", "footer", "nav", "script", "style", "body", "html", "table", "form", "select", "canvas", "svg"]) {
      const open = (c.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
      const close = (c.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
      if (open > close) return true;
    }
    if (/<html[\s>]/i.test(c) && !/<\/html>\s*$/i.test(c.trim())) return true;
  }
  return false;
}

/** Runs the §6 checklist over what was really produced (not over what was promised). */
export function codeChecklist(reply: string): ChecklistReport {
  const blocks = parseFileBlocks(reply);
  const findings: ChecklistFinding[] = [];
  let lines = 0;
  let bytes = 0;

  /* الأحداث قد تُعرَّف في ملف ويُستدعى منها في ملف آخر: اجمع الأسماء على مستوى المشروع */
  const defined = new Set<string>(HANDLER_BUILTINS);
  for (const b of blocks) {
    for (const m of b.code.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    for (const m of b.code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    for (const m of b.code.matchAll(/(?:window|globalThis|module\.exports)\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
    for (const m of b.code.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(?:function|\()/g)) defined.add(m[1]);
  }

  for (const b of blocks) {
    lines += b.code.split("\n").length;
    bytes += b.code.length;
    if (!b.complete) findings.push({ id: "cut", label: "الملف يبدو مقطوعًا (وسم/قوس أو كتلة غير مغلقة)", scope: b.path, severity: "high" });
    if (PLACEHOLDER_LINE_RE.test(b.code) || PLACEHOLDER_IN_COMMENT_RE.test(b.code)) findings.push({ id: "placeholder", label: "فيه «باقي الكود/TODO/…» — ممنوع في الدستور", scope: b.path, severity: "high" });
    if (EMPTY_FN_RE.test(b.code)) findings.push({ id: "empty-fn", label: "دالة فارغة أو غير مُنفَّذة", scope: b.path, severity: "medium" });
    /* حدث داخلي ينادي دالة غير معرّفة في أي ملف من المشروع */
    const calls = Array.from(b.code.matchAll(/on[a-z]+\s*=\s*["']([A-Za-z_$][\w$]*)\s*\(/g)).map((m) => m[1]);
    const missing = Array.from(new Set(calls.filter((name) => !defined.has(name))));
    if (missing.length) {
      findings.push({ id: "handler", label: `حدث يستدعي دوالًا غير معرّفة: ${missing.slice(0, 4).join(", ")}`, scope: b.path, severity: "medium" });
    }
    const ids = Array.from(b.code.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length && /\.(html?|svg)$/i.test(b.path)) findings.push({ id: "dup-id", label: `IDs مكرّرة: ${Array.from(new Set(dupes)).slice(0, 4).join(", ")}`, scope: b.path, severity: "medium" });
    if (/\blocalStorage\b/.test(b.code) && !/try\s*\{[\s\S]{0,200}localStorage/.test(b.code) && !/try\s*\{/.test(b.code)) {
      findings.push({ id: "storage", label: "localStorage بلا try/catch", scope: b.path, severity: "medium" });
    }
    if (/(?:setInterval|addEventListener)\s*\(/.test(b.code) && !/(?:clearInterval|removeEventListener|{ *once: *true)/.test(b.code) && b.code.split("\n").length > 120) {
      findings.push({ id: "leak", label: "مؤقّت/حدث بلا تنظيف واضح", scope: b.path, severity: "medium" });
    }
  }

  const passed: string[] = [];
  if (!findings.some((f) => f.id === "placeholder")) passed.push("بلا TODO أو «باقي الكود»");
  if (!findings.some((f) => f.id === "cut")) passed.push("كل ملف مغلق (وسوم/أقواس/دوال)");
  if (!findings.some((f) => f.id === "handler" || f.id === "dup-id")) passed.push("لا معرّفات مكرّرة ولا أحداث معلّقة");
  if (findings.length === 0 && blocks.length) passed.push("مراجعة بنيوية سليمة");

  return { ok: findings.length === 0, findings, files: blocks.length, lines, bytes, passed };
}

/* ══════════════════════════════════════════════════════════════════════════
   6. الحارس على البثّ — علامة الاستمرار + الادعاءات، سطرًا سطرًا
   ══════════════════════════════════════════════════════════════════════════ */

export interface NexusProtocolOptions {
  /** a real, server-provided live URL exists for this turn */
  hasLiveUrl?: boolean;
  /** voice turns keep everything (no code, no claims) */
  enabled?: boolean;
  /** cap on how much we hold back while looking for a claim (chars of the current line) */
  maxLineHold?: number;
}

/**
 * Wraps a text stream and applies the protocol without a visible delay:
 * complete lines are scanned and cleaned, an incomplete last line is held back
 * only while it could still become a claim (or a continue marker).
 */
export function withNexusProtocol(src: ReadableStream<string>, opts: NexusProtocolOptions = {}): ReadableStream<string> {
  if (opts.enabled === false) return src;
  const reader = src.getReader();
  const maxHold = opts.maxLineHold ?? 260;
  let buf = "";
  /* a marker line took its newline with it: its blank line goes too */
  let swallowBlank = false;
  const clean = (chunk: string) => {
    const hadMarker = CONTINUE_MARK_RE.test(chunk);
    const stripped = stripContinueMarkers(chunk);
    if (!stripped.trim()) {
      if (hadMarker) {
        swallowBlank = true;
        return "";
      }
      if (!stripped || swallowBlank) {
        swallowBlank = false;
        return ""; /* whitespace-only line dropped with its marker */
      }
      return stripped; /* a plain blank line: keep the reader's line breaks */
    }
    swallowBlank = false;
    const cleaned = sanitizeClaims(stripped, { hasLiveUrl: opts.hasLiveUrl }).text;
    if (!cleaned) return "";
    /* sanitizeClaims trims its output: put the newline run back so the reader
       sees exactly the lines the model wrote */
    const tail = /\n+$/.exec(stripped)?.[0] ?? "";
    return cleaned + tail;
  };

  return new ReadableStream<string>({
    async pull(controller) {
      /* read until we have at least one complete line (or a line we must not hold) */
      for (;;) {
        const idx = buf.lastIndexOf("\n");
        if (idx >= 0) {
          const head = buf.slice(0, idx + 1);
          buf = buf.slice(idx + 1);
          const out = clean(head);
          if (out) {
            controller.enqueue(out);
            return;
          }
          /* the line cleaned down to nothing (a marker): keep going — a pull that
             emits nothing and returns would stall the reader forever */
          continue;
        }
        if (buf.length > maxHold) {
          /* one very long line (minified code): emit all but the tail */
          const cut = buf.length - maxHold;
          const out = clean(buf.slice(0, cut));
          buf = buf.slice(cut);
          if (out) {
            controller.enqueue(out);
            return;
          }
          continue;
        }
        const { done, value } = await reader.read();
        if (done) {
          if (buf) {
            controller.enqueue(clean(buf));
            buf = "";
          }
          controller.close();
          return;
        }
        buf += value;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   6ب. إصلاح ذاتي بعد التسليم — دورة واحدة فقط، للعيوب الخطيرة
   ══════════════════════════════════════════════════════════════════════════ */

export interface RepairRequest {
  /** the whole answer so far */
  answer: string;
  /** the files that broke the contract (may be empty) */
  files: string[];
  /** every high-severity finding */
  findings: ChecklistFinding[];
}

export interface ContractRepairOptions {
  /** streams the rewritten files back (the route owns the model call) */
  repair: (req: RepairRequest) => Promise<ReadableStream<string> | null>;
  /** epoch ms — never start a repair after this */
  deadlineAt?: number;
  enabled?: boolean;
  /** max repair rounds (default 1: the contract is strict about not looping) */
  rounds?: number;
  /** short line shown before the repaired code */
  note?: string;
}

/**
 * §5 of the constitution, enforced instead of merely requested: when the produced
 * code contains "باقي الكود / TODO / …" or a file that was cut mid-way, ONE repair
 * round re-asks for those files and streams the corrected versions in place.
 *
 * One round, high-severity findings only, and only when there is time left: the
 * user asked for a hard stop on silent failure, not for an endless agent loop.
 */
export function withContractRepair(src: ReadableStream<string>, o: ContractRepairOptions): ReadableStream<string> {
  if (o.enabled === false) return src;
  const reader = src.getReader();
  const rounds = o.rounds ?? 1;
  return new ReadableStream<string>({
    async pull(controller) {
      let acc = "";
      let done = false;
      try {
        for (;;) {
          const { done: d, value } = await reader.read();
          if (d) {
            done = true;
            break;
          }
          acc += value;
          controller.enqueue(value);
        }
      } catch {
        done = true;
      }

      /* the review the constitution asks for — run on the real output */
      for (let r = 0; r < rounds && done && (!o.deadlineAt || Date.now() < o.deadlineAt); r++) {
        const cleaned = stripContinueMarkers(acc).replace(/\n{3,}/g, "\n\n");
        const report = codeChecklist(cleaned);
        const high = report.findings.filter((f) => f.severity === "high");
        if (!high.length) break;
        const files = Array.from(new Set(high.map((f) => f.scope).filter((p) => p && p !== "index.txt")));
        try {
          const fix = await o.repair({ answer: cleaned, files, findings: high });
          if (!fix) break;
          const head = `\n\n${o.note ?? "— إصلاح آلي: أُعيدت كتابة الملفات المقطوعة كاملة —"}\n\n`;
          controller.enqueue(head);
          acc += head;
          const fr = fix.getReader();
          for (;;) {
            const { done: fd, value } = await fr.read();
            if (fd) break;
            acc += value;
            controller.enqueue(value);
          }
        } catch {
          break;
        }
      }

      controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   7. مساعدات للواجهة
   ══════════════════════════════════════════════════════════════════════════ */

/** True when the reply looks like a multi-file NEXUS CODE deliverable. */
export function isNexusDeliverable(reply: string): boolean {
  const t = reply || "";
  if (t.length < 200) return false;
  if (/^\s*(?:#{1,6}\s*)?(?:FILE|file|filename)\s*[:：]/m.test(t)) return true;
  if (/\[\[\s*CONTINUE/i.test(t)) return true;
  if (/```(?:html|htm|js|ts|jsx|tsx|css|py|php|sql|json|md)\b/i.test(t) && t.length > 800) return true;
  return false;
}

/** One-line summary of a checklist, in the user's language. */
export function checklistLine(r: ChecklistReport): string {
  if (!r.files) return "لا ملفات في هذا الرد.";
  const base = `${r.files} ملف · ${r.lines.toLocaleString("ar-DZ")} سطر`;
  if (r.ok) return `${base} · مراجعة بنيوية: سليمة ✓`;
  return `${base} · ${r.findings.length} ملاحظة تحتاج إصلاحًا`;
}
