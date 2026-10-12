/** أدوات مساعدة عامة — بلا أي تبعيات خارجية */

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** رمز أمان تشفيري (يُستخدم لأرقام التحقق ورمز التسليم) */
export function secureDigits(len = 6): string {
  const out: string[] = [];
  const g = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto : null;
  if (g) {
    const buf = new Uint8Array(len);
    g.getRandomValues(buf);
    for (let i = 0; i < len; i++) out.push(String(buf[i] % 10));
  } else {
    for (let i = 0; i < len; i++) out.push(String(Math.floor(Math.random() * 10)));
  }
  return out.join('');
}

/** رمز تسليم مقروء: NF-XXXX-XXXX (بلا حروف ملتبسة) */
export function deliveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = (n: number) => {
    let s = '';
    const g = typeof crypto !== 'undefined' && 'getRandomValues' in crypto ? crypto : null;
    if (g) {
      const buf = new Uint8Array(n);
      g.getRandomValues(buf);
      for (let i = 0; i < n; i++) s += alphabet[buf[i] % alphabet.length];
    } else {
      for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return s;
  };
  return `NF-${block(4)}-${block(4)}`;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function bytesFmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function timeAgo(ts: number, lang: 'ar' | 'en' = 'ar'): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  const table: [number, string, string][] = [
    [60, 'ثانية', 'second'],
    [60, 'دقيقة', 'minute'],
    [24, 'ساعة', 'hour'],
    [30, 'يوم', 'day'],
    [12, 'شهر', 'month'],
    [Number.MAX_SAFE_INTEGER, 'سنة', 'year'],
  ];
  let v = s;
  for (const [step, ar, en] of table) {
    if (v < step) {
      const n = Math.floor(v);
      if (lang === 'ar') {
        if (n === 1) return `قبل ${ar === 'يوم' ? 'يوم' : ar}`;
        if (n === 2) return `قبل ${ar}ين`.replace('ةين', 'تين');
        return `قبل ${n} ${ar === 'سنة' ? 'سنوات' : ar === 'شهر' ? 'أشهر' : ar + 'ات'}`.replace('ةات', 'ات');
      }
      return `${n} ${en}${n === 1 ? '' : 's'} ago`;
    }
    v = v / step;
  }
  return lang === 'ar' ? 'الآن' : 'now';
}

export function clockFmt(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function localDayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function download(filename: string, content: string, type = 'text/plain;charset=utf-8'): void {
  try {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    /* المتصفح منع التنزيل — لا نرمي خطأ للمستخدم */
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* المتابعة إلى المسار البديل */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // تقدير مختلط: ~4 أحرف/توكن للإنجليزية، ~2.2 حرف/توكن للعربية
  let arabic = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06ff) arabic++;
  }
  const other = text.length - arabic;
  return Math.max(1, Math.round(arabic / 2.2 + other / 4));
}

export function formatMoney(v: number): string {
  if (v === 0) return '$0.0000';
  if (v < 0.0001) return `$${v.toExponential(2)}`;
  return `$${v.toFixed(4)}`;
}

/** نبضة صوتية قصيرة بـ WebAudio — بلا ملفات خارجية */
let audioCtx: AudioContext | null = null;
export function blip(kind: 'ok' | 'warn' | 'err' | 'tick' = 'tick', enabled = true): void {
  if (!enabled) return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) audioCtx = new Ctor();
    const ctx = audioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const map: Record<string, [number, number, number]> = {
      ok: [880, 0.09, 0.05],
      warn: [420, 0.14, 0.05],
      err: [200, 0.2, 0.06],
      tick: [1200, 0.03, 0.02],
    };
    const [freq, dur, vol] = map[kind];
    osc.type = kind === 'err' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.6), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {
    /* الصوت غير متاح — نتجاهل بهدوء */
  }
}

export interface StoredEnvelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

export function saveLocal<T>(key: string, data: T): void {
  try {
    const env: StoredEnvelope<T> = { v: 1, savedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {
    /* الحصة ممتلئة أو التخزين معطّل */
  }
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as StoredEnvelope<T> | T;
    if (parsed && typeof parsed === 'object' && 'v' in (parsed as object) && 'data' in (parsed as object)) {
      return (parsed as StoredEnvelope<T>).data ?? fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function storageUsage(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      total += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    return total * 2; // تقدير بايت UTF-16
  } catch {
    return 0;
  }
}

/** تصنيف نوع المشروع من نص الطلب */
export function detectKind(text: string): 'game' | 'website' | 'app' | 'api' | 'other' {
  const t = text.toLowerCase();
  if (/لعبة|لعبه|game|gameplay|arcade|شوتر|منصات|منصة ألغاز|platformer|shooter|rogue|runner|puzzle|tower defense/.test(t))
    return 'game';
  if (/موقع|صفحة|هبوط|internet|website|landing|site|متجر|store|portfolio|مدونة|blog/.test(t)) return 'website';
  if (/تطبيق|أداة|app|tool|محرر|editor|tracker|dashboard|لوحة تحكم/.test(t)) return 'app';
  if (/api|endpoint|سيرفر|server|backend|قاعدة بيانات|database|sql/.test(t)) return 'api';
  return 'other';
}

export function titleFromPrompt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const cut = clean.split(/[.\n،؛]/)[0] ?? clean;
  const t = cut.slice(0, 46).trim();
  return t.length ? t : 'مشروع جديد';
}
