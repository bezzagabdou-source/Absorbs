"use client";

import type { Nova } from '@/lib/apex/store';

/** تنبيهات عائمة أنيقة — بلا مكتبات */
export function Toasts({ nova }: { nova: Nova }) {
  const { toasts, dismissToast } = nova;
  const tone: Record<string, string> = {
    ok: 'nv-chip-ok',
    warn: 'nv-chip-warn',
    err: 'nv-chip-err',
    info: 'nv-chip-accent',
  };
  const icon: Record<string, string> = { ok: '✓', warn: '!', err: '✕', info: 'i' };

  return (
    <div
      className="pointer-events-none fixed bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2"
      style={{ insetInlineEnd: 16 }}
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div key={t.id} className="nv-card nv-rise pointer-events-auto flex items-start gap-3 p-3" role="status">
          <span className={`nv-chip ${tone[t.kind]} mt-0.5 grid h-6 w-6 place-items-center !px-0 text-sm`} aria-hidden="true">
            {icon[t.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold" title={t.title}>
              {t.title}
            </div>
            {t.body ? <div className="mt-0.5 text-xs leading-6" style={{ color: 'var(--ink-soft)' }}>{t.body}</div> : null}
          </div>
          <button
            type="button"
            className="nv-btn nv-btn-ghost px-2! py-1! text-base"
            onClick={() => dismissToast(t.id)}
            aria-label="إغلاق التنبيه"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
