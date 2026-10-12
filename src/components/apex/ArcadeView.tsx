"use client";

import { useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { EDITOR_TEMPLATES } from '@/lib/apex/templates';
import { makeT } from '@/lib/apex/i18n';
import { download } from '@/lib/apex/utils';

/** الأركيد: جرّب القوالب والألعاب المدمجة فوراً داخل التطبيق */
export function ArcadeView({ nova }: { nova: Nova }) {
  const { settings, projects, setActiveId, setView, setTab, toast } = nova;
  const t = makeT(settings.lang);
  const [playing, setPlaying] = useState<string | null>(EDITOR_TEMPLATES[0]?.id ?? null);

  const games = projects.filter((p) => p.kind === 'game' && p.code.trim());

  return (
    <div className="flex flex-col gap-3">
      <header className="nv-card flex flex-wrap items-center gap-3 p-4">
        <h1 className="text-[17px] font-extrabold">🎮 الأركيد</h1>
        <p className="text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
          العب القوالب المدمجة ومشاريعك المولّدة مباشرة — كل شيء داخل إطار معزول وآمن.
        </p>
        <span className="nv-chip nv-chip-accent ms-auto px-2! py-0! text-[11.5px]">{games.length} لعبة من إنتاجك</span>
      </header>

      <div className="flex flex-wrap gap-2">
        {EDITOR_TEMPLATES.map((tpl) => (
          <button key={tpl.id} type="button" className="nv-tab" data-active={playing === tpl.id} onClick={() => setPlaying(tpl.id)}>
            {tpl.label.ar}
          </button>
        ))}
        {games.map((g) => (
          <button key={g.id} type="button" className="nv-tab" data-active={playing === g.id} onClick={() => setPlaying(g.id)}>
            ▶ {g.title.slice(0, 22)}
          </button>
        ))}
      </div>

      <section className="nv-card p-2">
        {playing ? (
          (() => {
            const tpl = EDITOR_TEMPLATES.find((x) => x.id === playing);
            const project = projects.find((p) => p.id === playing);
            const code = tpl?.code ?? project?.code ?? '';
            const title = tpl?.label.ar ?? project?.title ?? '';
            return (
              <>
                <div className="flex flex-wrap items-center gap-2 p-2">
                  <strong className="text-[13px]">{title}</strong>
                  <button type="button" className="nv-btn px-2! py-1! text-[12px]" onClick={() => setPlaying((p) => (p === playing ? null : playing))}>
                    ⟳ {t('restart')}
                  </button>
                  <button type="button" className="nv-btn px-2! py-1! text-[12px]" onClick={() => download(`${title}.html`, code, 'text/html;charset=utf-8')}>
                    ⤓ {t('download')}
                  </button>
                  {project ? (
                    <button
                      type="button"
                      className="nv-btn nv-btn-primary px-2! py-1! text-[12px]"
                      onClick={() => {
                        setActiveId(project.id);
                        setView('studio');
                        setTab('code');
                      }}
                    >
                      افتح في الاستوديو
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="nv-btn nv-btn-primary px-2! py-1! text-[12px]"
                      onClick={() => {
                        nova.setPromptDraft(code);
                        setView('studio');
                        toast('info', 'حُمّل القالب في الاستوديو', 'عدّل الكود أو ولّد نسخة جديدة');
                      }}
                    >
                      عدّل في الاستوديو
                    </button>
                  )}
                </div>
                <iframe
                  key={`${playing}-${code.length}`}
                  title={title}
                  sandbox="allow-scripts allow-pointer-lock"
                  srcDoc={code}
                  className="h-[70vh] w-full rounded-xl bg-white"
                />
              </>
            );
          })()
        ) : (
          <p className="p-6 text-center text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            اختر لعبة أو قالباً بالأعلى للعب.
          </p>
        )}
      </section>
    </div>
  );
}
