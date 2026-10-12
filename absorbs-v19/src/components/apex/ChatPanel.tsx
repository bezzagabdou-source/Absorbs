"use client";

import { useEffect, useRef, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { MODEL_BY_ID } from '@/lib/apex/models';
import { clockFmt } from '@/lib/apex/utils';

/** لوحة المحادثة: سجل الطلبات وردود النماذج مع حالة البث */
export function ChatPanel({ nova }: { nova: Nova }) {
  const { activeProject, chats, generation, settings, generate, activeModel } = nova;
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);

  const messages = activeProject ? chats[activeProject.id] ?? [] : [];

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, generation.chars]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div ref={scroller} className="nv-scroll min-h-0 flex-1 pe-1" role="log" aria-live="polite">
        {!messages.length ? (
          <div className="nv-panel p-4 text-[13px]" style={{ color: 'var(--ink-dim)' }}>
            لا رسائل بعد. اكتب طلبك بالأسفل، أو حمّل برومبتاً ضخماً من المكتبة ثم اضغط توليد.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const model = m.modelId ? MODEL_BY_ID[m.modelId] : undefined;
              const isUser = m.role === 'user';
              return (
                <li
                  key={m.id}
                  className="nv-panel p-3"
                  style={isUser ? { borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)' } : undefined}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-dim)' }}>
                    <span className="nv-chip px-2! py-0!">{isUser ? 'أنت' : model?.name ?? 'النموذج'}</span>
                    <span dir="ltr">{clockFmt(m.at)}</span>
                    {m.tokens ? <span>· ~{m.tokens} توكن</span> : null}
                    {m.pending ? <span className="nv-caret text-[12px]" style={{ color: 'var(--accent)' }} /> : null}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[12.5px] leading-7" style={{ color: isUser ? 'var(--ink)' : 'var(--ink-soft)' }}>
                    {m.content.length > 2600 && !isUser ? `${m.content.slice(0, 2600)}\n… (اقتُطع العرض — الكود الكامل في تبويب الكود)` : m.content}
                  </div>
                  {m.error ? <p className="mt-2 text-[12px]" style={{ color: 'var(--err)' }}>خطأ: {m.error}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        className="nv-panel flex items-end gap-2 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text || generation.running) return;
          setDraft('');
          void generate(text);
        }}
      >
        <textarea
          className="nv-textarea nv-editor min-h-[52px]! bg-transparent!"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 12000))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              const text = draft.trim();
              if (text && !generation.running) {
                setDraft('');
                void generate(text);
              }
            }
          }}
          placeholder={`اطلب من ${MODEL_BY_ID[activeModel]?.name} تعديلاً أو ميزة جديدة… (Ctrl+Enter للإرسال)`}
          aria-label="رسالة إلى النموذج"
          rows={2}
        />
        <button type="submit" className="nv-btn nv-btn-primary" disabled={generation.running || !draft.trim()}>
          {generation.running ? '…' : 'إرسال'}
        </button>
      </form>
      <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
        النموذج النشِط: {MODEL_BY_ID[activeModel]?.name} · {settings.demoMode ? 'وضع تجريبي محلي' : 'مزوّد حقيقي'} · Ctrl+Enter للإرسال
      </p>
    </div>
  );
}
