import type { ProjectKind, QaIssue, QaReport, Severity } from '@/lib/apex/types';
import { bytesFmt } from '@/lib/apex/utils';

/**
 * محرّك الفحص (NOVA QA ENGINE v3)
 * تحليل ساكن عميق لملفات HTML/JS/TSX/CSS مع مقاييس وقياسات وبوابات جودة.
 * لا يعتمد على أي مكتبة خارجية — محللات نمطية مُحكمة مع عدّ أسطر دقيق.
 */

interface Rule {
  id: string;
  severity: Severity;
  category: QaIssue['category'];
  /** يُنفَّذ على الكود كامل، ويُرجع أدلة إن وُجدت المشكلة */
  check: (code: string, ctx: Ctx) => { evidence?: string; line?: number; detailAr: string; detailEn: string } | null;
  titleAr: string;
  titleEn: string;
  fixAr: string;
  fixEn: string;
  auto?: (code: string) => string;
  kinds?: ProjectKind[];
}

interface Ctx {
  lines: string[];
  kind: ProjectKind;
  isGame: boolean;
}

const lineOf = (code: string, index: number): number => code.slice(0, index).split('\n').length;

function firstMatch(code: string, re: RegExp): { text: string; line: number } | null {
  const m = re.exec(code);
  if (!m) return null;
  return { text: m[0].slice(0, 160).replace(/\s+/g, ' '), line: lineOf(code, m.index) };
}

function countMatches(code: string, re: RegExp): number {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let n = 0;
  while (r.exec(code) !== null) {
    n++;
    if (n > 5000) break;
  }
  return n;
}

const SEV_WEIGHT: Record<Severity, number> = { critical: 25, high: 12, medium: 6, low: 2.5, info: 1 };

