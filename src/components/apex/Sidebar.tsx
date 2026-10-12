"use client";

import type { Nova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { MODEL_BY_ID, MODELS } from '@/lib/apex/models';
import { PROMPTS } from '@/lib/apex/prompts';
import { bytesFmt } from '@/lib/apex/utils';

const ICONS: Record<string, string> = {
  studio: '🎛',
  models: '🧠',
  prompts: '📚',
  qa: '🛡',
  projects: '🗂',
  guide: '📖',
};

/** القائمة الجانبية: ملاحة + إحصاءات + مشاريع سريعة */
export function Sidebar({ nova }: { nova: Nova }) {
  const {
    settings,
    view,
    setView,
    setTab,
    projects,
    activeId,
    setActiveId,
    storageBytes,
    activeModel,
    setActiveModelSafe,
    sidebarOpen,
    reports,
  } = nova;
  const t = makeT(settings.lang);

  const items: { id: Nova['view']; label: string; badge?: string }[] = [
    { id: 'studio', label: t('navStudio') },
    { id: 'models', label: t('navModels'), badge: String(MODELS.length) },
    { id: 'prompts', label: t('navPrompts'), badge: String(PROMPTS.length) },
    { id: 'qa', label: t('navQa') },
    { id: 'projects', label: t('navProjects'), badge: String(projects.length) },
    { id: 'guide', label: t('navGuide') },
  ];

  if (!sidebarOpen) return null;

  const delivered = projects.filter((p) => p.delivered).length;
  const scored = projects.filter((p) => typeof p.qaScore === 'number') as (typeof projects)[number][];
  const avg = scored.length ? Math.round(scored.reduce((s, p) => s + (p.qaScore ?? 0), 0) / scored.length) : 0;

  return (
    <aside
      className="nv-scroll hidden w-[268px] shrink-0 flex-col gap-3 border-e p-3 md:flex"
      style={{ borderColor: 'var(--line)', background: 'color-mix(in oklab, var(--surface-2) 55%, transparent)' }}
      aria-label="التنقل الجانبي"
    >
      <nav className="flex flex-col gap-1" aria-label="الأقسام">
        {items.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className="nv-btn w-full justify-between border-transparent!"
              style={
                active
                  ? { background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)', color: 'var(--ink)' }
                  : { background: 'transparent', color: 'var(--ink-soft)' }
              }
              aria-current={active ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{ICONS[item.id]}</span>
                {item.label}
              </span>
              {item.badge ? <span className="nv-chip px-2! py-0! text-[11px]">{item.badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <hr className="nv-divider" />

      <section aria-labelledby="sb-model">
        <h2 id="sb-model" className="mb-2 flex items-center justify-between text-[12px] font-extrabold" style={{ color: 'var(--ink-dim)' }}>
          {t('modelsTitle')}
          <button type="button" className="nv-btn nv-btn-ghost px-2! py-0.5! text-[11px]" onClick={() => setView('models')}>
            {t('all')}
          </button>
        </h2>
        <div className="flex flex-col gap-1">
          {MODELS.filter((m) => m.flagship)
            .slice(0, 3)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                className="nv-btn w-full justify-start text-[13px]"
                style={
                  activeModel === m.id
                    ? { borderColor: m.color, background: 'var(--accent-soft)' }
                    : { background: 'transparent', color: 'var(--ink-soft)' }
                }
                onClick={() => setActiveModelSafe(m.id)}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                <span className="truncate">{m.name}</span>
                {m.flagship ? <span className="nv-chip nv-chip-accent px-1.5! py-0! text-[10px]">{t('flagship')}</span> : null}
              </button>
            ))}
        </div>
      </section>

      <hr className="nv-divider" />

      <section aria-labelledby="sb-stats">
        <h2 id="sb-stats" className="mb-2 text-[12px] font-extrabold" style={{ color: 'var(--ink-dim)' }}>
          {t('overview')}
        </h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { k: t('totalProjects'), v: String(projects.length) },
            { k: t('deliveredCount'), v: String(delivered) },
            { k: t('avgScore'), v: avg ? String(avg) : '—' },
          ].map((s) => (
            <div key={s.k} className="nv-panel p-2">
              <div className="text-[16px] font-extrabold" style={{ color: 'var(--accent)' }}>
                {s.v}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--ink-dim)' }}>
                {s.k}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
          {t('storageUsed')}: {bytesFmt(storageBytes)}
        </p>
      </section>

      <hr className="nv-divider" />

      <section aria-labelledby="sb-recent" className="min-h-0 flex-1">
        <h2 id="sb-recent" className="mb-2 flex items-center justify-between text-[12px] font-extrabold" style={{ color: 'var(--ink-dim)' }}>
          {t('navProjects')}
          <button type="button" className="nv-btn nv-btn-ghost px-2! py-0.5! text-[11px]" onClick={() => setView('projects')}>
            + {t('newProject')}
          </button>
        </h2>
        <div className="flex max-h-[240px] flex-col gap-1 overflow-auto">
          {projects.slice(0, 8).map((p) => {
            const report = reports[p.id];
            return (
              <button
                key={p.id}
                type="button"
                className="nv-btn w-full justify-between text-[12.5px]"
                style={activeId === p.id ? { borderColor: 'var(--accent)' } : { background: 'transparent', color: 'var(--ink-soft)' }}
                onClick={() => {
                  setActiveId(p.id);
                  setView('studio');
                  setTab('preview');
                }}
              >
                <span className="truncate">{p.pinned ? '📌 ' : ''}{p.title}</span>
                <span className="nv-chip px-1.5! py-0! text-[10px]">{report ? `${report.score}` : '—'}</span>
              </button>
            );
          })}
          {!projects.length ? (
            <p className="text-[12px]" style={{ color: 'var(--ink-dim)' }}>
              {t('noProjects')}
            </p>
          ) : null}
        </div>
      </section>

      <div className="nv-panel mt-auto p-3">
        <div className="text-[11px] font-bold" style={{ color: 'var(--ink-dim)' }}>
          {t('active')}: {MODEL_BY_ID[activeModel]?.name}
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--ink-dim)' }}>
          {settings.demoMode ? t('demoNotice') : t('liveNotice')}
        </div>
      </div>
    </aside>
  );
}
