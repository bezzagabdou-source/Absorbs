"use client";

import { useMemo, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { bytesFmt } from '@/lib/apex/utils';
import type { Severity } from '@/lib/apex/types';

const SEV_COLOR: Record<Severity, string> = {
  critical: 'var(--err)',
  high: '#fb923c',
  medium: 'var(--warn)',
  low: 'var(--info)',
  info: 'var(--ink-dim)',
};

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

/** بوابة الفحص: تقرير مفصّل + إصلاح آلي + منع التسليم عند وجود أخطاء */
export function QaPanel({ nova, compact = false }: { nova: Nova; compact?: boolean }) {
  const { activeProject, reports, settings, runQa, applyFix, aiReview, repairWithAi, generation, setTab } = nova;
  const t = makeT(settings.lang);
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const [autoOnly, setAutoOnly] = useState(false);

  const report = activeProject ? reports[activeProject.id] : undefined;
  const label: Record<Severity, string> = {
    critical: t('critical'),
    high: t('high'),
    medium: t('medium'),
    low: t('low'),
    info: t('info'),
  };

  const issues = useMemo(() => {
    if (!report) return [];
    return report.issues.filter((i) => (filter === 'all' ? true : i.severity === filter)).filter((i) => (autoOnly ? i.autoFixable : true));
  }, [report, filter, autoOnly]);

  if (!activeProject) {
    return (
      <div className="nv-panel p-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
        {t('reportEmpty')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* رأس التقرير */}
      <div className="nv-panel flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-3">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl text-[22px] font-black"
            style={{
              background: report && report.passed ? 'color-mix(in oklab, var(--ok) 18%, transparent)' : 'color-mix(in oklab, var(--warn) 16%, transparent)',
              border: `1px solid ${report && report.passed ? 'var(--ok)' : 'var(--warn)'}`,
              color: report && report.passed ? 'var(--ok)' : 'var(--warn)',
            }}
            aria-label={`${t('score')} ${report?.score ?? 0}`}
          >
            {report ? report.score : '—'}
          </div>
          <div>
            <div className="text-sm font-extrabold">
              {report ? (report.passed ? `✓ ${t('passed')}` : `! ${t('failed')}`) : t('reportEmpty')}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
              <span className="nv-chip px-2! py-0!">{report ? report.grade : '—'}</span>
              {report ? <span>{report.metrics.lines} {t('lines')} · {bytesFmt(report.metrics.bytes)}</span> : null}
              {report ? <span>· {report.metrics.functions} {t('functions')}</span> : null}
              {report ? <span>· {report.metrics.listeners} {t('listeners')}</span> : null}
              {report ? <span>· {report.metrics.externalRefs} {t('externalRefs')}</span> : null}
              {report && report.metrics.todoCount > 0 ? <span className="nv-chip nv-chip-warn px-2! py-0!">{report.metrics.todoCount} TODO</span> : null}
            </div>
          </div>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" className="nv-btn nv-btn-primary" onClick={() => runQa()}>
            🛡 {t('runQa')}
          </button>
          <button
            type="button"
            className="nv-btn"
            onClick={() => applyFix('all')}
            disabled={!report || !report.issues.some((i) => i.autoFixable)}
            title={t('applyAllSafe')}
          >
            ⚡ {t('fixAll')}
          </button>
          <button
            type="button"
            className="nv-btn"
            onClick={() => void repairWithAi()}
            disabled={generation.running || !report || report.passed}
            title={t('aiRepairHint')}
          >
            🛠 {t('aiRepair')}
          </button>
          <button type="button" className="nv-btn" onClick={() => void aiReview()} disabled={generation.running}>
            🤖 {t('reviewWithAi')}
          </button>
          {compact ? (
            <button type="button" className="nv-btn nv-btn-ghost" onClick={() => setTab('qa')}>
              {t('report')} ↗
            </button>
          ) : null}
        </div>
      </div>

      {/* بطاقات الخطورة */}
      {report ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SEV_ORDER.map((sev) => (
            <button
              key={sev}
              type="button"
              className="nv-panel p-2 text-center transition"
              style={filter === sev ? { borderColor: SEV_COLOR[sev] } : undefined}
              onClick={() => setFilter(filter === sev ? 'all' : sev)}
              aria-pressed={filter === sev}
            >
              <div className="text-[18px] font-extrabold" style={{ color: SEV_COLOR[sev] }}>
                {report.counts[sev]}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                {label[sev]}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button type="button" className="nv-tab" data-active={filter === 'all'} onClick={() => setFilter('all')}>
          {t('allSeverities')}
        </button>
        <label className="nv-chip cursor-pointer gap-2">
          <input type="checkbox" checked={autoOnly} onChange={(e) => setAutoOnly(e.target.checked)} className="accent-current" />
          {t('autoFix')}
        </label>
        {activeProject.delivered ? (
          <span className="nv-chip nv-chip-ok">
            ✓ {t('delivered')} · {activeProject.deliveryCode}
          </span>
        ) : (
          <span className="nv-chip nv-chip-warn">{t('notDelivered')}</span>
        )}
      </div>

      {/* قائمة المشاكل */}
      <div className="nv-scroll min-h-0 flex-1 pe-1">
        {!report ? (
          <div className="nv-panel p-4 text-sm" style={{ color: 'var(--ink-dim)' }}>
            {t('reportEmpty')}
          </div>
        ) : issues.length === 0 ? (
          <div className="nv-panel p-4 text-sm" style={{ color: 'var(--ok)' }}>
            ✓ {t('noIssues')}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {issues.map((issue) => (
              <li key={issue.id + (issue.line ?? '')} className="nv-panel p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nv-chip px-2! py-0!" style={{ color: SEV_COLOR[issue.severity], borderColor: SEV_COLOR[issue.severity] }}>
                    {label[issue.severity]}
                  </span>
                  <span className="text-[12px] font-bold" style={{ color: 'var(--ink-dim)' }}>
                    {issue.rule} · {issue.category}
                  </span>
                  {issue.line ? <span className="text-[12px]" style={{ color: 'var(--ink-dim)' }}>· {t('lines')} {issue.line}</span> : null}
                  <span className="ms-auto flex gap-2">
                    {issue.autoFixable ? (
                      <button type="button" className="nv-btn px-2! py-1! text-[12px]" onClick={() => applyFix(issue.id)}>
                        {t('applyFix')}
                      </button>
                    ) : (
                      <span className="nv-chip px-2! py-0! text-[11px]">{t('manualFix')}</span>
                    )}
                  </span>
                </div>
                <h3 className="mt-2 text-[13.5px] font-extrabold">
                  {settings.lang === 'ar' ? issue.title.ar : issue.title.en}
                </h3>
                <p className="mt-1 text-[12.5px] leading-7" style={{ color: 'var(--ink-soft)' }}>
                  {settings.lang === 'ar' ? issue.detail.ar : issue.detail.en}
                </p>
                {issue.evidence ? (
                  <pre
                    className="nv-code mt-2 max-h-24 overflow-auto rounded-lg p-2"
                    style={{ background: 'color-mix(in oklab, var(--surface) 70%, black 12%)', border: '1px solid var(--line)' }}
                    aria-label={t('evidence')}
                  >
                    {issue.evidence}
                  </pre>
                ) : null}
                <p className="mt-2 text-[12.5px]" style={{ color: 'var(--accent)' }}>
                  <strong>{t('fix')}: </strong>
                  {settings.lang === 'ar' ? issue.fix.ar : issue.fix.en}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
