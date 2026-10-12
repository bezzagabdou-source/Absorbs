"use client";

import { useRef, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { MODELS } from '@/lib/apex/models';
import { makeT } from '@/lib/apex/i18n';
import { bytesFmt, download } from '@/lib/apex/utils';
import type { Accent, Lang, Theme } from '@/lib/apex/types';

type Section = 'general' | 'models' | 'generation' | 'gate' | 'data' | 'about';

/** لوحة الإعدادات الكاملة — كل مفتاح يشرح أثره قبل الضغط */
export function SettingsPanel({ nova }: { nova: Nova }) {
  const { settings, setSettings, settingsOpen, setSettingsOpen, exportAll, importAll, resetAll, storageBytes, toast, projects } = nova;
  const t = makeT(settings.lang);
  const [section, setSection] = useState<Section>('general');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  if (!settingsOpen) return null;

  const sections: { id: Section; label: string; icon: string }[] = [
    { id: 'general', label: 'عام والمظهر', icon: '🎨' },
    { id: 'models', label: 'النماذج والمزوّد', icon: '🧠' },
    { id: 'generation', label: 'التوليد', icon: '⚡' },
    { id: 'gate', label: 'بوابة الجودة والتسليم', icon: '🛡' },
    { id: 'data', label: 'البيانات', icon: '🗄' },
    { id: 'about', label: 'عن التطبيق', icon: 'ℹ' },
  ];

  return (
    <div className="fixed inset-0 z-[65] flex" role="dialog" aria-modal="true" aria-label={t('settings')}>
      <button type="button" className="absolute inset-0 cursor-default" style={{ background: 'rgba(3,7,18,.62)', backdropFilter: 'blur(4px)' }} onClick={() => setSettingsOpen(false)} aria-label={t('close')} />
      <section
        className="nv-rise relative ms-auto flex h-full w-[min(940px,100%)] flex-col"
        style={{ background: 'var(--surface-2)', borderInlineStart: '1px solid var(--line)', boxShadow: '0 0 80px -20px rgba(0,0,0,.6)' }}
      >
        <header className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h2 className="text-[15px] font-extrabold">⚙ {t('settings')}</h2>
          <span className="nv-chip nv-chip-accent px-2! py-0! text-[11px]">{settings.demoMode ? 'وضع تجريبي' : 'مزوّد حقيقي'}</span>
          <button type="button" className="nv-btn nv-btn-ghost ms-auto" onClick={() => setSettingsOpen(false)} aria-label={t('close')}>
            ✕ {t('close')}
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[230px_1fr]">
          <nav className="flex gap-1 overflow-auto p-2 md:flex-col" style={{ borderInlineEnd: '1px solid var(--line)' }} aria-label="أقسام الإعدادات">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className="nv-btn w-full justify-start border-transparent!"
                style={section === s.id ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : { background: 'transparent', color: 'var(--ink-soft)' }}
                onClick={() => setSection(s.id)}
                aria-current={section === s.id}
              >
                <span aria-hidden="true">{s.icon}</span> {s.label}
              </button>
            ))}
          </nav>

          <div className="nv-scroll min-h-0 p-4">
            {section === 'general' ? (
              <div className="flex flex-col gap-4">
                <Row label={t('lang')} hint="تبديل فوري لاتجاه الواجهة RTL/LTR">
                  <select className="nv-select" value={settings.lang} onChange={(e) => setSettings((s) => ({ ...s, lang: e.target.value as Lang }))}>
                    <option value="ar">العربية (RTL)</option>
                    <option value="en">English (LTR)</option>
                  </select>
                </Row>

                <Row label={t('theme')} hint="داكن للأداء البصري، فاتح للقراءة الطويلة">
                  <div className="flex gap-1">
                    {(['dark', 'light'] as Theme[]).map((th) => (
                      <button key={th} type="button" className="nv-tab" data-active={settings.theme === th} onClick={() => setSettings((s) => ({ ...s, theme: th }))}>
                        {th === 'dark' ? `🌙 ${t('dark')}` : `☀ ${t('light')}`}
                      </button>
                    ))}
                  </div>
                </Row>

                <Row label={t('accent')} hint="لون الهوية عبر كل التطبيق">
                  <div className="flex gap-2">
                    {(
                      [
                        ['forge', '#327dff'],
                        ['plasma', '#a855f7'],
                        ['neon', '#14b8a6'],
                        ['magma', '#f97316'],
                      ] as [Accent, string][]
                    ).map(([id, color]) => (
                      <button
                        key={id}
                        type="button"
                        className="h-8 w-8 rounded-full"
                        style={{ background: color, outline: settings.accent === id ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}
                        onClick={() => setSettings((s) => ({ ...s, accent: id }))}
                        aria-label={`لون ${id}`}
                        aria-pressed={settings.accent === id}
                      />
                    ))}
                  </div>
                </Row>

                <Row label={t('density')} hint="مضغوط يعرض محتوى أكثر على نفس الشاشة">
                  <div className="flex gap-1">
                    {(['comfortable', 'compact'] as const).map((d) => (
                      <button key={d} type="button" className="nv-tab" data-active={settings.density === d} onClick={() => setSettings((s) => ({ ...s, density: d }))}>
                        {d === 'comfortable' ? 'مريح' : 'مضغوط'}
                      </button>
                    ))}
                  </div>
                </Row>

                <Row label={t('fontScale')} hint="1.00 افتراضي — يكبّر كل النصوص">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.9}
                      max={1.25}
                      step={0.05}
                      value={settings.fontScale}
                      onChange={(e) => setSettings((s) => ({ ...s, fontScale: Number(e.target.value) }))}
                      className="w-full accent-current"
                      aria-label={t('fontScale')}
                    />
                    <span className="nv-code">{settings.fontScale.toFixed(2)}</span>
                  </div>
                </Row>

                <Toggle label={t('animations')} hint="إيقافها يساعد على الأجهزة الضعيفة" checked={settings.animations} onChange={(v) => setSettings((s) => ({ ...s, animations: v }))} />
                <Toggle label="تقليل الحركة" hint="يحترم إعداد النظام prefers-reduced-motion" checked={settings.reducedMotion} onChange={(v) => setSettings((s) => ({ ...s, reducedMotion: v }))} />
                <Toggle label={t('sound')} hint="نقرة صوتية قصيرة عند التنبيهات (WebAudio)" checked={settings.sound} onChange={(v) => setSettings((s) => ({ ...s, sound: v }))} />
              </div>
            ) : null}

            {section === 'models' ? (
              <div className="flex flex-col gap-4">
                <Toggle
                  label={t('demoMode')}
                  hint="محاكاة محلية كاملة بلا مفاتيح — مفيدة للتجربة والاختبار"
                  checked={settings.demoMode}
                  onChange={(v) => setSettings((s) => ({ ...s, demoMode: v }))}
                />
                <Row label={t('baseUrl')} hint="أي مزوّد متوافق مع OpenAI: /v1">
                  <input className="nv-input nv-code" dir="ltr" value={settings.baseUrl} onChange={(e) => setSettings((s) => ({ ...s, baseUrl: e.target.value.trim().slice(0, 160) }))} />
                </Row>
                <Row label={t('apiKey')} hint="يُحفظ محلياً في متصفحك فقط ولا يُرسل لأي طرف آخر">
                  <input
                    className="nv-input nv-code"
                    dir="ltr"
                    type="password"
                    autoComplete="off"
                    value={settings.apiKey}
                    onChange={(e) => setSettings((s) => ({ ...s, apiKey: e.target.value.slice(0, 200) }))}
                  />
                </Row>
                <Row label={t('defaultModel')} hint="النموذج الذي يُفتح افتراضياً">
                  <select className="nv-select" value={settings.defaultModel} onChange={(e) => setSettings((s) => ({ ...s, defaultModel: e.target.value as typeof s.defaultModel }))}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.vendor}
                      </option>
                    ))}
                  </select>
                </Row>

                <details className="nv-panel p-3">
                  <summary className="cursor-pointer text-[13px] font-extrabold">{t('modelMapped')} — معرّفات مخصّصة</summary>
                  <p className="mt-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                    اترك الحقل فارغاً لاستخدام المعرّف الافتراضي. مثال: <span className="nv-code">gpt-4o-mini</span> أو <span className="nv-code">moonshot-v1-8k</span>.
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {MODELS.map((m) => (
                      <label key={m.id} className="grid grid-cols-[1fr_1.4fr] items-center gap-2 text-[12px]">
                        <span style={{ color: 'var(--ink-soft)' }}>
                          {m.name} <span className="nv-code" style={{ color: 'var(--ink-dim)' }}>({m.apiModel})</span>
                        </span>
                        <input
                          className="nv-input nv-code py-1.5!"
                          dir="ltr"
                          placeholder={m.apiModel}
                          value={settings.modelOverrides[m.id] ?? ''}
                          onChange={(e) => setSettings((s) => ({ ...s, modelOverrides: { ...s.modelOverrides, [m.id]: e.target.value.trim().slice(0, 80) } }))}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}

            {section === 'generation' ? (
              <div className="flex flex-col gap-4">
                <Row label={`${t('temperature')} — ${settings.temperature.toFixed(2)}`} hint="أقل = أدق وأكثر التزاماً · أعلى = أكثر إبداعاً">
                  <input type="range" min={0} max={1.4} step={0.05} value={settings.temperature} onChange={(e) => setSettings((s) => ({ ...s, temperature: Number(e.target.value) }))} className="w-full accent-current" />
                </Row>
                <Row label={`${t('topP')} — ${settings.topP.toFixed(2)}`} hint="تقليص توزيع الاحتمالات — 0.95 متوازن">
                  <input type="range" min={0.1} max={1} step={0.05} value={settings.topP} onChange={(e) => setSettings((s) => ({ ...s, topP: Number(e.target.value) }))} className="w-full accent-current" />
                </Row>
                <Row label={t('maxTokens')} hint="سقف طول الرد — 8192 مناسب للمشاريع الكبيرة">
                  <input
                    type="number"
                    min={512}
                    max={65536}
                    step={512}
                    className="nv-input nv-code"
                    value={settings.maxTokens}
                    onChange={(e) => setSettings((s) => ({ ...s, maxTokens: Math.max(512, Math.min(65536, Number(e.target.value) || 8192)) }))}
                  />
                </Row>
                <Toggle label={t('streaming')} hint="عرض الكود أثناء التوليد بدل انتظار الرد كاملاً" checked={settings.stream} onChange={(v) => setSettings((s) => ({ ...s, stream: v }))} />
                <Row label="سياق المكتب (Persona)" hint="يُلحَق بكل طلب — اكتب قواعد فريقك: اللغة، الأسلوب، التقنيات المسموحة">
                  <textarea
                    className="nv-textarea"
                    rows={5}
                    value={settings.persona}
                    onChange={(e) => setSettings((s) => ({ ...s, persona: e.target.value.slice(0, 3000) }))}
                    placeholder="مثال: اكتب دائماً بالعربية الفصحى، بلا مكتبات خارجية، وبتعليقات موجزة داخل الكود."
                  />
                </Row>
              </div>
            ) : null}

            {section === 'gate' ? (
              <div className="flex flex-col gap-4">
                <Toggle label={t('autoQa')} hint="يشغّل الفحص تلقائياً بعد كل توليد" checked={settings.autoQa} onChange={(v) => setSettings((s) => ({ ...s, autoQa: v }))} />
                <Toggle
                  label={t('autoRepair')}
                  hint={t('autoRepairHint')}
                  checked={settings.autoRepair}
                  onChange={(v) => setSettings((s) => ({ ...s, autoRepair: v }))}
                />
                <Row label={t('repairPasses')} hint={t('repairPassesHint')}>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="nv-tab"
                        data-active={settings.repairPasses === n}
                        onClick={() => setSettings((s) => ({ ...s, repairPasses: n }))}
                        aria-pressed={settings.repairPasses === n}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </Row>
                <Toggle
                  label={t('strictGate')}
                  hint="يمنع التسليم نهائياً عند وجود أي خطأ حرج أو عالٍ — لا استثناءات"
                  checked={settings.strictGate}
                  onChange={(v) => setSettings((s) => ({ ...s, strictGate: v }))}
                />
                <Toggle
                  label={t('requireCode')}
                  hint="لا يُعلَّم المشروع «مُسلَّماً» إلا بعد التحقق من رمز صحيح"
                  checked={settings.requireDeliveryCode}
                  onChange={(v) => setSettings((s) => ({ ...s, requireDeliveryCode: v }))}
                />
                <Toggle
                  label="كشف رمز التسليم (للمطوّر)"
                  hint="معطّل افتراضياً: الرمز يُرسل ولا يُعرض أبداً. فعّله للاختبار السريع فقط."
                  checked={settings.showDemoCode}
                  onChange={(v) => setSettings((s) => ({ ...s, showDemoCode: v }))}
                />
                <Toggle
                  label="طبّق الإصلاحات الآمنة تلقائياً"
                  hint="يضيف doctype/viewport/charset/noopener تلقائياً بعد كل توليد (تعديلات مؤمّنة فقط)"
                  checked={settings.autoFixSafe}
                  onChange={(v) => setSettings((s) => ({ ...s, autoFixSafe: v }))}
                />
                <div className="nv-panel p-3 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  <strong>كيف تعمل البوابة؟</strong>
                  <ol className="mt-1 flex list-decimal flex-col gap-1 ps-5">
                    <li>توليد الكود ← فحص آلي على {33} قاعدة عبر 9 محاور.</li>
                    <li>نتيجة أقل من 80 أو وجود خطأ حرج/عالٍ = منع التسليم.</li>
                    <li>إصلاح آلي لما يمكن، ومراجعة AI لما يحتاج حكماً بشرياً.</li>
                    <li>إرسال رمز تحقق إلى SMS/البريد ثم إدخاله في 6 خانات.</li>
                  </ol>
                </div>
              </div>
            ) : null}

            {section === 'data' ? (
              <div className="flex flex-col gap-4">
                <div className="nv-panel p-3 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  {t('storageUsed')}: <strong className="nv-code">{bytesFmt(storageBytes)}</strong> · {projects.length} مشروع محفوظ محلياً في هذا المتصفح.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nv-btn nv-btn-primary"
                    onClick={() => {
                      download(`absorbs-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll(), 'application/json');
                      toast('ok', 'تم تصدير النسخة الاحتياطية');
                    }}
                  >
                    ⤓ {t('exportAll')}
                  </button>
                  <button type="button" className="nv-btn" onClick={() => fileInput.current?.click()}>
                    ⤒ {t('importAll')}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const text = typeof reader.result === 'string' ? reader.result : '';
                        if (text) importAll(text);
                      };
                      reader.onerror = () => toast('err', 'تعذّرت قراءة الملف');
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <div className="nv-panel p-3" style={{ borderColor: 'var(--err)' }}>
                  <h3 className="text-[13px] font-extrabold" style={{ color: 'var(--err)' }}>
                    ⚠ {t('dangerZone')}
                  </h3>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                    {t('confirmReset')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="nv-btn nv-btn-danger" onClick={() => setConfirmReset(true)}>
                      🗑 {t('resetAll')}
                    </button>
                    {confirmReset ? (
                      <>
                        <button
                          type="button"
                          className="nv-btn nv-btn-danger"
                          onClick={() => {
                            resetAll();
                            setConfirmReset(false);
                          }}
                        >
                          {t('yes')}
                        </button>
                        <button type="button" className="nv-btn nv-btn-ghost" onClick={() => setConfirmReset(false)}>
                          {t('cancel')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {section === 'about' ? (
              <div className="flex flex-col gap-3 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--ink)' }}>
                  ABSORBS · Nexus AI — v19 APEX
                </h3>
                <p className="leading-7">
                  نسخة أُعيد تصميمها وبناؤها من الصفر: واجهة عصرية بمقياس تصميم موحّد، كتيبة نماذج خفيفة مع برومبتات نظام ضخمة،
                  مكتبة برومبتات أسطورية، محرّك فحص ببوابة صارمة قبل التسليم، وتسليم برمز تحقق (SMS/بريد) لا يظهر على الشاشة.
                </p>
                <ul className="flex list-disc flex-col gap-1 ps-5">
                  <li>بلا أي مكتبة واجهة خارجية — React + TypeScript فقط.</li>
                  <li>كل البيانات محلية في متصفحك، وبلا تتبّع.</li>
                  <li>المعاينة تعمل في إطار معزول (sandbox) مع التقاط الأخطاء تلقائياً.</li>
                  <li>جاهز للنشر على Vercel كملف/تطبيق ساكن بلا سيرفر.</li>
                </ul>
                <p className="text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                  مستوحى من مشروع Absorbs على GitHub — أُعيد بناء الواجهة والمنطق بالكامل.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[1fr_1.2fr] md:items-center">
      <div>
        <div className="text-[13px] font-extrabold">{label}</div>
        {hint ? (
          <div className="text-[11.5px] leading-6" style={{ color: 'var(--ink-dim)' }}>
            {hint}
          </div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="nv-panel flex cursor-pointer items-start gap-3 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-current" />
      <span className="min-w-0">
        <span className="block text-[13px] font-extrabold">{label}</span>
        {hint ? (
          <span className="block text-[11.5px] leading-6" style={{ color: 'var(--ink-dim)' }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