export const RULES: Rule[] = [
  /* ============================ بنية HTML ============================ */
  {
    id: 'html-001',
    severity: 'high',
    category: 'html',
    titleAr: 'ناقص إعلان doctype',
    titleEn: 'Missing doctype declaration',
    check: (code) => {
      if (!/<html/i.test(code)) return null;
      if (/^\s*<!doctype html>/i.test(code)) return null;
      return { detailAr: 'الملف يبدأ بوسم html بلا <!doctype html>، ما يفعّل «وضع المتصفح الغريب» ويكسر التخطيط والقياسات.', detailEn: 'The file starts with <html> without <!doctype html>, triggering quirks mode and breaking layout and measurements.' };
    },
    fixAr: 'أضف <!doctype html> في أول سطر تماماً.',
    fixEn: 'Add <!doctype html> as the very first line.',
    auto: (code) => `<!doctype html>\n${code.replace(/^\s*<!doctype[^>]*>\s*/i, '')}`,
  },
  {
    id: 'html-002',
    severity: 'high',
    category: 'html',
    titleAr: 'مفقود وسم viewport',
    titleEn: 'Missing viewport meta',
    check: (code) => {
      if (!/<html/i.test(code)) return null;
      if (/<meta[^>]+name=["']viewport["']/i.test(code)) return null;
      return { detailAr: 'بلا وسم viewport سيهبط الموقع على الهاتف إلى عرض وهمي 980px وتُصغَّر الواجهة وتصبح غير قابلة للاستخدام.', detailEn: 'Without a viewport tag, mobile browsers render at a 980px virtual width, shrinking the UI into unusability.' };
    },
    fixAr: 'أضف <meta name="viewport" content="width=device-width, initial-scale=1"> داخل head.',
    fixEn: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside head.',
    auto: (code) =>
      /<head[^>]*>/i.test(code)
        ? code.replace(/<head([^>]*)>/i, `<head$1>\n  <meta name="viewport" content="width=device-width, initial-scale=1" />`)
        : code,
  },
  {
    id: 'html-003',
    severity: 'medium',
    category: 'html',
    titleAr: 'مفقود charset',
    titleEn: 'Missing charset',
    check: (code) => {
      if (!/<html/i.test(code)) return null;
      if (/<meta[^>]+charset/i.test(code)) return null;
      return { detailAr: 'بلا <meta charset> قد تظهر الحروف العربية مشوّهة (RTL سينكسر بصرياً على بعض السيرفرات).', detailEn: 'Without <meta charset>, Arabic text can render as mojibake (visually breaking RTL on some servers).' };
    },
    fixAr: 'أضف <meta charset="UTF-8"> كأول عنصر داخل head.',
    fixEn: 'Add <meta charset="UTF-8"> as the first element inside head.',
    auto: (code) => (/<head[^>]*>/i.test(code) ? code.replace(/<head([^>]*)>/i, `<head$1>\n  <meta charset="UTF-8" />`) : code),
  },
  {
    id: 'html-004',
    severity: 'medium',
    category: 'seo',
    titleAr: 'مفقود وسم title',
    titleEn: 'Missing <title>',
    check: (code) => {
      if (!/<html/i.test(code)) return null;
      if (/<title>[^<]{2,}<\/title>/i.test(code)) return null;
      return { detailAr: 'العنوان الفارغ يجعل التبويب بلا اسم ويُضعف ترتيب الصفحة في نتائج البحث.', detailEn: 'An empty title leaves the tab unnamed and weakens search ranking.' };
    },
    fixAr: 'أضف title وصفياً بين 30 و60 حرفاً.',
    fixEn: 'Add a descriptive title between 30 and 60 characters.',
    auto: (code) =>
      /<head[^>]*>/i.test(code) ? code.replace(/<head([^>]*)>/i, `<head$1>\n  <title>مشروع نوفا فورج</title>`) : code,
  },
  {
    id: 'html-005',
    severity: 'low',
    category: 'html',
    titleAr: 'سمات وسم مكرّرة',
    titleEn: 'Duplicate markup attributes',
    check: (code) => {
      const m = /<[a-z][^>]*\s(id|class|type)=["'][^"']*["'][^>]*\s\1=/i.exec(code);
      if (!m) return null;
      return { evidence: m[0].slice(0, 100), line: lineOf(code, m.index), detailAr: `السمة «${m[1]}» معرّفة مرتين في نفس الوسم؛ المتصفح يتجاهل الثانية وقد يتصرف بشكل غير متوقع.`, detailEn: `Attribute "${m[1]}" is defined twice on one tag; browsers ignore the second one, causing surprising behavior.` };
    },
    fixAr: 'احذف السمة المكرّرة واترك واحدة.',
    fixEn: 'Remove the duplicate attribute, keep one.',
  },
  {
    id: 'html-006',
    severity: 'high',
    category: 'html',
    titleAr: 'وسوم غير مغلقة (فرق التماسك)',
    titleEn: 'Unbalanced tags',
    check: (code, ctx) => {
      if (!/<html/i.test(code) && !/<div|<section|<main/i.test(code)) return null;
      const voidTags = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'track', 'area', 'base', 'col', 'embed', 'param', 'wbr']);
      const stack: string[] = [];
      const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
      let m: RegExpExecArray | null;
      let worst: string | null = null;
      let worstLine = 0;
      while ((m = re.exec(code)) !== null) {
        const tag = m[1].toLowerCase();
        const selfClosed = m[2].trim().endsWith('/');
        if (voidTags.has(tag) || selfClosed) continue;
        if (m[0].startsWith('</')) {
          const idx = stack.lastIndexOf(tag);
          if (idx === -1) {
            if (!worst) {
              worst = `إغلاق زائد لوسم <${tag}>`;
              worstLine = lineOf(code, m.index);
            }
          } else {
            stack.splice(idx);
          }
        } else {
          stack.push(tag);
        }
      }
      if (!worst && stack.length) {
        worst = `وسوم لم تُغلق: ${stack.slice(-4).map((t) => `<${t}>`).join(' ')}`;
        worstLine = ctx.lines.length;
      }
      if (!worst) return null;
      return { evidence: worst, line: worstLine, detailAr: `${worst} — التماسك المكسور يجعل المتصفح يعيد بناء الشجرة عشوائياً فينكسر التخطيط والقيم المأخوذة من DOM.`, detailEn: `${worst} — broken nesting makes the browser rebuild the tree unpredictably, breaking layout and DOM-derived values.` };
    },
    fixAr: 'راجع الوسوم عند السطر المذكور وأغلق كل وسم ترتيبياً (آخر مفتوح أول مُغلق).',
    fixEn: 'Inspect the reported line and close tags in strict nesting order.',
  },
  {
    id: 'html-007',
    severity: 'medium',
    category: 'game',
    titleAr: 'كانفس بلا معالجة تغيير الحجم',
    titleEn: 'Canvas without resize handling',
    check: (code) => {
      if (!/<canvas/i.test(code)) return null;
      if (/addEventListener\(\s*['"]resize['"]/i.test(code) || /window\.onresize/i.test(code)) return null;
      return { detailAr: 'الكانفس لا يتحسّس تغيير حجم النافذة؛ عند تدوير الهاتف أو تغيير حجم النافذة سيمتد الرسم أو يتشوّه.', detailEn: 'The canvas never listens to window resize; rotating the phone or resizing will stretch or distort the render.' };
    },
    fixAr: `أضف:
window.addEventListener('resize', () => { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr,0,0,dpr,0,0); });`,
    fixEn: 'Add a resize listener that updates canvas.width/height with devicePixelRatio and resets the transform.',
  },
  {
    id: 'html-008',
    severity: 'high',
    category: 'game',
    titleAr: 'حلقة رسم بلا حصر للزمن',
    titleEn: 'Animation loop without time clamping',
    check: (code, ctx) => {
      if (!ctx.isGame) return null;
      const hasRaf = /requestAnimationFrame/.test(code);
      if (!hasRaf) return null;
      const hasDelta = /delta|dt\b|0\.033|33/.test(code);
      if (hasDelta) return null;
      return { detailAr: 'الحلقة تعتمد على عدد الإطارات لا على الزمن المنقضي؛ على جهاز أبطأ تتباطأ اللعبة، وعند العودة من التبويب المخفي تقفز الكائنات قفزة واحدة ضخمة.', detailEn: 'The loop depends on frame count instead of elapsed time; slower devices run in slow motion and returning from a hidden tab teleports objects.' };
    },
    fixAr: 'استخدم: let last = performance.now(); function frame(t){ const dt = Math.min(0.033, (t - last)/1000); last = t; update(dt); rAF(frame); }',
    fixEn: 'Use elapsed time: let last = performance.now(); const dt = Math.min(0.033, (t-last)/1000).',
  },
  {
    id: 'html-009',
    severity: 'medium',
    category: 'game',
    titleAr: 'لا إيقاف عند إخفاء التبويب',
    titleEn: 'No pause on hidden tab',
    check: (code, ctx) => {
      if (!ctx.isGame) return null;
      if (!/requestAnimationFrame/.test(code)) return null;
      if (/visibilitychange|document\.hidden/i.test(code)) return null;
      return { detailAr: 'اللعبة لا تتوقف عند ترك التبويب؛ ستستهلك بطارية ومعالجاً، وقد تعود اللعبة حالة موت مفاجئ أو تسريب مؤقتات.', detailEn: 'The game never pauses when the tab hides; it drains battery and CPU, and may resume into a sudden death or timer leak.' };
    },
    fixAr: "document.addEventListener('visibilitychange', () => { paused = document.hidden; if(!document.hidden) last = performance.now(); });",
    fixEn: "Add a visibilitychange listener that pauses and resets the loop clock on return.",
  },
  {
    id: 'html-010',
    severity: 'low',
    category: 'game',
    titleAr: 'لا دعم لمس على الأجهزة المحمولة',
    titleEn: 'No touch controls',
    check: (code, ctx) => {
      if (!ctx.isGame) return null;
      if (/pointerdown|touchstart|touchmove|pointermove/i.test(code)) return null;
      return { detailAr: 'اللعبة تستقبل لوحة المفاتيح فقط؛ أكثر من نصف اللاعبين على الهاتف لن يستطيعوا اللعب إطلاقاً.', detailEn: 'The game only listens to the keyboard; the majority playing on phones cannot play at all.' };
    },
    fixAr: "أضف pointerdown/pointermove/pointerup على الكانفس مع preventDefault وحدود للأزرار لا تقل عن 44px.",
    fixEn: 'Add pointer events on the canvas (pointerdown/move/up) with preventDefault and >=44px targets.',
  },
  {
    id: 'js-001',
    severity: 'critical',
    category: 'js',
    titleAr: 'مرجع لعنصر قبل التأكد من وجوده',
    titleEn: 'DOM element used without null check',
    check: (code) => {
      const uses = /document\.(getElementById|querySelector)\s*\(/;
      if (!uses.test(code)) return null;
      if (/if\s*\(\s*!?\s*(el|element|node|dom)\s*\)/.test(code) || /\?\.\w/.test(code)) return null;
      const m = /(?:const|let|var)\s+(\w+)\s*=\s*document\.(?:getElementById|querySelector)\s*\([^)]*\)\s*;\s*(?:\n\s*)?\1\s*\./m.exec(code);
      if (!m) return null;
      return { evidence: m[0].slice(0, 140).replace(/\n/g, ' '), line: lineOf(code, m.index), detailAr: `العنصر «${m[1]}» يُستخدم فوراً بعد جلبه: إن كان الوسم غير موجود (تغيير html، أو التنفيذ قبل بناء DOM) يتوقف كل السكربت بخطأ TypeError ويبدو الموقع ميتاً.`, detailEn: `Element "${m[1]}" is used immediately after lookup: if the node is missing (markup change or script running pre-DOM) the entire script dies with a TypeError and the site looks dead.` };
    },
    fixAr: 'تحقّق دائماً: const el = document.getElementById(...); if (!el) return; ثم استخدم el، أو انقل السكربت لنهاية body مع defer.',
    fixEn: 'Always guard: const el = document.querySelector(...); if (!el) return;',
  },
  {
    id: 'js-002',
    severity: 'critical',
    category: 'security',
    titleAr: 'استخدام eval أو Function',
    titleEn: 'eval / Function usage',
    check: (code) => {
      const m = firstMatch(code, /\b(eval\s*\(|new\s+Function\s*\()/);
      if (!m) return null;
      return { evidence: m.text, line: m.line, detailAr: 'تنفيذ نص ككود يفتح باب حقن كامل (XSS) ويُعطّل سياسات الأمان. كثير من المتصفحات تحجبه، فالكود يفشل أصلاً.', detailEn: 'Executing strings as code opens full injection (XSS) and defeats CSP. Browsers increasingly block it, so the code fails anyway.' };
    },
    fixAr: 'استبدل eval بـ JSON.parse للبيانات، وبجدول دوال (map) للسلوك الديناميكي.',
    fixEn: 'Replace eval with JSON.parse for data and a lookup map for dynamic behavior.',
  },
  {
    id: 'js-003',
    severity: 'high',
    category: 'security',
    titleAr: 'innerHTML بمحتوى غير موثوق',
    titleEn: 'innerHTML with untrusted content',
    check: (code) => {
      const suspicious = /\.innerHTML\s*=\s*(?:[a-zA-Z_$][\w$.]*(?:\s*[,+)]|\s*;)|[\s\S]{0,120}?(?:\.value|location\.|params|search|userInput|inputValue|dataset|response|\.json\(\)))/;
      const m = firstMatch(code, suspicious);
      if (!m) return null;
      // إن كان المقطع المُدرج مبنياً من نص ثابت + قيم رقمية فقط فلا خطر
      const rhs = code.slice(m.line ? code.split('\n').slice(0, m.line).join('\n').length + 1 : 0, (m.line ? code.split('\n').slice(0, m.line).join('\n').length : 0) + 400);
      const safeRhs = /^[^\n]*\.innerHTML\s*=\s*['"`]/.test(rhs) && !/(\.value|location\.|params|search|userInput|inputValue|dataset|response)/.test(rhs);
      if (safeRhs) return null;
      return { evidence: m.text, line: m.line, detailAr: 'إدراج نص متغيّر داخل innerHTML يحوّل أي مدخل مستخدم إلى HTML منفَّذ (وسم img يحمل onerror كافٍ لسرقة المفاتيح).', detailEn: 'Writing variable text into innerHTML turns any user input into executing HTML (an img tag with onerror is enough to steal keys).' };
    },
    fixAr: 'استخدم textContent للقيم، وcreateElement+appendChild للبنى، وأضف دالة escapeHtml مركزية.',
    fixEn: 'Use textContent for values, createElement/appendChild for structure, and add a central escapeHtml.',
  },
  {
    id: 'js-004',
    severity: 'high',
    category: 'security',
    titleAr: 'رابط خارجي بلا noopener',
    titleEn: 'External link missing noopener',
    check: (code) => {
      const re = /<a[^>]*target=["']_blank["'][^>]*>/gi;
      const bad: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        if (!/rel=["'][^"']*noopener/i.test(m[0])) bad.push(m[0]);
      }
      if (!bad.length) return null;
      return { evidence: bad[0].slice(0, 140), line: lineOf(code, code.indexOf(bad[0])), detailAr: `${bad.length} رابطاً يفتح في تبويب جديد بلا rel="noopener noreferrer"؛ الصفحة المفتوحة تستطيع التحكم في تبويبك (reverse tabnabbing).`, detailEn: `${bad.length} link(s) open in a new tab without rel="noopener noreferrer"; the opened page can control your tab (reverse tabnabbing).` };
    },
    fixAr: 'أضف rel="noopener noreferrer" لكل رابط target="_blank".',
    fixEn: 'Add rel="noopener noreferrer" to every target="_blank" link.',
    auto: (code) =>
      code.replace(/<a([^>]*)target=["']_blank["']([^>]*)>/gi, (full, a: string, b: string) => {
        if (/rel=/i.test(full)) {
          return full.replace(/rel=["']([^"']*)["']/i, (_s, rel: string) => `rel="${rel.includes('noopener') ? rel : rel + ' noopener noreferrer'}"`);
        }
        return `${full.slice(0, -1)} rel="noopener noreferrer"${a || b ? '' : ''}>`;
      }),
  },
  {
    id: 'js-005',
    severity: 'high',
    category: 'perf',
    titleAr: 'مؤقت بلا إيقاف',
    titleEn: 'Timer without cleanup',
    check: (code) => {
      const set = countMatches(code, /setInterval\s*\(/);
      if (set === 0) return null;
      const clear = countMatches(code, /clearInterval\s*\(/) + countMatches(code, /visibilitychange/);
      if (clear > 0) return null;
      return { detailAr: `${set} نداء setInterval بلا clearInterval ولا إيقاف عند إخفاء التبويب — استهلاك مستمر للبطارية وتراكم مؤقتات عند إعادة تشغيل الواجهة.`, detailEn: `${set} setInterval call(s) with no clearInterval and no pause on hidden tabs — continuous battery drain and timer pileup on UI re-entry.` };
    },
    fixAr: 'احفظ معرّف المؤقت: const id = setInterval(...); وأوقفه عند الإنهاء وعند visibilitychange.',
    fixEn: 'Store the timer id and clear it on teardown and on visibilitychange.',
  },
  {
    id: 'js-006',
    severity: 'medium',
    category: 'perf',
    titleAr: 'تحديث DOM داخل حلقة رسم',
    titleEn: 'DOM writes inside the render loop',
    check: (code) => {
      const rafBlock = /requestAnimationFrame[\s\S]{0,900}/.exec(code);
      if (!rafBlock) return null;
      const inner = rafBlock[0];
      if (/\.(textContent|innerText|innerHTML|style\.\w+)\s*=/.test(inner) && /\.textContent|innerHTML|innerText/.test(inner)) {
        return { detailAr: 'تحديث النصوص/HTML داخل حلقة الرسم كل إطار يسبب إعادة تخطيط متكررة (reflow) وهو السبب الأول لهبوط الإطارات في المتصفح.', detailEn: 'Updating text/HTML every frame inside the render loop causes repeated layout (reflow), the top cause of frame drops.' };
      }
      return null;
    },
    fixAr: 'افصل تحديث الواجهة: حدّث النص فقط عند تغيّر القيمة (قارن قبل الكتابة) أو كل 250ms خارج الحلقة.',
    fixEn: 'Decouple UI updates: only write text on value change (compare first) or every 250ms outside the loop.',
  },
  {
    id: 'js-007',
    severity: 'medium',
    category: 'js',
    titleAr: 'وعد (Promise) بلا معالجة أخطاء',
    titleEn: 'Unhandled promise rejection risk',
    check: (code) => {
      const fetches = countMatches(code, /\b(await\s+)?fetch\s*\(/);
      if (fetches === 0) return null;
      const guarded = /try\s*\{[\s\S]{0,600}?fetch|\.catch\s*\(/.test(code);
      if (guarded) return null;
      return { detailAr: `${fetches} نداء fetch بلا try/catch ولا .catch() — أي انقطاع شبكة يُنتج رفض وعد غير معالَج وواجهة معلّقة بلا رسالة.`, detailEn: `${fetches} fetch call(s) with no try/catch or .catch() — any network hiccup yields an unhandled rejection and a UI stuck with no message.` };
    },
    fixAr: 'غلّف كل نداء شبكة بـ try/catch مع رسالة عربية واضحة ومسار بديل (بيانات محلية).',
    fixEn: 'Wrap every network call in try/catch with a clear message and a local fallback path.',
  },
  {
    id: 'js-008',
    severity: 'high',
    category: 'js',
    titleAr: 'تخزين محلي بلا حماية',
    titleEn: 'localStorage without try/catch',
    check: (code) => {
      const ls = countMatches(code, /localStorage\.(setItem|getItem|removeItem)/);
      if (ls === 0) return null;
      if (/try\s*\{[\s\S]{0,400}?localStorage/.test(code)) return null;
      return { detailAr: `${ls} وصولاً لـ localStorage بلا try/catch — في وضع التصفح الخاص أو عند امتلاء الحصة يرمي المتصفح استثناءً يتوقف عنده التطبيق كاملاً.`, detailEn: `${ls} localStorage access(es) without try/catch — in private mode or when quota fills, the browser throws and the whole app halts.` };
    },
    fixAr: 'غلّف القراءة/الكتابة: try { ... } catch { /* تابع بذاكرة مؤقتة */ }',
    fixEn: 'Wrap reads/writes: try { ... } catch { /* continue with in-memory state */ }',
  },
  {
    id: 'js-009',
    severity: 'medium',
    category: 'js',
    titleAr: 'مقارنة غير صارمة (==)',
    titleEn: 'Loose equality usage',
    check: (code) => {
      const n = countMatches(code, /[^=!<>]==[^=]/);
      if (n < 2) return null;
      return { evidence: `${n} موضعاً`, detailAr: `${n} مقارنة بـ«==» تسمح بتحويل نوع ضمني مربك مثل '' == 0 و '0' == false، وهو مصدر تقليدي لأخطاء منطقية خفية.`, detailEn: `${n} loose comparisons allow type coercion traps like '' == 0 and '0' == false — a classic source of silent logic bugs.` };
    },
    fixAr: 'استخدم === و !== دائماً، وحوّل الأنواع صراحةً قبل المقارنة.',
    fixEn: 'Always use === and !==, converting types explicitly before comparing.',
  },
  {
    id: 'js-010',
    severity: 'medium',
    category: 'js',
    titleAr: 'ترك TODO أو دالة فارغة',
    titleEn: 'Leftover TODO or empty function',
    check: (code) => {
      const todo = countMatches(code, /\b(TODO|FIXME)\b/g);
      const empty = countMatches(code, /function\s+\w*\s*\([^)]*\)\s*\{\s*\}|=>\s*\{\s*\}/g);
      if (todo + empty === 0) return null;
      return { evidence: `TODO:${todo} فارغة:${empty}`, line: lineOf(code, Math.max(0, code.search(/TODO|FIXME/))), detailAr: `${todo} علامة TODO و${empty} دالة فارغة — هذا كود غير مكتمل، والتسليم يجب أن يكون كاملاً وقابلاً للتشغيل فوراً.`, detailEn: `${todo} TODO marker(s) and ${empty} empty function(s) — incomplete code; a deliverable must run immediately.` };
    },
    fixAr: 'أكمل الدوال أو احذفها، وأزل كل TODO قبل التسليم.',
    fixEn: 'Complete or delete the functions, and remove every TODO before shipping.',
  },
  {
    id: 'js-011',
    severity: 'critical',
    category: 'js',
    titleAr: 'محتمل حلقة لا نهائية',
    titleEn: 'Potential infinite loop',
    check: (code) => {
      const loops = /(while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;;\s*\))/g;
      if (!loops.test(code)) return null;
      const m = firstMatch(code, /(while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;;\s*\))/);
      return { evidence: m?.text ?? 'while(true)', line: m?.line, detailAr: 'حلقة بلا شرط نهاية ظاهر — إن غاب break في كل مسار يتجمّد المتصفح تماماً ويحتاج إغلاقاً قسرياً.', detailEn: 'A loop with no visible exit condition — if any path lacks a break, the browser freezes hard and needs a force quit.' };
    },
    fixAr: 'أضف حداً أقصى للمرور: while (cond && guard++ < 10000) { ... } وأضف break واضحاً.',
    fixEn: 'Add a hard iteration cap: while (cond && guard++ < 10000) { ... }',
  },
  {
    id: 'js-012',
    severity: 'medium',
    category: 'js',
    titleAr: 'فقدان التركيز يترك أزراراً عالقة',
    titleEn: 'Focus loss leaves keys stuck',
    check: (code) => {
      const hasKeys = /keydown/.test(code);
      if (!hasKeys) return null;
      if (/blur/.test(code)) return null;
      return { detailAr: 'تُسجَّل لوحة المفاتيح بلا معالجة blur؛ عند Alt+Tab يبقى الزر مضغوطاً منطقياً وتتحرك الشخصية وحدها.', detailEn: 'Keyboard input is registered without a blur handler; after Alt+Tab a key stays logically pressed and the character moves on its own.' };
    },
    fixAr: "window.addEventListener('blur', () => { keys = {}; }); وأعد ضبط كل الأزرار.",
    fixEn: "window.addEventListener('blur', () => { keys = {}; });",
  },
  {
    id: 'js-013',
    severity: 'medium',
    category: 'perf',
    titleAr: 'إنشاء كائنات داخل الحلقة',
    titleEn: 'Per-frame allocations',
    check: (code) => {
      const raf = /requestAnimationFrame[\s\S]{0,1200}/.exec(code);
      if (!raf) return null;
      const inner = raf[0];
      const allocs = countMatches(inner, /(\{\s*\}|\[\s*\]|new\s+(Array|Object|Map|Set)|\{ \w+:|\.push\(\s*\{)/g);
      if (allocs < 3) return null;
      return { evidence: `${allocs} تخصيصات محتملة`, detailAr: `${allocs} تخصيص ذاكرة محتمل داخل حلقة الرسم (مصفوفات/كائنات) — يسبب جمع قمامة متكرراً وارتجافاً في الإطارات (frame hitches).`, detailEn: `${allocs} potential allocations inside the render loop — repeated garbage collection and visible frame hitches.` };
    },
    fixAr: 'استخدم كائنات معاد استخدامها (object pooling) ومصفوفات مُسبقة التخصيص تُعاد تهيئتها لا تُنشأ من جديد.',
    fixEn: 'Use object pooling and preallocated arrays that are reset, never recreated.',
  },
  {
    id: 'js-014',
    severity: 'medium',
    category: 'ux',
    titleAr: 'دالة موتها بلا مسار بديل',
    titleEn: 'Failure path with no fallback',
    check: (code) => {
      if (!/catch\s*\(/.test(code)) return null;
      const emptyCatch = countMatches(code, /catch\s*(\([^)]*\))?\s*\{\s*\}/g);
      const silent = countMatches(code, /catch\s*\([^)]*\)\s*\{\s*(console\.(log|error|warn)[^;]*;?)\s*\}/g);
      if (emptyCatch + silent === 0) return null;
      return { detailAr: 'يوجد catch فارغ أو يكتفي بـconsole — المستخدم لا يعلم أن شيئاً فشل، وقد يظن أن العملية نجحت وهي لم تُنفَّذ.', detailEn: 'An empty catch or one that only logs — the user never learns that something failed and may assume success.' };
    },
    fixAr: 'أظهر رسالة عربية واضحة + مسار بديل، ولا تبتلع الخطأ أبداً.',
    fixEn: 'Show a clear message plus a fallback; never swallow errors.',
  },

  /* ============================ CSS وواجهة ============================ */
  {
    id: 'css-001',
    severity: 'medium',
    category: 'a11y',
    titleAr: 'إزالة إطار التركيز',
    titleEn: 'Focus outline removed',
    check: (code) => {
      const m = firstMatch(code, /outline\s*:\s*(none|0)/i);
      if (!m) return null;
      const compensated = /:focus-visible|:focus\s*\{[^}]*box-shadow/i.test(code);
      if (compensated) return null;
      return { evidence: m.text, line: m.line, detailAr: 'إزالة outline بلا بديل بصري تحذف مؤشر لوحة المفاتيح تماماً فيصبح الموقع غير قابل للاستخدام بدون فأرة (WCAG 2.4.7).', detailEn: 'Removing the outline without a visual replacement erases the keyboard indicator, making the site unusable without a mouse (WCAG 2.4.7).' };
    },
    fixAr: 'أضف بديلاً: :focus-visible { outline: 2px solid #59a4ff; outline-offset: 2px; }',
    fixEn: 'Add: :focus-visible { outline: 2px solid #59a4ff; outline-offset: 2px; }',
  },
  {
    id: 'css-002',
    severity: 'medium',
    category: 'a11y',
    titleAr: 'زر أيقوني بلا تسمية',
    titleEn: 'Icon button without label',
    check: (code) => {
      const re = /<button[^>]*>([\s\S]{0,80}?)<\/button>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const inner = m[1];
        const tag = m[0];
        const textOnly = inner.replace(/<[^>]*>/g, '').trim();
        const hasLabel = /aria-label=|aria-labelledby=|title=/.test(tag);
        const isIconOnly = /<svg|<img|&[a-z]+;|[\u2190-\u21FF\u2600-\u27BF\uFE0F]/i.test(inner) || textOnly.length <= 2;
        if (isIconOnly && !hasLabel) {
          return { evidence: tag.slice(0, 120).replace(/\s+/g, ' '), line: lineOf(code, m.index), detailAr: 'زر يحتوي أيقونة فقط بلا aria-label — قارئ الشاشة ينطق «زر» بلا أي معنى، والمستخدم لا يعرف وظيفته.', detailEn: 'An icon-only button with no aria-label — screen readers announce just "button", leaving the purpose unknown.' };
        }
      }
      return null;
    },
    fixAr: 'أضف aria-label="وصف الوظيفة" لكل زر أيقوني (وشغّل title للنص التلميحي).',
    fixEn: 'Add aria-label="what it does" to every icon-only button.',
  },
  {
    id: 'css-003',
    severity: 'high',
    category: 'a11y',
    titleAr: 'صور بلا نص بديل',
    titleEn: 'Images without alt text',
    check: (code) => {
      const imgs = countMatches(code, /<img\b/g);
      if (imgs === 0) return null;
      const missing = countMatches(code, /<img(?![^>]*\balt=)[^>]*>/g);
      if (missing === 0) return null;
      return { evidence: `${missing} من ${imgs} صورة`, detailAr: `${missing} صورة بلا alt — عند تعطّل الصورة لا يظهر شيء، وقارئ الشاشة يتجاهلها تماماً.`, detailEn: `${missing} image(s) without alt — nothing shows if the image fails, and screen readers skip it entirely.` };
    },
    fixAr: 'أضف alt وصفياً لكل صورة، وalt="" للصور التزيينية فقط.',
    fixEn: 'Add a descriptive alt to every image; use alt="" strictly for decoration.',
  },
  {
    id: 'css-004',
    severity: 'medium',
    category: 'html',
    titleAr: 'تجاوزات !important',
    titleEn: 'Excessive !important',
    check: (code) => {
      const n = countMatches(code, /!important/g);
      if (n < 4) return null;
      return { evidence: `${n} استخداماً`, detailAr: `${n} استخداماً لـ!important — مؤشر على صراع تخصيصات في CSS، ويجعل أي تعديل لاحق معركة غير قابلة للتنبؤ.`, detailEn: `${n} uses of !important — a sign of specificity wars that makes future edits unpredictable.` };
    },
    fixAr: 'قلّل التخصيص ببنية أسماء منظمة (BEM مبسّط) بدلاً من الإكراه.',
    fixEn: 'Reduce specificity with disciplined naming instead of forcing values.',
  },
  {
    id: 'css-005',
    severity: 'low',
    category: 'perf',
    titleAr: 'تحريك خصائص مكلفة',
    titleEn: 'Animating expensive properties',
    check: (code) => {
      const m = firstMatch(code, /transition\s*:[^;}]*\b(width|height|top|left|margin|padding)\b/i);
      if (!m) return null;
      return { evidence: m.text, line: m.line, detailAr: 'تحريك خصائص تُسبب إعادة تخطيط (layout) يكلّف المعالج أضعاف تحريك transform/opacity، ويهبط بالإطارات على الأجهزة المتوسطة.', detailEn: 'Animating layout-triggering properties costs many times more than transform/opacity and drops frames on mid-range devices.' };
    },
    fixAr: 'حرّك transform/opacity فقط، واستخدم will-change بحذر عند الحاجة.',
    fixEn: 'Animate only transform/opacity; use will-change sparingly when needed.',
  },
  {
    id: 'css-006',
    severity: 'medium',
    category: 'perf',
    titleAr: 'مراجع خارجية تمنع العمل بلا إنترنت',
    titleEn: 'External references',
    check: (code) => {
      const n = countMatches(code, /(https?:)?\/\/(cdn|fonts|unpkg|jsdelivr|cdnjs|googleapis|bootstrapcdn)[^"'\s)]*/gi);
      if (n === 0) return null;
      return { evidence: `${n} مرجعاً خارجياً`, detailAr: `${n} مرجعاً لمكتبة/خط من شبكة توصيل — صفحة أبطأ، مخاطر سلسلة توريد، وتوقف كامل عند حجب الشبكة أو انقطاعها.`, detailEn: `${n} external CDN reference(s) — slower page, supply-chain risk, and total failure when the network is blocked.` };
    },
    fixAr: 'ضُمّن المكتبة محلياً أو اكتب البديل يدوياً، واستخدم خطوط النظام.',
    fixEn: 'Bundle locally or implement it yourself; use system fonts.',
    kinds: ['game', 'website', 'app'],
  },
  {
    id: 'css-007',
    severity: 'medium',
    category: 'perf',
    titleAr: 'prefers-reduced-motion غير محترم',
    titleEn: 'prefers-reduced-motion ignored',
    check: (code) => {
      const anims = countMatches(code, /(animation\s*:|@keyframes|transition\s*:)/g);
      if (anims < 3) return null;
      if (/prefers-reduced-motion/.test(code)) return null;
      return { detailAr: `${anims} حركة معرّفة بلا أي احترام لـprefers-reduced-motion؛ من يعاني حسّاسية الحركة لن يستطيع استخدام المشروع (مشكلة وصولية حقيقية).`, detailEn: `${anims} declared animations with no prefers-reduced-motion handling; motion-sensitive users cannot use the project (a real accessibility defect).` };
    },
    fixAr: '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; } }',
    fixEn: 'Add a reduced-motion media query that neutralizes animations and transitions.',
  },
  {
    id: 'css-008',
    severity: 'low',
    category: 'ux',
    titleAr: 'محتوى تجاوز حدود الشاشة',
    titleEn: 'Overflow risk',
    check: (code) => {
      const wide = countMatches(code, /(?<!max-)\bwidth\s*:\s*(\d{4,}px|1\d{2}vw)/g);
      if (wide === 0) return null;
      return { evidence: `${wide} عنصر عريض ثابت`, detailAr: `${wide} عنصراً بعرض ثابت كبير — على شاشة 360px يظهر شريط تمرير أفقي وتنكسر الواجهة.`, detailEn: `${wide} fixed large-width element(s) — on a 360px screen you get horizontal scroll and a broken layout.` };
    },
    fixAr: 'استبدل العروض الثابتة بـmax-width وclamp() ونسب مئوية.',
    fixEn: 'Replace fixed widths with max-width, clamp(), and percentages.',
  },
  {
    id: 'css-009',
    severity: 'low',
    category: 'ux',
    titleAr: 'لا يوجد نمط للطباعة',
    titleEn: 'No print styles',
    check: (code, ctx) => {
      if (ctx.kind === 'game') return null;
      if (!/<html/i.test(code)) return null;
      if (/@media\s+print/.test(code)) return null;
      return { detailAr: 'بلا قواعد @media print ستُطبع الصفحة بخلفية داكنة وروابط مبتورة وأزرار بلا وظيفة.', detailEn: 'Without @media print rules the page prints with a dark background, truncated links, and meaningless buttons.' };
    },
    fixAr: '@media print { body { background:#fff; color:#000 } nav, button, .no-print { display:none } a::after { content:" (" attr(href) ")" } }',
    fixEn: 'Add @media print rules that switch to light ink, hide chrome, and expose link targets.',
  },
  {
    id: 'css-010',
    severity: 'medium',
    category: 'ux',
    titleAr: 'اتجاه RTL غير مضبوط مع نص عربي',
    titleEn: 'RTL not set for Arabic content',
    check: (code) => {
      const hasArabic = /[\u0600-\u06FF]{3,}/.test(code.replace(/<!--[\s\S]*?-->/g, ''));
      if (!hasArabic) return null;
      if (/dir=["']rtl["']/.test(code)) return null;
      return { detailAr: 'المحتوى عربي بلا dir="rtl" — تُعرض الجمل والترقيم بعكس الاتجاه الصحيح، وتنقلب الأيقونات الدلالية.', detailEn: 'Arabic content without dir="rtl" — sentences and punctuation render reversed and directional icons flip.' };
    },
    fixAr: 'أضف dir="rtl" وlang="ar" على وسم html، واستخدم الخصائص المنطقية (margin-inline).',
    fixEn: 'Add dir="rtl" and lang="ar" to <html> and use logical properties.',
    auto: (code) => code.replace(/<html([^>]*)>/i, '<html$1 dir="rtl" lang="ar">'),
  },
  {
    id: 'css-011',
    severity: 'high',
    category: 'security',
    titleAr: 'موارد HTTP غير آمنة',
    titleEn: 'Insecure HTTP resources',
    check: (code) => {
      const m = firstMatch(code, /(src|href)=["']http:\/\//i);
      if (!m) return null;
      return { evidence: m.text, line: m.line, detailAr: 'تحميل مورد عبر http:// على صفحة https يُحجب تماماً بـMixed Content، ويفتح باب تعديل المحتوى في الشبكة (MITM).', detailEn: 'Loading over http:// on an https page is blocked as Mixed Content and opens the door to in-transit tampering (MITM).' };
    },
    fixAr: 'استخدم https:// دائماً أو ضُمّن المورد محلياً.',
    fixEn: 'Always use https:// or bundle the asset locally.',
  },
  {
    id: 'css-012',
    severity: 'low',
    category: 'ux',
    titleAr: 'أرقام في بداية سطر عربي',
    titleEn: 'Digits breaking RTL flow',
    check: (code) => {
      const hasArabic = /[\u0600-\u06FF]{3,}/.test(code);
      const digitStart = /(?:^|>)\s*\d{1,3}[\s،:]/.test(code);
      if (!hasArabic || !digitStart) return null;
      if (/\u200F|\u200E|dir=["']ltr["']/.test(code)) return null;
      return { detailAr: 'أرقام في بدايات نص عربي بلا علامة اتجاه — كثيراً ما يُعاد ترتيب الترقيم بصرياً فينقلب معنى السطر.', detailEn: 'Numbers at the start of Arabic text without a direction mark — punctuation reorders visually and the line reads wrong.' };
    },
    fixAr: 'غلّف الأرقام/الرموز بعلامة U+200F أو ضع dir="ltr" حول المقاطع اللاتينية.',
    fixEn: 'Wrap digits/symbols with U+200F or set dir="ltr" around Latin segments.',
  },
];

/** مقاييس إضافية تُعرض في التقرير */
function computeMetrics(code: string) {
  return {
    lines: code ? code.split('\n').length : 0,
    bytes: new TextEncoder().encode(code).length,
    functions: countMatches(code, /(function\s+\w+|=>\s*\{|=>\s*[^(]|\w+\s*\([^)]*\)\s*\{)/g),
    loops: countMatches(code, /\b(for|while|do)\s*\(/g),
    listeners: countMatches(code, /addEventListener\s*\(/g),
    externalRefs: countMatches(code, /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/gi),
    todoCount: countMatches(code, /\b(TODO|FIXME)\b/g),
    canvases: countMatches(code, /<canvas|createElement\(['"]canvas['"]\)/g),
    fpsGuards: countMatches(code, /Math\.min\([^)]*0?\.0?33|clampDelta|dt\s*=\s*Math\.min/g),
    touchControls: countMatches(code, /pointerdown|touchstart|touchmove/gi),
  };
}

/** تحليل كامل */
export function analyze(code: string, kind: ProjectKind, onlyAutoFix = false): QaReport {
  const ctx: Ctx = {
    lines: code.split('\n'),
    kind,
    // إشارات لعبة حقيقية فقط: كانفس/كائن لاعب/حلقة لعبة — لا يكفي مجرد وجود requestAnimationFrame
    isGame: kind === 'game' || /<canvas|createElement\(['"]canvas['"]\)|\bplayer\.[a-z]|\benemy\b|gameLoop|gameState/i.test(code),
  };
  const issues: QaIssue[] = [];

  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    if (onlyAutoFix && !rule.auto) continue;
    let res: ReturnType<Rule['check']> = null;
    try {
      res = rule.check(code, ctx);
    } catch {
      res = null; // قاعدة لم تُنفّذ — لا نُسقط الفحص كله
    }
    if (!res) continue;
    issues.push({
      id: rule.id,
      rule: rule.id.toUpperCase(),
      severity: rule.severity,
      category: rule.category,
      title: { ar: rule.titleAr, en: rule.titleEn },
      detail: { ar: res.detailAr, en: res.detailEn },
      evidence: res.evidence,
      line: res.line,
      fix: { ar: rule.fixAr, en: rule.fixEn },
      autoFixable: Boolean(rule.auto),
    });
  }

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;

  let score = 100;
  for (const i of issues) score -= SEV_WEIGHT[i.severity];

  // نقاط إيجابية واعية للجودة الفعلية
  const metrics = computeMetrics(code);
  let bonus = 0;
  if (metrics.fpsGuards > 0) bonus += 3;
  if (metrics.touchControls > 0) bonus += 3;
  if (/aria-label|aria-live|role=/.test(code)) bonus += 2;
  if (/try\s*\{/.test(code)) bonus += 2;
  if (issues.length > 0) bonus = Math.min(bonus, 4); // لا تجمّل النتيجة فوق وجود ملاحظات
  score += bonus;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade = score >= 95 ? 'A+' : score >= 88 ? 'A' : score >= 78 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  const passed = counts.critical === 0 && counts.high === 0 && score >= 80;

  return {
    score,
    grade,
    passed,
    issues: issues.sort((a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity]),
    counts,
    metrics,
    checkedAt: Date.now(),
    profile: kind,
  };
}

/** تطبيق الإصلاحات الآلية القابلة للتطبيق (محدودة ومؤمّنة) */
export function applyAutoFixes(code: string, kind: ProjectKind): { code: string; applied: string[] } {
  let out = code;
  const applied: string[] = [];
  const ctx: Ctx = { lines: code.split('\n'), kind, isGame: kind === 'game' };
  for (const rule of RULES) {
    if (!rule.auto) continue;
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    let res: ReturnType<Rule['check']> = null;
    try {
      res = rule.check(out, ctx);
    } catch {
      res = null;
    }
    if (!res) continue;
    try {
      const next = rule.auto(out);
      if (next && next !== out) {
        out = next;
        applied.push(rule.id.toUpperCase());
      }
    } catch {
      /* تخطَّ الإصلاح الفاشل */
    }
  }
  return { code: out, applied };
}

export function reportToMarkdown(r: QaReport, title: string): string {
  const head = [
    `# تقرير فحص — ${title}`,
    '',
    `- **النتيجة:** ${r.score}/100 (${r.grade})`,
    `- **الحالة:** ${r.passed ? '✅ اجتاز' : '❌ لم يجتز'}`,
    `- **النوع:** ${r.profile}`,
    `- **التاريخ:** ${new Date(r.checkedAt).toLocaleString('ar')}`,
    '',
    `## الملخص`,
    `| الخطورة | العدد |`,
    `| --- | --- |`,
    `| حرج | ${r.counts.critical} |`,
    `| عالٍ | ${r.counts.high} |`,
    `| متوسط | ${r.counts.medium} |`,
    `| منخفض | ${r.counts.low} |`,
    `| معلومات | ${r.counts.info} |`,
    '',
    `## المقاييس`,
    `- الأسطر: ${r.metrics.lines} · الحجم: ${bytesFmt(r.metrics.bytes)}`,
    `- الدوال: ${r.metrics.functions} · الحلقات: ${r.metrics.loops} · المستمعات: ${r.metrics.listeners}`,
    `- مراجع خارجية: ${r.metrics.externalRefs} · TODO: ${r.metrics.todoCount}`,
    `- كانفس: ${r.metrics.canvases} · حماية إطارات: ${r.metrics.fpsGuards} · تحكم لمس: ${r.metrics.touchControls}`,
    '',
    '## المشاكل',
  ];
  const body = r.issues.length
    ? r.issues.map(
        (i) =>
          `### ${i.rule} — ${i.title.ar} [${i.severity}]${i.line ? ` · سطر ${i.line}` : ''}\n${i.detail.ar}\n\n- **الدليل:** \`${i.evidence ?? '—'}\`\n- **الإصلاح:** ${i.fix.ar}\n- **آلي:** ${i.autoFixable ? 'نعم' : 'لا'}`,
      )
    : ['لا مشاكل — المشروع نظيف.'];
  return [...head, ...body].join('\n');
}
