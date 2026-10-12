"use client";

import { useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { MODELS, MODEL_BY_ID } from '@/lib/apex/models';
import { makeT } from '@/lib/apex/i18n';
import { formatMoney } from '@/lib/apex/utils';
import type { ModelId } from '@/lib/apex/types';

/** كتيبة النماذج: بطاقات تفصيلية + برومبت النظام الكامل + تفعيل النموذج */
export function ModelsView({ nova }: { nova: Nova }) {
  const { settings, activeModel, setActiveModelSafe } = nova;
  const t = makeT(settings.lang);
  const [openPrompt, setOpenPrompt] = useState<ModelId | null>(null);
  const ar = settings.lang === 'ar';

  return (
    <div className="flex flex-col gap-3">
      <header className="nv-card flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-[17px] font-extrabold">🧠 {t('modelsTitle')}</h1>
        <p className="text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
          {t('modelsHint')}
        </p>
        <span className="nv-chip nv-chip-accent ms-auto px-2! py-0! text-[11.5px]">
          {t('active')}: {MODEL_BY_ID[activeModel]?.name}
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {MODELS.map((m) => {
          const active = m.id === activeModel;
          return (
            <article key={m.id} className="nv-card flex flex-col gap-3 p-4" style={active ? { borderColor: m.color, boxShadow: `0 24px 70px -40px ${m.color}` } : undefined}>
              <header className="flex items-start gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[16px] font-black"
                  style={{ background: `color-mix(in oklab, ${m.color} 22%, transparent)`, border: `1px solid ${m.color}`, color: m.color }}
                  aria-hidden="true"
                >
                  {m.name.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[14.5px] font-extrabold">
                    {m.name}
                    {m.flagship ? <span className="nv-chip nv-chip-accent px-2! py-0! text-[10px]">{t('flagship')}</span> : null}
                    {m.light ? <span className="nv-chip px-2! py-0! text-[10px]">{t('lightModel')}</span> : null}
                  </h2>
                  <p className="text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                    {m.vendor} · {t('modelMapped')}: <span className="nv-code">{settings.modelOverrides[m.id] ?? m.apiModel}</span>
                  </p>
                </div>
              </header>

              <p className="text-[12.5px] leading-7" style={{ color: 'var(--ink-soft)' }}>
                {ar ? m.tagline.ar : m.tagline.en}
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                <Bar label={t('speed')} value={m.speed} max={5} color={m.color} />
                <Bar label={t('quality')} value={m.quality} max={5} color={m.color} />
                <Bar label={t('reasoning')} value={m.reasoning} max={5} color={m.color} />
                <div className="nv-panel p-2">
                  <div style={{ color: 'var(--ink-dim)' }}>{t('context')}</div>
                  <div className="font-extrabold">{m.contextK}K · {t('cost')} {formatMoney(m.costIn)}/{formatMoney(m.costOut)}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {m.badges.map((b, i) => (
                  <span key={i} className="nv-chip px-2! py-0! text-[11px]">
                    {ar ? b.ar : b.en}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-1 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                {m.specialties.map((s) => (
                  <span key={s} className="nv-chip px-2! py-0!">{s}</span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" className="nv-btn nv-btn-primary flex-1" onClick={() => setActiveModelSafe(m.id)}>
                  {active ? `✓ ${t('active')}` : t('useModel')}
                </button>
                <button type="button" className="nv-btn" onClick={() => setOpenPrompt(openPrompt === m.id ? null : m.id)} aria-expanded={openPrompt === m.id}>
                  📜 {t('viewPrompt')}
                </button>
              </div>

              {openPrompt === m.id ? (
                <pre
                  className="nv-code nv-scroll max-h-[320px] whitespace-pre-wrap rounded-xl p-3"
                  style={{ background: 'color-mix(in oklab, var(--surface) 68%, black 14%)', border: '1px solid var(--line)' }}
                  dir={ar ? 'rtl' : 'ltr'}
                >
                  {ar ? m.system.ar : m.system.en}
                </pre>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="nv-panel p-2">
      <div className="flex items-center justify-between" style={{ color: 'var(--ink-dim)' }}>
        <span>{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
        <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}
