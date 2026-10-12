"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { makeT } from '@/lib/apex/i18n';
import { MODEL_BY_ID, MODELS } from '@/lib/apex/models';
import { PROMPTS } from '@/lib/apex/prompts';
import { ChatPanel } from './ChatPanel';
import { QaPanel } from './QaPanel';
import { DeliveryGate } from './DeliveryGate';
import { copyText, download, bytesFmt, estimateTokens, formatMoney } from '@/lib/apex/utils';
import type { ConsoleLine, Device } from '@/lib/apex/types-ui';

/**
 * الاستوديو — منصة العمل الرئيسية
 * طلب ← توليد ← كود ← معاينة معزولة ← فحص ← تسليم برمز
 */
export function StudioView({ nova }: { nova: Nova }) {
  const {
    settings,
    activeProject,
    promptDraft,
    setPromptDraft,
    generate,
    generation,
    stopGeneration,
    activeModel,
    setActiveModelSafe,
    runQa,
    reports,
    updateActiveCode,
    repairWithAi,
    setTab,
    tab,
    toast,
  } = nova;
  const t = makeT(settings.lang);

  const [device, setDevice] = useState<Device>('desktop');
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const iframe = useRef<HTMLIFrameElement | null>(null);

  const code = activeProject?.code ?? '';
  const report = activeProject ? reports[activeProject.id] : undefined;
  const model = MODEL_BY_ID[activeModel];

  /* استقبال رسائل الكونسول من الإطار المعزول */
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { __novaConsole?: boolean; level?: ConsoleLine['level']; text?: string } | null;
      if (!data || !data.__novaConsole) return;
      setConsoleLines((prev) => [...prev.slice(-120), { level: data.level ?? 'log', text: data.text ?? '', at: Date.now() }]);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    setConsoleLines([]);
  }, [previewKey, activeProject?.id]);

  const srcDoc = useMemo(() => buildPreviewDoc(code), [code]);
  const devices: { id: Device; label: string; w: number | '100%' }[] = [
    { id: 'desktop', label: t('desktop'), w: '100%' },
    { id: 'tablet', label: t('tablet'), w: 834 },
    { id: 'mobile', label: t('mobile'), w: 390 },
  ];

  const errorCount = consoleLines.filter((l) => l.level === 'error').length;
  const shownPrompts = PROMPTS.filter((p) => p.category === 'game' || p.category === 'web').slice(0, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ===== شريط الطلب ===== */}
      <section className="nv-card p-3" aria-labelledby="studio-req">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="studio-req" className="text-[14px] font-extrabold">
            ✨ {t('request')}
          </h2>
          <span className="nv-chip px-2! py-0! text-[11px]">{t('requestHint')}</span>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--ink-dim)' }}>
              {t('navModels')}:
              <select className="nv-select py-1! text-[12px]!" value={activeModel} onChange={(e) => setActiveModelSafe(e.target.value as typeof activeModel)}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.vendor}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="nv-btn" onClick={() => setShowPromptPicker((v) => !v)} aria-expanded={showPromptPicker}>
              📚 {t('pickPrompt')}
            </button>
          </div>
        </div>

        {showPromptPicker ? (
          <div className="nv-panel mt-3 grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownPrompts.map((p) => (
              <button
                key={p.id}
                type="button"
                className="nv-btn h-auto! flex-col items-start! gap-1 p-2! text-start"
                onClick={() => {
                  setPromptDraft(p.body.ar);
                  setShowPromptPicker(false);
                }}
              >
                <span className="text-[12.5px] font-extrabold">{p.title.ar}</span>
                <span className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
                  {p.category} · {p.minutes} {t('minutes')}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <textarea
          className="nv-textarea mt-3"
          style={{ minHeight: 108 }}
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value.slice(0, 14000))}
          placeholder={t('requestHint')}
          aria-label={t('request')}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="nv-btn nv-btn-primary"
            disabled={generation.running || !promptDraft.trim()}
            onClick={() => void generate(promptDraft)}
          >
            {generation.running ? `⏳ ${t('generating')}` : `⚡ ${t('generate')}`}
          </button>
          <button type="button" className="nv-btn nv-btn-danger" onClick={stopGeneration} disabled={!generation.running}>
            ■ {t('stop')}
          </button>
          <button type="button" className="nv-btn nv-btn-ghost" onClick={() => setPromptDraft('')} disabled={!promptDraft}>
            {t('clear')}
          </button>
          <button type="button" className="nv-btn" onClick={() => runQa()} disabled={!code.trim()}>
            🛡 {t('runQa')}
          </button>
          <button
            type="button"
            className="nv-btn"
            onClick={() => void repairWithAi()}
            disabled={!code.trim() || generation.running || Boolean(report?.passed)}
            title={t('aiRepairHint')}
          >
            🛠 {t('aiRepair')}
          </button>

          <div className="ms-auto flex flex-wrap items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
            <span className="nv-chip px-2! py-0!">{model?.name} · {model?.contextK}K</span>
            <span className="nv-chip px-2! py-0!">~{estimateTokens(promptDraft + code)} {t('tokensUsed')}</span>
            <span className="nv-chip px-2! py-0!">
              {t('costEst')}: {formatMoney((estimateTokens(promptDraft + code) / 1_000_000) * ((model?.costIn ?? 0) + (model?.costOut ?? 0)))}
            </span>
            {generation.running ? (
              <span className="nv-chip nv-chip-accent px-2! py-0!">
                {generation.phase} · {bytesFmt(generation.chars)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* ===== لوحة العمل ===== */}
      <section className="nv-card flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t('workbench')}>
        <div className="flex flex-wrap items-center gap-2 p-2" style={{ borderBottom: '1px solid var(--line)' }}>
          {([
            ['code', `⌨ ${t('code')}`],
            ['preview', `▶ ${t('preview')}`],
            ['qa', `🛡 ${t('report')}${report ? ` · ${report.score}` : ''}`],
            ['chat', `💬 ${t('chat')}`],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className="nv-tab" data-active={tab === id} onClick={() => setTab(id)} aria-selected={tab === id} role="tab">
              {label}
            </button>
          ))}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {tab === 'preview' ? (
              <>
                <div className="flex gap-1">
                  {devices.map((d) => (
                    <button key={d.id} type="button" className="nv-tab px-2! py-1! text-[12px]" data-active={device === d.id} onClick={() => setDevice(d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="nv-btn px-2! py-1! text-[12px]" onClick={() => setPreviewKey((k) => k + 1)}>
                  ⟳ {t('restart')}
                </button>
                <button type="button" className="nv-btn px-2! py-1! text-[12px]" onClick={() => setFullscreen((v) => !v)}>
                  ⛶ {t('fullscreen')}
                </button>
                {errorCount > 0 ? <span className="nv-chip nv-chip-err px-2! py-0! text-[11px]">{errorCount} {t('errorsFound')}</span> : null}
              </>
            ) : null}

            {code ? (
              <>
                <button
                  type="button"
                  className="nv-btn px-2! py-1! text-[12px]"
                  onClick={async () => {
                    const ok = await copyText(code);
                    toast(ok ? 'ok' : 'warn', ok ? t('copiedCode') : 'تعذّر النسخ', ok ? `${bytesFmt(new Blob([code]).size)}` : 'انسخ يدوياً');
                  }}
                >
                  📋 {t('copy')}
                </button>
                <button
                  type="button"
                  className="nv-btn px-2! py-1! text-[12px]"
                  onClick={() => download(`${(activeProject?.title ?? 'nova').replace(/[^\w\u0600-\u06FF-]+/g, '-').slice(0, 40)}.html`, code, 'text/html;charset=utf-8')}
                >
                  ⤓ {t('download')}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 p-2">
          {tab === 'code' ? (
            <CodePane code={code} onChange={updateActiveCode} />
          ) : tab === 'preview' ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div
                className="nv-scroll min-h-0 flex-1 rounded-xl p-2"
                style={{ background: 'color-mix(in oklab, var(--surface) 70%, black 10%)', border: '1px solid var(--line)' }}
              >
                {code.trim() ? (
                  <iframe
                    key={previewKey}
                    ref={iframe}
                    title="معاينة المشروع"
                    sandbox="allow-scripts allow-pointer-lock"
                    srcDoc={srcDoc}
                    className="mx-auto block h-full w-full rounded-lg bg-white"
                    style={{
                      width: device === 'desktop' ? '100%' : `${devices.find((d) => d.id === device)?.w}px`,
                      maxWidth: '100%',
                      minHeight: fullscreen ? '70vh' : 320,
                    }}
                  />
                ) : (
                  <p className="grid h-full place-items-center py-10 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
                    {t('emptyPreview')}
                  </p>
                )}
              </div>
              <ConsoleView lines={consoleLines} onClear={() => setConsoleLines([])} lang={settings.lang} />
            </div>
          ) : tab === 'qa' ? (
            <div className="h-full min-h-0">
              <QaPanel nova={nova} />
            </div>
          ) : (
            <div className="h-full min-h-0">
              <ChatPanel nova={nova} />
            </div>
          )}
        </div>

        {/* شريط التسليم */}
        <div className="p-2" style={{ borderTop: '1px solid var(--line)' }}>
          <DeliveryGate nova={nova} />
        </div>
      </section>
    </div>
  );
}

/* ============================ محرّر الكود ============================ */
function CodePane({ code, onChange }: { code: string; onChange: (code: string, label?: string) => void }) {
  const [value, setValue] = useState(code);
  const [wrap, setWrap] = useState(true);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const gutter = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setValue(code);
  }, [code]);

  const lines = useMemo(() => value.split('\n').length, [value]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    const onScroll = () => {
      if (gutter.current) gutter.current.scrollTop = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
        <span className="nv-chip px-2! py-0!">HTML · {lines} أسطر</span>
        <button type="button" className="nv-tab px-2! py-0.5! text-[11.5px]" data-active={wrap} onClick={() => setWrap((w) => !w)}>
          التفاف الأسطر
        </button>
        <span className="ms-auto">المحرّر LTR داخل واجهة RTL — للمحاذاة الصحيحة</span>
      </div>

      <div
        className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl"
        style={{ border: '1px solid var(--line)', background: 'color-mix(in oklab, var(--surface) 74%, black 12%)' }}
      >
        <div ref={gutter} className="nv-scroll hidden w-[52px] shrink-0 overflow-hidden py-2 sm:block" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className="nv-line-num">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={ta}
          dir="ltr"
          spellCheck={false}
          className="nv-code nv-scroll nv-editor min-h-0 flex-1 rounded-none! border-0! bg-transparent! p-2"
          style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'anywhere' : 'normal' }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value !== code) onChange(value, 'تعديل يدوي في المحرّر');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const next = `${value.slice(0, start)}  ${value.slice(end)}`;
              setValue(next);
              window.requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 2;
              });
            }
          }}
          aria-label="كود المشروع"
        />
      </div>
    </div>
  );
}

