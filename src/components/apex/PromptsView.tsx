"use client";

import { useMemo, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { PROMPTS, PROMPT_CATEGORIES } from '@/lib/apex/prompts';
import { MODEL_BY_ID } from '@/lib/apex/models';
import { makeT } from '@/lib/apex/i18n';
import { copyText, estimateTokens } from '@/lib/apex/utils';
import type { PromptCategory } from '@/lib/apex/types';

/** مكتبة البرومبتات الضخمة: تصفية · بحث · تحميل في الاستوديو · نسخ */
export function PromptsView({ nova }: { nova: Nova }) {
  const { settings, openPrompt, toast } = nova;
  const t = makeT(settings.lang);
  const ar = settings.lang === 'ar';
  const [category, setCategory] = useState<PromptCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROMPTS.filter((p) => (category === 'all' ? true : p.category === category)).filter((p) => {
      if (!q) return true;
      return (
        p.title.ar.toLowerCase().includes(q) ||
        p.title.en.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        p.body.ar.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  return (
    <div className="flex flex-col gap-3">
      <header className="nv-card flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-[17px] font-extrabold">📚 {t('navPrompts')}</h1>
        <span className="nv-chip px-2! py-0! text-[11.5px]">{PROMPTS.length} برومبت ضخم</span>
        <input
          className="nv-input ms-auto max-w-[320px]"
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 60))}
          placeholder={t('search')}
          aria-label={t('search')}
        />
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="nv-tab" data-active={category === 'all'} onClick={() => setCategory('all')}>
          {t('all')} ({PROMPTS.length})
        </button>
        {PROMPT_CATEGORIES.map((c) => {
          const n = PROMPTS.filter((p) => p.category === c.id).length;
          return (
            <button key={c.id} type="button" className="nv-tab" data-active={category === c.id} onClick={() => setCategory(c.id)} style={category === c.id ? { borderColor: c.color } : undefined}>
              <span aria-hidden="true">{c.icon === 'gamepad' ? '🎮' : c.icon === 'globe' ? '🌐' : c.icon === 'apps' ? '🧩' : c.icon === 'brain' ? '🧠' : c.icon === 'shield' ? '🛡' : c.icon === 'palette' ? '🎨' : '🚀'}</span> {ar ? c.label.ar : c.label.en} ({n})
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((p) => {
          const cat = PROMPT_CATEGORIES.find((c) => c.id === p.category);
          const expanded = open === p.id;
          return (
            <article key={p.id} className="nv-card flex flex-col gap-2 p-4">
              <header className="flex items-start gap-2">
                <div className="min-w-0">
                  <h2 className="text-[14.5px] font-extrabold">{ar ? p.title.ar : p.title.en}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                    <span className="nv-chip px-2! py-0!" style={cat ? { borderColor: cat.color, color: cat.color } : undefined}>
                      {cat ? (ar ? cat.label.ar : cat.label.en) : p.category}
                    </span>
                    <span>{t('difficulty')}: {p.difficulty}</span>
                    <span>· {p.minutes} {t('minutes')}</span>
                    <span>· ~{estimateTokens(p.body.ar)} {t('tokensUsed')}</span>
                  </p>
                </div>
                <span className="nv-chip ms-auto px-2! py-0! text-[11px]">{p.deliverable.ar.slice(0, 22)}</span>
              </header>

              <div className="flex flex-wrap gap-1">
                {p.tags.map((tag) => (
                  <span key={tag} className="nv-chip px-2! py-0! text-[10.5px]">#{tag}</span>
                ))}
              </div>

              <div className="text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                <strong>{t('bestFor')}: </strong>
                {p.bestModels.map((id, i) => (
                  <span key={id} className="nv-code" style={{ color: MODEL_BY_ID[id]?.color }}>
                    {i ? ' · ' : ''}
                    {MODEL_BY_ID[id]?.name ?? id}
                  </span>
                ))}
              </div>

              <div className="text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                <strong>{t('gates')}: </strong>
                {(ar ? p.gates.map((g) => g.ar) : p.gates.map((g) => g.en)).join(' · ')}
              </div>

              {expanded ? (
                <pre
                  className="nv-code nv-scroll max-h-[340px] whitespace-pre-wrap rounded-xl p-3"
                  style={{ background: 'color-mix(in oklab, var(--surface) 68%, black 14%)', border: '1px solid var(--line)' }}
                  dir="rtl"
                >
                  {ar ? p.body.ar : p.body.en}
                </pre>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" className="nv-btn nv-btn-primary" onClick={() => openPrompt(p.id)}>
                  ⚡ {t('loadPrompt')}
                </button>
                <button type="button" className="nv-btn" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded}>
                  {expanded ? t('close') : 'عرض البرومبت'}
                </button>
                <button
                  type="button"
                  className="nv-btn nv-btn-ghost"
                  onClick={async () => {
                    const ok = await copyText(ar ? p.body.ar : p.body.en);
                    toast(ok ? 'ok' : 'warn', ok ? t('copied') : 'تعذّر النسخ');
                  }}
                >
                  📋 {t('copy')}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="nv-panel p-4 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
          لا نتائج مطابقة — جرّب كلمة أخرى أو اختر «الكل».
        </p>
      ) : null}
    </div>
  );
}
