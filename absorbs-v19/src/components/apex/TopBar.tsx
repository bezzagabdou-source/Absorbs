"use client";

import type { Nova } from '@/lib/apex/store';
import { MODEL_BY_ID } from '@/lib/apex/models';
import { makeT } from '@/lib/apex/i18n';

/** الشريط العلوي: الهوية · البحث · النموذج النشط · إجراءات سريعة */
export function TopBar({ nova }: { nova: Nova }) {
  const { settings, activeModel, generation, setPaletteOpen, setSettingsOpen, setView, setSidebarOpen, sidebarOpen, stopGeneration } = nova;
  const t = makeT(settings.lang);
  const model = MODEL_BY_ID[activeModel];

  return (
    <header
      className="sticky top-0 z-40 flex h-[62px] items-center gap-3 px-3 md:px-5"
      style={{ background: 'color-mix(in oklab, var(--surface) 82%, transparent)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)' }}
    >
      <button
        type="button"
        className="nv-btn nv-btn-ghost px-2.5!"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? 'إخفاء القائمة' : 'إظهار القائمة'}
        aria-expanded={sidebarOpen}
      >
        <span aria-hidden="true">☰</span>
      </button>

      <button type="button" className="flex items-center gap-3 rounded-xl px-1 py-1 text-start" onClick={() => setView('studio')}>
        <span
          className="grid h-9 w-9 place-items-center rounded-xl text-[15px] font-black"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#02101f' }}
          aria-hidden="true"
        >
          A
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px] font-extrabold tracking-tight">ABSORBS · Nexus AI</span>
          <span className="block text-[11px]" style={{ color: 'var(--ink-dim)' }}>
            v19 APEX — {t('appTag')}
          </span>
        </span>
      </button>

      <button
        type="button"
        className="nv-input mx-auto hidden max-w-[420px] cursor-text items-center gap-2 bg-transparent! text-start md:flex"
        onClick={() => setPaletteOpen(true)}
        aria-label={t('cmdPalette')}
      >
        <span aria-hidden="true">⌘</span>
        <span className="flex-1 text-xs" style={{ color: 'var(--ink-dim)' }}>
          {t('cmdPalette')} · Ctrl+K
        </span>
      </button>

      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          className="nv-chip nv-chip-accent hidden max-w-[220px] gap-2 truncate lg:inline-flex"
          onClick={() => setView('models')}
          title={`${model?.name} · ${model?.contextK}K`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: model?.color }} aria-hidden="true" />
          <span className="truncate">{model?.name}</span>
          <span style={{ color: 'var(--ink-dim)' }}>· {model?.speed}/5</span>
        </button>

        {generation.running ? (
          <button type="button" className="nv-btn nv-btn-danger" onClick={stopGeneration}>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />
            {t('stop')}
          </button>
        ) : null}

        <button
          type="button"
          className="nv-btn nv-btn-ghost px-2.5! md:hidden"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('cmdPalette')}
        >
          🔎
        </button>

        <button type="button" className="nv-btn px-2.5!" onClick={() => setSettingsOpen(true)} aria-label={t('settings')}>
          ⚙
        </button>
      </div>
    </header>
  );
}