/* ============================ الكونسول ============================ */
function ConsoleView({ lines, onClear, lang }: { lines: ConsoleLine[]; onClear: () => void; lang: 'ar' | 'en' }) {
  const t = makeT(lang);
  const tone: Record<ConsoleLine['level'], string> = {
    log: 'var(--ink-soft)',
    warn: 'var(--warn)',
    error: 'var(--err)',
    info: 'var(--info)',
  };
  return (
    <div className="nv-panel max-h-[190px] min-h-[92px] overflow-hidden">
      <div className="flex items-center gap-2 p-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <strong className="text-[12px]">{t('console')}</strong>
        <span className="nv-chip px-2! py-0! text-[11px]">{lines.length}</span>
        <span className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>{t('sandboxNote')}</span>
        <button type="button" className="nv-btn nv-btn-ghost ms-auto px-2! py-0.5! text-[11px]" onClick={onClear}>
          {t('clear')}
        </button>
      </div>
      <div className="nv-scroll max-h-[140px] p-2" role="log" aria-live="polite">
        {lines.length === 0 ? (
          <p className="text-[12px]" style={{ color: 'var(--ink-dim)' }}>
            {t('noConsole')}
          </p>
        ) : (
          lines.slice(-60).map((l, i) => (
            <div key={`${l.at}-${i}`} className="nv-code flex gap-2 py-0.5" style={{ color: tone[l.level] }}>
              <span style={{ opacity: 0.7 }}>[{l.level}]</span>
              <span className="break-all">{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================ مستند المعاينة المعزول ============================ */
function buildPreviewDoc(code: string): string {
  if (!code.trim()) {
    return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b1120;color:#9fb0cf;font-family:system-ui">
      <p>لا كود بعد.</p></body></html>`;
  }
  const isDoc = /<html|<!doctype/i.test(code);
  const inner = isDoc ? code : `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body>${code}</body></html>`;

  const bridge = `<script>
(function(){
  var send = function(level, args){
    try {
      var text = Array.prototype.slice.call(args).map(function(a){
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      }).join(' ');
      parent.postMessage({ __novaConsole: true, level: level, text: text.slice(0, 2000) }, '*');
    } catch(e){}
  };
  ['log','info','warn','error'].forEach(function(k){
    var orig = console[k];
    console[k] = function(){ send(k === 'log' ? 'log' : k, arguments); if (orig) orig.apply(console, arguments); };
  });
  window.addEventListener('error', function(e){ send('error', ['خطأ:', e.message, 'في', e.filename + ':' + e.lineno]); });
  window.addEventListener('unhandledrejection', function(e){ send('error', ['وعد غير معالَج:', (e.reason && e.reason.message) || e.reason || '']); });
  window.addEventListener('load', function(){ send('info', ['تم تحميل المعاينة بنجاح']); });
})();
</script>`;

  return /<\/head>/i.test(inner) ? inner.replace(/<\/head>/i, `${bridge}</head>`) : `${bridge}${inner}`;
}
