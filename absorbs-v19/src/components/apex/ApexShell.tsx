'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { TopBar } from '@/components/apex/TopBar';
import { Sidebar } from '@/components/apex/Sidebar';
import { Toasts } from '@/components/apex/Toasts';
import { Palette } from '@/components/apex/Palette';
import { SettingsPanel } from '@/components/apex/SettingsPanel';
import { StudioView } from '@/components/apex/StudioView';
import { ModelsView } from '@/components/apex/ModelsView';
import { PromptsView } from '@/components/apex/PromptsView';
import { ProjectsView } from '@/components/apex/ProjectsView';
import { GuideView } from '@/components/apex/GuideView';
import { ArcadeView } from '@/components/apex/ArcadeView';
import { QaPanel } from '@/components/apex/QaPanel';

/**
 * ABSORBS · Nexus AI — v19 APEX
 * الواجهة الكاملة لمسار /apex: شريط علوي ثابت + قائمة جانبية + منطقة عمل بملء الشاشة.
 * تُركَّب بعد التحميل فقط لتفادي أي عدم تطابق بين السيرفر والمتصفح (localStorage).
 */
export function ApexShell() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="apex-boot" role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" />
        <p>يُجهَّز استوديو APEX…</p>
      </div>
    );
  }

  return <ApexApp />;
}

function ApexApp() {
  const nova = useNova();
  const { settings, view, setView, toast, liveProviders } = nova;
  const t = makeT(settings.lang);

  useEffect(() => {
    if (liveProviders.length) {
      toast('ok', `متصل بمزوّدين حقيقيين: ${liveProviders.slice(0, 3).join(' · ')}`, 'الأسماء مأخوذة من متغيرات البيئة على السيرفر.');
    } else if (settings.demoMode) {
      toast('info', 'أهلاً بك في ABSORBS v19 APEX', 'وضع تجريبي: التوليد محاكى محلياً. أضف مفاتيح المزوّدين في متغيرات البيئة (أو مفتاحك من الإعدادات) لتشغيل النماذج الحقيقية.');
    }
    // مرة واحدة عند الإقلاع
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="apex-root apex-dark" dir="rtl" data-accent={settings.accent}>
      <TopBar nova={nova} />

      <div className="flex min-h-0 flex-1">
        <Sidebar nova={nova} />

        <main className="nv-scroll min-h-0 flex-1 p-3 md:p-4" aria-label={t('workbench')}>
          {view === 'studio' ? (
            <StudioView nova={nova} />
          ) : view === 'models' ? (
            <ModelsView nova={nova} />
          ) : view === 'prompts' ? (
            <PromptsView nova={nova} />
          ) : view === 'projects' ? (
            <ProjectsView nova={nova} />
          ) : view === 'guide' ? (
            <GuideView nova={nova} />
          ) : view === 'qa' ? (
            <div className="flex flex-col gap-3">
              <header className="nv-card flex flex-wrap items-center gap-3 p-4">
                <h1 className="text-[17px] font-extrabold">🛡 {t('navQa')}</h1>
                <p className="text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
                  {t('deliveryGateHint')}
                </p>
                <button type="button" className="nv-btn ms-auto" onClick={() => setView('studio')}>
                  → الاستوديو
                </button>
              </header>
              <section className="nv-card min-h-[60vh] p-3">
                <QaPanel nova={nova} />
              </section>
            </div>
          ) : (
            <ArcadeView nova={nova} />
          )}

          <footer className="mt-4 flex flex-wrap items-center gap-2 pb-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
            <span>ABSORBS · Nexus AI v19 APEX</span>
            <span>·</span>
            <span>{nova.projects.length} مشروع</span>
            <span>·</span>
            <span>{liveProviders.length ? `متصل: ${liveProviders.length} مزوّد` : 'وضع تجريبي'}</span>
            <span>·</span>
            <Link href="/app" className="nv-btn nv-btn-ghost !px-2 !py-0.5 text-[11.5px]">
              التطبيق الكلاسيكي ↗
            </Link>
            <button type="button" className="nv-btn nv-btn-ghost !px-2 !py-0.5 text-[11.5px]" onClick={() => setView('guide')}>
              {t('navGuide')}
            </button>
            <button type="button" className="nv-btn nv-btn-ghost !px-2 !py-0.5 text-[11.5px]" onClick={() => nova.setPaletteOpen(true)}>
              {t('cmdPalette')} ⌘K
            </button>
          </footer>
        </main>
      </div>

      <SettingsPanel nova={nova} />
      <Palette nova={nova} />
      <Toasts nova={nova} />
    </div>
  );
}
