"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nova } from '@/lib/apex/store';
import { MODELS } from '@/lib/apex/models';
import { PROMPTS } from '@/lib/apex/prompts';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

/** لوحة الأوامر (Ctrl+K): تنقّل، توليد، فحص، تبديل نموذج، تحميل برومبت */
export function Palette({ nova }: { nova: Nova }) {
  const {
    paletteOpen,
    setPaletteOpen,
    setView,
    setTab,
    setSettingsOpen,
    setSettings,
    runQa,
    generate,
    promptDraft,
    setActiveModelSafe,
    openPrompt,
    exportAll,
    toast,
    projects,
    setActiveId,
  } = nova;
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ('');
      setCursor(0);
      window.setTimeout(() => input.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: 'v-studio', label: 'الانتقال إلى الاستوديو', icon: '🎛', run: () => setView('studio') },
      { id: 'v-models', label: 'كتيبة النماذج', icon: '🧠', run: () => setView('models') },
      { id: 'v-prompts', label: 'مكتبة البرومبتات', icon: '📚', run: () => setView('prompts') },
      { id: 'v-qa', label: 'بوابة الفحص', icon: '🛡', run: () => { setView('studio'); setTab('qa'); } },
      { id: 'v-projects', label: 'المشاريع', icon: '🗂', run: () => setView('projects') },
      { id: 'v-guide', label: 'الدليل', icon: '📖', run: () => setView('guide') },
      { id: 'gen', label: 'توليد من الطلب الحالي', hint: promptDraft ? promptDraft.slice(0, 44) : 'الطلب فارغ', icon: '⚡', run: () => { setView('studio'); void generate(promptDraft); } },
      { id: 'qa', label: 'تشغيل الفحص الآن', icon: '🛡', run: () => { setView('studio'); runQa(); } },
      { id: 'tab-code', label: 'عرض تبويب الكود', icon: '⌨', run: () => { setView('studio'); setTab('code'); } },
      { id: 'tab-preview', label: 'عرض تبويب المعاينة', icon: '▶', run: () => { setView('studio'); setTab('preview'); } },
      { id: 'tab-chat', label: 'عرض تبويب المحادثة', icon: '💬', run: () => { setView('studio'); setTab('chat'); } },
      { id: 'settings', label: 'فتح الإعدادات', icon: '⚙', run: () => setSettingsOpen(true) },
      { id: 'theme', label: 'تبديل المظهر (داكن/فاتح)', icon: '🌓', run: () => setSettings((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' })) },
      { id: 'lang', label: 'تبديل اللغة (عربي/إنجليزي)', icon: '🌐', run: () => setSettings((s) => ({ ...s, lang: s.lang === 'ar' ? 'en' : 'ar' })) },
      {
        id: 'export',
        label: 'تصدير كل البيانات (JSON)',
        icon: '⤓',
        run: () => {
          const blob = exportAll();
          const url = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `absorbs-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('ok', 'تم التصدير', 'ملف JSON يحتوي المشاريع والإعدادات');
        },
      },
    ];

    const models: Cmd[] = MODELS.map((m) => ({
      id: `m-${m.id}`,
      label: `استخدم ${m.name}`,
      hint: `${m.vendor} · ${m.contextK}K`,
      icon: '🧠',
      run: () => setActiveModelSafe(m.id),
    }));

    const prompts: Cmd[] = PROMPTS.slice(0, 40).map((p) => ({
      id: `p-${p.id}`,
      label: p.title.ar,
      hint: `برومبت · ${p.category}`,
      icon: '📚',
      run: () => openPrompt(p.id),
    }));

    const recent: Cmd[] = projects.slice(0, 8).map((p) => ({
      id: `prj-${p.id}`,
      label: p.title,
      hint: 'مشروع محفوظ',
      icon: '🗂',
      run: () => {
        setActiveId(p.id);
        setView('studio');
        setTab('preview');
      },
    }));

    return [...base, ...models, ...prompts, ...recent];
  }, [exportAll, generate, openPrompt, projects, promptDraft, runQa, setActiveModelSafe, setActiveId, setSettings, setSettingsOpen, setTab, setView, toast]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.slice(0, 40);
    return commands.filter((c) => c.label.toLowerCase().includes(needle) || (c.hint ?? '').toLowerCase().includes(needle)).slice(0, 40);
  }, [commands, q]);

  if (!paletteOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
      <button type="button" className="absolute inset-0 cursor-default" style={{ background: 'rgba(3,7,18,.66)', backdropFilter: 'blur(4px)' }} onClick={() => setPaletteOpen(false)} aria-label="إغلاق" />
      <div className="nv-card nv-rise relative w-[min(680px,100%)] overflow-hidden">
        <input
          ref={input}
          className="nv-input rounded-none! border-0! bg-transparent! py-4! text-[15px]!"
          style={{ borderBottom: '1px solid var(--line)' }}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(filtered.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const cmd = filtered[cursor];
              if (cmd) {
                cmd.run();
                setPaletteOpen(false);
              }
            }
          }}
          placeholder="اكتب أمراً… (تنقّل، توليد، فحص، نموذج، برومبت)"
          aria-label="بحث الأوامر"
        />
        <ul className="nv-scroll max-h-[52vh] p-2" role="listbox">
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className="nv-btn w-full justify-start border-transparent! text-start"
                style={i === cursor ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)' } : { background: 'transparent' }}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  c.run();
                  setPaletteOpen(false);
                }}
                role="option"
                aria-selected={i === cursor}
              >
                <span aria-hidden="true">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint ? (
                  <span className="truncate text-[11px]" style={{ color: 'var(--ink-dim)', maxWidth: 200 }}>
                    {c.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="p-3 text-[12.5px]" style={{ color: 'var(--ink-dim)' }}>
              لا نتائج.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
