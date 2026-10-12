"use client";

import { useMemo, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { MODEL_BY_ID } from '@/lib/apex/models';
import { makeT } from '@/lib/apex/i18n';
import { bytesFmt, download, timeAgo, uid } from '@/lib/apex/utils';
import type { Project } from '@/lib/apex/types';

/** إدارة المشاريع: فتح · تثبيت · نسخة · نقل · سجل الإصدارات · تصدير */
export function ProjectsView({ nova }: { nova: Nova }) {
  const { settings, projects, activeId, setActiveId, setView, setTab, patchProject, removeProject, createProject, restoreSnapshot, reports, toast, runQa } = nova;
  const t = makeT(settings.lang);
  const [filter, setFilter] = useState<'all' | 'delivered' | 'pending' | Project['kind']>('all');
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const items = useMemo(() => {
    const list = [...projects].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
    if (filter === 'all') return list;
    if (filter === 'delivered') return list.filter((p) => p.delivered);
    if (filter === 'pending') return list.filter((p) => !p.delivered);
    return list.filter((p) => p.kind === filter);
  }, [projects, filter]);

  return (
    <div className="flex flex-col gap-3">
      <header className="nv-card flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-[17px] font-extrabold">🗂 {t('navProjects')}</h1>
        <span className="nv-chip px-2! py-0! text-[11.5px]">{projects.length}</span>
        <div className="ms-auto flex flex-wrap gap-1">
          {(
            [
              ['all', t('all')],
              ['delivered', t('deliveredCount')],
              ['pending', t('notDelivered')],
              ['game', 'ألعاب'],
              ['website', 'مواقع'],
              ['app', 'تطبيقات'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className="nv-tab px-2.5! py-1! text-[12px]" data-active={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="nv-btn nv-btn-primary"
          onClick={() => {
            const p = createProject('', 'other', 'مشروع جديد', nova.activeModel);
            toast('ok', 'أُنشئ مشروع فارغ', p.title);
            setView('studio');
          }}
        >
          + {t('newProject')}
        </button>
      </header>

      {items.length === 0 ? (
        <p className="nv-panel p-5 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
          {t('noProjects')}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => {
            const report = reports[p.id];
            const model = MODEL_BY_ID[p.modelId];
            return (
              <article key={p.id} className="nv-card flex flex-col gap-2 p-4" style={activeId === p.id ? { borderColor: 'var(--accent)' } : undefined}>
                <header className="flex items-start gap-2">
                  <button
                    type="button"
                    className="nv-btn nv-btn-ghost p-1! text-[15px]"
                    onClick={() => patchProject(p.id, { pinned: !p.pinned })}
                    aria-label={t('pin')}
                    title={t('pin')}
                  >
                    {p.pinned ? '📌' : '📍'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-extrabold" title={p.title}>
                      {p.title}
                    </h2>
                    <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                      {model?.name} · {p.kind} · {bytesFmt(new Blob([p.code]).size)} · {timeAgo(p.updatedAt, settings.lang)}
                    </p>
                  </div>
                  {report ? (
                    <span className={`nv-chip !px-2 !py-0 text-[11px] ${report.passed ? 'nv-chip-ok' : 'nv-chip-warn'}`}>{report.score}/100</span>
                  ) : (
                    <span className="nv-chip px-2! py-0! text-[11px]">—</span>
                  )}
                </header>

                {p.code ? (
                  <pre
                    className="nv-code nv-scroll max-h-[110px] overflow-hidden whitespace-pre-wrap rounded-lg p-2"
                    style={{ background: 'color-mix(in oklab, var(--surface) 68%, black 14%)', border: '1px solid var(--line)' }}
                    aria-hidden="true"
                  >
                    {p.code.slice(0, 320)}
                  </pre>
                ) : (
                  <p className="text-[12px]" style={{ color: 'var(--ink-dim)' }}>
                    مشروع فارغ — اكتب طلبك في الاستوديو.
                  </p>
                )}

                <div className="flex flex-wrap gap-1 text-[11px]">
                  {p.delivered ? <span className="nv-chip nv-chip-ok px-2! py-0!">✓ {p.deliveryCode}</span> : <span className="nv-chip nv-chip-warn px-2! py-0!">{t('notDelivered')}</span>}
                  <span className="nv-chip px-2! py-0!">{p.history.length} إصدار</span>
                  <span className="nv-chip px-2! py-0!">{p.promptId ? 'برومبت جاهز' : 'طلب حر'}</span>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nv-btn nv-btn-primary"
                    onClick={() => {
                      setActiveId(p.id);
                      setView('studio');
                      setTab('preview');
                    }}
                  >
                    ▶ {t('open')}
                  </button>
                  <button type="button" className="nv-btn" onClick={() => setOpenHistory(openHistory === p.id ? null : p.id)} aria-expanded={openHistory === p.id}>
                    🕘 {t('history')} ({p.history.length})
                  </button>
                  <button type="button" className="nv-btn" onClick={() => runQa(p.id)}>
                    🛡 {t('runQa')}
                  </button>
                  <button
                    type="button"
                    className="nv-btn nv-btn-ghost px-2!"
                    onClick={() => {
                      const copy: Project = { ...p, id: uid('prj'), title: `${p.title} (نسخة)`, createdAt: Date.now(), updatedAt: Date.now(), delivered: false, deliveryCode: null, pinned: false };
                      createProject(copy.code, copy.kind, copy.title, copy.modelId, copy.promptId);
                      toast('ok', 'أُنشئت نسخة', copy.title);
                    }}
                    aria-label={t('dupe')}
                    title={t('dupe')}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="nv-btn nv-btn-ghost px-2!"
                    onClick={() => download(`${p.title.slice(0, 30)}.html`, p.code, 'text/html;charset=utf-8')}
                    aria-label={t('download')}
                    title={t('download')}
                  >
                    ⤓
                  </button>
                  <button
                    type="button"
                    className="nv-btn nv-btn-danger px-2!"
                    onClick={() => setConfirmDelete(p.id)}
                    aria-label={t('delete')}
                    title={t('delete')}
                  >
                    🗑
                  </button>
                </div>

                {openHistory === p.id ? (
                  <ul className="nv-scroll mt-1 flex max-h-[170px] flex-col gap-1 overflow-auto">
                    {[...p.history].reverse().map((h) => (
                      <li key={h.at} className="nv-panel flex items-center gap-2 p-2 text-[11.5px]">
                        <span className="min-w-0 flex-1 truncate" title={h.label}>
                          {h.label}
                        </span>
                        <span style={{ color: 'var(--ink-dim)' }}>{timeAgo(h.at, settings.lang)}</span>
                        <button type="button" className="nv-btn px-2! py-0.5! text-[11px]" onClick={() => restoreSnapshot(h.code, h.label)}>
                          {t('restore')}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {confirmDelete === p.id ? (
                  <div className="nv-panel mt-1 flex items-center gap-2 p-2 text-[11.5px]" style={{ borderColor: 'var(--err)' }}>
                    <span>تأكيد الحذف النهائي؟</span>
                    <button
                      type="button"
                      className="nv-btn nv-btn-danger px-2! py-0.5! text-[11px]"
                      onClick={() => {
                        removeProject(p.id);
                        setConfirmDelete(null);
                        toast('warn', 'حُذف المشروع');
                      }}
                    >
                      {t('yes')}
                    </button>
                    <button type="button" className="nv-btn nv-btn-ghost px-2! py-0.5! text-[11px]" onClick={() => setConfirmDelete(null)}>
                      {t('no')}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
