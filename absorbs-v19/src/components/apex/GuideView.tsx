"use client";

import type { Nova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { RULES } from '@/lib/apex/qa';
import { MODELS } from '@/lib/apex/models';
import { PROMPTS } from '@/lib/apex/prompts';

/** الدليل السريع: كيف تبني · كيف تفحص · كيف تسلّم · اختصارات · نشر على Vercel */
export function GuideView({ nova }: { nova: Nova }) {
  const { settings, setView, runQa } = nova;
  const t = makeT(settings.lang);

  const steps = [
    { icon: '🧠', title: t('guide1'), body: `النماذج الرائدة: ${MODELS.filter((m) => m.flagship).map((m) => m.name).join(' · ')} — وكل نموذج مزوّد ببطاقة شخصية وبرومبت نظام ضخم.` },
    { icon: '📚', title: t('guide2'), body: `${PROMPTS.length} برومبتاً ضخماً موزّعة على الألعاب والمواقع والتطبيقات والفحص والتصميم والنمو.` },
    { icon: '🛡', title: t('guide3'), body: `المحرّك يفحص ${RULES.length} قاعدة: بنية HTML، مراجع، أمان، أداء، ألعاب، وصولية، RTL.` },
    {
      icon: '🛠',
      title: 'إصلاح ذكي تلقائي قبل التسليم',
      body: 'بعد كل توليد: فحص ← إصلاح بالـAI ← إعادة فحص (حتى 3 تمريرات). ولا يُستبدل الكود إلا إذا تحسّنت النتيجة فعلاً.',
    },
    { icon: '🔐', title: t('guide4'), body: 'الرمز يُرسل إلى SMS أو البريد ولا يُعرض على الشاشة — ست خانات، صلاحية 5 دقائق، و5 محاولات.' },
    { icon: '🚀', title: t('guide5'), body: 'صدّر الملف أو انسخه، ثم ارفعه إلى GitHub واربطه بـ Vercel — بلا سيرفر وبلا تبعيات.' },
  ];

  const shortcuts: [string, string][] = [
    ['Ctrl + K', 'لوحة الأوامر'],
    ['Ctrl + Enter', 'توليد فوري من الطلب'],
    ['Ctrl + Q', 'تشغيل الفحص'],
    ['Ctrl + ,', 'الإعدادات'],
    ['Esc', 'إغلاق النوافذ'],
    ['Tab / Shift+Tab', 'إزاحة داخل المحرّر'],
  ];

  return (
    <div className="flex flex-col gap-3">
      <header className="nv-card flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-[17px] font-extrabold">📖 {t('guideTitle')}</h1>
        <p className="text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
          كل ما تحتاجه لإنتاج لعبة أو موقع أسطوري وتسليمه بلا أخطاء.
        </p>
        <button type="button" className="nv-btn nv-btn-primary ms-auto" onClick={() => setView('studio')}>
          ابدأ الآن →
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((s) => (
          <article key={s.title} className="nv-card p-4">
            <div className="flex items-center gap-2 text-[14px] font-extrabold">
              <span aria-hidden="true">{s.icon}</span>
              <span>{s.title}</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-7" style={{ color: 'var(--ink-soft)' }}>
              {s.body}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="nv-card p-4">
          <h2 className="text-[14px] font-extrabold">⌨ {t('shortcuts')}</h2>
          <table className="mt-2 w-full text-[12.5px]">
            <tbody>
              {shortcuts.map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="py-1.5">
                    <span className="nv-chip nv-code px-2! py-0!">{k}</span>
                  </td>
                  <td className="py-1.5" style={{ color: 'var(--ink-soft)' }}>
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article className="nv-card p-4">
          <h2 className="text-[14px] font-extrabold">🛡 قواعد الفحص ({RULES.length})</h2>
          <div className="nv-scroll mt-2 flex max-h-[260px] flex-col gap-1">
            {RULES.map((r) => (
              <div key={r.id} className="nv-panel flex items-center gap-2 p-2 text-[12px]">
                <span
                  className="nv-chip px-2! py-0! text-[10.5px]"
                  style={{
                    color:
                      r.severity === 'critical'
                        ? 'var(--err)'
                        : r.severity === 'high'
                          ? '#fb923c'
                          : r.severity === 'medium'
                            ? 'var(--warn)'
                            : 'var(--ink-dim)',
                  }}
                >
                  {r.severity}
                </span>
                <span className="nv-code text-[10.5px]" style={{ color: 'var(--ink-dim)' }}>
                  {r.id}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.titleAr}</span>
                {r.auto ? <span className="nv-chip nv-chip-ok px-2! py-0! text-[10px]">آلي</span> : null}
              </div>
            ))}
          </div>
          <button type="button" className="nv-btn mt-3" onClick={() => runQa()}>
            🛡 {t('runQa')}
          </button>
        </article>
      </section>

      <section className="nv-card p-4">
        <h2 className="text-[14px] font-extrabold">🚀 النشر على Vercel</h2>
        <ol className="mt-2 flex flex-col gap-2 text-[12.5px] leading-7" style={{ color: 'var(--ink-soft)' }}>
          <li>
            <strong className="text-[13px]">1)</strong> صدّر المشروع من الاستوديو (زر التنزيل) أو انسخ الكود.
          </li>
          <li>
            <strong className="text-[13px]">2)</strong> ارفعه إلى مستودع GitHub، ثم في Vercel: <span className="nv-code">Add New → Project → Import</span>.
          </li>
          <li>
            <strong className="text-[13px]">3)</strong> Framework Preset = <span className="nv-code">Other</span>، Build Command فارغ، Output Directory = الجذر (الملف HTML يعمل مباشرة).
          </li>
          <li>
            <strong className="text-[13px]">4)</strong> أضف نطاقك، وفعّل HTTPS — لا تحتاج أي متغيرات بيئة لنشر ملف واحد.
          </li>
          <li>
            <strong className="text-[13px]">5)</strong> لتشغيل النماذج الحقيقية: ضع مفتاح المزوّد في الإعدادات (أو متغيرات <span className="nv-code">VITE_AI_*</span>).
          </li>
        </ol>
      </section>

      <section className="nv-card p-4 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
        <h2 className="text-[14px] font-extrabold" style={{ color: 'var(--ink)' }}>
          ℹ عن هذا الإصدار
        </h2>
        <p className="mt-1 leading-7">
          ABSORBS · Nexus AI — الإصدار <strong>v19 APEX</strong>: واجهة أُعيد بناؤها من الصفر، كتيبة نماذج خفيفة مع برومبتات نظام ضخمة،
          مكتبة برومبتات أسطورية، بوابة فحص قبل التسليم، وتسليم برمز تحقق لا يظهر على الشاشة.
          كل شيء يعمل بلا تبعيات خارجية وبلا سيرفر، والبيانات تُحفظ محلياً في متصفحك فقط.
        </p>
      </section>
    </div>
  );
}
